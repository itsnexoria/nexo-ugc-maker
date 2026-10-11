import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { exportLayeredGlb } from '../src/clothing/layered';
import { buildFromTemplate, classifyName, describeTemplate, drawAffineTriangle, parseTemplate, uvLayoutGuide, weldedNormals } from '../src/clothing/layeredTemplate';
import { R15_DEFAULTS, bodyMapFor, getR15Calibration, r15JointOffsets, setR15Calibration } from '../src/clothing/mapping';
import { r15TestPattern } from '../src/clothing/presets';
import { TEMPLATES } from '../src/clothing/templates';
import { useClothing } from '../src/store/clothing';
import { useEditor } from '../src/store/editor';
import { buildProject } from '../src/assets/sample';
import { formatPerfReport } from '../src/utils/perf';

const readBuf = (b: Blob) =>
  new Promise<ArrayBuffer>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(b);
  });

/** A stand-in "Roblox template": our own starter export has the same shape (named cages, R15 skin). */
async function syntheticTemplate() {
  const { blob } = await exportLayeredGlb('shirt', 'Tpl', 0.1);
  return parseTemplate('tpl.glb', await readBuf(blob));
}

describe('layered clothing from a template', () => {
  it('recognises cage meshes by name', () => {
    expect(classifyName('Clothing_InnerCage')).toBe('inner');
    expect(classifyName('Jacket_OuterCage')).toBe('outer');
    expect(classifyName('LeftUpperArm_Cage')).toBe('other');
    expect(classifyName('UpperTorso')).toBe('body');
  });

  it('reads meshes, roles and the skeleton from a file', async () => {
    const info = await syntheticTemplate();
    expect(info.meshes.map((m) => m.role).sort()).toEqual(['body', 'inner', 'outer']);
    expect(info.bones).toBeGreaterThan(10);
    expect(info.meshes.every((m) => m.skinned && m.hasUv)).toBe(true);
  });

  it('keeps the inner cage vertices, UVs and skin exactly, and offsets the others', async () => {
    const info = await syntheticTemplate();
    const innerSrc = info.meshes.find((m) => m.role === 'inner')!.mesh;
    const b = buildFromTemplate(info, { kind: 'shirt', name: 'Jacket', puffiness: 0.12, frontPositiveZ: false });
    expect(b.names).toEqual({ mesh: 'Jacket', inner: 'Jacket_InnerCage', outer: 'Jacket_OuterCage' });
    const get = (n: string) => b.group.children.find((c) => c.name === n) as THREE.SkinnedMesh;
    const inner = get('Jacket_InnerCage');
    const outer = get('Jacket_OuterCage');
    const garment = get('Jacket');
    const src = innerSrc.geometry as THREE.BufferGeometry;
    const flat = src.index ? src.toNonIndexed() : src;
    expect(inner.geometry.attributes.position.count).toBe(flat.attributes.position.count);
    expect(outer.geometry.attributes.position.count).toBe(inner.geometry.attributes.position.count);
    expect(garment.geometry.attributes.position.count).toBe(inner.geometry.attributes.position.count);
    for (let i = 0; i < flat.attributes.position.count; i += 7) {
      for (let k = 0; k < 3; k++) expect(inner.geometry.attributes.position.getComponent(i, k)).toBeCloseTo(flat.attributes.position.getComponent(i, k), 5);
      for (let k = 0; k < 2; k++) {
        expect(inner.geometry.attributes.uv.getComponent(i, k)).toBeCloseTo(flat.attributes.uv.getComponent(i, k), 6);
        expect(outer.geometry.attributes.uv.getComponent(i, k)).toBeCloseTo(flat.attributes.uv.getComponent(i, k), 6);
      }
      for (let k = 0; k < 4; k++) {
        expect(inner.geometry.attributes.skinWeight.getComponent(i, k)).toBeCloseTo(flat.attributes.skinWeight.getComponent(i, k), 6);
        expect(outer.geometry.attributes.skinIndex.getComponent(i, k)).toBe(flat.attributes.skinIndex.getComponent(i, k));
      }
    }
    const size = (m: THREE.Mesh) => {
      m.geometry.computeBoundingBox();
      return m.geometry.boundingBox!.getSize(new THREE.Vector3()).length();
    };
    expect(size(outer)).toBeGreaterThan(size(garment));
    expect(size(garment)).toBeGreaterThan(size(inner));
    expect(b.stats.bones).toBe(info.bones);
  });

  it('rebuilds a self-contained skeleton with the template bone names', async () => {
    const info = await syntheticTemplate();
    const b = buildFromTemplate(info, { kind: 'shirt', name: 'J', puffiness: 0.1, frontPositiveZ: false });
    const bones: string[] = [];
    b.group.traverse((o) => (o as THREE.Bone).isBone && bones.push(o.name));
    expect(bones).toContain('HumanoidRootPart');
    expect(bones).toContain('RightUpperArm');
    expect(bones.length).toBe(info.bones);
  });

  it('keeps only the garment body parts when the cage covers the whole body', async () => {
    const info = await syntheticTemplate();
    const pants = buildFromTemplate(info, { kind: 'pants', name: 'P', puffiness: 0.1, frontPositiveZ: false });
    const shirt = buildFromTemplate(info, { kind: 'shirt', name: 'S', puffiness: 0.1, frontPositiveZ: false });
    expect(pants.stats.filtered).toBe(true);
    // the shirt-only cage contains torso and arms, so pants (torso + legs) keep a smaller, different set
    expect(pants.stats.triangles).toBeLessThan(shirt.stats.triangles + 2000);
    expect(pants.stats.triangles).toBeGreaterThan(0);
  });

  it('warns instead of failing when no cage is named and when there is no skin', () => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const root = new THREE.Group();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
    m.name = 'Body';
    root.add(m);
    const info = describeTemplate('x.obj', root);
    const b = buildFromTemplate(info, { kind: 'shirt', name: 'X', puffiness: 0.1, frontPositiveZ: false });
    expect(b.warnings.some((w) => /No mesh named like an inner cage/.test(w))).toBe(true);
    expect(b.warnings.some((w) => /no skin weights/.test(w))).toBe(true);
    expect(b.stats.bones).toBe(0);
  });

  it('averages normals across split vertices so offsets do not crack the mesh', () => {
    const flat = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const n = weldedNormals(flat);
    // every copy of the corner at (+,+,+) must share one diagonal normal
    const pos = flat.attributes.position;
    const seen: number[][] = [];
    for (let i = 0; i < pos.count; i++) if (pos.getX(i) > 0.4 && pos.getY(i) > 0.4 && pos.getZ(i) > 0.4) seen.push([n[i * 3], n[i * 3 + 1], n[i * 3 + 2]]);
    expect(seen.length).toBeGreaterThan(2);
    // all copies are identical (that is what keeps the offset surface closed) and point outwards
    for (const v of seen) {
      for (let k = 0; k < 3; k++) {
        expect(v[k]).toBeCloseTo(seen[0][k], 6);
        expect(v[k]).toBeGreaterThan(0);
      }
      expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 5);
    }
  });

  it('solves the affine map used to transfer the design onto the cage UVs', () => {
    const calls: number[][] = [];
    const ctx = {
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, drawImage() {},
      setTransform: (...a: number[]) => calls.push(a),
    } as unknown as CanvasRenderingContext2D;
    drawAffineTriangle(ctx, {} as CanvasImageSource, [[0, 0], [10, 0], [0, 10]], [[5, 5], [25, 5], [5, 25]]);
    expect(calls[0].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([2, 0, 0, 2, 5, 5]);
    // a degenerate source triangle is skipped
    calls.length = 0;
    drawAffineTriangle(ctx, {} as CanvasImageSource, [[0, 0], [1, 1], [2, 2]], [[0, 0], [1, 0], [0, 1]]);
    expect(calls).toHaveLength(0);
  });

  it('draws no UV guide without a canvas rather than throwing', () => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    expect(() => uvLayoutGuide(g)).not.toThrow();
  });
});

