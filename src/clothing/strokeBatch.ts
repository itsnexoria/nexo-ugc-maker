import { useClothing } from '../store/clothing';

/**
 * Pointer events can fire hundreds of times per second on a high-polling mouse. Re-rendering for each one
 * is wasted work, so points are queued and applied once per animation frame (and immediately on release).
 */
interface Pending {
  layerId: string;
  index: number;
  mirrorIndex: number | null;
  points: [number, number][];
}

let pending: Pending | null = null;
let raf = 0;

export function flushStroke(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  const p = pending;
  pending = null;
  if (p) useClothing.getState().extendStrokeMany(p.layerId, p.index, p.points, p.mirrorIndex);
}

export function queueStrokePoint(layerId: string, index: number, mirrorIndex: number | null, point: [number, number]): void {
  if (pending && (pending.layerId !== layerId || pending.index !== index)) flushStroke();
  if (!pending) pending = { layerId, index, mirrorIndex, points: [] };
  pending.points.push(point);
  if (!raf) raf = requestAnimationFrame(flushStroke);
}
