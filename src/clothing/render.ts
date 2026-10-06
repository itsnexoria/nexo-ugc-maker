import { IncrementalPaint } from '../utils/strokePaint';
import type { BlendMode, ClothingKind, ClothingLayer, ImageLayer, PatternLayer, ShapeLayer, ShapeType, TextLayer } from '../types';
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

export function textSize(l: TextLayer): { w: number; h: number; lines: string[]; lineHeight: number } {
  const lines = l.text.split('\n');
  const lineHeight = l.size * 1.15;
  const ctx = getMeasureCtx();
  let w = 0;
  if (ctx) {
    ctx.font = fontString(l);
    for (const line of lines) w = Math.max(w, ctx.measureText(line || ' ').width);
  } else {
    for (const line of lines) w = Math.max(w, line.length * l.size * 0.58);
  }
  return { w: Math.max(w, 4), h: lineHeight * lines.length, lines, lineHeight };
}

// ------------------------------------------------------------------ patterns

const tileCache = new Map<string, HTMLCanvasElement>();

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

function makeTile(pattern: PatternLayer['pattern'], s: number, c1: string, c2: string): HTMLCanvasElement {
  const key = `${pattern}|${s}|${c1}|${c2}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  const size = Math.max(2, Math.round(s));
  let w = size * 2;
  let h = size * 2;
  if (pattern === 'grid') w = h = size;
  if (pattern === 'zigzag') h = size;
  if (pattern === 'camo') w = h = 128;
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = c2;
  g.fillRect(0, 0, w, h);
  g.fillStyle = c1;
  switch (pattern) {
    case 'stripes':
      g.fillRect(0, 0, w, size);
      break;
    case 'checker':
      g.fillRect(0, 0, size, size);
      g.fillRect(size, size, size, size);
      break;
    case 'dots':
      g.beginPath();
      g.arc(size, size, size * 0.5, 0, Math.PI * 2);
      g.fill();
      break;
    case 'grid':
      g.fillRect(0, 0, w, Math.max(1, size / 8));
      g.fillRect(0, 0, Math.max(1, size / 8), h);
      break;
    case 'zigzag':
      g.strokeStyle = c1;
      g.lineWidth = Math.max(1, size / 5);
      g.beginPath();
      g.moveTo(0, size * 0.85);
      g.lineTo(size * 0.5, size * 0.15);
      g.lineTo(size, size * 0.85);
      g.lineTo(size * 1.5, size * 0.15);
      g.lineTo(size * 2, size * 0.85);
      g.stroke();
      break;
    case 'camo': {
      let seed = 1337;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const shades = [mix(c1, c2, 0.3), mix(c1, c2, 0.6), c1];
      for (let i = 0; i < 46; i++) {
        g.fillStyle = shades[i % 3];
        const x = rand() * w;
        const y = rand() * h;
        const rx = 8 + rand() * 18;
        const ry = 6 + rand() * 12;
        for (const ox of [-w, 0, w]) {
          for (const oy of [-h, 0, h]) {
            g.beginPath();
            g.ellipse(x + ox, y + oy, rx, ry, rand() * 3, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      break;
    }
  }
  if (tileCache.size > 80) tileCache.clear();
  tileCache.set(key, c);
  return c;
}

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
  ctx.translate(l.x, l.y);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.font = fontString(l);
  ctx.textBaseline = 'middle';
  ctx.textAlign = l.align;
  ctx.lineJoin = 'round';
  const x = l.align === 'left' ? -w / 2 : l.align === 'right' ? w / 2 : 0;
  const top = (-lines.length * lineHeight) / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    const y = top + i * lineHeight;
    if (l.strokeWidth > 0) {
      ctx.strokeStyle = l.stroke;
      ctx.lineWidth = l.strokeWidth;
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = l.color;
    ctx.fillText(line, x, y);
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

export function forgetPaintLayer(id: string): void {
  paintRasters.delete(id);
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

  for (const l of layers) {
    if (!l.visible || l.opacity <= 0) continue;
    const pic = rasterize(kind, l, env, pxW, pxH, k);
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    applyClip(ctx, kind, l.clip);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(1, Math.max(0, l.opacity));
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
      const s = textSize(l);
      return { cx: l.x, cy: l.y, w: s.w + l.strokeWidth, h: s.h, rotation: l.rotation };
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
