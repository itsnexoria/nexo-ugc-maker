import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEFAULT_MATERIAL } from '../assets/materials';
import { TEXTURE_MAX_DIM, optimizeDataUrl } from '../utils/imageOptimize';
import type { MaterialProps } from '../types';

/** One material's worth of a model: its triangles plus the look it had in the file. */
export interface ImportedPart {
  name: string;
  geometry: THREE.BufferGeometry;
  material: MaterialProps;
  /** the picture the file used for this material, if any (decoded later by `textureToDataUrl`) */
  map: THREE.Texture | null;
}

export const MODEL_EXTENSIONS = ['obj', 'glb', 'gltf'];
export const SIDECAR_EXTENSIONS = ['mtl', 'bin'];

export const extOf = (name: string): string => name.split('.').pop()?.toLowerCase() ?? '';
const baseName = (url: string): string => decodeURIComponent(url.split('?')[0].split(/[\\/]/).pop() ?? '').toLowerCase();
const hex = (c: THREE.Color): string => `#${c.getHexString()}`;

/** Reads the look of a three.js material (glTF PBR, or the Phong/Lambert materials OBJ+MTL produce). */
export function materialProps(m: THREE.Material | undefined): Pick<ImportedPart, 'material' | 'map'> {
  const material: MaterialProps = { ...DEFAULT_MATERIAL, texRepeat: [...DEFAULT_MATERIAL.texRepeat] as MaterialProps['texRepeat'], texOffset: [...DEFAULT_MATERIAL.texOffset] as MaterialProps['texOffset'] };
  if (!m) return { material, map: null };
  const any = m as THREE.MeshStandardMaterial & THREE.MeshPhongMaterial;
  if (any.color) material.color = hex(any.color);
  if (m.type === 'MeshStandardMaterial' || m.type === 'MeshPhysicalMaterial') {
    material.metalness = THREE.MathUtils.clamp(any.metalness ?? 0, 0, 1);
    material.roughness = THREE.MathUtils.clamp(any.roughness ?? 0.6, 0, 1);
  } else {
    material.metalness = 0;
    material.roughness = THREE.MathUtils.clamp(1 - (any.shininess ?? 30) / 100, 0.2, 1);
  }
  material.opacity = m.transparent || m.opacity < 1 ? THREE.MathUtils.clamp(m.opacity, 0, 1) : 1;
  if (any.emissive && any.emissive.getHex() !== 0) {
    material.emissive = hex(any.emissive);
    material.emissiveIntensity = any.emissiveIntensity ?? 1;
  }
  const map = (any.map as THREE.Texture | null) ?? null;
  if (map) {
    material.texRepeat = [map.repeat.x, map.repeat.y];
    material.texOffset = [map.offset.x, map.offset.y];
    material.texRotation = THREE.MathUtils.radToDeg(map.rotation);
  }
  return { material, map };
}

/** Triangles [start, start + count) of a non-indexed geometry as their own geometry. */
export function sliceGeometry(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const a = g.attributes[name] as THREE.BufferAttribute | undefined;
    if (!a) continue;
    out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
  }
  return out;
}

function prepare(source: THREE.BufferGeometry, matrix: THREE.Matrix4, flipV: boolean): THREE.BufferGeometry {
  let g = source.clone();
  g.applyMatrix4(matrix);
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  if (flipV) {
    // glTF puts the image's top row at v = 0; the editor (like OBJ) puts it at v = 1
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  }
  return g;
}

/** Splits every mesh in the file by material, so each material keeps its colour, finish and texture. */
export function collectParts(root: THREE.Object3D, opts: { flipV: boolean }): ImportedPart[] {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { name: string; material: THREE.Material | undefined; geoms: THREE.BufferGeometry[] }>();
  const add = (key: string, name: string, material: THREE.Material | undefined, g: THREE.BufferGeometry) => {
    const b = buckets.get(key) ?? { name, material, geoms: [] };
    b.geoms.push(g);
    buckets.set(key, b);
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const g = prepare(mesh.geometry, mesh.matrixWorld, opts.flipV);
    if (Array.isArray(mesh.material)) {
      const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
      for (const grp of groups) {
        const mat = mesh.material[grp.materialIndex ?? 0];
        const count = Math.min(grp.count, g.attributes.position.count - grp.start);
        if (count > 0) add(mat?.uuid ?? 'none', mat?.name || mesh.name, mat, sliceGeometry(g, grp.start, count));
      }
      g.dispose();
    } else {
      add(mesh.material?.uuid ?? 'none', mesh.material?.name || mesh.name, mesh.material, g);
    }
  });
  if (!buckets.size) throw new Error('No meshes were found in this file.');
  const parts: ImportedPart[] = [];
  let n = 0;
  for (const b of buckets.values()) {
    const merged = b.geoms.length === 1 ? b.geoms[0] : mergeGeometries(b.geoms, false);
    if (!merged) throw new Error('The meshes in this file could not be combined.');
    if (b.geoms.length > 1) b.geoms.forEach((x) => x.dispose());
    n += 1;
    parts.push({ name: (b.name || `Part ${n}`).trim().slice(0, 40) || `Part ${n}`, geometry: merged, ...materialProps(b.material) });
  }
  return parts;
}

