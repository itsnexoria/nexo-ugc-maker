import { beforeEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import * as THREE from 'three';
import { useEditor } from '../src/store/editor';
import { useClothing, mirrorPoint } from '../src/store/clothing';
import { buildProject } from '../src/assets/sample';
import { ASSETS } from '../src/assets/presets';
import { atlasGrid, bakeMerged, bakedColor, cellUv } from '../src/utils/bake';
import { runExport, primaryRoot, type ExportInput } from '../src/utils/exporter';
import { validateProject, LIMITS } from '../src/utils/validation';
import { robloxAttachmentFor } from '../src/assets/avatar';

const readBuf = (b: Blob) =>
  new Promise<ArrayBuffer>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(b);
  });

function input(): ExportInput {
  const s = useEditor.getState();
  return { objects: s.objects, order: s.order, layers: s.layers, textures: s.textures, models: s.models, rig: s.rig };
}
const base = { units: 'studs' as const, includeAvatar: false, includeHidden: false, filename: 'Test' };

describe('merge + bake', () => {
  beforeEach(() => useEditor.getState().loadProject({ id: 'b', name: 'b', createdAt: 0 }, buildProject('cyber-crown')));

  it('lays out atlas cells without overlap', () => {
    expect(atlasGrid(1)).toBe(1);
    expect(atlasGrid(17)).toBe(5);
    const seen = new Set<string>();
    for (let i = 0; i < 17; i++) {
      const c = cellUv(5, i);
      expect(c.u1).toBeGreaterThan(c.u0);
      expect(c.v1).toBeGreaterThan(c.v0);
      seen.add(`${c.u0.toFixed(3)},${c.v0.toFixed(3)}`);
    }
    expect(seen.size).toBe(17);
  });

  it('bakes glow into the flat colour', () => {
    const glow = Object.values(useEditor.getState().objects).find((o) => o.material.emissiveIntensity > 0)!;
    const c = new THREE.Color(bakedColor(glow));
    const plain = new THREE.Color(glow.material.color);
    expect(c.r).toBeGreaterThan(plain.r);
  });

  it('joins every visible part into one mesh with UVs inside the atlas', async () => {
    const s = input();
    const r = await bakeMerged({ ...s, layers: s.layers }, 1024, null);
    expect(r.parts).toBe(Object.values(s.objects).filter((o) => o.kind !== 'group').length);
    const tris = r.geometry.attributes.position.count / 3;
    expect(tris).toBe(r.triangles);
    const uv = r.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(i)).toBeLessThanOrEqual(1);
    }
  });

  it('moves the origin to the attachment point', async () => {
    const s = input();
    const root = primaryRoot(s)!;
    const world = await bakeMerged(s, 512, null);
    const centred = await bakeMerged(s, 512, new THREE.Vector3(...root.position));
    const dy = world.geometry.boundingBox!.min.y - centred.geometry.boundingBox!.min.y;
    expect(dy).toBeCloseTo(root.position[1], 4);
  });

  it('exports a merged GLB and OBJ zip with one object', async () => {
    const glb = await runExport(input(), { ...base, format: 'glb', merge: true });
    expect(new TextDecoder().decode(new Uint8Array(await readBuf(glb.blob)).slice(0, 4))).toBe('glTF');
    expect(glb.attachment).toBe('HatAttachment');
    const obj = await runExport(input(), { ...base, format: 'obj', merge: true });
    const zip = await JSZip.loadAsync(await readBuf(obj.blob));
    const text = await zip.file('Test.obj')!.async('string');
    expect((text.match(/^o /gm) ?? []).length).toBe(1);
    expect((text.match(/^f /gm) ?? []).length).toBe(obj.triangles);
    expect(text).not.toMatch(/NaN/);
  });

  it('suggests Roblox attachment names', () => {
    expect(robloxAttachmentFor('face')).toBe('FaceFrontAttachment');
    expect(robloxAttachmentFor('shoulder', -1)).toBe('LeftShoulderAttachment');
    expect(robloxAttachmentFor('shoulder', 1)).toBe('RightShoulderAttachment');
    expect(robloxAttachmentFor('back')).toBe('BodyBackAttachment');
  });
});

