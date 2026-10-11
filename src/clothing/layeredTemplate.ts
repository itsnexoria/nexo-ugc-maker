import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { ClothingKind } from '../types';
import { bodyMapFor, faceUvPixels, type BodyMap } from './mapping';
import { renderFull } from './composite';
import type { FaceId } from './templates';

/**
 * Layered clothing from Roblox's own cage template.
 *
 * Roblox requires the clothing's cages to keep the template cage's vertices and UVs. The only way to honour
 * that is to start from the template, so this takes a file the user downloaded from Roblox
 * (for example Clothing_Cage_Template.fbx or ClassicMannequin_With-Cages.fbx) and derives everything from it:
 *   - InnerCage: the template cage, untouched (same vertices, UVs and skin weights)
 *   - OuterCage: the same mesh pushed outwards along its normals
 *   - garment: the same mesh pushed out half way, with the user's classic design baked onto the cage UVs
 * It is written against Roblox's documented structure and has not been run against the real files.
 */
export type CageRole = 'inner' | 'outer' | 'body' | 'other';

export interface TemplateMesh {
  name: string;
  role: CageRole;
  triangles: number;
  skinned: boolean;
  hasUv: boolean;
  mesh: THREE.Mesh;
}

export interface TemplateInfo {
  fileName: string;
  root: THREE.Object3D;
  meshes: TemplateMesh[];
  bones: number;
}

export function classifyName(name: string): CageRole {
  const n = name.toLowerCase();
  if (n.includes('innercage') || (n.includes('inner') && n.includes('cage'))) return 'inner';
  if (n.includes('outercage') || (n.includes('outer') && n.includes('cage'))) return 'outer';
  if (n.includes('cage')) return 'other';
  return 'body';
}

export function describeTemplate(fileName: string, root: THREE.Object3D): TemplateInfo {
  const meshes: TemplateMesh[] = [];
  const bones = new Set<THREE.Object3D>();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.add(o);
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const g = m.geometry as THREE.BufferGeometry;
    meshes.push({
      name: m.name || '(unnamed)',
      role: classifyName(m.name || ''),
      triangles: Math.round((g.index ? g.index.count : g.attributes.position.count) / 3),
      skinned: !!(m as THREE.SkinnedMesh).isSkinnedMesh && !!g.attributes.skinWeight,
      hasUv: !!g.attributes.uv,
      mesh: m,
    });
  });
  return { fileName, root, meshes, bones: bones.size };
}

export async function parseTemplate(fileName: string, data: ArrayBuffer | string): Promise<TemplateInfo> {
  const ext = fileName.split('.').pop()?.toLowerCase();
  let root: THREE.Object3D;
  if (ext === 'fbx') {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    if (typeof data === 'string') throw new Error('FBX files must be read as binary.');
    root = new FBXLoader().parse(data, '');
  } else if (ext === 'glb' || ext === 'gltf') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) =>
      new GLTFLoader().parse(data, '', resolve, (e) => reject(new Error(e instanceof Error ? e.message : 'Invalid glTF file'))),
    );
    root = gltf.scene;
  } else {
    throw new Error('Use the .fbx, .glb or .gltf version of the template.');
  }
  return describeTemplate(fileName, root);
}

// ------------------------------------------------------------------ geometry helpers

/** Vertex normals averaged by position, so offsetting a mesh with UV seams does not crack it open. */
export function weldedNormals(g: THREE.BufferGeometry): Float32Array {
  const pos = g.attributes.position;
  const idx = g.index;
  const key = (i: number) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const sums = new Map<string, THREE.Vector3>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const tri = idx ? idx.count / 3 : pos.count / 3;
  for (let t = 0; t < tri; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    n.crossVectors(b.clone().sub(a), c.clone().sub(a)); // area weighted
    for (const i of [i0, i1, i2]) {
      const k = key(i);
      const s = sums.get(k) ?? new THREE.Vector3();
      s.add(n);
      sums.set(k, s);
    }
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const s = sums.get(key(i))!.clone().normalize();
    out[i * 3] = s.x;
    out[i * 3 + 1] = s.y;
    out[i * 3 + 2] = s.z;
  }
  return out;
}

function offsetGeometry(src: THREE.BufferGeometry, normals: Float32Array, distance: number): THREE.BufferGeometry {
  const g = src.clone();
  const p = g.attributes.position;
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    arr[i * 3] = p.getX(i) + normals[i * 3] * distance;
    arr[i * 3 + 1] = p.getY(i) + normals[i * 3 + 1] * distance;
    arr[i * 3 + 2] = p.getZ(i) + normals[i * 3 + 2] * distance;
  }
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
}

