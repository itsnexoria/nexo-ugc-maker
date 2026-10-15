import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { booleanGeometry, decimate, mirrorGeometry, signedVolume, toSoup, triangleCount, weld } from '../src/utils/meshOps';

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const bbox = (g: THREE.BufferGeometry) => (g.computeBoundingBox(), g.boundingBox!);

describe('toSoup', () => {
  it('is non-indexed with position, normal and uv only', () => {
    const g = toSoup(box(1, 1, 1));
    expect(g.index).toBeNull();
    expect(Object.keys(g.attributes).sort()).toEqual(['normal', 'position', 'uv']);
    expect(triangleCount(g)).toBe(12);
  });
  it('fills in missing uvs and normals', () => {
    const raw = new THREE.BufferGeometry();
    raw.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    const g = toSoup(raw);
    expect(g.attributes.uv.count).toBe(3);
    expect(g.attributes.normal.count).toBe(3);
  });
});

describe('mirrorGeometry', () => {
  it('flips across x and keeps the faces pointing outward', () => {
    const g = box(2, 2, 2, 5, 0, 0);
    const m = mirrorGeometry(g);
    expect(bbox(m).min.x).toBeCloseTo(-6);
    expect(bbox(m).max.x).toBeCloseTo(-4);
    expect(signedVolume(g)).toBeGreaterThan(0);
    expect(signedVolume(m)).toBeCloseTo(signedVolume(g));
    expect(triangleCount(m)).toBe(12);
  });
  it('mirroring twice gives the original shape back', () => {
    const g = box(1, 2, 3, 4, 5, 6);
    const back = mirrorGeometry(mirrorGeometry(g));
    expect(bbox(back).min.x).toBeCloseTo(bbox(g).min.x);
    expect(bbox(back).max.y).toBeCloseTo(bbox(g).max.y);
    expect(signedVolume(back)).toBeCloseTo(signedVolume(g));
  });
  it('does not change the source', () => {
    const g = box(1, 1, 1, 3, 0, 0);
    mirrorGeometry(g);
    expect(bbox(g).min.x).toBeCloseTo(2.5);
  });
});

describe('booleanGeometry', () => {
  const a = box(2, 2, 2);
  const b = box(2, 2, 2, 1, 0, 0);
  it('union spans both shapes', () => {
    const r = booleanGeometry(a, b, 'union');
    expect(bbox(r).min.x).toBeCloseTo(-1);
    expect(bbox(r).max.x).toBeCloseTo(2);
    expect(signedVolume(r)).toBeCloseTo(12, 1); // 8 + 8 - overlap 4
  });
  it('subtract removes the overlap', () => {
    const r = booleanGeometry(a, b, 'subtract');
    expect(bbox(r).max.x).toBeCloseTo(0);
    expect(signedVolume(r)).toBeCloseTo(4, 1);
  });
  it('intersect keeps only the overlap', () => {
    const r = booleanGeometry(a, b, 'intersect');
    expect(bbox(r).min.x).toBeCloseTo(0);
    expect(bbox(r).max.x).toBeCloseTo(1);
    expect(signedVolume(r)).toBeCloseTo(4, 1);
  });
  it('keeps uvs and normals', () => {
    const r = booleanGeometry(a, b, 'union');
    expect(r.attributes.uv.count).toBe(r.attributes.position.count);
    expect(r.attributes.normal.count).toBe(r.attributes.position.count);
  });
});

describe('decimate', () => {
  const sphere = () => new THREE.SphereGeometry(1, 48, 24);

  it('welds shared corners', () => {
    const w = weld(toSoup(box(1, 1, 1)));
    expect(w.indices.length / 3).toBe(12);
    expect(w.positions.length / 3).toBeLessThan(36);
  });

  it('reduces to about the target and keeps the shape, uvs and winding', async () => {
    const g = sphere();
    const before = triangleCount(g);
    expect(before).toBeGreaterThan(2000);
    const small = await decimate(g, 600);
    const n = triangleCount(small);
    expect(n).toBeLessThanOrEqual(700);
    expect(n).toBeGreaterThan(200);
    expect(bbox(small).max.y).toBeGreaterThan(0.9);
    expect(small.attributes.uv.count).toBe(small.attributes.position.count);
    expect(signedVolume(small)).toBeGreaterThan(signedVolume(g) * 0.7);
  });

  it('returns the mesh unchanged when it is already small enough', async () => {
    const g = box(1, 1, 1);
    const r = await decimate(g, 5000);
    expect(triangleCount(r)).toBe(12);
  });

  it('can be applied repeatedly', async () => {
    const once = await decimate(sphere(), 800);
    const twice = await decimate(once, 300);
    expect(triangleCount(twice)).toBeLessThan(triangleCount(once));
  });
});
