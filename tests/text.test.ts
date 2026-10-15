import { describe, expect, it } from 'vitest';
import { arcGlyphs, arcRadius, curvedTextExtent, layerBox, textSize } from '../src/clothing/render';
import { makeLayer } from '../src/clothing/layers';
import type { TextLayer } from '../src/types';

const text = (over: Partial<TextLayer> = {}): TextLayer => ({ ...(makeLayer('shirt', 'text') as TextLayer), text: 'HELLO', size: 20, ...over });

describe('arcGlyphs', () => {
  const chars = [...'ABCDE'];
  const widths = chars.map(() => 10);

  it('puts the middle letter on top and lets a rainbow drop at both ends', () => {
    const g = arcGlyphs(chars, widths, 0, 120, arcRadius(50, 120));
    expect(g[2].y).toBeCloseTo(0);
    expect(g[2].x).toBeCloseTo(0);
    expect(g[2].rot).toBeCloseTo(0);
    expect(g[0].y).toBeGreaterThan(0);
    expect(g[4].y).toBeCloseTo(g[0].y);
    expect(g[0].x).toBeCloseTo(-g[4].x);
    expect(g[0].rot).toBeLessThan(0); // left end tilts counter-clockwise
    expect(g[4].rot).toBeGreaterThan(0);
  });

  it('a smile mirrors the rainbow', () => {
    const r = arcRadius(50, 120);
    const up = arcGlyphs(chars, widths, 0, 120, r);
    const down = arcGlyphs(chars, widths, 0, -120, r);
    up.forEach((g, i) => {
      expect(down[i].y).toBeCloseTo(-g.y);
      expect(down[i].rot).toBeCloseTo(-g.rot);
      expect(down[i].x).toBeCloseTo(g.x);
    });
  });

  it('the widest line sweeps exactly the requested angle', () => {
    const r = arcRadius(50, 90);
    expect(r).toBeCloseTo(50 / (Math.PI / 2));
    expect(arcRadius(50, 0)).toBe(Infinity);
    expect(arcRadius(50, 720)).toBeCloseTo(50 / (2 * Math.PI)); // capped at a full circle
  });

  it('letter spacing pushes letters apart', () => {
    const tight = arcGlyphs(chars, widths, 0, 60, 80);
    const loose = arcGlyphs(chars, widths, 6, 60, 80);
    expect(loose[4].x - loose[0].x).toBeGreaterThan(tight[4].x - tight[0].x);
  });
});

describe('text size and box', () => {
  it('letter spacing makes the text wider', () => {
    expect(textSize(text({ spacing: 10 })).w).toBeGreaterThan(textSize(text({ spacing: 0 })).w + 30);
  });

  it('straight text is unchanged by the new fields', () => {
    const a = textSize(text());
    expect(curvedTextExtent(text())).toEqual({ w: a.w, h: a.h, offY: 0 });
  });

  it('a curved box is taller than the straight one and its centre sits toward the bend', () => {
    const straight = curvedTextExtent(text());
    const up = curvedTextExtent(text({ curve: 120 }));
    const down = curvedTextExtent(text({ curve: -120 }));
    expect(up.h).toBeGreaterThan(straight.h);
    expect(up.offY).toBeGreaterThan(0);
    expect(down.offY).toBeCloseTo(-up.offY);
  });

  it('the selection box follows the layer when it is rotated', () => {
    const t = text({ curve: 120, x: 100, y: 100, rotation: 90 });
    const b = layerBox(t)!;
    const e = curvedTextExtent(t);
    // local "down" becomes screen "left" after a quarter turn
    expect(b.cx).toBeCloseTo(100 - e.offY);
    expect(b.cy).toBeCloseTo(100, 0);
  });
});
