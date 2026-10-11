import * as THREE from 'three';
import type { ModelAsset, SceneObject } from '../types';
import { getPaintGeometry } from './geometry';
import { worldMatrix } from './math';
import { rootOf } from './scene';

/**
 * Symmetry painting for accessories. The mirror plane is the accessory root's local X = 0 plane.
 * The brush position is reflected through that plane and looked up on the matching part
 * (the same part when it is centred, otherwise its left/right twin), so a stroke on one horn
 * also lands on the other horn at the mirrored spot.
 */
export interface MirrorHit {
  /** UV (three.js convention, v up) on the partner part */
  u: number;
  v: number;
  /** distance from the reflected point to the partner surface (world units) */
  distance: number;
}

const MAX_TRIANGLES = 6000;

function reflectionMatrix(rootWorld: THREE.Matrix4): THREE.Matrix4 {
  const flip = new THREE.Matrix4().makeScale(-1, 1, 1);
  return rootWorld.clone().multiply(flip).multiply(rootWorld.clone().invert());
}

function partCentre(objects: Record<string, SceneObject>, id: string): THREE.Vector3 {
  return new THREE.Vector3().setFromMatrixPosition(worldMatrix(objects, id));
}

/** The part a stroke on `id` should be mirrored onto, or null when there is none. */
export function findMirrorPartner(objects: Record<string, SceneObject>, id: string): string | null {
  const me = objects[id];
  const root = me ? rootOf(objects, id) : undefined;
  if (!me || !root || me.kind === 'group') return null;
  const reflect = reflectionMatrix(worldMatrix(objects, root.id));
  const mine = partCentre(objects, id);
  const mirrored = mine.clone().applyMatrix4(reflect);
  const scale = Math.max(...me.scale, 0.2);
  const tol = 0.04 + scale * 0.06;
  // centred parts are their own partner
  if (mine.distanceTo(mirrored) <= tol) return id;
  let best: { id: string; d: number } | null = null;
  for (const o of Object.values(objects)) {
    if (o.id === id || o.kind === 'group' || o.kind !== me.kind || rootOf(objects, o.id)?.id !== root.id) continue;
    const d = partCentre(objects, o.id).distanceTo(mirrored);
    if (d <= tol && (!best || d < best.d)) best = { id: o.id, d };
  }
  return best?.id ?? null;
}

const _tri = new THREE.Triangle();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const _bary = new THREE.Vector3();

/** Where the reflection of `worldPoint` lands on the partner part's painted surface. */
export function mirrorPaintHit(
  objects: Record<string, SceneObject>,
  models: Record<string, ModelAsset>,
  sourceId: string,
  partnerId: string,
  worldPoint: THREE.Vector3,
): MirrorHit | null {
  const partner = objects[partnerId];
  const root = rootOf(objects, sourceId);
  if (!partner || !root) return null;
  const reflect = reflectionMatrix(worldMatrix(objects, root.id));
  const local = worldPoint.clone().applyMatrix4(reflect).applyMatrix4(worldMatrix(objects, partnerId).invert());
  const g = getPaintGeometry(partner.kind, partner.detail, partner.modelId ? models[partner.modelId] : undefined);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const index = g.index;
  const count = index ? index.count / 3 : pos.count / 3;
  if (count > MAX_TRIANGLES) return null;
  let bestD = Infinity;
  let bu = 0;
  let bv = 0;
  for (let t = 0; t < count; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    _a.fromBufferAttribute(pos, i0);
    _b.fromBufferAttribute(pos, i1);
    _c.fromBufferAttribute(pos, i2);
    _tri.set(_a, _b, _c);
    _tri.closestPointToPoint(local, _p);
    const d = _p.distanceToSquared(local);
    if (d >= bestD) continue;
    bestD = d;
    if (!THREE.Triangle.getBarycoord(_p, _a, _b, _c, _bary)) continue;
    bu = uv.getX(i0) * _bary.x + uv.getX(i1) * _bary.y + uv.getX(i2) * _bary.z;
    bv = uv.getY(i0) * _bary.x + uv.getY(i1) * _bary.y + uv.getY(i2) * _bary.z;
  }
  if (!Number.isFinite(bestD)) return null;
  // distance is measured in the partner's local units; scale it back roughly to world units
  const s = new THREE.Vector3().setFromMatrixScale(worldMatrix(objects, partnerId));
  return { u: bu, v: bv, distance: Math.sqrt(bestD) * Math.max(s.x, s.y, s.z) };
}