/** Centres all parts together and scales unusually large or small files to a sensible accessory size. */
export function normaliseParts(parts: ImportedPart[]): { scaled: boolean; factor: number } {
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  }
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z);
  const factor = max > 8 || max < 0.2 ? 2 / max : 1;
  for (const p of parts) {
    p.geometry.translate(-centre.x, -centre.y, -centre.z);
    if (factor !== 1) p.geometry.scale(factor, factor, factor);
    p.geometry.computeBoundingBox();
  }
  return { scaled: factor !== 1, factor };
}

/** Draws a decoded texture to a PNG data URL, scaled to Roblox's maximum. Returns null if it cannot be read. */
export async function textureToDataUrl(tex: THREE.Texture): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const img = tex.image as (CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }) | undefined;
  const w = img?.naturalWidth || img?.width || 0;
  const h = img?.naturalHeight || img?.height || 0;
  if (!img || !w || !h || typeof document === 'undefined') return null;
  try {
    const k = Math.min(1, 2048 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * k));
    canvas.height = Math.max(1, Math.round(h * k));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const raw = canvas.toDataURL('image/png');
    const opt = await optimizeDataUrl(raw, { maxDim: TEXTURE_MAX_DIM });
    return opt.changed ? { dataUrl: opt.dataUrl, width: opt.width, height: opt.height } : { dataUrl: raw, width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

/** Waits until every texture the file refers to has finished decoding (they load asynchronously). */
async function waitForMaps(root: THREE.Object3D, timeoutMs = 8000): Promise<void> {
  const maps = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      const map = (mat as THREE.MeshStandardMaterial).map;
      if (map) maps.add(map);
    }
  });
  const ready = (t: THREE.Texture) => {
    const i = t.image as { complete?: boolean; width?: number } | undefined;
    return !!i && (i.complete !== false) && (i.width ?? 1) > 0;
  };
  const t0 = Date.now();
  while ([...maps].some((t) => !ready(t)) && Date.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 50));
}

export interface LoadedModel {
  name: string;
  parts: ImportedPart[];
  /** names of picture files the model needed but were not provided */
  missingTextures: string[];
}

/**
 * Loads a model plus any files that go with it: an OBJ's .mtl, a glTF's .bin and pictures.
 * Everything the model refers to is found by file name among the files given.
 */
export async function loadModelFiles(files: File[]): Promise<LoadedModel> {
  const model = files.find((f) => MODEL_EXTENSIONS.includes(extOf(f.name)));
  if (!model) throw new Error('Choose a .obj, .glb or .gltf file.');
  const ext = extOf(model.name);
  const urls = new Map<string, string>();
  const requested = new Set<string>();
  for (const f of files) if (f !== model) urls.set(f.name.toLowerCase(), URL.createObjectURL(f));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    const key = baseName(url);
    requested.add(key);
    return urls.get(key) ?? url;
  });
  try {
    let root: THREE.Object3D;
    if (ext === 'obj') {
      const loader = new OBJLoader(manager);
      const mtl = files.find((f) => extOf(f.name) === 'mtl');
      if (mtl) {
        const mats = new MTLLoader(manager).parse(await mtl.text(), '');
        mats.preload();
        loader.setMaterials(mats);
      }
      root = loader.parse(await model.text());
    } else {
      const data = ext === 'glb' ? await model.arrayBuffer() : await model.text();
      const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) =>
        new GLTFLoader(manager).parse(data, '', resolve, (e) => reject(new Error(e instanceof Error ? e.message : 'Invalid glTF file'))),
      );
      root = gltf.scene;
    }
    await waitForMaps(root);
    const parts = collectParts(root, { flipV: ext !== 'obj' });
    const missingTextures = [...requested].filter((n) => /\.(png|jpe?g|webp|bmp|tga|gif)$/.test(n) && !urls.has(n));
    return { name: model.name.replace(/\.[^.]+$/, ''), parts, missingTextures };
  } finally {
    for (const u of urls.values()) URL.revokeObjectURL(u);
  }
}
