import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { R15_BONES, type BoneDef } from '../assets/avatar';
import type { ClothingKind, Vec3 } from '../types';
import { bodyMapFor, buildClothingGeometry, type BodyMap } from './mapping';
import { renderFull } from './composite';

/**
 * Layered clothing STARTER. It gives you what Roblox asks for that can be generated here:
 * a mesh skinned to an R15 skeleton (max 2 influences per vertex), plus _InnerCage and _OuterCage
 * meshes with the same vertices. What it cannot give you is Roblox's own cage template: Roblox
 * requires cage vertices and UVs to match its template, so the placeholder cages must be replaced
 * in a 3D tool before the item can be uploaded.
 */
export const LAYERED_SEGMENTS: Record<'shirt' | 'pants', string[]> = {
  shirt: ['LowerTorso', 'UpperTorso', 'RightUpperArm', 'RightLowerArm', 'LeftUpperArm', 'LeftLowerArm'],
  pants: ['LowerTorso', 'RightUpperLeg', 'RightLowerLeg', 'LeftUpperLeg', 'LeftLowerLeg'],
};

export const ROOT_BONE = 'HumanoidRootPart';

/** Bones next to each other along a limb or the spine: used to blend skin weights around joints. */
const NEIGHBOURS: Record<string, { below?: string; above?: string }> = {
  LowerTorso: { above: 'UpperTorso' },
  UpperTorso: { below: 'LowerTorso' },
  RightUpperArm: { below: 'RightLowerArm' },
  RightLowerArm: { above: 'RightUpperArm', below: 'RightHand' },
  LeftUpperArm: { below: 'LeftLowerArm' },
  LeftLowerArm: { above: 'LeftUpperArm', below: 'LeftHand' },
  RightUpperLeg: { below: 'RightLowerLeg' },
  RightLowerLeg: { above: 'RightUpperLeg', below: 'RightFoot' },
  LeftUpperLeg: { below: 'LeftLowerLeg' },
  LeftLowerLeg: { above: 'LeftUpperLeg', below: 'LeftFoot' },
};

export interface LayeredStats {
  triangles: number;
  vertices: number;
  maxInfluences: number;
  bones: number;
  segments: number;
}

export interface LayeredBuild {
  group: THREE.Group;
  stats: LayeredStats;
  names: { mesh: string; inner: string; outer: string };
}

export function buildSkeleton(): { bones: Map<string, THREE.Bone>; list: THREE.Bone[]; root: THREE.Bone } {
  const bones = new Map<string, THREE.Bone>();
  const list: THREE.Bone[] = [];
  const root = new THREE.Bone();
  root.name = ROOT_BONE;
  const first = R15_BONES.find((b) => !b.parent)!;
  root.position.set(first.joint[0], first.joint[1], first.joint[2]);
  list.push(root);
  bones.set(ROOT_BONE, root);
  const jointOf = new Map<string, Vec3>([[ROOT_BONE, first.joint]]);
  const addBone = (def: BoneDef) => {
    if (bones.has(def.name)) return;
    const parentName = def.parent ?? ROOT_BONE;
    const parentDef = R15_BONES.find((b) => b.name === parentName);
    if (parentDef && !bones.has(parentName)) addBone(parentDef);
    const parent = bones.get(parentName)!;
    const pj = jointOf.get(parentName)!;
    const bone = new THREE.Bone();
    bone.name = def.name;
    bone.position.set(def.joint[0] - pj[0], def.joint[1] - pj[1], def.joint[2] - pj[2]);
    parent.add(bone);
    bones.set(def.name, bone);
    jointOf.set(def.name, def.joint);
    list.push(bone);
  };
  R15_BONES.forEach(addBone);
  return { bones, list, root };
}

