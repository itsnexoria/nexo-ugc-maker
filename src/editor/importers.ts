import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { geometryToModelAsset } from '../utils/geometry';
import { uid } from '../utils/ids';
import type { TextureAsset } from '../types';

const MAX_TEXTURE_BYTES = 12 * 1024 * 1024;
const MAX_MODEL_BYTES = 40 * 1024 * 1024;

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}

export function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('This image could not be decoded.'));
    img.src = dataUrl;
  });
}

export async function textureFromFile(file: File): Promise<Omit<TextureAsset, 'id' | 'createdAt' | 'source'>> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error(`"${file.name}" is not a PNG, JPG or WebP image.`);
  if (file.size > MAX_TEXTURE_BYTES) throw new Error(`"${file.name}" is larger than 12 MB.`);
  const dataUrl = await readAsDataUrl(file);
  const { width, height } = await imageSize(dataUrl);
  return { name: file.name.replace(/\.[^.]+$/, ''), dataUrl, width, height };
}

/** Adds an uploaded image to the project's texture library. */
export async function uploadTexture(file: File, applyToSelected = true): Promise<TextureAsset | null> {
  const ui = useUI.getState();
  try {
    ui.setBusy('Loading texture…');
    const t = await textureFromFile(file);
    const asset: TextureAsset = { ...t, id: uid('tex'), source: 'upload', createdAt: Date.now() };
    const ed = useEditor.getState();
    ed.addTexture(asset);
    const sel = ed.selectedId ? ed.objects[ed.selectedId] : null;
    if (applyToSelected && sel && sel.kind !== 'group') {
      ed.setMaterial(sel.id, { textureId: asset.id, color: '#ffffff' }, undefined);
      ui.toast('success', `Texture "${asset.name}" added and applied to ${sel.name}`);
    } else {
      ui.toast('success', `Texture "${asset.name}" added to the library (${asset.width}×${asset.height})`);
    }
    return asset;
  } catch (err) {
    ui.toast('error', err instanceof Error ? err.message : 'Texture upload failed.');
    return null;
  } finally {
    useUI.getState().setBusy(null);
  }
}

function collectGeometry(root: THREE.Object3D): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    let g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((g.attributes.position.count || 0) * 2), 2));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.clearGroups();
    parts.push(g);
  });
  if (!parts.length) throw new Error('No meshes were found in this file.');
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('The meshes in this file could not be combined.');
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Centres the mesh and scales unusually large/small files to a sensible accessory size. */
function normalise(g: THREE.BufferGeometry): { scaled: boolean; factor: number } {
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const centre = box.getCenter(new THREE.Vector3());
  g.translate(-centre.x, -centre.y, -centre.z);
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z);
  let factor = 1;
  if (max > 8 || max < 0.2) {
    factor = 2 / max;
    g.scale(factor, factor, factor);
  }
  g.computeBoundingBox();
  return { scaled: factor !== 1, factor };
}

export async function importModelFile(file: File): Promise<boolean> {
  const ui = useUI.getState();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  try {
    if (!['obj', 'glb', 'gltf'].includes(ext)) throw new Error(`"${file.name}" is not a supported model. Use .obj, .glb or .gltf.`);
    if (file.size > MAX_MODEL_BYTES) throw new Error(`"${file.name}" is larger than 40 MB.`);
    ui.setBusy(`Importing ${file.name}…`);
    let root: THREE.Object3D;
    if (ext === 'obj') {
      root = new OBJLoader().parse(await file.text());
    } else {
      const buf = await file.arrayBuffer();
      const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) =>
        new GLTFLoader().parse(buf, '', resolve, (e) => reject(new Error(e instanceof Error ? e.message : 'Invalid glTF file'))),
      );
      root = gltf.scene;
    }
    const geo = collectGeometry(root);
    const { scaled, factor } = normalise(geo);
    const name = file.name.replace(/\.[^.]+$/, '');
    const asset = geometryToModelAsset(uid('model'), name, geo);
    geo.dispose();
    if (asset.triangles > 200_000) throw new Error(`This mesh has ${asset.triangles.toLocaleString()} triangles, which is too heavy for the browser editor.`);
    useEditor.getState().addImported(asset, name);
    if (scaled) ui.toast('info', `Imported "${name}" and scaled it by ${factor.toFixed(3)} to fit the avatar.`);
    else ui.toast('success', `Imported "${name}" (${asset.triangles.toLocaleString()} triangles)`);
    if (asset.triangles > 4000) ui.toast('warn', 'Over 4,000 triangles. Check the Validation tab before exporting.');
    return true;
  } catch (err) {
    ui.toast('error', err instanceof Error ? err.message : 'Model import failed.');
    return false;
  } finally {
    useUI.getState().setBusy(null);
  }
}

/** Opens a native file picker and resolves with the chosen files. */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export async function handleDroppedFiles(files: File[]): Promise<void> {
  if (useEditor.getState().screen === 'clothing') {
    for (const f of files) await uploadClothingImage(f, true);
    return;
  }
  for (const f of files) {
    if (/\.(obj|glb|gltf)$/i.test(f.name)) await importModelFile(f);
    else if (f.type.startsWith('image/')) await uploadTexture(f);
    else useUI.getState().toast('warn', `"${f.name}" isn't a supported file. Drop a .obj, .glb, .gltf or image.`);
  }
}

// ------------------------------------------------------------------ clothing images

import { useClothing } from '../store/clothing';
import type { ClothingImage } from '../types';

/** Adds an uploaded picture to the clothing image library, and optionally places it as a layer. */
export async function uploadClothingImage(file: File, asLayer = true): Promise<ClothingImage | null> {
  const ui = useUI.getState();
  try {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error(`"${file.name}" is not a PNG, JPG, WebP or GIF image.`);
    if (file.size > MAX_TEXTURE_BYTES) throw new Error(`"${file.name}" is larger than 12 MB.`);
    ui.setBusy('Loading image…');
    const dataUrl = await readAsDataUrl(file);
    const { width, height } = await imageSize(dataUrl);
    const img: ClothingImage = { id: uid('img'), name: file.name.replace(/\.[^.]+$/, ''), dataUrl, width, height };
    const cl = useClothing.getState();
    cl.addImage(img);
    if (asLayer) cl.addLayer('image', { image: img });
    ui.toast('success', `Added "${img.name}" (${width}×${height})`);
    return img;
  } catch (err) {
    ui.toast('error', err instanceof Error ? err.message : 'Image upload failed.');
    return null;
  } finally {
    useUI.getState().setBusy(null);
  }
}
