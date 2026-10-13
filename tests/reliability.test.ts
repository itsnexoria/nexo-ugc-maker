import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unusedClothingImageIds, useClothing } from '../src/store/clothing';
import { unusedTextureIds, useEditor } from '../src/store/editor';
import { CRITICAL_RATIO, LARGE_PROJECT_BYTES, WARN_RATIO, estimateProjectBytes, storageLevel, storageNeedsAttention } from '../src/utils/storageHealth';
import { planScale } from '../src/utils/imageOptimize';
import type { ClothingImage, ProjectData, SceneObject, Stroke, TextureAsset } from '../src/types';

const img = (id: string): ClothingImage => ({ id, name: id, dataUrl: `data:image/png;base64,${id}`, width: 10, height: 10 });

function resetClothing() {
  useClothing.getState().load({ version: 1, designs: { shirt: [], pants: [], tshirt: [] }, images: [], activeKind: 'shirt' });
}

describe('clothing: deleting images is undoable', () => {
  beforeEach(resetClothing);

  it('undo brings back the image together with the layers that use it, redo removes them again', () => {
    const c = useClothing.getState();
    const a = img('a');
    c.addImage(a);
    c.addLayer('image', { image: a });
    expect(useClothing.getState().designs.shirt).toHaveLength(1);
    c.removeImage('a');
    expect(useClothing.getState().images).toHaveLength(0);
    expect(useClothing.getState().designs.shirt).toHaveLength(0);
    c.undo();
    let s = useClothing.getState();
    expect(s.images.map((i) => i.id)).toEqual(['a']);
    expect(s.designs.shirt).toHaveLength(1);
    // no layer may point at a missing image
    expect(s.designs.shirt.every((l) => l.type !== 'image' || s.images.some((i) => i.id === l.imageId))).toBe(true);
    c.redo();
    s = useClothing.getState();
    expect(s.images).toHaveLength(0);
    expect(s.designs.shirt).toHaveLength(0);
  });

  it('removeUnusedImages deletes only images no layer uses, in one undo step', () => {
    const c = useClothing.getState();
    const used = img('used');
    const spare1 = img('spare1');
    const spare2 = img('spare2');
    [used, spare1, spare2].forEach((i) => c.addImage(i));
    c.addLayer('image', { image: used });
    expect(unusedClothingImageIds(useClothing.getState().designs, useClothing.getState().images).sort()).toEqual(['spare1', 'spare2']);
    expect(c.removeUnusedImages()).toBe(2);
    expect(useClothing.getState().images.map((i) => i.id)).toEqual(['used']);
    expect(useClothing.getState().designs.shirt).toHaveLength(1);
    expect(c.removeUnusedImages()).toBe(0);
    c.undo();
    expect(useClothing.getState().images.map((i) => i.id).sort()).toEqual(['spare1', 'spare2', 'used']);
  });

  it('replaceImages swaps pixels without touching layers or history', () => {
    const c = useClothing.getState();
    c.addImage(img('a'));
    c.addLayer('image', { image: img('a') });
    const pastBefore = useClothing.getState().past.length;
    c.replaceImages([{ id: 'a', dataUrl: 'data:image/webp;base64,small', width: 5, height: 5 }]);
    const s = useClothing.getState();
    expect(s.images[0]).toMatchObject({ id: 'a', width: 5, dataUrl: 'data:image/webp;base64,small' });
    expect(s.past.length).toBe(pastBefore);
  });
});

