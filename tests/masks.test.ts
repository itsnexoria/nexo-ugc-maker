import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClothing } from '../src/store/clothing';
import type { ClothingLayer, Stroke } from '../src/types';

const reset = () => useClothing.getState().load({ version: 1, designs: { shirt: [], pants: [], tshirt: [] }, images: [], activeKind: 'shirt' });
const layers = () => useClothing.getState().designs.shirt;
const stroke = (over: Partial<Stroke> = {}): Stroke => ({ color: '#ff0000', size: 10, erase: false, points: [[50, 50]], ...over });

describe('layer masks', () => {
  beforeEach(reset);

  it('adding a mask starts editing it and changes nothing visible', () => {
    const c = useClothing.getState();
    const id = c.addLayer('fill');
    c.addMask(id);
    const l = layers().find((x) => x.id === id)!;
    expect(l.mask).toEqual({ strokes: [], invert: false, enabled: true });
    expect(useClothing.getState().maskEdit).toBe(id);
    expect(useClothing.getState().tool).toBe('brush');
  });

  it('while editing, strokes go into the mask, not into a new paint layer, and are forced black', () => {
    const c = useClothing.getState();
    const id = c.addLayer('fill');
    c.addMask(id);
    const r = c.beginStroke(stroke());
    expect(r.layerId).toBe(id);
    expect(layers()).toHaveLength(1); // no paint layer was created
    c.extendStrokeMany(r.layerId, r.index, [[60, 60], [70, 70]]);
    const m = layers()[0].mask!;
    expect(m.strokes).toHaveLength(1);
    expect(m.strokes[0].color).toBe('#000000');
    expect(m.strokes[0].points).toHaveLength(3);
  });

  it('the eraser reveals: it adds an erase stroke', () => {
    const c = useClothing.getState();
    const id = c.addLayer('fill');
    c.addMask(id);
    c.beginStroke(stroke({ erase: true }));
    expect(layers()[0].mask!.strokes[0].erase).toBe(true);
  });

  describe('undo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('one mask stroke is one undo step even with pauses, and undo removes just that stroke', () => {
      const c = useClothing.getState();
      const id = c.addLayer('fill');
      c.addMask(id);
      const before = useClothing.getState().past.length;
      const r = c.beginStroke(stroke());
      c.extendStrokeMany(r.layerId, r.index, [[60, 60]]);
      vi.advanceTimersByTime(4000);
      c.extendStrokeMany(r.layerId, r.index, [[90, 90]]);
      expect(useClothing.getState().past.length - before).toBe(1);
      c.undo();
      expect(layers()[0].mask!.strokes).toHaveLength(0);
      expect(layers()[0].mask).toBeDefined(); // the mask itself survives
    });
  });

  it('selecting another layer or nothing ends mask editing; re-selecting the same layer keeps it', () => {
    const c = useClothing.getState();
    const a = c.addLayer('fill');
    const b = c.addLayer('shape');
    c.addMask(a);
    c.select(a);
    expect(useClothing.getState().maskEdit).toBe(a);
    c.select(b);
    expect(useClothing.getState().maskEdit).toBeNull();
    c.setMaskEdit(a);
    c.select(null);
    expect(useClothing.getState().maskEdit).toBeNull();
  });

  it('remove and clear', () => {
    const c = useClothing.getState();
    const id = c.addLayer('fill');
    c.addMask(id);
    c.beginStroke(stroke());
    c.clearMask(id);
    expect(layers()[0].mask!.strokes).toHaveLength(0);
    c.removeMask(id);
    expect(layers()[0].mask).toBeUndefined();
    expect(useClothing.getState().maskEdit).toBeNull();
    c.undo();
    expect(layers()[0].mask).toBeDefined();
  });

  it('only one mask per layer, and masks need a real layer', () => {
    const c = useClothing.getState();
    const id = c.addLayer('fill');
    c.addMask(id);
    const past = useClothing.getState().past.length;
    c.addMask(id);
    expect(useClothing.getState().past.length).toBe(past);
    expect(() => c.addMask('nope')).not.toThrow();
  });

  it('a mirrored copy does not inherit the mask', () => {
    const c = useClothing.getState();
    const id = c.addLayer('shape');
    c.addMask(id);
    const copy = c.mirrorLayer(id);
    const mirrored = layers().find((l) => l.id === copy) as ClothingLayer | undefined;
    expect(mirrored).toBeDefined();
    expect(mirrored!.mask).toBeUndefined();
    expect(layers().find((l) => l.id === id)!.mask).toBeDefined();
  });

  it('duplicates keep the mask', () => {
    const c = useClothing.getState();
    const id = c.addLayer('fill');
    c.addMask(id);
    c.beginStroke(stroke());
    const copyId = c.duplicateLayer(id)!;
    expect(layers().find((l) => l.id === copyId)!.mask!.strokes).toHaveLength(1);
  });
});
