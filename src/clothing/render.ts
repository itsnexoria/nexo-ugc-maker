import { IncrementalPaint } from '../utils/strokePaint';
import { makeTile } from '../utils/patterns';
import type { BlendMode, ClothingKind, ClothingLayer, ImageLayer, PatternLayer, ShapeLayer, ShapeType, TextLayer } from '../types';
import { effectiveOf, groupIndex } from './groups';
import { TEMPLATES, clipBounds, clipRects } from './templates';

export interface RenderEnv {
  /** Returns a decoded image for a library id, or null while it is still loading */
  getImage: (id: string) => CanvasImageSource | null;
  /** Bumps when something a cached layer picture depends on changes (an image or a font finished loading) */
  version: number;
}

const BLEND: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
};

// ------------------------------------------------------------------ measuring

let measureCtx: CanvasRenderingContext2D | null | undefined;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  try {
    measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  } catch {
    measureCtx = null;
  }
  return measureCtx;
}

export function fontString(l: Pick<TextLayer, 'font' | 'size' | 'bold' | 'italic'>): string {
  return `${l.italic ? 'italic ' : ''}${l.bold ? '700' : '400'} ${l.size}px "${l.font}", Arial, sans-serif`;
}

/** Width of each character of a line (kerning between letters is ignored; only used when letters are placed one by one). */
function charWidths(ctx: CanvasRenderingContext2D | null, l: TextLayer, chars: string[]): number[] {
  if (!ctx) return chars.map(() => l.size * 0.58);
  ctx.font = fontString(l);
  return chars.map((c) => ctx.measureText(c).width);
}

export function textSize(l: TextLayer): { w: number; h: number; lines: string[]; lineHeight: number } {
  const lines = l.text.split('\n');
  const lineHeight = l.size * 1.15;
  const ctx = getMeasureCtx();
  const spacing = l.spacing ?? 0;
  let w = 0;
  if (ctx) {
    ctx.font = fontString(l);
    for (const line of lines) {
      const base = ctx.measureText(line || ' ').width;
      w = Math.max(w, base + spacing * Math.max(0, [...line].length - 1));
    }
  } else {
    for (const line of lines) w = Math.max(w, line.length * l.size * 0.58 + spacing * Math.max(0, line.length - 1));
  }
  return { w: Math.max(w, 4), h: lineHeight * lines.length, lines, lineHeight };
}

export interface Glyph {
  ch: string;
  x: number;
  y: number;
  /** radians, clockwise */
  rot: number;
}

/**
 * Places the letters of one line on a circle of `radius`, centred on the line's middle.
 * curve > 0 bends like a rainbow (ends drop), curve < 0 like a smile (ends rise). Positions are relative to the
 * point where the arc is at its top (or bottom); y grows downward like on the canvas.
 */
export function arcGlyphs(chars: string[], widths: number[], spacing: number, curveDeg: number, radius: number): Glyph[] {
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  const dir = curveDeg >= 0 ? 1 : -1;
  const r = Math.max(1, radius);
  let cursor = -total / 2;
  return chars.map((ch, i) => {
    const mid = cursor + widths[i] / 2;
    cursor += widths[i] + spacing;
    const phi = mid / r;
    return { ch, x: r * Math.sin(phi), y: dir * r * (1 - Math.cos(phi)), rot: dir * phi };
  });
}

/** Radius that makes the widest line sweep exactly `curve` degrees. */
export function arcRadius(widestLine: number, curveDeg: number): number {
  const theta = (Math.min(360, Math.abs(curveDeg)) * Math.PI) / 180;
  return theta > 0 ? widestLine / theta : Infinity;
}

