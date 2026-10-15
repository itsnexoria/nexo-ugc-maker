import { describe, expect, it } from 'vitest';
import { boxBounds, snapMove, snapTargetsFor, unionBounds } from '../src/clothing/snap';
import { makeLayer } from '../src/clothing/layers';
import { TEMPLATES } from '../src/clothing/templates';
import type { ShapeLayer } from '../src/types';

describe('snap', () => {
  it('bounds of a rotated box grow', () => {
    const b = boxBounds({ cx: 10, cy: 10, w: 20, h: 10, rotation: 90 });
    expect(b.l).toBeCloseTo(5);
    expect(b.r).toBeCloseTo(15);
    expect(b.t).toBeCloseTo(0);
    expect(b.b).toBeCloseTo(20);
  });

  it('unions bounds', () => {
    expect(unionBounds([])).toBeNull();
    expect(unionBounds([{ l: 0, r: 5, t: 0, b: 5 }, { l: 3, r: 10, t: -2, b: 4 }])).toEqual({ l: 0, r: 10, t: -2, b: 5 });
  });

  it('snaps the nearest edge or centre within the threshold only', () => {
    const targets = { xs: [100], ys: [50] };
    // right edge 3 px short of x = 100, centre y 2 px below 50
    const r = snapMove({ l: 80, r: 97, t: 40, b: 64 }, targets, 5);
    expect(r.dx).toBe(3);
    expect(r.dy).toBe(-2);
    expect(r.guideXs).toEqual([100]);
    expect(r.guideYs).toEqual([50]);
    const far = snapMove({ l: 0, r: 10, t: 0, b: 10 }, targets, 5);
    expect(far).toEqual({ dx: 0, dy: 0, guideXs: [], guideYs: [] });
  });

  it('prefers the closest of several candidates', () => {
    // left edge 10 is 1 from 11; centre 15 is 3 from 18; right edge 20 is 2 from 18
    const r = snapMove({ l: 10, r: 20, t: 0, b: 0 }, { xs: [11, 18], ys: [] }, 5);
    expect(r.dx).toBe(1);
    expect(r.guideXs).toEqual([11]);
  });

  it('builds targets from the template, its panels and other layers (not the moving ones)', () => {
    const spec = TEMPLATES.shirt;
    const other = { ...(makeLayer('shirt', 'shape') as ShapeLayer), id: 'other', x: 300, y: 200, w: 40, h: 20, rotation: 0 };
    const moving = { ...(makeLayer('shirt', 'shape') as ShapeLayer), id: 'moving', x: 100, y: 100, w: 10, h: 10, rotation: 0 };
    const t = snapTargetsFor('shirt', [other, moving], new Set(['moving']));
    expect(t.xs).toContain(spec.width / 2);
    expect(t.xs).toContain(280); // other's left edge
    expect(t.xs).toContain(320); // other's right edge
    expect(t.xs).not.toContain(95); // the moving layer's own left edge
    expect(t.ys).toContain(190);
    for (const p of spec.panels) expect(t.xs).toContain(p.x);
  });
});
