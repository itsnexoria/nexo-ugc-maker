import type { Stroke } from '../types';

/**
 * Brush stroke engine shared by the clothing designer and accessory texture painting.
 * Strokes are stored as vectors (points + brush settings) so projects stay small and undo is cheap.
 */

export function drawStrokePath(g: CanvasRenderingContext2D, st: Stroke, color: string): void {
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = st.size;
  if (st.points.length === 1) {
    g.beginPath();
    g.arc(st.points[0][0], st.points[0][1], st.size / 2, 0, Math.PI * 2);
    g.fill();
  } else if (st.points.length > 1) {
    g.beginPath();
    g.moveTo(st.points[0][0], st.points[0][1]);
    for (let i = 1; i < st.points.length; i++) g.lineTo(st.points[i][0], st.points[i][1]);
    g.stroke();
  }
}

/** Soft brush: radial-gradient stamps along the path (colour only, alpha handled by the caller). */
export function drawSoftStamps(g: CanvasRenderingContext2D, st: Stroke): void {
  const r = st.size / 2;
  const hard = Math.min(1, Math.max(0, st.hardness ?? 1));
  const step = Math.max(0.5, st.size * 0.12);
  const rgb = st.color;
  const stamp = (x: number, y: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgb);
    grad.addColorStop(Math.min(0.999, hard), rgb);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const pts = st.points;
  if (pts.length === 1) return stamp(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) stamp(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
  }
}

let scratch: HTMLCanvasElement | null = null;

function getScratch(w: number, h: number): HTMLCanvasElement {
  if (!scratch || scratch.width !== w || scratch.height !== h) {
    scratch = document.createElement('canvas');
    scratch.width = w;
    scratch.height = h;
  }
  return scratch;
}

/** Pixel box a stroke can touch, so soft/translucent strokes only clear and blit that region. */
function strokeBox(st: Stroke, scale: number, pxW: number, pxH: number) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of st.points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const pad = st.size / 2 + 2;
  const bx = Math.max(0, Math.floor((x0 - pad) * scale));
  const by = Math.max(0, Math.floor((y0 - pad) * scale));
  return { x: bx, y: by, w: Math.min(pxW, Math.ceil((x1 + pad) * scale)) - bx, h: Math.min(pxH, Math.ceil((y1 + pad) * scale)) - by };
}

export function drawStroke(g: CanvasRenderingContext2D, st: Stroke, pxW: number, pxH: number, scale: number): void {
  if (!st.points.length) return;
  const alpha = Math.min(1, Math.max(0, st.alpha ?? 1));
  const soft = (st.hardness ?? 1) < 0.97;
  const op: GlobalCompositeOperation = st.erase ? 'destination-out' : 'source-over';
  if (!soft && alpha >= 0.999) {
    g.globalCompositeOperation = op;
    drawStrokePath(g, st, st.color);
    return;
  }
  // render the whole stroke at full strength on a reused scratch canvas, then apply its opacity once
  const box = strokeBox(st, scale, pxW, pxH);
  if (box.w <= 0 || box.h <= 0) return;
  const tmp = getScratch(pxW, pxH);
  const t = tmp.getContext('2d')!;
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.clearRect(box.x, box.y, box.w, box.h);
  t.save();
  t.beginPath();
  t.rect(box.x, box.y, box.w, box.h);
  t.clip();
  t.scale(scale, scale);
  t.lineCap = 'round';
  t.lineJoin = 'round';
  t.globalCompositeOperation = 'source-over';
  if (soft) drawSoftStamps(t, st);
  else drawStrokePath(t, st, st.color);
  t.restore();
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = alpha;
  g.globalCompositeOperation = op;
  g.drawImage(tmp, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
  g.restore();
}


/**
 * Keeps painted pixels between edits. Finished strokes live in a "base" canvas; only the last two
 * strokes (a stroke and its symmetric twin) can still be growing, so only those are redrawn per update.
 * A pointer move therefore costs the same whether the surface holds 5 strokes or 500.
 * An optional background (for example a part's base colour) is painted under the strokes.
 */
const LIVE = 2;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function setupStrokeCtx(g: CanvasRenderingContext2D, scale: number): void {
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.lineCap = 'round';
  g.lineJoin = 'round';
}

export class IncrementalPaint {
  private w = 0;
  private h = 0;
  private base: HTMLCanvasElement | null = null;
  private out: HTMLCanvasElement | null = null;
  private baked: Stroke[] = [];
  private lastStrokes: Stroke[] | null = null;
  private lastBgKey = '';

  render(strokes: Stroke[], pxW: number, pxH: number, scale: number, background?: (ctx: CanvasRenderingContext2D) => void, bgKey = ''): HTMLCanvasElement {
    if (!this.base || !this.out || this.w !== pxW || this.h !== pxH) {
      this.base = makeCanvas(pxW, pxH);
      this.out = makeCanvas(pxW, pxH);
      this.w = pxW;
      this.h = pxH;
      this.baked = [];
      this.lastStrokes = null;
      this.lastBgKey = '\u0000';
    }
    if (this.lastStrokes === strokes && this.lastBgKey === bgKey) return this.out;
    const bg = this.base.getContext('2d')!;

    // the first N strokes are unchanged when they are the very same objects as last time
    let same = 0;
    while (same < this.baked.length && same < strokes.length && strokes[same] === this.baked[same]) same++;
    const rebuild = same < this.baked.length || bgKey !== this.lastBgKey;
    if (rebuild) {
      bg.setTransform(1, 0, 0, 1, 0, 0);
      bg.globalCompositeOperation = 'source-over';
      bg.globalAlpha = 1;
      bg.clearRect(0, 0, pxW, pxH);
      if (background) {
        bg.save();
        background(bg);
        bg.restore();
      }
      this.baked = [];
      same = 0;
    }
    const bakeUpTo = Math.max(0, strokes.length - LIVE);
    if (bakeUpTo > same) {
      bg.save();
      setupStrokeCtx(bg, scale);
      for (let i = same; i < bakeUpTo; i++) {
        drawStroke(bg, strokes[i], pxW, pxH, scale);
        this.baked.push(strokes[i]);
      }
      bg.restore();
    }

    const og = this.out.getContext('2d')!;
    og.setTransform(1, 0, 0, 1, 0, 0);
    og.globalAlpha = 1;
    og.globalCompositeOperation = 'copy';
    og.drawImage(this.base, 0, 0);
    og.globalCompositeOperation = 'source-over';
    og.save();
    setupStrokeCtx(og, scale);
    for (let i = Math.max(bakeUpTo, this.baked.length); i < strokes.length; i++) drawStroke(og, strokes[i], pxW, pxH, scale);
    og.restore();
    this.lastStrokes = strokes;
    this.lastBgKey = bgKey;
    return this.out;
  }
}
