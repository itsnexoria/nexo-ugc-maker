import * as THREE from 'three';
import { boxUnwrap } from './geometry';

export type UvOp = 'flipU' | 'flipV' | 'rotate90' | 'fit' | 'boxUnwrap';

export const UV_OP_LABEL: Record<UvOp, string> = {
  flipU: 'Flip left-right',
  flipV: 'Flip up-down',
  rotate90: 'Rotate 90°',
  fit: 'Fill the square',
  boxUnwrap: 'Auto unwrap (box)',
};

/** Where a mesh's uv lands on the texture once the material's repeat, offset and rotation (about the middle) are applied. */
export function uvToTexture(u: number, v: number, repeat: [number, number], offset: [number, number], rotationDeg: number): [number, number] {
  const rot = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const cx = 0.5;
  const cy = 0.5;
  const [sx, sy] = repeat;
  const [tx, ty] = offset;
  // the same matrix three.js builds for a texture (Matrix3.setUvTransform)
  return [sx * c * u + sx * s * v + (-sx * (c * cx + s * cy) + cx + tx), -sy * s * u + sy * c * v + (-sy * (-s * cx + c * cy) + cy + ty)];
}

export interface UvBounds {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

export function uvBounds(g: THREE.BufferGeometry): UvBounds | null {
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv || !uv.count) return null;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    minU = Math.min(minU, uv.getX(i));
    maxU = Math.max(maxU, uv.getX(i));
    minV = Math.min(minV, uv.getY(i));
    maxV = Math.max(maxV, uv.getY(i));
  }
  return { minU, maxU, minV, maxV };
}

/** True when every triangle has uvs that are not all the same point (a mesh with zero uvs shows one colour). */
export function hasUsableUvs(g: THREE.BufferGeometry): boolean {
  const b = uvBounds(g);
  return !!b && (b.maxU - b.minU > 1e-6 || b.maxV - b.minV > 1e-6);
}

/** A copy of the mesh with its uvs edited. Positions and normals are untouched. */
export function editUv(source: THREE.BufferGeometry, op: UvOp): THREE.BufferGeometry {
  if (op === 'boxUnwrap') return boxUnwrap(source);
  const g = source.clone();
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return g;
  const b = uvBounds(g)!;
  const cu = (b.minU + b.maxU) / 2;
  const cv = (b.minV + b.maxV) / 2;
  const w = b.maxU - b.minU || 1;
  const h = b.maxV - b.minV || 1;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (op === 'flipU') uv.setX(i, 2 * cu - u);
    else if (op === 'flipV') uv.setY(i, 2 * cv - v);
    else if (op === 'rotate90') uv.setXY(i, cu - (v - cv), cv + (u - cu)); // about the middle of the island
    else if (op === 'fit') uv.setXY(i, (u - b.minU) / w, (v - b.minV) / h);
  }
  uv.needsUpdate = true;
  return g;
}
