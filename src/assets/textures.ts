/**
 * Procedural, tileable starter textures. They are drawn with the Canvas 2D API
 * (so the app needs no external image files) and stored in the project like
 * any uploaded texture.
 */

export interface BuiltinTexture {
  id: string;
  name: string;
  size: number;
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drawCircuit(ctx: CanvasRenderingContext2D, size: number) {
  const rand = rng(7);
  ctx.fillStyle = '#0d0d10';
  ctx.fillRect(0, 0, size, size);
  const cell = size / 16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // faint grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 16; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  for (let n = 0; n < 26; n++) {
    let x = Math.floor(rand() * 16);
    let y = Math.floor(rand() * 16);
    const bright = rand() > 0.55;
    ctx.strokeStyle = bright ? '#ff2d38' : '#8e1a21';
    ctx.lineWidth = bright ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(x * cell, y * cell);
    const steps = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < steps; s++) {
      const horizontal = rand() > 0.5;
      const len = 1 + Math.floor(rand() * 3);
      const dir = rand() > 0.5 ? 1 : -1;
      if (horizontal) x += len * dir;
      else y += len * dir;
      x = (x + 16) % 16;
      y = (y + 16) % 16;
      ctx.lineTo(x * cell, y * cell);
      // diagonal kink
      if (rand() > 0.6) {
        x += dir;
        y += dir;
        ctx.lineTo(x * cell, y * cell);
      }
    }
    ctx.stroke();
    ctx.fillStyle = bright ? '#ffd0d3' : '#d6454c';
    ctx.beginPath();
    ctx.arc(x * cell, y * cell, bright ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHex(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#121216';
  ctx.fillRect(0, 0, size, size);
  const r = size / 8;
  const h = Math.sqrt(3) * r;
  ctx.strokeStyle = '#e3242b';
  ctx.lineWidth = 3;
  for (let row = -1; row < 10; row++) {
    for (let col = -1; col < 10; col++) {
      const cx = col * r * 1.5;
      const cy = row * h + (col % 2 ? h / 2 : 0);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        const px = cx + r * 0.92 * Math.cos(a);
        const py = cy + r * 0.92 * Math.sin(a);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = (row + col) % 3 === 0 ? '#1d1d23' : '#16161a';
      ctx.fill();
      ctx.stroke();
    }
  }
}

function drawCarbon(ctx: CanvasRenderingContext2D, size: number) {
  const c = size / 16;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dark = (x + y) % 2 === 0;
      const g = ctx.createLinearGradient(x * c, y * c, (x + 1) * c, (y + 1) * c);
      g.addColorStop(0, dark ? '#25252b' : '#101013');
      g.addColorStop(1, dark ? '#101013' : '#25252b');
      ctx.fillStyle = g;
      ctx.fillRect(x * c, y * c, c, c);
    }
  }
}

function drawChecker(ctx: CanvasRenderingContext2D, size: number) {
  const c = size / 8;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f2f2f4' : '#1a1a1e';
      ctx.fillRect(x * c, y * c, c, c);
    }
  }
}

function drawStripes(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#17171a';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#e3242b';
  const w = size / 8;
  for (let i = -8; i < 16; i++) {
    ctx.beginPath();
    ctx.moveTo(i * w, 0);
    ctx.lineTo(i * w + w / 2, 0);
    ctx.lineTo(i * w + w / 2 + size, size);
    ctx.lineTo(i * w + size, size);
    ctx.closePath();
    ctx.fill();
  }
}

export const BUILTIN_TEXTURES: BuiltinTexture[] = [
  { id: 'circuit', name: 'Circuit panel', size: 512, draw: drawCircuit },
  { id: 'hex', name: 'Hex grid', size: 512, draw: drawHex },
  { id: 'carbon', name: 'Carbon fiber', size: 512, draw: drawCarbon },
  { id: 'checker', name: 'Checker', size: 512, draw: drawChecker },
  { id: 'stripes', name: 'Hazard stripes', size: 512, draw: drawStripes },
];

export interface RenderedTexture {
  dataUrl: string;
  width: number;
  height: number;
}

/** Renders a builtin texture to a PNG data URL. Returns null when no canvas is available (tests). */
export function renderBuiltinTexture(id: string): RenderedTexture | null {
  const def = BUILTIN_TEXTURES.find((t) => t.id === id);
  if (!def || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = def.size;
  canvas.height = def.size;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return null;
  def.draw(ctx, def.size);
  return { dataUrl: canvas.toDataURL('image/png'), width: def.size, height: def.size };
}
