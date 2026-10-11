import { beforeEach, describe, expect, it } from 'vitest';
import { useClothing, translateClip } from '../src/store/clothing';
import { useEditor } from '../src/store/editor';
import { buildProject } from '../src/assets/sample';

const blank = () => useClothing.getState().load({ version: 1, designs: { shirt: [], pants: [], tshirt: [] }, images: [], activeKind: 'shirt' });

describe('clothing quality of life', () => {
  beforeEach(() => {
    useEditor.getState().loadProject({ id: 'q', name: 'q', createdAt: 0 }, buildProject('clothing'));
    blank();
  });

  it('selects a range and toggles individual layers', () => {
    const cl = useClothing.getState();
    const a = cl.addLayer('fill');
    const b = cl.addLayer('shape');
    const c = cl.addLayer('text');
    const d = cl.addLayer('shape');
    useClothing.getState().select(a);
    useClothing.getState().selectRange(c);
    expect(useClothing.getState().selectedIds).toEqual([a, b, c]);
    useClothing.getState().toggleSelect(d);
    expect(useClothing.getState().selectedIds).toContain(d);
    useClothing.getState().toggleSelect(b);
    expect(useClothing.getState().selectedIds).not.toContain(b);
  });

  it('moves, edits, duplicates and deletes a selection as single undo steps', () => {
    const cl = useClothing.getState();
    const a = cl.addLayer('shape');
    const b = cl.addLayer('text');
    const before = useClothing.getState().past.length;
    useClothing.getState().moveLayersBy([a, b], 10, 5, 'drag');
    useClothing.getState().moveLayersBy([a, b], 10, 5, 'drag');
    expect(useClothing.getState().past.length).toBe(before + 1);
    const moved = useClothing.getState().designs.shirt.find((l) => l.id === a)!;
    expect(moved.type === 'shape' && [moved.x, moved.y]).toEqual([295 + 20, 138 + 10]);
    useClothing.getState().updateLayers([a, b], { opacity: 0.4 });
    expect(useClothing.getState().designs.shirt.every((l) => l.opacity === 0.4)).toBe(true);
    useClothing.getState().duplicateLayers([a, b]);
    expect(useClothing.getState().designs.shirt).toHaveLength(4);
    expect(useClothing.getState().selectedIds).toHaveLength(2);
    useClothing.getState().removeLayers(useClothing.getState().selectedIds);
    expect(useClothing.getState().designs.shirt).toHaveLength(2);
    useClothing.getState().undo();
    expect(useClothing.getState().designs.shirt).toHaveLength(4);
  });

  it('aligns layers to a common edge or centre', () => {
    const cl = useClothing.getState();
    const a = cl.addLayer('shape');
    const b = cl.addLayer('shape');
    useClothing.getState().updateLayer(a, { x: 250, y: 100, w: 20, h: 20 });
    useClothing.getState().updateLayer(b, { x: 330, y: 160, w: 40, h: 40 });
    useClothing.getState().alignLayers([a, b], 'left');
    const [la, lb] = [a, b].map((id) => useClothing.getState().designs.shirt.find((l) => l.id === id)!);
    expect(la.type === 'shape' && la.x - la.w / 2).toBeCloseTo(240);
    expect(lb.type === 'shape' && lb.x - lb.w / 2).toBeCloseTo(240);
    useClothing.getState().alignLayers([a, b], 'middle');
    const [ma, mb] = [a, b].map((id) => useClothing.getState().designs.shirt.find((l) => l.id === id)!);
    expect(ma.type === 'shape' && ma.y).toBe(mb.type === 'shape' && mb.y);
  });

  it('keeps a labelled history that can be jumped through', () => {
    const cl = useClothing.getState();
    cl.addLayer('fill');
    useClothing.getState().addLayer('text');
    useClothing.getState().addLayer('shape');
    const labels = useClothing.getState().past.map((e) => e.label);
    expect(labels).toEqual(['Added fill layer', 'Added text layer', 'Added shape layer']);
    useClothing.getState().jumpHistory(-2);
    expect(useClothing.getState().designs.shirt).toHaveLength(1);
    expect(useClothing.getState().future.map((e) => e.label)).toEqual(['Added text layer', 'Added shape layer']);
    useClothing.getState().jumpHistory(2);
    expect(useClothing.getState().designs.shirt).toHaveLength(3);
  });

  it('copies a shirt to pants turning sleeves into legs, and refuses T-shirts', () => {
    expect(translateClip('rightArm.front', 'shirt', 'pants')).toBe('rightLeg.front');
    expect(translateClip('leftArm', 'shirt', 'pants')).toBe('leftLeg');
    expect(translateClip('rightLeg.left', 'pants', 'shirt')).toBe('rightArm.left');
    expect(translateClip('torso.front', 'shirt', 'pants')).toBe('torso.front');
    const cl = useClothing.getState();
    const id = cl.addLayer('shape', { clip: 'rightArm.front' });
    expect(useClothing.getState().copyLayersToKind([id], 'pants')).toBe(1);
    expect(useClothing.getState().designs.pants[0].clip).toBe('rightLeg.front');
    expect(useClothing.getState().designs.shirt).toHaveLength(1); // original untouched
    expect(useClothing.getState().copyLayersToKind('all', 'tshirt')).toBe(0);
  });

  it('records pattern and gradient fills on strokes, but not for the eraser', () => {
    useClothing.getState().setBrush({ fillType: 'pattern', pattern: 'dots', patternSize: 8, color2: '#000000', symmetry: false });
    let r = useClothing.getState().beginStroke({ color: '#ff0000', size: 10, erase: false, points: [[250, 100]] });
    let layer = useClothing.getState().designs.shirt.find((l) => l.id === r.layerId)!;
    expect(layer.type === 'paint' && layer.strokes[0].fill).toEqual({ type: 'pattern', pattern: 'dots', color2: '#000000', size: 8 });
    useClothing.getState().setBrush({ fillType: 'gradient' });
    r = useClothing.getState().beginStroke({ color: '#ff0000', size: 10, erase: false, points: [[250, 120]] });
    layer = useClothing.getState().designs.shirt.find((l) => l.id === r.layerId)!;
    expect(layer.type === 'paint' && layer.strokes[1].fill).toEqual({ type: 'gradient', color2: '#000000' });
    r = useClothing.getState().beginStroke({ color: '#ff0000', size: 10, erase: true, points: [[250, 140]] });
    layer = useClothing.getState().designs.shirt.find((l) => l.id === r.layerId)!;
    expect(layer.type === 'paint' && layer.strokes[2].fill).toBeUndefined();
  });
});
