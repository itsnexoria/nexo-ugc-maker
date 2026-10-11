import type { PatternId } from '../types';

/** Small repeating tiles for pattern layers and pattern brushes. */
const tileCache = new Map<string, HTMLCanvasElement>();

export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

export function makeTile(pattern: PatternId, s: number, c1: string, c2: string): HTMLCanvasElement {
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

