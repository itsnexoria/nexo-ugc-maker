import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';

/** Everything in here works on plain triangle soup with position, normal and uv, like the editor's own meshes. */

export type BooleanOp = 'union' | 'subtract' | 'intersect';

export const triangleCount = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.attributes.position.count) / 3;

/** A copy with only position, normal and uv, not indexed, with normals and uvs filled in when missing. */
export function toSoup(source: THREE.BufferGeometry): THREE.BufferGeometry {
  let g = source.index ? source.toNonIndexed() : source.clone();
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  g.clearGroups();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

/** Mirrors across the YZ plane (x becomes -x) and keeps the faces pointing outward. */
export function mirrorGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = toSoup(source);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, -pos.getX(i));
    nor.setX(i, -nor.getX(i));
  }
  // a mirror turns every triangle inside out, so reverse the corner order of each one
  for (const a of [g.attributes.position, g.attributes.normal, g.attributes.uv] as THREE.BufferAttribute[]) {
    const n = a.itemSize;
    const arr = a.array as Float32Array;
    for (let t = 0; t < a.count; t += 3) {
      for (let k = 0; k < n; k++) {
        const tmp = arr[(t + 1) * n + k];
        arr[(t + 1) * n + k] = arr[(t + 2) * n + k];
        arr[(t + 2) * n + k] = tmp;
      }
    }
    a.needsUpdate = true;
  }
  g.computeBoundingBox();
  return g;
}

/** Union, subtraction or intersection of two meshes that are already in the same space. */
export function booleanGeometry(a: THREE.BufferGeometry, b: THREE.BufferGeometry, op: BooleanOp): THREE.BufferGeometry {
  const brushA = new Brush(toSoup(a));
  const brushB = new Brush(toSoup(b));
  brushA.updateMatrixWorld(true);
  brushB.updateMatrixWorld(true);
  const evaluator = new Evaluator();
  evaluator.attributes = ['position', 'normal', 'uv'];
  evaluator.useGroups = false;
  const result = evaluator.evaluate(brushA, brushB, op === 'union' ? ADDITION : op === 'subtract' ? SUBTRACTION : INTERSECTION);
  const out = toSoup(result.geometry);
  out.computeBoundingBox();
  return out;
}

interface Welded {
  indices: Uint32Array;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
}

/** Joins identical vertices (same position, normal and uv) so triangles share corners and can be collapsed. */
export function weld(soup: THREE.BufferGeometry): Welded {
  const p = soup.attributes.position as THREE.BufferAttribute;
  const n = soup.attributes.normal as THREE.BufferAttribute;
  const t = soup.attributes.uv as THREE.BufferAttribute;
  const map = new Map<string, number>();
  const idx: number[] = [];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const q = (v: number) => Math.round(v * 1e5);
  for (let i = 0; i < p.count; i++) {
    const key = `${q(p.getX(i))},${q(p.getY(i))},${q(p.getZ(i))}|${q(n.getX(i))},${q(n.getY(i))},${q(n.getZ(i))}|${q(t.getX(i))},${q(t.getY(i))}`;
    let v = map.get(key);
    if (v === undefined) {
      v = pos.length / 3;
      map.set(key, v);
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(t.getX(i), t.getY(i));
    }
    idx.push(v);
  }
  return { indices: Uint32Array.from(idx), positions: Float32Array.from(pos), normals: Float32Array.from(nor), uvs: Float32Array.from(uv) };
}

/**
 * Reduces a mesh to about `targetTriangles` by collapsing edges. Surviving vertices keep their own normals and
 * uvs, so textures stay where they were. The result can have more triangles than asked when the shape cannot be
 * simplified further without breaking it.
 */
export async function decimate(source: THREE.BufferGeometry, targetTriangles: number): Promise<THREE.BufferGeometry> {
  await MeshoptSimplifier.ready;
  const soup = toSoup(source);
  const w = weld(soup);
  const have = w.indices.length / 3;
  const target = Math.max(4, Math.floor(targetTriangles));
  if (target >= have) return soup;
  const [kept] = MeshoptSimplifier.simplify(w.indices, w.positions, 3, target * 3, 1, []);
  const out = new THREE.BufferGeometry();
  const pos = new Float32Array(kept.length * 3);
  const nor = new Float32Array(kept.length * 3);
  const uv = new Float32Array(kept.length * 2);
  kept.forEach((v, i) => {
    pos.set(w.positions.subarray(v * 3, v * 3 + 3), i * 3);
    nor.set(w.normals.subarray(v * 3, v * 3 + 3), i * 3);
    uv.set(w.uvs.subarray(v * 2, v * 2 + 2), i * 2);
  });
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingBox();
  return out;
}

/** Signed volume: positive when the faces point outward (used to check winding survives an operation). */
export function signedVolume(g: THREE.BufferGeometry): number {
  const s = toSoup(g);
  const p = s.attributes.position as THREE.BufferAttribute;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.cross(c)) / 6;
  }
  return v;
}