const SHIRT_BONES = /(LowerTorso|UpperTorso|UpperArm|LowerArm)/;
const PANTS_BONES = /(LowerTorso|UpperLeg|LowerLeg)/;
const wanted = (kind: 'shirt' | 'pants') => (kind === 'shirt' ? SHIRT_BONES : PANTS_BONES);

/** Keeps only the triangles whose dominant bone belongs to the garment. Without skin data everything stays. */
function selectTriangles(mesh: THREE.Mesh, kind: 'shirt' | 'pants'): { geometry: THREE.BufferGeometry; kept: number; filtered: boolean } {
  const src = mesh.geometry as THREE.BufferGeometry;
  const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh && src.attributes.skinIndex && src.attributes.skinWeight;
  const flat = src.index ? src.toNonIndexed() : src.clone();
  if (!skinned) return { geometry: flat, kept: flat.attributes.position.count / 3, filtered: false };
  const bones = (mesh as THREE.SkinnedMesh).skeleton.bones;
  const si = flat.attributes.skinIndex;
  const sw = flat.attributes.skinWeight;
  const dominant = (v: number) => {
    let best = 0;
    let w = -1;
    for (let k = 0; k < 4; k++) {
      const x = sw.getComponent(v, k);
      if (x > w) {
        w = x;
        best = si.getComponent(v, k);
      }
    }
    return bones[best]?.name ?? '';
  };
  const re = wanted(kind);
  const keep: number[] = [];
  for (let t = 0; t < flat.attributes.position.count; t += 3) {
    const names = [dominant(t), dominant(t + 1), dominant(t + 2)];
    const votes = names.filter((n) => re.test(n)).length;
    if (votes >= 2) keep.push(t, t + 1, t + 2);
  }
  if (!keep.length) return { geometry: flat, kept: flat.attributes.position.count / 3, filtered: false };
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(flat.attributes)) {
    const a = flat.attributes[name] as THREE.BufferAttribute;
    const arr = new (a.array.constructor as new (n: number) => ArrayLike<number> & { [i: number]: number })(keep.length * a.itemSize);
    keep.forEach((v, i) => {
      for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.array[v * a.itemSize + c];
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr as unknown as ArrayLike<number> as Float32Array, a.itemSize, a.normalized));
  }
  return { geometry: out, kept: keep.length / 3, filtered: true };
}

// ------------------------------------------------------------------ texture transfer

/** Face of a triangle relative to the body part, with the template's front axis taken into account. */
function faceOf(n: THREE.Vector3, frontPositiveZ: boolean): FaceId {
  const x = frontPositiveZ ? -n.x : n.x;
  const z = frontPositiveZ ? -n.z : n.z;
  const ax = Math.abs(x);
  const ay = Math.abs(n.y);
  const az = Math.abs(z);
  if (ax >= ay && ax >= az) return x > 0 ? 'right' : 'left';
  if (ay >= ax && ay >= az) return n.y > 0 ? 'top' : 'bottom';
  return z > 0 ? 'back' : 'front';
}