describe('triangle optimizer', () => {
  beforeEach(() => useEditor.getState().loadProject({ id: 'o', name: 'o', createdAt: 0 }, buildProject('blank')));

  it('brings an over-budget scene under the limit and can be undone', () => {
    const wings = ASSETS.find((a) => a.id === 'back-wings')!;
    for (let i = 0; i < 3; i++) useEditor.getState().addAccessory(wings.build(), 'back');
    for (let i = 0; i < 12; i++) useEditor.getState().addPrimitive('sphere');
    const s = useEditor.getState();
    const before = validateProject({ objects: s.objects, order: s.order, layers: s.layers, textures: s.textures, models: s.models }).triangles;
    expect(before).toBeGreaterThan(LIMITS.maxTriangles);
    const r = useEditor.getState().optimizeTriangles(Math.floor(LIMITS.maxTriangles * 0.85));
    expect(r.changed).toBeGreaterThan(0);
    const s2 = useEditor.getState();
    const after = validateProject({ objects: s2.objects, order: s2.order, layers: s2.layers, textures: s2.textures, models: s2.models }).triangles;
    expect(after).toBeLessThanOrEqual(LIMITS.maxTriangles);
    expect(after).toBe(r.after);
    useEditor.getState().undo();
    const s3 = useEditor.getState();
    expect(validateProject({ objects: s3.objects, order: s3.order, layers: s3.layers, textures: s3.textures, models: s3.models }).triangles).toBe(before);
  });
});

describe('clothing: import, reorder, symmetry', () => {
  beforeEach(() => {
    useEditor.getState().loadProject({ id: 'c', name: 'c', createdAt: 0 }, buildProject('clothing'));
    useClothing.getState().load({ version: 1, designs: { shirt: [], pants: [], tshirt: [] }, images: [], activeKind: 'shirt' });
  });

  it('imports an existing shirt PNG as the bottom layer, 1:1', () => {
    const cl = useClothing.getState();
    cl.addLayer('text');
    const img = { id: 'i1', name: 'old', dataUrl: 'data:,', width: 585, height: 559 };
    cl.addImage(img);
    cl.addBaseImage(img, 'exact');
    const layers = useClothing.getState().designs.shirt;
    expect(layers[0].type).toBe('image');
    expect(layers[0].type === 'image' && [layers[0].x, layers[0].y, layers[0].w, layers[0].h]).toEqual([292.5, 279.5, 585, 559]);
    expect(layers[1].type).toBe('text');
  });

  it('reorders a layer in a single undo step', () => {
    const cl = useClothing.getState();
    const a = cl.addLayer('fill');
    const b = cl.addLayer('shape');
    const c = cl.addLayer('text');
    const past = useClothing.getState().past.length;
    useClothing.getState().reorderLayer(c, 0);
    expect(useClothing.getState().designs.shirt.map((l) => l.id)).toEqual([c, a, b]);
    expect(useClothing.getState().past.length).toBe(past + 1);
    useClothing.getState().undo();
    expect(useClothing.getState().designs.shirt.map((l) => l.id)).toEqual([a, b, c]);
  });

  it('mirrors a point to the other side of the body', () => {
    // right arm front centre is x=249, left arm front centre x=340. 10 px left of centre -> 10 px right of centre
    expect(mirrorPoint('shirt', [239, 400])).toEqual([350, 400]);
    // torso front mirrors within itself: centre x = 295
    expect(mirrorPoint('shirt', [275, 100])).toEqual([315, 100]);
    expect(mirrorPoint('shirt', [2, 2])).toBeNull();
  });

  it('paints both sides with symmetry on, and extends both strokes', () => {
    useClothing.getState().setBrush({ symmetry: true, hardness: 0.4, opacity: 0.5 });
    const r = useClothing.getState().beginStroke({ color: '#ff0000', size: 6, erase: false, points: [[275, 100]] });
    expect(r.mirrorIndex).not.toBeNull();
    useClothing.getState().extendStroke(r.layerId, r.index, [280, 110], r.mirrorIndex);
    const layer = useClothing.getState().designs.shirt.find((l) => l.id === r.layerId)!;
    expect(layer.type === 'paint' && layer.strokes).toHaveLength(2);
    if (layer.type === 'paint') {
      expect(layer.strokes[0].hardness).toBe(0.4);
      expect(layer.strokes[0].alpha).toBe(0.5);
      expect(layer.strokes[0].points).toHaveLength(2);
      expect(layer.strokes[1].points[1]).toEqual([310, 110]);
    }
    expect(useClothing.getState().recentColors[0]).toBe('#ff0000');
  });

  it('makes one undo step per brush stroke, symmetric or not', () => {
    useClothing.getState().setBrush({ symmetry: true });
    const before = useClothing.getState().past.length;
    const r = useClothing.getState().beginStroke({ color: '#ff0000', size: 6, erase: false, points: [[275, 100]] });
    for (let i = 1; i <= 8; i++) useClothing.getState().extendStrokeMany(r.layerId, r.index, [[275 + i, 100 + i]], r.mirrorIndex);
    expect(useClothing.getState().past.length).toBe(before + 1);
    useClothing.getState().undo();
    const layer = useClothing.getState().designs.shirt.find((l) => l.type === 'paint');
    expect(layer).toBeUndefined();
  });

  it('keeps symmetry off by default', () => {
    useClothing.getState().setBrush({ symmetry: false });
    const r = useClothing.getState().beginStroke({ color: '#00ff00', size: 4, erase: false, points: [[275, 100]] });
    expect(r.mirrorIndex).toBeNull();
  });
});

