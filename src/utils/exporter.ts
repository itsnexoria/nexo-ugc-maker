import * as THREE from 'three';
import JSZip from 'jszip';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { BONES } from '../assets/avatar';
import type { Layer, MaterialProps, ModelAsset, RigType, SceneObject, TextureAsset } from '../types';
import { getModelGeometry, getPrimitiveGeometry, triangleCount } from './geometry';
import { DEG, localMatrix, worldMatrix } from './math';

export type ExportFormat = 'obj' | 'glb' | 'gltf';
export type ExportUnits = 'studs' | 'meters' | 'centimeters';

/** Roblox: 1 stud = 0.28 metres. */
export const UNIT_SCALE: Record<ExportUnits, number> = { studs: 1, meters: 0.28, centimeters: 28 };

export interface ExportOptions {
  format: ExportFormat;
  units: ExportUnits;
  includeAvatar: boolean;
  includeHidden: boolean;
  filename: string;
}

export interface ExportInput {
  objects: Record<string, SceneObject>;
  order: string[];
  layers: Layer[];
  textures: TextureAsset[];
  models: Record<string, ModelAsset>;
  rig: RigType;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  parts: number;
  triangles: number;
  files: string[];
}

const safe = (s: string) => s.replace(/[^\w\-.]+/g, '_').replace(/^_+|_+$/g, '') || 'part';

function isVisible(o: SceneObject, input: ExportInput, includeHidden: boolean): boolean {
  if (includeHidden) return true;
  let cur: SceneObject | undefined = o;
  let guard = 0;
  while (cur && guard++ < 64) {
    const layer = input.layers.find((l) => l.id === cur!.layerId);
    if (!cur.visible || layer?.visible === false) return false;
    cur = cur.parentId ? input.objects[cur.parentId] : undefined;
  }
  return true;
}

function geometryOf(o: SceneObject, input: ExportInput): THREE.BufferGeometry | null {
  if (o.kind === 'group') return null;
  if (o.kind === 'imported') {
    const m = o.modelId ? input.models[o.modelId] : undefined;
    return m ? getModelGeometry(m) : null;
  }
  return getPrimitiveGeometry(o.kind);
}

// ------------------------------------------------------------------ OBJ

interface ObjPart {
  name: string;
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  materialName: string;
}

function mtlFor(name: string, m: MaterialProps, texFile: string | null): string {
  const c = new THREE.Color(m.color);
  const e = new THREE.Color(m.emissive).multiplyScalar(Math.min(1, m.emissiveIntensity));
  const ns = Math.round(Math.pow(1 - m.roughness, 2) * 900 + 10);
  const ks = 0.04 + m.metalness * 0.9;
  const lines = [
    `newmtl ${name}`,
    `Kd ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}`,
    `Ks ${ks.toFixed(3)} ${ks.toFixed(3)} ${ks.toFixed(3)}`,
    `Ke ${e.r.toFixed(4)} ${e.g.toFixed(4)} ${e.b.toFixed(4)}`,
    `Ns ${ns}`,
    `d ${m.opacity.toFixed(3)}`,
    `illum 2`,
  ];
  if (texFile) lines.push(`map_Kd ${texFile}`);
  return lines.join('\n');
}

export function writeObj(parts: ObjPart[], mtlName: string): string {
  const out: string[] = ['# Exported from Nexo UGC Studio by Nexoria', '# Y up, accessory front faces -Z (Roblox convention)', `mtllib ${mtlName}`];
  let vOff = 1;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const p of parts) {
    const g = p.geometry;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(p.matrix);
    const flip = p.matrix.determinant() < 0;
    out.push(`o ${p.name}`, `usemtl ${p.materialName}`);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(p.matrix);
      out.push(`v ${v.x.toFixed(5)} ${v.y.toFixed(5)} ${v.z.toFixed(5)}`);
    }
    if (uv) for (let i = 0; i < uv.count; i++) out.push(`vt ${uv.getX(i).toFixed(5)} ${uv.getY(i).toFixed(5)}`);
    if (nor) {
      for (let i = 0; i < nor.count; i++) {
        n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
        out.push(`vn ${n.x.toFixed(5)} ${n.y.toFixed(5)} ${n.z.toFixed(5)}`);
      }
    }
    const idx = g.index;
    const triCount = (idx ? idx.count : pos.count) / 3;
    const ref = (i: number) => {
      const a = i + vOff;
      return uv && nor ? `${a}/${a}/${a}` : nor ? `${a}//${a}` : uv ? `${a}/${a}` : `${a}`;
    };
    for (let t = 0; t < triCount; t++) {
      const a = idx ? idx.getX(t * 3) : t * 3;
      const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      out.push(flip ? `f ${ref(a)} ${ref(c)} ${ref(b)}` : `f ${ref(a)} ${ref(b)} ${ref(c)}`);
    }
    vOff += pos.count;
  }
  return out.join('\n') + '\n';
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; ext: string } {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error('A texture could not be decoded for export.');
  const ext = m[1].includes('jpeg') ? 'jpg' : m[1].includes('webp') ? 'webp' : 'png';
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, ext };
}

