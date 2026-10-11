import * as THREE from 'three';
import type { ClothingKind, RigType, Vec3 } from '../types';
import { TEMPLATES, panelFor, type FaceId, type PartId } from './templates';

/** How one avatar bone is covered by the clothing template. */
export interface BodyMap {
  part: PartId;
  /** Vertical slice of the full limb/torso panel this bone shows, 0 = bottom, 1 = top */
  slice: [number, number];
  top: boolean;
  bottom: boolean;
}

const R6_PARTS: Record<string, PartId> = {
  Torso: 'torso',
  'Right Arm': 'rightArm',
  'Left Arm': 'leftArm',
  'Right Leg': 'rightLeg',
  'Left Leg': 'leftLeg',
};

type Chain = { part: PartId; bones: string[]; /** share of the 128 px panel height per bone, bottom first */ shares: number[] };

/**
 * Where R15 segments meet on the classic template. The limb split (64 px upper / 48 px lower / the rest
 * for hand or foot) comes from Roblox's R15 guidance on the DevForum; Roblox does not publish the torso
 * line, so the lower-torso share is an estimate. All three can be adjusted after testing on a real avatar.
 */
export interface R15Calibration {
  /** lower torso as a share of the torso panel height */
  torsoLower: number;
  /** upper arm/leg height in template px (of 128) */
  limbUpper: number;
  /** lower arm/leg height in template px (of 128) */
  limbLower: number;
}

export const R15_DEFAULTS: R15Calibration = { torsoLower: 0.2, limbUpper: 64, limbLower: 48 };
let cal: R15Calibration = { ...R15_DEFAULTS };

export function getR15Calibration(): R15Calibration {
  return cal;
}

export function setR15Calibration(patch: Partial<R15Calibration>): R15Calibration {
  const next = { ...cal, ...patch };
  next.torsoLower = Math.min(0.5, Math.max(0.05, next.torsoLower));
  next.limbUpper = Math.min(100, Math.max(30, Math.round(next.limbUpper)));
  next.limbLower = Math.min(120 - next.limbUpper > 20 ? 120 - next.limbUpper : 20, Math.max(16, Math.round(next.limbLower)));
  cal = next;
  return cal;
}

const limbShares = () => [Math.max(0, 128 - cal.limbUpper - cal.limbLower) / 128, cal.limbLower / 128, cal.limbUpper / 128];
const torsoShares = () => [cal.torsoLower, 1 - cal.torsoLower];

function chains(): Chain[] {
  const l = limbShares();
  return [
    { part: 'torso', bones: ['LowerTorso', 'UpperTorso'], shares: torsoShares() },
    { part: 'rightArm', bones: ['RightHand', 'RightLowerArm', 'RightUpperArm'], shares: l },
    { part: 'leftArm', bones: ['LeftHand', 'LeftLowerArm', 'LeftUpperArm'], shares: l },
    { part: 'rightLeg', bones: ['RightFoot', 'RightLowerLeg', 'RightUpperLeg'], shares: l },
    { part: 'leftLeg', bones: ['LeftFoot', 'LeftLowerLeg', 'LeftUpperLeg'], shares: l },
  ];
}

/** Joint lines (template px from the panel top) where R15 segments meet, for the 2D guides. */
export function r15JointOffsets(part: PartId): number[] {
  const shares = part === 'torso' ? torsoShares() : limbShares();
  const out: number[] = [];
  let below = 0;
  for (let i = 0; i < shares.length - 1; i++) {
    below += shares[i];
    out.push(128 * (1 - below));
  }
  return out;
}

/** How each R15 segment samples the classic-clothing panels. */
export function bodyMapFor(rig: RigType, bone: string): BodyMap | null {
  if (rig === 'R6') {
    const part = R6_PARTS[bone];
    return part ? { part, slice: [0, 1], top: true, bottom: true } : null;
  }
  for (const chain of chains()) {
    const idx = chain.bones.indexOf(bone);
    if (idx < 0) continue;
    const below = chain.shares.slice(0, idx).reduce((a, b) => a + b, 0);
    return {
      part: chain.part,
      slice: [below, below + chain.shares[idx]],
      top: idx === chain.bones.length - 1,
      bottom: idx === 0,
    };
  }
  return null;
}