/** Maps the classic template design onto the cage's own UV layout by projecting each triangle onto its body part. */
export function bakeClassicToCageUv(
  geometry: THREE.BufferGeometry,
  bones: THREE.Bone[] | null,
  kind: ClothingKind,
  classic: CanvasImageSource & { width: number; height: number },
  size = 1024,
  frontPositiveZ = false,
): HTMLCanvasElement | null {
  const uv = geometry.attributes.uv;
  const si = geometry.attributes.skinIndex;
  const sw = geometry.attributes.skinWeight;
  if (!uv || !si || !sw || !bones || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const pos = geometry.attributes.position;
  const boneOf = (v: number) => {
    let best = 0;
    let w = -1;
    for (let k = 0; k < 4; k++) {
      const x = sw.getComponent(v, k);
      if (x > w) {
        w = x;
        best = si.getComponent(v, k);
      }
    }
    return bones[best]?.name ?? '';
  };
  // bounding box of every bone's triangles, used to normalise positions inside that body part
  const box = new Map<string, THREE.Box3>();
  for (let v = 0; v < pos.count; v++) {
    const name = boneOf(v);
    const b = box.get(name) ?? new THREE.Box3();
    b.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, v));
    box.set(name, b);
  }
  const maps = new Map<string, BodyMap | null>();
  const tp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const sizeV = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const cw = classic.width;
  const ch = classic.height;
  const scaleX = cw / (kind === 'tshirt' ? 128 : 585);
  const scaleY = ch / (kind === 'tshirt' ? 128 : 559);
  for (let t = 0; t < pos.count; t += 3) {
    const name = boneOf(t);
    if (!maps.has(name)) maps.set(name, bodyMapFor('R15', name));
    const map = maps.get(name);
    const b = box.get(name);
    if (!map || !b) continue;
    b.getSize(sizeV);
    b.getCenter(centre);
    for (let k = 0; k < 3; k++) tp[k].fromBufferAttribute(pos, t + k).sub(centre);
    nrm.crossVectors(tp[1].clone().sub(tp[0]), tp[2].clone().sub(tp[0])).normalize();
    const face = faceOf(nrm, frontPositiveZ);
    const src: [number, number][] = [];
    let ok = true;
    for (let k = 0; k < 3; k++) {
      const p = frontPositiveZ ? new THREE.Vector3(-tp[k].x, tp[k].y, -tp[k].z) : tp[k];
      const px = faceUvPixels(kind, map, face, p, [sizeV.x || 1, sizeV.y || 1, sizeV.z || 1]);
      if (!px) {
        ok = false;
        break;
      }
      src.push([px[0] * scaleX, px[1] * scaleY]);
    }
    if (!ok) continue;
    const dst: [number, number][] = [0, 1, 2].map((k) => [uv.getX(t + k) * size, (1 - uv.getY(t + k)) * size]);
    drawAffineTriangle(ctx, classic, src, dst);
  }
  return canvas;
}

