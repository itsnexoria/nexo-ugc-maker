import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { editUv, hasUsableUvs, uvBounds, uvToTexture } from '../src/utils/uvOps';

const tri = (uvs: number[]) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  return g;
};
const uvs = (g: THREE.BufferGeometry) => Array.from(g.attributes.uv.array).map((x) => Math.round(x * 1000) / 1000);

describe('uvToTexture', () => {
  it('is the identity with default settings', () => {
    expect(uvToTexture(0.2, 0.7, [1, 1], [0, 0], 0)).toEqual([0.2, 0.7]);
  });
  it('applies repeat and offset', () => {
    const [u, v] = uvToTexture(0.5, 0.5, [2, 3], [0.1, 0.2], 0);
    // repeat scales about the centre of the texture, then the offset shifts it
    expect(u).toBeCloseTo(0.5 + 0.1);
    expect(v).toBeCloseTo(0.5 + 0.2);
    const [u2] = uvToTexture(1, 0.5, [2, 1], [0, 0], 0);
    expect(u2).toBeCloseTo(1.5);
  });
  it('rotates about the middle of the texture', () => {
    const [u, v] = uvToTexture(0.5, 0.5, [1, 1], [0, 0], 90);
    expect(u).toBeCloseTo(0.5);
    expect(v).toBeCloseTo(0.5);
    const [a, b] = uvToTexture(1, 0.5, [1, 1], [0, 0], 90);
    expect(a).toBeCloseTo(0.5);
    expect(Math.abs(b - 0.5)).toBeCloseTo(0.5);
  });
  it('matches three.js texture matrix', () => {
    const t = new THREE.Texture();
    t.repeat.set(1.5, 0.75);
    t.offset.set(0.3, -0.2);
    t.center.set(0.5, 0.5);
    t.rotation = 0.6;
    t.updateMatrix();
    const p = new THREE.Vector2(0.37, 0.81).applyMatrix3(t.matrix);
    const [u, v] = uvToTexture(0.37, 0.81, [1.5, 0.75], [0.3, -0.2], (0.6 * 180) / Math.PI);
    expect(u).toBeCloseTo(p.x, 5);
    expect(v).toBeCloseTo(p.y, 5);
  });
});

describe('editUv', () => {
  const g = tri([0.1, 0.2, 0.5, 0.2, 0.1, 0.8]);

  it('flips about the middle of the island, leaving positions alone', () => {
    expect(uvs(editUv(g, 'flipU'))).toEqual([0.5, 0.2, 0.1, 0.2, 0.5, 0.8]);
    expect(uvs(editUv(g, 'flipV'))).toEqual([0.1, 0.8, 0.5, 0.8, 0.1, 0.2]);
    expect(Array.from(editUv(g, 'flipU').attributes.position.array)).toEqual(Array.from(g.attributes.position.array));
  });

  it('does not change the original', () => {
    editUv(g, 'rotate90');
    expect(uvs(g)).toEqual([0.1, 0.2, 0.5, 0.2, 0.1, 0.8]);
  });

  it('four quarter turns come back to the start', () => {
    let r = g;
    for (let i = 0; i < 4; i++) r = editUv(r, 'rotate90');
    uvs(r).forEach((x, i) => expect(x).toBeCloseTo(uvs(g)[i], 2));
  });

  it('fill the square stretches the island to 0..1', () => {
    const b = uvBounds(editUv(g, 'fit'))!;
    expect([b.minU, b.maxU, b.minV, b.maxV].map((x) => Math.round(x * 1000) / 1000)).toEqual([0, 1, 0, 1]);
  });

  it('auto unwrap gives a mesh with zero uvs usable ones', () => {
    const flat = tri([0, 0, 0, 0, 0, 0]);
    expect(hasUsableUvs(flat)).toBe(false);
    expect(hasUsableUvs(editUv(flat, 'boxUnwrap'))).toBe(true);
  });

  it('a mesh without uvs does not crash', () => {
    const bare = new THREE.BufferGeometry();
    bare.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    expect(() => editUv(bare, 'flipU')).not.toThrow();
    expect(uvBounds(bare)).toBeNull();
  });
});