/** Which clothing kinds draw on which body part. */
export function kindCovers(kind: ClothingKind, part: PartId): boolean {
  if (kind === 'shirt') return part === 'torso' || part === 'rightArm' || part === 'leftArm';
  if (kind === 'pants') return part === 'torso' || part === 'rightLeg' || part === 'leftLeg';
  return part === 'torso';
}

/**
 * Image-space basis for each box face, viewed from outside with the template's natural
 * unfolding: Front is -Z, Right is +X (Roblox NormalIds).
 */
const BASIS: Record<FaceId, { r: THREE.Vector3; u: THREE.Vector3 }> = {
  front: { r: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 1, 0) },
  back: { r: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 1, 0) },
  right: { r: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(0, 1, 0) },
  left: { r: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(0, 1, 0) },
  top: { r: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, 1) },
  bottom: { r: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, -1) },
};

function faceOfNormal(nx: number, ny: number, nz: number): FaceId {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ax >= ay && ax >= az) return nx > 0 ? 'right' : 'left';
  if (ay >= ax && ay >= az) return ny > 0 ? 'top' : 'bottom';
  return nz > 0 ? 'back' : 'front';
}

/** Template pixel position for a point on a face (also exported for tests). */
export function faceUvPixels(kind: ClothingKind, map: BodyMap, face: FaceId, p: THREE.Vector3, size: Vec3): [number, number] | null {
  const panel = panelFor(kind, map.part, face);
  if (!panel) return null;
  const { r, u } = BASIS[face];
  const extentR = Math.abs(r.x * size[0]) + Math.abs(r.y * size[1]) + Math.abs(r.z * size[2]);
  const extentU = Math.abs(u.x * size[0]) + Math.abs(u.y * size[1]) + Math.abs(u.z * size[2]);
  const s = p.dot(r) / extentR + 0.5;
  let t = p.dot(u) / extentU + 0.5;
  if (face !== 'top' && face !== 'bottom') t = map.slice[0] + t * (map.slice[1] - map.slice[0]);
  return [panel.x + s * panel.w, panel.y + (1 - t) * panel.h];
}

/**
 * Box geometry whose UVs point into the clothing template. `inflate` pushes the
 * surface slightly outside the body so it never z-fights with it.
 */
export function buildClothingGeometry(kind: ClothingKind, map: BodyMap, size: Vec3, inflate = 0.03, segments = 1): THREE.BufferGeometry {
  const spec = TEMPLATES[kind];
  const g = new THREE.BoxGeometry(size[0] + inflate, size[1] + inflate, size[2] + inflate, segments, segments, segments);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  const p = new THREE.Vector3();
  const blankU = 0.5 / spec.width;
  const blankV = 1 - 0.5 / spec.height;
  for (let i = 0; i < pos.count; i++) {
    const face = faceOfNormal(nor.getX(i), nor.getY(i), nor.getZ(i));
    const capHidden = (face === 'top' && !map.top) || (face === 'bottom' && !map.bottom);
    p.fromBufferAttribute(pos, i);
    // use the un-inflated size so the template stays aligned with the body
    const px = p.clone();
    px.x *= size[0] / (size[0] + inflate);
    px.y *= size[1] / (size[1] + inflate);
    px.z *= size[2] / (size[2] + inflate);
    const hit = capHidden ? null : faceUvPixels(kind, map, face, px, size);
    if (!hit) uv.setXY(i, blankU, blankV);
    else uv.setXY(i, hit[0] / spec.width, 1 - hit[1] / spec.height);
  }
  uv.needsUpdate = true;
  return g;
}

/** Flat plane in front of the torso for the T-shirt graphic. */
export function buildTshirtGeometry(map: BodyMap, size: Vec3): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(size[0], size[1]);
  g.rotateY(Math.PI); // face -Z
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const t = uv.getY(i);
    uv.setY(i, map.slice[0] + t * (map.slice[1] - map.slice[0]));
  }
  uv.needsUpdate = true;
  return g;
}