/** Draws the part of `img` inside triangle `src` so that it fills triangle `dst`. */
export function drawAffineTriangle(ctx: CanvasRenderingContext2D, img: CanvasImageSource, src: [number, number][], dst: [number, number][]): void {
  const [[x0, y0], [x1, y1], [x2, y2]] = src;
  const [[u0, v0], [u1, v1], [u2, v2]] = dst;
  const det = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
  if (Math.abs(det) < 1e-9) return;
  const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / det;
  const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / det;
  const c = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / det;
  const d = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / det;
  const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / det;
  const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / det;
  // grow the clip a little so neighbouring triangles overlap and leave no hairline gaps
  const cx = (u0 + u1 + u2) / 3;
  const cy = (v0 + v1 + v2) / 3;
  const grow = (u: number, v: number): [number, number] => {
    const dx = u - cx;
    const dy = v - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [u + (dx / len) * 0.8, v + (dy / len) * 0.8];
  };
  ctx.save();
  ctx.beginPath();
  const g0 = grow(u0, v0);
  const g1 = grow(u1, v1);
  const g2 = grow(u2, v2);
  ctx.moveTo(g0[0], g0[1]);
  ctx.lineTo(g1[0], g1[1]);
  ctx.lineTo(g2[0], g2[1]);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// ------------------------------------------------------------------ build

export interface TemplateBuildOptions {
  kind: 'shirt' | 'pants';
  name: string;
  puffiness: number;
  frontPositiveZ: boolean;
  /** index into info.meshes to use as the base cage; defaults to the detected inner cage */
  baseIndex?: number;
}

export interface TemplateBuild {
  group: THREE.Group;
  names: { mesh: string; inner: string; outer: string };
  warnings: string[];
  stats: { triangles: number; vertices: number; bones: number; textured: boolean; filtered: boolean };
}

function pickBase(info: TemplateInfo, forced?: number): { base: TemplateMesh; warnings: string[] } {
  const warnings: string[] = [];
  if (forced !== undefined && info.meshes[forced]) return { base: info.meshes[forced], warnings };
  const inner = info.meshes.filter((m) => m.role === 'inner');
  const pool = inner.length ? inner : info.meshes.filter((m) => m.role === 'other');
  if (!pool.length) {
    const biggest = [...info.meshes].sort((a, b) => b.triangles - a.triangles)[0];
    if (!biggest) throw new Error('No meshes were found in this file.');
    warnings.push('No mesh named like an inner cage was found, so the largest mesh was used. Check that it is the body cage.');
    return { base: biggest, warnings };
  }
  const best = [...pool].sort((a, b) => b.triangles - a.triangles)[0];
  if (pool.length > 1) warnings.push(`${pool.length} possible inner cages were found. Using "${best.name}", the largest. Pick another from the list if that is wrong.`);
  return { base: best, warnings };
}

export function buildFromTemplate(info: TemplateInfo, opts: TemplateBuildOptions): TemplateBuild {
  const { base, warnings } = pickBase(info, opts.baseIndex);
  const mesh = base.mesh;
  mesh.updateWorldMatrix(true, false);
  const selected = selectTriangles(mesh, opts.kind);
  if (!selected.filtered) warnings.push('The cage has no skin weights, so the whole mesh was kept. Delete the parts the garment does not cover in your 3D tool, but do not change the remaining vertices or UVs.');
  const inner = selected.geometry;
  // work in the template's own space, bake the mesh's world transform so scale/rotation from the file are honoured
  inner.applyMatrix4(mesh.matrixWorld);
  const normals = weldedNormals(inner);
  const thick = Math.max(0.01, opts.puffiness);
  const garment = offsetGeometry(inner, normals, thick);
  const outer = offsetGeometry(inner, normals, thick * 1.35 + 0.02);

  const skinnedSrc = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? (mesh as THREE.SkinnedMesh) : null;
  const names = { mesh: opts.name, inner: `${opts.name}_InnerCage`, outer: `${opts.name}_OuterCage` };
  const group = new THREE.Group();
  group.name = `${opts.name}_FromTemplate`;

  // rebuild the template's skeleton so the output is self-contained
  let skeleton: THREE.Skeleton | null = null;
  if (skinnedSrc) {
    const old = skinnedSrc.skeleton.bones;
    const fresh = old.map((b) => {
      const nb = new THREE.Bone();
      nb.name = b.name;
      nb.position.copy(b.position);
      nb.quaternion.copy(b.quaternion);
      nb.scale.copy(b.scale);
      return nb;
    });
    old.forEach((b, i) => {
      const pi = old.indexOf(b.parent as THREE.Bone);
      if (pi >= 0) fresh[pi].add(fresh[i]);
      else group.add(fresh[i]);
    });
    group.updateMatrixWorld(true);
    skeleton = new THREE.Skeleton(fresh, skinnedSrc.skeleton.boneInverses.map((m) => m.clone()));
  }

  let texture: THREE.CanvasTexture | null = null;
  let textured = false;
  try {
    const classic = renderFull(opts.kind);
    if (classic.getContext('2d') && skeleton) {
      const baked = bakeClassicToCageUv(selected.geometry, skeleton.bones, opts.kind, classic, 1024, opts.frontPositiveZ);
      if (baked) {
        texture = new THREE.CanvasTexture(baked);
        texture.colorSpace = THREE.SRGBColorSpace;
        textured = true;
      }
    }
  } catch {
    /* no canvas available */
  }
  if (!textured) warnings.push('The design could not be baked onto the cage UVs (needs skin weights and UVs), so the garment has a plain material.');

  const make = (geo: THREE.BufferGeometry, label: string, map: THREE.Texture | null) => {
    const mat = new THREE.MeshStandardMaterial({ name: `${label}_mat`, color: '#ffffff', roughness: 0.9, metalness: 0, side: THREE.DoubleSide, map: map ?? undefined });
    const m: THREE.Mesh = skeleton ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat);
    m.name = label;
    m.frustumCulled = false;
    group.add(m);
    if (skeleton) (m as THREE.SkinnedMesh).bind(skeleton, new THREE.Matrix4());
    return m;
  };
  make(garment, names.mesh, texture);
  make(inner, names.inner, null);
  make(outer, names.outer, null);
  group.updateMatrixWorld(true);

  return {
    group,
    names,
    warnings,
    stats: { triangles: inner.attributes.position.count / 3, vertices: inner.attributes.position.count, bones: skeleton?.bones.length ?? 0, textured, filtered: selected.filtered },
  };
}

export async function exportTemplateBuild(b: TemplateBuild): Promise<Blob> {
  const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
    new GLTFExporter().parse(b.group, (r) => resolve(r as ArrayBuffer), (e) => reject(e instanceof Error ? e : new Error('Export failed')), { binary: true, onlyVisible: false });
  });
  return new Blob([buf], { type: 'model/gltf-binary' });
}

/** The cage's UV islands drawn as a wireframe, to use as a guide in a paint program. */
export function uvLayoutGuide(geometry: THREE.BufferGeometry, size = 1024): HTMLCanvasElement | null {
  const uv = geometry.attributes.uv;
  if (!uv || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(40,40,60,0.7)';
  g.lineWidth = 1;
  const idx = geometry.index;
  const n = idx ? idx.count : uv.count;
  for (let t = 0; t < n; t += 3) {
    const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
    g.beginPath();
    ids.forEach((i, k) => {
      const x = uv.getX(i) * size;
      const y = (1 - uv.getY(i)) * size;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.closePath();
    g.stroke();
  }
  return c;
}
