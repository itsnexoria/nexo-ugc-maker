import type { ClothingKind, ClothingLayer } from '../types';
import { effectiveOf, groupIndex } from './groups';
import { layerBox, type LayerBox } from './render';
import { TEMPLATES } from './templates';

/** Axis-aligned bounds. */
export interface Bounds {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface SnapTargets {
  xs: number[];
  ys: number[];
}

export interface SnapResult {
  dx: number;
  dy: number;
  /** x positions (template units) where a vertical guide line should be drawn */
  guideXs: number[];
  guideYs: number[];
}

/** The smallest axis-aligned rectangle around a rotated box. */
export function boxBounds(b: LayerBox): Bounds {
  const a = (b.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const hw = (b.w * c + b.h * s) / 2;
  const hh = (b.w * s + b.h * c) / 2;
  return { l: b.cx - hw, r: b.cx + hw, t: b.cy - hh, b: b.cy + hh };
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (!list.length) return null;
  return { l: Math.min(...list.map((x) => x.l)), r: Math.max(...list.map((x) => x.r)), t: Math.min(...list.map((x) => x.t)), b: Math.max(...list.map((x) => x.b)) };
}

/**
 * Lines worth snapping to: the template edges and centre, every panel's edges and centre,
 * and the edges and centre of every other movable layer.
 */
export function snapTargetsFor(kind: ClothingKind, layers: ClothingLayer[], exclude: Set<string>): SnapTargets {
  const spec = TEMPLATES[kind];
  const xs = new Set<number>([0, spec.width / 2, spec.width]);
  const ys = new Set<number>([0, spec.height / 2, spec.height]);
  for (const p of spec.panels) {
    xs.add(p.x).add(p.x + p.w / 2).add(p.x + p.w);
    ys.add(p.y).add(p.y + p.h / 2).add(p.y + p.h);
  }
  const groups = groupIndex(layers);
  for (const l of layers) {
    if (exclude.has(l.id) || !effectiveOf(l, groups).visible) continue;
    const box = layerBox(l);
    if (!box) continue;
    const bb = boxBounds(box);
    xs.add(bb.l).add((bb.l + bb.r) / 2).add(bb.r);
    ys.add(bb.t).add((bb.t + bb.b) / 2).add(bb.b);
  }
  return { xs: [...xs], ys: [...ys] };
}

function nearest(values: number[], targets: number[], threshold: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: t };
    }
  }
  return best;
}

/**
 * How far to nudge a moving rectangle so its left/centre/right (and top/middle/bottom) land on a target line.
 * Every target line that ends up exactly aligned is returned so a guide can be drawn for it.
 */
export function snapMove(moving: Bounds, targets: SnapTargets, threshold: number): SnapResult {
  const mx = [moving.l, (moving.l + moving.r) / 2, moving.r];
  const my = [moving.t, (moving.t + moving.b) / 2, moving.b];
  const sx = nearest(mx, targets.xs, threshold);
  const sy = nearest(my, targets.ys, threshold);
  const dx = sx?.delta ?? 0;
  const dy = sy?.delta ?? 0;
  const eps = 1e-6;
  const guideXs = sx ? [...new Set(targets.xs.filter((t) => mx.some((v) => Math.abs(v + dx - t) < eps)))] : [];
  const guideYs = sy ? [...new Set(targets.ys.filter((t) => my.some((v) => Math.abs(v + dy - t) < eps)))] : [];
  return { dx, dy, guideXs, guideYs };
}