async function exportObj(input: ExportInput, opts: ExportOptions): Promise<ExportResult> {
  const unit = new THREE.Matrix4().makeScale(UNIT_SCALE[opts.units], UNIT_SCALE[opts.units], UNIT_SCALE[opts.units]);
  const parts: ObjPart[] = [];
  const mtl: string[] = [];
  const zip = new JSZip();
  const texFiles = new Map<string, string>();
  const usedNames = new Set<string>();
  let tris = 0;

  const unique = (base: string) => {
    let n = safe(base);
    let i = 2;
    while (usedNames.has(n)) n = `${safe(base)}_${i++}`;
    usedNames.add(n);
    return n;
  };

  for (const id of input.order) {
    const o = input.objects[id];
    if (!o || o.kind === 'group' || !isVisible(o, input, opts.includeHidden)) continue;
    const g = geometryOf(o, input);
    if (!g) continue;
    const name = unique(o.name);
    let texFile: string | null = null;
    const tex = o.material.textureId ? input.textures.find((t) => t.id === o.material.textureId) : undefined;
    if (tex) {
      if (!texFiles.has(tex.id)) {
        const { bytes, ext } = dataUrlToBytes(tex.dataUrl);
        const file = `textures/${safe(tex.name)}_${texFiles.size + 1}.${ext}`;
        zip.file(file, bytes);
        texFiles.set(tex.id, file);
      }
      texFile = texFiles.get(tex.id)!;
    }
    parts.push({ name, geometry: g, matrix: unit.clone().multiply(worldMatrix(input.objects, id)), materialName: `${name}_mat` });
    mtl.push(mtlFor(`${name}_mat`, o.material, texFile));
    tris += triangleCount(g);
  }

  if (opts.includeAvatar) {
    for (const b of BONES[input.rig]) {
      const geo = new THREE.BoxGeometry(...b.size);
      const m = unit.clone().multiply(new THREE.Matrix4().makeTranslation(...b.center));
      const name = unique(`AvatarRef_${b.name}`);
      parts.push({ name, geometry: geo, matrix: m, materialName: 'AvatarReference' });
    }
    mtl.push(mtlFor('AvatarReference', { color: '#9aa0ab', metalness: 0, roughness: 0.8, opacity: 1, emissive: '#000000', emissiveIntensity: 0, textureId: null, texRepeat: [1, 1], texOffset: [0, 0], texRotation: 0 }, null));
  }

  if (!parts.length) throw new Error('There is nothing visible to export. Add a part or show hidden parts.');
  const base = safe(opts.filename);
  zip.file(`${base}.obj`, writeObj(parts, `${base}.mtl`));
  zip.file(`${base}.mtl`, `# Materials from Nexo UGC Studio\n${mtl.join('\n\n')}\n`);
  zip.file('README.txt', 'Exported from Nexo UGC Studio by Nexoria.\nUnits and orientation: see the Roblox workflow notes in the export dialog.\nOBJ stores no hierarchy, so every part is a separate object with its transform baked in.\n');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return {
    blob,
    filename: `${base}-obj.zip`,
    parts: parts.filter((p) => !p.name.startsWith('AvatarRef_')).length,
    triangles: tris,
    files: [`${base}.obj`, `${base}.mtl`, ...Array.from(texFiles.values())],
  };
}

// ------------------------------------------------------------------ GLB / glTF

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('A texture image could not be loaded for export.'));
    img.src = dataUrl;
  });
}