describe('clothing: one stroke is one undo step', () => {
  beforeEach(() => {
    resetClothing();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('pausing mid-stroke does not split it into several undo steps', () => {
    const c = useClothing.getState();
    const before = useClothing.getState().past.length;
    const stroke: Stroke = { color: '#ff0000', size: 4, erase: false, points: [[10, 10]] };
    const { layerId, index } = c.beginStroke(stroke);
    c.extendStrokeMany(layerId, index, [[20, 20]]);
    vi.advanceTimersByTime(3000); // hold still for 3 seconds
    c.extendStrokeMany(layerId, index, [[40, 40]]);
    vi.advanceTimersByTime(3000);
    c.extendStrokeMany(layerId, index, [[80, 80]]);
    const layer = useClothing.getState().designs.shirt.find((l) => l.id === layerId);
    expect(layer?.type === 'paint' && layer.strokes[index].points.length).toBe(4);
    expect(useClothing.getState().past.length - before).toBe(1);
    c.undo();
    expect(useClothing.getState().designs.shirt).toHaveLength(0);
  });

  it('two separate strokes stay two undo steps', () => {
    const c = useClothing.getState();
    const stroke: Stroke = { color: '#00ff00', size: 4, erase: false, points: [[10, 10]] };
    const a = c.beginStroke(stroke);
    c.extendStrokeMany(a.layerId, a.index, [[30, 30]]);
    const b = c.beginStroke({ ...stroke, points: [[100, 100]] });
    c.extendStrokeMany(b.layerId, b.index, [[130, 130]]);
    expect(useClothing.getState().past.length).toBe(2);
  });
});

describe('clothing: undo follows the tab it changed', () => {
  beforeEach(resetClothing);

  it('switches to the pants tab when the undone change was on the pants', () => {
    const c = useClothing.getState();
    c.setActiveKind('pants');
    c.addLayer('paint');
    c.setActiveKind('shirt');
    c.undo();
    const s = useClothing.getState();
    expect(s.activeKind).toBe('pants');
    expect(s.designs.pants).toHaveLength(0);
    c.setActiveKind('shirt');
    c.redo();
    expect(useClothing.getState().activeKind).toBe('pants');
    expect(useClothing.getState().designs.pants).toHaveLength(1);
  });

  it('stays on the current tab when the change was there', () => {
    const c = useClothing.getState();
    c.addLayer('paint');
    c.undo();
    expect(useClothing.getState().activeKind).toBe('shirt');
  });
});

describe('accessory textures', () => {
  it('finds textures no part uses', () => {
    const tex = (id: string) => ({ id, name: id, dataUrl: '', width: 1, height: 1, source: 'upload', createdAt: 0 }) as TextureAsset;
    const objects = { o1: { material: { textureId: 'used' } } } as unknown as Record<string, SceneObject>;
    expect(unusedTextureIds(objects, [tex('used'), tex('spare')])).toEqual(['spare']);
  });

  it('deleteUnusedTextures removes only the unused ones and marks the project unsaved', () => {
    const tex = (id: string) => ({ id, name: id, dataUrl: '', width: 1, height: 1, source: 'upload', createdAt: 0 }) as TextureAsset;
    useEditor.setState({
      objects: { o1: { material: { textureId: 'used' } } } as unknown as Record<string, SceneObject>,
      textures: [tex('used'), tex('spare1'), tex('spare2')],
    });
    expect(useEditor.getState().deleteUnusedTextures()).toBe(2);
    expect(useEditor.getState().textures.map((t) => t.id)).toEqual(['used']);
    expect(useEditor.getState().project.saveStatus).toBe('unsaved');
    expect(useEditor.getState().deleteUnusedTextures()).toBe(0);
  });
});

describe('storage health', () => {
  it('levels follow the quota', () => {
    expect(storageLevel(null, null)).toBe('ok');
    expect(storageLevel(50, 100)).toBe('ok');
    expect(storageLevel(WARN_RATIO * 100, 100)).toBe('warn');
    expect(storageLevel(CRITICAL_RATIO * 100, 100)).toBe('critical');
    expect(storageLevel(10, 0)).toBe('ok');
  });

  it('dismissing hides a level until it gets worse', () => {
    expect(storageNeedsAttention({ level: 'ok', projectBytes: 0, dismissed: null })).toBe(false);
    expect(storageNeedsAttention({ level: 'warn', projectBytes: 0, dismissed: null })).toBe(true);
    expect(storageNeedsAttention({ level: 'warn', projectBytes: 0, dismissed: 'warn' })).toBe(false);
    expect(storageNeedsAttention({ level: 'critical', projectBytes: 0, dismissed: 'warn' })).toBe(true);
    expect(storageNeedsAttention({ level: 'ok', projectBytes: LARGE_PROJECT_BYTES, dismissed: null })).toBe(true);
    expect(storageNeedsAttention({ level: 'ok', projectBytes: LARGE_PROJECT_BYTES, dismissed: 'ok' })).toBe(false);
  });

  it('estimates a project by its images and meshes', () => {
    const data = {
      textures: [{ dataUrl: 'x'.repeat(100) }],
      models: { m: { positions: 'p'.repeat(50), normals: null, uvs: 'u'.repeat(10), index: null } },
      clothing: { images: [{ dataUrl: 'y'.repeat(40) }] },
    } as unknown as ProjectData;
    expect(estimateProjectBytes(data)).toBe(200);
  });
});

describe('image scaling plan', () => {
  it('never upscales and keeps the aspect ratio', () => {
    expect(planScale(512, 256, 1024)).toEqual({ width: 512, height: 256, scaled: false });
    expect(planScale(2048, 1024, 1024)).toEqual({ width: 1024, height: 512, scaled: true });
    expect(planScale(1000, 4000, 1000)).toEqual({ width: 250, height: 1000, scaled: true });
    expect(planScale(0, 0, 1024).scaled).toBe(false);
  });
});