/** Size of the box around curved text, and where its centre sits relative to the layer position (before rotation). */
export function curvedTextExtent(l: TextLayer): { w: number; h: number; offY: number } {
  const t = textSize(l);
  const curve = l.curve ?? 0;
  if (!curve) return { w: t.w, h: t.h, offY: 0 };
  const theta = (Math.min(360, Math.abs(curve)) * Math.PI) / 180;
  const r = arcRadius(t.w, curve);
  const half = theta / 2;
  const sag = r * (1 - Math.cos(Math.min(half, Math.PI)));
  const width = half >= Math.PI / 2 ? 2 * r : 2 * r * Math.sin(half);
  const dir = curve >= 0 ? 1 : -1;
  return { w: Math.max(t.w * 0.25, width) + t.h / t.lines.length * 0.4, h: sag + t.h, offY: (dir * sag) / 2 };
}

// ------------------------------------------------------------------ patterns

// ------------------------------------------------------------------ shapes

export function shapePath(ctx: CanvasRenderingContext2D, shape: ShapeType, w: number, h: number, radius: number): void {
  const hw = w / 2;
  const hh = h / 2;
  ctx.beginPath();
  switch (shape) {
    case 'rect': {
      const r = Math.max(0, Math.min(radius, hw, hh));
      ctx.moveTo(-hw + r, -hh);
      ctx.lineTo(hw - r, -hh);
      ctx.arcTo(hw, -hh, hw, -hh + r, r);
      ctx.lineTo(hw, hh - r);
      ctx.arcTo(hw, hh, hw - r, hh, r);
      ctx.lineTo(-hw + r, hh);
      ctx.arcTo(-hw, hh, -hw, hh - r, r);
      ctx.lineTo(-hw, -hh + r);
      ctx.arcTo(-hw, -hh, -hw + r, -hh, r);
      break;
    }
    case 'ellipse':
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(-hw, hh);
      break;
    case 'diamond':
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, 0);
      ctx.lineTo(0, hh);
      ctx.lineTo(-hw, 0);
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const x = Math.cos(a) * hw;
        const y = Math.sin(a) * hh;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const k = i % 2 === 0 ? 1 : 0.42;
        const x = Math.cos(a) * hw * k;
        const y = Math.sin(a) * hh * k;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      break;
  }
  ctx.closePath();
}

// ------------------------------------------------------------------ paint cache

// ------------------------------------------------------------------ layers

function applyClip(ctx: CanvasRenderingContext2D, kind: ClothingKind, clip: string): void {
  const rects = clipRects(kind, clip);
  ctx.beginPath();
  for (const r of rects) ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
}