/** Removes joint cap faces that the clothing does not use (they would sit inside the garment). */
function dropHiddenCaps(g: THREE.BufferGeometry, map: BodyMap): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.attributes.position;
  const nor = src.attributes.normal;
  const keep: number[] = [];
  for (let t = 0; t < pos.count; t += 3) {
    const ny = nor.getY(t);
    const isTop = ny > 0.9;
    const isBottom = ny < -0.9;
    if ((isTop && !map.top) || (isBottom && !map.bottom)) continue;
    keep.push(t, t + 1, t + 2);
  }
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const a = src.attributes[name];
    const arr = new Float32Array(keep.length * a.itemSize);
    keep.forEach((v, i) => {
      for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = (a as THREE.BufferAttribute).array[v * a.itemSize + c];
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  return out;
}

interface Piece {
  geometry: THREE.BufferGeometry;
  bone: string;
  center: Vec3;
  height: number;
}

function piecesFor(kind: 'shirt' | 'pants', inflate: number, segs: number): Piece[] {
  const out: Piece[] = [];
  for (const name of LAYERED_SEGMENTS[kind]) {
    const def = R15_BONES.find((b) => b.name === name)!;
    const map = bodyMapFor('R15', name);
    if (!map) continue;
    // sleeves/legs are open at the ends, so the joint caps toward the hand and foot are dropped
    const open: BodyMap = { ...map, bottom: name === 'LowerTorso' ? map.bottom : false };
    const box = dropHiddenCaps(buildClothingGeometry(kind, map, def.size, inflate, segs), open);
    out.push({ geometry: box, bone: name, center: def.center, height: def.size[1] });
  }
  return out;
}

/** Fills skin indices/weights: rigid on the segment's own bone, blended with the neighbour near joints. */
function skinPiece(piece: Piece, boneIndex: Map<string, number>, blend: number): void {
  const g = piece.geometry;
  const n = g.attributes.position.count;
  const idx = new Uint16Array(n * 4);
  const wts = new Float32Array(n * 4);
  const self = boneIndex.get(piece.bone)!;
  const nb = NEIGHBOURS[piece.bone] ?? {};
  for (let i = 0; i < n; i++) {
    const y = g.attributes.position.getY(i); // local to the box centre
    const t = y / piece.height + 0.5; // 0 bottom .. 1 top
    let a = self;
    let wa = 1;
    let b = 0;
    let wb = 0;
    const edge = blend / piece.height;
    if (nb.above && t > 1 - edge) {
      b = boneIndex.get(nb.above)!;
      wb = 0.5 * ((t - (1 - edge)) / edge);
    } else if (nb.below && t < edge) {
      b = boneIndex.get(nb.below)!;
      wb = 0.5 * ((edge - t) / edge);
    }
    wa = 1 - wb;
    idx[i * 4] = a;
    wts[i * 4] = wa;
    if (wb > 0) {
      idx[i * 4 + 1] = b;
      wts[i * 4 + 1] = wb;
    }
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(wts, 4));
}

function mergePieces(pieces: Piece[], boneIndex: Map<string, number>, inflate: number, blend: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const p of pieces) {
    const g = p.geometry.clone();
    skinPiece({ ...p, geometry: g }, boneIndex, blend);
    g.translate(p.center[0], p.center[1], p.center[2]);
    parts.push(g);
  }
  const merged = new THREE.BufferGeometry();
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'] as const) {
    const size = parts[0].attributes[name].itemSize;
    const arr = name === 'skinIndex' ? new Uint16Array(total * size) : new Float32Array(total * size);
    let off = 0;
    for (const g of parts) {
      arr.set((g.attributes[name] as THREE.BufferAttribute).array as ArrayLike<number>, off);
      off += g.attributes[name].count * size;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  void inflate;
  return merged;
}

export function buildLayeredStarter(kind: 'shirt' | 'pants', name: string, puffiness: number, segments = 4): LayeredBuild {
  const { list, root } = buildSkeleton();
  const boneIndex = new Map(list.map((b, i) => [b.name, i]));
  const blend = 0.25;
  // inner cage hugs the body, the garment sits between, the outer cage fully covers the garment
  const inflates = { inner: 0.0, mesh: Math.max(0.04, puffiness), outer: Math.max(0.04, puffiness) * 1.35 + 0.03 };
  const skeleton = new THREE.Skeleton(list);

  const make = (label: string, inflate: number, withTexture: boolean) => {
    const geo = mergePieces(piecesFor(kind, inflate, segments), boneIndex, inflate, blend);
    const mat = new THREE.MeshStandardMaterial({ name: `${label}_mat`, color: '#ffffff', roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    if (withTexture) {
      try {
        const canvas = renderFull(kind);
        if (canvas.getContext('2d')) {
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          mat.map = tex;
        }
      } catch {
        /* no canvas available: export without a texture */
      }
    }
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = label;
    mesh.frustumCulled = false;
    return mesh;
  };

  const names = { mesh: name, inner: `${name}_InnerCage`, outer: `${name}_OuterCage` };
  const group = new THREE.Group();
  group.name = `${name}_LayeredStarter`;
  const body = make(names.mesh, inflates.mesh, true);
  const inner = make(names.inner, inflates.inner, false);
  const outer = make(names.outer, inflates.outer, false);
  group.add(root);
  for (const m of [body, inner, outer]) {
    group.add(m);
    m.bind(skeleton);
  }
  group.updateMatrixWorld(true);
  skeleton.calculateInverses();

  const geo = body.geometry;
  let maxInf = 0;
  const w = geo.attributes.skinWeight;
  for (let i = 0; i < w.count; i++) {
    let c = 0;
    for (let k = 0; k < 4; k++) if (w.getComponent(i, k) > 0) c++;
    maxInf = Math.max(maxInf, c);
  }
  return {
    group,
    names,
    stats: { triangles: geo.attributes.position.count / 3, vertices: geo.attributes.position.count, maxInfluences: maxInf, bones: list.length, segments: LAYERED_SEGMENTS[kind].length },
  };
}

export async function exportLayeredGlb(kind: ClothingKind, name: string, puffiness: number): Promise<{ blob: Blob; stats: LayeredStats; names: LayeredBuild['names'] }> {
  if (kind === 'tshirt') throw new Error('T-shirts are flat decals. Choose Shirt or Pants for layered clothing.');
  const built = buildLayeredStarter(kind, name, puffiness);
  const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
    new GLTFExporter().parse(built.group, (r) => resolve(r as ArrayBuffer), (e) => reject(e instanceof Error ? e : new Error('Export failed')), { binary: true, onlyVisible: false });
  });
  return { blob: new Blob([buf], { type: 'model/gltf-binary' }), stats: built.stats, names: built.names };
}
