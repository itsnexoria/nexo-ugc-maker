import * as THREE from 'three';
import type { SceneObject, Vec3 } from '../types';

export const DEG = Math.PI / 180;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const round = (v: number, digits = 3) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};
export const isFiniteVec = (v: ArrayLike<number>) => Array.from(v).every((n) => Number.isFinite(n));
export const addVec = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const subVec = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Local matrix of an object (T * R * S), rotation in degrees. */
export function localMatrix(
  o: Pick<SceneObject, 'position' | 'rotation' | 'scale'>,
  out = new THREE.Matrix4(),
): THREE.Matrix4 {
  _e.set(o.rotation[0] * DEG, o.rotation[1] * DEG, o.rotation[2] * DEG, 'XYZ');
  _q.setFromEuler(_e);
  _p.set(o.position[0], o.position[1], o.position[2]);
  _s.set(o.scale[0], o.scale[1], o.scale[2]);
  return out.compose(_p, _q, _s);
}

/** World matrix by walking up the parent chain. */
export function worldMatrix(objects: Record<string, SceneObject>, id: string): THREE.Matrix4 {
  const chain: SceneObject[] = [];
  let cur: SceneObject | undefined = objects[id];
  let guard = 0;
  while (cur && guard++ < 64) {
    chain.unshift(cur);
    cur = cur.parentId ? objects[cur.parentId] : undefined;
  }
  const m = new THREE.Matrix4();
  const l = new THREE.Matrix4();
  for (const o of chain) m.multiply(localMatrix(o, l));
  return m;
}

export function decomposeMatrix(m: THREE.Matrix4): { position: Vec3; rotation: Vec3; scale: Vec3 } {
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  m.decompose(p, q, s);
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return {
    position: [round(p.x, 4), round(p.y, 4), round(p.z, 4)],
    rotation: [round(e.x / DEG, 3), round(e.y / DEG, 3), round(e.z / DEG, 3)],
    scale: [round(s.x, 4), round(s.y, 4), round(s.z, 4)],
  };
}