describe('R15 calibration', () => {
  it('moves the segment boundaries and can be reset', () => {
    setR15Calibration({ limbUpper: 80, limbLower: 30 });
    const up = bodyMapFor('R15', 'RightUpperArm')!;
    const lo = bodyMapFor('R15', 'RightLowerArm')!;
    expect((up.slice[1] - up.slice[0]) * 128).toBeCloseTo(80, 5);
    expect((lo.slice[1] - lo.slice[0]) * 128).toBeCloseTo(30, 5);
    // from the top: shoulder-to-elbow is 80 px, elbow-to-wrist ends at 110 px, the last 18 px are the hand
    expect(r15JointOffsets('rightArm')).toEqual([110, 80]);
    setR15Calibration({ ...R15_DEFAULTS });
    expect(r15JointOffsets('rightArm')).toEqual([112, 64]);
  });

  it('keeps values in a sane range', () => {
    const c = setR15Calibration({ torsoLower: 5, limbUpper: 500, limbLower: -4 });
    expect(c.torsoLower).toBeLessThanOrEqual(0.5);
    expect(c.limbUpper).toBeLessThanOrEqual(100);
    expect(128 - c.limbUpper - c.limbLower).toBeGreaterThanOrEqual(8);
    setR15Calibration({ ...R15_DEFAULTS });
  });

  it('saves the tuned split with the project and restores it on load', () => {
    useEditor.getState().loadProject({ id: 'r', name: 'r', createdAt: 0 }, buildProject('clothing'));
    useClothing.getState().setR15Cal({ torsoLower: 0.3 });
    const data = JSON.parse(JSON.stringify(useClothing.getState().serialize()));
    expect(data.r15.torsoLower).toBe(0.3);
    useClothing.getState().setR15Cal('reset');
    expect(useClothing.getState().serialize().r15).toBeUndefined();
    useClothing.getState().load(data);
    expect(getR15Calibration().torsoLower).toBe(0.3);
    useClothing.getState().load({ version: 1, designs: { shirt: [], pants: [], tshirt: [] }, images: [], activeKind: 'shirt' });
    expect(getR15Calibration().torsoLower).toBe(R15_DEFAULTS.torsoLower);
  });

  it('builds a numbered test pattern covering every panel', () => {
    for (const kind of ['shirt', 'pants'] as const) {
      const layers = r15TestPattern(kind);
      for (const p of TEMPLATES[kind].panels) expect(layers.some((l) => l.clip === p.id), p.id).toBe(true);
      const sides = TEMPLATES[kind].panels.filter((p) => p.face !== 'top' && p.face !== 'bottom');
      // one numbered label per 16 px band on every side panel
      expect(layers.filter((l) => l.type === 'text' && /n\d+$/.test(l.name)).length).toBe(sides.reduce((n, p) => n + p.h / 16, 0));
    }
  });
});

describe('performance report', () => {
  it('formats a readable report', () => {
    const text = formatPerfReport({ gpu: 'Test GPU', software: false, cores: 4, memoryGb: 8, fps: 58.2, compositeMs: 3.2, brushMs: 1.4, recommended: 'high', reasons: ['Everything measured fast.'], touch: false });
    expect(text).toContain('Recommended quality: high');
    expect(text).toContain('Soft brush move: 1.4 ms');
  });
});