export async function buildExportScene(input: ExportInput, opts: ExportOptions): Promise<{ root: THREE.Group; parts: number; triangles: number }> {
  const root = new THREE.Group();
  root.name = safe(opts.filename);
  const s = UNIT_SCALE[opts.units];
  root.scale.setScalar(s);
  let parts = 0;
  let triangles = 0;

  const textures = new Map<string, THREE.Texture>();
  const getTexture = async (id: string): Promise<THREE.Texture | null> => {
    const asset = input.textures.find((t) => t.id === id);
    if (!asset) return null;
    if (!textures.has(id)) {
      const t = new THREE.Texture(await loadImage(asset.dataUrl));
      t.name = safe(asset.name);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.flipY = false;
      t.needsUpdate = true;
      textures.set(id, t);
    }
    return textures.get(id)!;
  };

  const kids = new Map<string | null, SceneObject[]>();
  for (const id of input.order) {
    const o = input.objects[id];
    if (!o) continue;
    const arr = kids.get(o.parentId) ?? [];
    arr.push(o);
    kids.set(o.parentId, arr);
  }

  const used = new Set<string>([root.name]);
  const unique = (base: string) => {
    let n = safe(base);
    let i = 2;
    while (used.has(n)) n = `${safe(base)}_${i++}`;
    used.add(n);
    return n;
  };

  const build = async (o: SceneObject, parent: THREE.Object3D) => {
    if (!isVisible(o, input, opts.includeHidden)) return;
    const g = geometryOf(o, input);
    let holder: THREE.Object3D;
    if (g) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(o.material.color),
        metalness: o.material.metalness,
        roughness: o.material.roughness,
        emissive: new THREE.Color(o.material.emissive),
        emissiveIntensity: o.material.emissiveIntensity,
        transparent: o.material.opacity < 1,
        opacity: o.material.opacity,
      });
      if (o.material.textureId) {
        const base = await getTexture(o.material.textureId);
        if (base) {
          const t = base.clone();
          t.needsUpdate = true;
          t.repeat.set(o.material.texRepeat[0], o.material.texRepeat[1]);
          t.offset.set(o.material.texOffset[0], o.material.texOffset[1]);
          t.center.set(0.5, 0.5);
          t.rotation = o.material.texRotation * DEG;
          mat.map = t;
        }
      }
      holder = new THREE.Mesh(g, mat);
      mat.name = `${unique(o.name)}_mat`;
      holder.name = mat.name.replace(/_mat$/, '');
      parts += 1;
      triangles += triangleCount(g);
    } else {
      holder = new THREE.Group();
      holder.name = unique(o.name);
    }
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(localMatrix(o));
    holder.matrixWorldNeedsUpdate = true;
    parent.add(holder);
    for (const c of kids.get(o.id) ?? []) await build(c, holder);
  };

  for (const r of kids.get(null) ?? []) await build(r, root);

  if (opts.includeAvatar) {
    const avatar = new THREE.Group();
    avatar.name = `AvatarReference_${input.rig}`;
    const mat = new THREE.MeshStandardMaterial({ name: 'AvatarReference', color: '#9aa0ab', roughness: 0.8 });
    for (const b of BONES[input.rig]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...b.size), mat);
      m.name = `AvatarRef_${b.name.replace(/\s+/g, '')}`;
      m.position.set(...b.center);
      avatar.add(m);
    }
    root.add(avatar);
  }
  return { root, parts, triangles };
}

async function exportGltf(input: ExportInput, opts: ExportOptions): Promise<ExportResult> {
  const { root, parts, triangles } = await buildExportScene(input, opts);
  if (!parts) throw new Error('There is nothing visible to export. Add a part or show hidden parts.');
  root.updateMatrixWorld(true);
  const binary = opts.format === 'glb';
  const result = await new Promise<ArrayBuffer | object>((resolve, reject) => {
    new GLTFExporter().parse(root, resolve, (e) => reject(e instanceof Error ? e : new Error('glTF export failed')), {
      binary,
      onlyVisible: false,
      maxTextureSize: 4096,
    });
  });
  const base = safe(opts.filename);
  if (binary) {
    return { blob: new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' }), filename: `${base}.glb`, parts, triangles, files: [`${base}.glb`] };
  }
  return { blob: new Blob([JSON.stringify(result)], { type: 'model/gltf+json' }), filename: `${base}.gltf`, parts, triangles, files: [`${base}.gltf`] };
}

export async function runExport(input: ExportInput, opts: ExportOptions): Promise<ExportResult> {
  return opts.format === 'obj' ? exportObj(input, opts) : exportGltf(input, opts);
}
