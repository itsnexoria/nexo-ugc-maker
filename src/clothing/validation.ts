import type { ClothingImage, ClothingKind, ClothingLayer } from '../types';
import { TEMPLATES } from './templates';

export type ClothingSeverity = 'ok' | 'info' | 'warn' | 'error';
export interface ClothingCheck {
  id: string;
  severity: ClothingSeverity;
  title: string;
  detail?: string;
}

/** Layer-based checks (no canvas needed, so they can be unit tested). */
export function checkLayers(kind: ClothingKind, layers: ClothingLayer[], images: ClothingImage[]): ClothingCheck[] {
  const spec = TEMPLATES[kind];
  const out: ClothingCheck[] = [];
  const visible = layers.filter((l) => l.visible && l.opacity > 0);
  if (!visible.length) {
    out.push({ id: 'empty', severity: 'error', title: 'Nothing to export', detail: `The ${spec.label.toLowerCase()} has no visible layers. Add a color fill, a preset or some artwork.` });
    return out;
  }
  out.push({ id: 'layers', severity: 'ok', title: `${visible.length} visible layer${visible.length === 1 ? '' : 's'}` });

  const missing = visible.filter((l) => l.type === 'image' && !images.some((i) => i.id === l.imageId));
  if (missing.length) out.push({ id: 'missing-img', severity: 'error', title: 'Missing image', detail: `${missing.map((l) => l.name).join(', ')} uses an image that is no longer in the library.` });

  const soft = visible.filter((l) => {
    if (l.type !== 'image') return false;
    const src = images.find((i) => i.id === l.imageId);
    return !!src && l.w / src.width > 2.5;
  });
  if (soft.length) out.push({ id: 'soft', severity: 'warn', title: 'Enlarged image', detail: `${soft.map((l) => l.name).join(', ')} is stretched more than 2.5× and may look blurry. Use a larger source image.` });

  const tiny = visible.filter((l) => l.type === 'text' && l.size < 6);
  if (tiny.length) out.push({ id: 'tiny-text', severity: 'warn', title: 'Very small text', detail: `${tiny.map((l) => l.name).join(', ')} is under 6 px and will be unreadable on the avatar.` });

  const hidden = layers.length - visible.length;
  if (hidden > 0) out.push({ id: 'hidden', severity: 'info', title: `${hidden} hidden layer${hidden === 1 ? '' : 's'}`, detail: 'Hidden layers are not exported.' });
  return out;
}

/** Fraction of template-panel pixels that contain artwork (0..1). Needs a real canvas. */
export function coverage(kind: ClothingKind, canvas: HTMLCanvasElement): number {
  const spec = TEMPLATES[kind];
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  const k = spec.scale;
  let total = 0;
  let filled = 0;
  for (const p of spec.panels) {
    const data = ctx.getImageData(Math.round(p.x * k), Math.round(p.y * k), Math.round(p.w * k), Math.round(p.h * k)).data;
    for (let i = 3; i < data.length; i += 4) {
      total++;
      if (data[i] > 8) filled++;
    }
  }
  return total ? filled / total : 0;
}

export function checkCoverage(kind: ClothingKind, frac: number): ClothingCheck {
  const spec = TEMPLATES[kind];
  const pct = Math.round(frac * 100);
  if (frac < 0.005) return { id: 'coverage', severity: 'error', title: 'The design is transparent', detail: 'No visible artwork lands inside the template panels.' };
  if (kind !== 'tshirt' && frac < 0.35) return { id: 'coverage', severity: 'info', title: `${pct}% of the template is painted`, detail: `Unpainted areas show the avatar's skin or lower layers. That is fine for ${spec.label.toLowerCase()} with bare arms or legs.` };
  return { id: 'coverage', severity: 'ok', title: `${pct}% of the template is painted` };
}
