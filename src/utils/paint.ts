import type { MaterialProps, PaintData, SceneObject, Stroke, TextureAsset } from '../types';
import { IncrementalPaint } from './strokePaint';
import { DEG } from './math';
import { create } from 'zustand';

/**
 * Hand-painted textures for accessory parts. Each painted part owns a square canvas:
 * its base colour (and library texture, if any) first, then the brush strokes on top.
 */
export const usePaintRev = create<{ rev: number; bump: () => void }>((set) => ({ rev: 0, bump: () => set((s) => ({ rev: s.rev + 1 })) }));

const rasters = new Map<string, IncrementalPaint>();
const images = new Map<string, { url: string; el: HTMLImageElement | null }>();

function loadImage(url: string): HTMLImageElement | null {
  const hit = images.get(url);
  if (hit) return hit.el;
  const entry = { url, el: null as HTMLImageElement | null };
  images.set(url, entry);
  const el = new Image();
  el.onload = () => {
    entry.el = el;
    usePaintRev.getState().bump();
  };
  el.src = url;
  return null;
}

export function paintBackgroundKey(m: MaterialProps, tex: TextureAsset | undefined): string {
  return `${m.color}|${tex?.id ?? ''}|${tex?.dataUrl.length ?? 0}|${m.texRepeat}|${m.texOffset}|${m.texRotation}|${usePaintRev.getState().rev}`;
}

function drawBackground(ctx: CanvasRenderingContext2D, res: number, m: MaterialProps, tex: TextureAsset | undefined): void {
  ctx.fillStyle = m.color;
  ctx.fillRect(0, 0, res, res);
  if (!tex) return;
  const img = loadImage(tex.dataUrl);
  if (!img) return;
  ctx.save();
  ctx.translate(res / 2, res / 2);
  ctx.rotate(-m.texRotation * DEG);
  ctx.translate(-res / 2 + m.texOffset[0] * res, -res / 2 - m.texOffset[1] * res);
  const pat = ctx.createPattern(img, 'repeat');
  if (pat && typeof DOMMatrix !== 'undefined') {
    pat.setTransform(new DOMMatrix().scale(res / (m.texRepeat[0] * img.width), res / (m.texRepeat[1] * img.height)));
    ctx.fillStyle = pat;
    ctx.fillRect(-res, -res, res * 3, res * 3);
  }
  ctx.restore();
}

/** The painted image for a part (cached and updated incrementally). Null if the part is not painted. */
export function paintCanvasFor(o: SceneObject, textures: TextureAsset[]): HTMLCanvasElement | null {
  if (!o.paint || typeof document === 'undefined') return null;
  let r = rasters.get(o.id);
  if (!r) rasters.set(o.id, (r = new IncrementalPaint()));
  const tex = o.material.textureId ? textures.find((t) => t.id === o.material.textureId) : undefined;
  try {
    return r.render(o.paint.strokes, o.paint.res, o.paint.res, 1, (ctx) => drawBackground(ctx, o.paint!.res, o.material, tex), paintBackgroundKey(o.material, tex));
  } catch {
    return null; // no 2D canvas available (tests, very old browsers)
  }
}

export function forgetPaint(id: string): void {
  rasters.delete(id);
}

export function emptyPaint(res: PaintData['res'] = 256): PaintData {
  return { res, strokes: [] };
}

/** Brush size is stored as a share of the texture so changing resolution keeps strokes the same size. */
export function strokeScale(stroke: Stroke, k: number): Stroke {
  return { ...stroke, size: stroke.size * k, points: stroke.points.map(([x, y]) => [x * k, y * k] as [number, number]) };
}