import { boxUnwrap, getPaintGeometry, getPrimitiveGeometry } from '../src/utils/geometry';

describe('accessory texture painting', () => {
  beforeEach(() => useEditor.getState().loadProject({ id: 'p', name: 'p', createdAt: 0 }, buildProject('blank')));

  it('gives cubes six separate texture cells', () => {
    const g = boxUnwrap(getPrimitiveGeometry('cube'));
    const uv = g.attributes.uv;
    const cells = new Set<string>();
    for (let t = 0; t < uv.count; t += 3) {
      const cu = (uv.getX(t) + uv.getX(t + 1) + uv.getX(t + 2)) / 3;
      const cv = (uv.getY(t) + uv.getY(t + 1) + uv.getY(t + 2)) / 3;
      cells.add(`${Math.floor(cu * 3)},${Math.floor((1 - cv) * 2)}`);
    }
    expect(cells.size).toBe(6);
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(i)).toBeLessThanOrEqual(1);
    }
    expect(g.attributes.position.count / 3).toBe(12);
  });

  it('keeps triangle counts and reuses native UVs for round shapes', () => {
    for (const k of ['cube', 'cylinder', 'cone', 'wedge', 'sphere', 'torus'] as const) {
      const a = getPrimitiveGeometry(k);
      const b = getPaintGeometry(k);
      const tris = (g: typeof a) => (g.index ? g.index.count : g.attributes.position.count) / 3;
      expect(tris(b), k).toBe(tris(a));
    }
    expect(getPaintGeometry('sphere')).toBe(getPrimitiveGeometry('sphere'));
    expect(getPaintGeometry('cube')).toBe(getPaintGeometry('cube')); // cached
  });

  it('paints, merges a drag into one undo step, rescales and clears', () => {
    const id = useEditor.getState().addPrimitive('cube');
    const past = useEditor.getState().past.length;
    const idx = useEditor.getState().beginPaintStroke(id, { color: '#ff0000', size: 12, erase: false, points: [[10, 10]] });
    expect(idx).toBe(0);
    for (let i = 1; i <= 5; i++) useEditor.getState().extendPaintStroke(id, 0, [[10 + i * 5, 10 + i * 5]]);
    const o = useEditor.getState().objects[id];
    expect(o.paint?.res).toBe(256);
    expect(o.paint?.strokes[0].points).toHaveLength(6);
    expect(useEditor.getState().past.length).toBe(past + 1); // the whole stroke is ONE undo step
    useEditor.getState().setPaintRes(id, 512);
    const s = useEditor.getState().objects[id].paint!;
    expect(s.res).toBe(512);
    expect(s.strokes[0].size).toBe(24);
    expect(s.strokes[0].points[0]).toEqual([20, 20]);
    useEditor.getState().clearPaint(id);
    expect(useEditor.getState().objects[id].paint!.strokes).toHaveLength(0);
    useEditor.getState().removePaint(id);
    expect(useEditor.getState().objects[id].paint).toBeUndefined();
    useEditor.getState().undo();
    expect(useEditor.getState().objects[id].paint).toBeDefined();
  });

  it('refuses to paint a group and counts painted parts as textures in validation', () => {
    const hat = ASSETS.find((a) => a.id === 'hat-basic')!;
    const root = useEditor.getState().addAccessory(hat.build(), 'hat');
    expect(useEditor.getState().beginPaintStroke(root, { color: '#fff', size: 4, erase: false, points: [[1, 1]] })).toBe(-1);
    const part = Object.values(useEditor.getState().objects).find((o) => o.kind === 'cylinder')!;
    useEditor.getState().beginPaintStroke(part.id, { color: '#fff', size: 4, erase: false, points: [[1, 1]] });
    const s = useEditor.getState();
    const r = validateProject({ objects: s.objects, order: s.order, layers: s.layers, textures: s.textures, models: s.models });
    const tex = r.results.find((x) => x.id === 'tex')!;
    expect(tex.severity).toBe('ok');
    expect(tex.detail).toContain('hand-painted');
  });

  it('survives project save/load', () => {
    const id = useEditor.getState().addPrimitive('sphere');
    useEditor.getState().beginPaintStroke(id, { color: '#00ff00', size: 9, erase: false, hardness: 0.5, alpha: 0.7, points: [[5, 5], [9, 9]] });
    const data = JSON.parse(JSON.stringify(useEditor.getState().serialize()));
    useEditor.getState().loadProject({ id: 'q', name: 'q', createdAt: 0 }, data);
    const o = useEditor.getState().objects[id];
    expect(o.paint?.strokes[0]).toMatchObject({ color: '#00ff00', hardness: 0.5, alpha: 0.7 });
  });
});