function drawFill(ctx: CanvasRenderingContext2D, kind: ClothingKind, l: Extract<ClothingLayer, { type: 'fill' }>): void {
  const b = clipBounds(kind, l.clip);
  if (l.color2) {
    const a = (l.angle * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const len = Math.abs(b.w * dx) + Math.abs(b.h * dy);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
    g.addColorStop(0, l.color);
    g.addColorStop(1, l.color2);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = l.color;
  }
  ctx.fillRect(b.x, b.y, b.w, b.h);
}

function drawPattern(ctx: CanvasRenderingContext2D, kind: ClothingKind, l: PatternLayer): void {
  const b = clipBounds(kind, l.clip);
  const camo = l.pattern === 'camo';
  const tile = makeTile(l.pattern, camo ? 32 : l.size, l.color, l.color2);
  const pat = ctx.createPattern(tile, 'repeat');
  if (!pat) return;
  if (camo && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scale(Math.max(0.1, l.size / 32)));
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  ctx.translate(cx, cy);
  ctx.rotate((l.angle * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = pat;
  const pad = Math.max(b.w, b.h);
  ctx.fillRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
}

function drawText(ctx: CanvasRenderingContext2D, l: TextLayer): void {
  const { lines, lineHeight, w } = textSize(l);
  const spacing = l.spacing ?? 0;
  const curve = l.curve ?? 0;
  ctx.translate(l.x, l.y);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.font = fontString(l);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const top = (-lines.length * lineHeight) / 2 + lineHeight / 2;
  const paint = (text: string, x: number, y: number) => {
    if (l.strokeWidth > 0) {
      ctx.strokeStyle = l.stroke;
      ctx.lineWidth = l.strokeWidth;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = l.color;
    ctx.fillText(text, x, y);
  };

  if (!curve && !spacing) {
    ctx.textAlign = l.align;
    const x = l.align === 'left' ? -w / 2 : l.align === 'right' ? w / 2 : 0;
    lines.forEach((line, i) => paint(line, x, top + i * lineHeight));
    return;
  }

  // letters placed one by one: with extra spacing, and/or along an arc
  const measure = getMeasureCtx();
  ctx.textAlign = 'center';
  const radius = curve ? arcRadius(w, curve) : Infinity;
  const dir = curve >= 0 ? 1 : -1;
  lines.forEach((line, i) => {
    const chars = [...line];
    if (!chars.length) return;
    const widths = charWidths(measure, l, chars);
    const dy = top + i * lineHeight;
    if (!curve) {
      const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
      let cx = l.align === 'left' ? -w / 2 : l.align === 'right' ? w / 2 - total : -total / 2;
      chars.forEach((ch, k) => {
        paint(ch, cx + widths[k] / 2, dy);
        cx += widths[k] + spacing;
      });
      return;
    }
    // lines further from the circle's centre get a larger radius, so stacked lines stay concentric
    const r = Math.max(1, radius - dir * dy);
    for (const g of arcGlyphs(chars, widths, spacing, curve, r)) {
      ctx.save();
      ctx.translate(g.x, dy + g.y);
      ctx.rotate(g.rot);
      paint(g.ch, 0, 0);
      ctx.restore();
    }
  });
}

function drawShape(ctx: CanvasRenderingContext2D, l: ShapeLayer): void {
  ctx.translate(l.x, l.y);
  ctx.rotate((l.rotation * Math.PI) / 180);
  shapePath(ctx, l.shape, l.w, l.h, l.radius);
  if (l.fill && l.fill !== 'none') {
    ctx.fillStyle = l.fill;
    ctx.fill();
  }
  if (l.strokeWidth > 0) {
    ctx.strokeStyle = l.stroke;
    ctx.lineWidth = l.strokeWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function drawImageLayer(ctx: CanvasRenderingContext2D, l: ImageLayer, env: RenderEnv): void {
  const img = env.getImage(l.imageId);
  if (!img) return;
  ctx.translate(l.x, l.y);
  ctx.rotate((l.rotation * Math.PI) / 180);
  if (l.flipX) ctx.scale(-1, 1);
  ctx.drawImage(img, -l.w / 2, -l.h / 2, l.w, l.h);
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const paintRasters = new Map<string, IncrementalPaint>();

const maskRasters = new Map<string, IncrementalPaint>();
const maskedPics = new Map<string, HTMLCanvasElement>();

export function forgetPaintLayer(id: string): void {
  paintRasters.delete(id);
  maskRasters.delete(id);
  maskedPics.delete(id);
}

/** Frees every paint-layer raster (called when another project is opened). */
export function clearClothingCaches(): void {
  paintRasters.clear();
  maskRasters.clear();
  maskedPics.clear();
}

/** The layer's picture with its mask applied (a new picture; the layer's own cache is never touched). */
function applyMask(l: ClothingLayer, pic: HTMLCanvasElement, pxW: number, pxH: number, scale: number): HTMLCanvasElement {
  const mask = l.mask;
  if (!mask || mask.enabled === false) return pic;
  if (!mask.strokes.length && !mask.invert) return pic;
  let ip = maskRasters.get(l.id);
  if (!ip) maskRasters.set(l.id, (ip = new IncrementalPaint()));
  const hidden = ip.render(mask.strokes, pxW, pxH, scale);
  let out = maskedPics.get(l.id);
  if (!out || out.width !== pxW || out.height !== pxH) maskedPics.set(l.id, (out = makeCanvas(pxW, pxH)));
  const c = out.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, pxW, pxH);
  c.drawImage(pic, 0, 0);
  c.globalCompositeOperation = mask.invert ? 'destination-in' : 'destination-out';
  c.drawImage(hidden, 0, 0);
  c.globalCompositeOperation = 'source-over';
  return out;
}

/** Cached picture of one layer (unclipped, full opacity). Re-made only when that layer object changes. */
const rasterCache = new WeakMap<ClothingLayer, { key: string; canvas: HTMLCanvasElement }>();

function rasterize(kind: ClothingKind, l: ClothingLayer, env: RenderEnv, pxW: number, pxH: number, scale: number): HTMLCanvasElement {
  if (l.type === 'paint') {
    let ip = paintRasters.get(l.id);
    if (!ip) paintRasters.set(l.id, (ip = new IncrementalPaint()));
    return ip.render(l.strokes, pxW, pxH, scale);
  }
  const key = `${pxW}x${pxH}|${env.version}`;
  const hit = rasterCache.get(l);
  if (hit && hit.key === key) return hit.canvas;
  const canvas = hit && hit.canvas.width === pxW && hit.canvas.height === pxH ? hit.canvas : makeCanvas(pxW, pxH);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pxW, pxH);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  switch (l.type) {
    case 'fill':
      drawFill(ctx, kind, l);
      break;
    case 'pattern':
      drawPattern(ctx, kind, l);
      break;
    case 'image':
      drawImageLayer(ctx, l, env);
      break;
    case 'text':
      drawText(ctx, l);
      break;
    case 'shape':
      drawShape(ctx, l);
      break;
  }
  ctx.restore();
  rasterCache.set(l, { key, canvas });
  return canvas;
}

/**
 * Flattens a design onto ctx. `scale` is the pixel density (T-shirts are drawn larger than 128 px).
 * Each layer's picture is cached, so editing one layer re-draws that layer and then just blits the rest.
 */
export function drawLayers(ctx: CanvasRenderingContext2D, kind: ClothingKind, layers: ClothingLayer[], env: RenderEnv, scale?: number): void {
  const spec = TEMPLATES[kind];
  const k = scale ?? spec.scale;
  const pxW = Math.round(spec.width * k);
  const pxH = Math.round(spec.height * k);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, pxW, pxH);
  ctx.restore();

  const groups = groupIndex(layers);
  for (const l of layers) {
    if (l.type === 'group') continue; // a folder draws nothing itself
    const eff = effectiveOf(l, groups);
    if (!eff.visible || eff.opacity <= 0) continue;
    const pic = applyMask(l, rasterize(kind, l, env, pxW, pxH, k), pxW, pxH, k);
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    applyClip(ctx, kind, l.clip);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(1, Math.max(0, eff.opacity));
    ctx.globalCompositeOperation = BLEND[l.blend];
    ctx.drawImage(pic, 0, 0);
    ctx.restore();
  }

  // Everything outside the template panels is ignored by Roblox, so keep it transparent.
  ctx.save();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  for (const p of spec.panels) ctx.rect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ geometry helpers for editing

export interface LayerBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

/** Oriented box for layers the user can move/scale/rotate. Null for area layers. */
export function layerBox(l: ClothingLayer): LayerBox | null {
  switch (l.type) {
    case 'image':
    case 'shape':
      return { cx: l.x, cy: l.y, w: l.w, h: l.h, rotation: l.rotation };
    case 'text': {
      const e = curvedTextExtent(l);
      const a = (l.rotation * Math.PI) / 180;
      // the box is centred on the arc's middle, which sits above or below the layer position when text is curved
      return { cx: l.x - e.offY * Math.sin(a), cy: l.y + e.offY * Math.cos(a), w: e.w + l.strokeWidth, h: e.h, rotation: l.rotation };
    }
    default:
      return null;
  }
}

export function pointInBox(b: LayerBox, x: number, y: number): boolean {
  const a = (-b.rotation * Math.PI) / 180;
  const dx = x - b.cx;
  const dy = y - b.cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2;
}
