import { uid } from '../utils/ids';
import { useClothing } from '../store/clothing';
import { useUI } from '../store/ui';
import type { ClothingImage, ClothingKind } from '../types';
import { renderFull } from './composite';
import { TEMPLATES } from './templates';
import { expandRegion, regionSize, regionToRgba, selectRegion } from './wand';

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}

/**
 * Fill tool (magic wand): finds the area of similar colour under the click in the finished design and
 * puts a new layer of the chosen colour over exactly that area. Nothing underneath is changed.
 */
export function fillAt(kind: ClothingKind, x: number, y: number): boolean {
  const st = useClothing.getState();
  const spec = TEMPLATES[kind];
  const src = renderFull(kind);
  const ctx = src.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const { width, height } = src;
  const px = (x / spec.width) * width;
  const py = (y / spec.height) * height;
  if (px < 0 || py < 0 || px >= width || py >= height) return false;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const { tolerance, contiguous, expand } = st.fillOpts;
  let region = selectRegion(pixels, width, height, px, py, { tolerance, contiguous });
  if (!regionSize(region)) return false;
  if (expand > 0) region = expandRegion(region, width, height, expand * (width / spec.width));

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const octx = out.getContext('2d');
  if (!octx) return false;
  octx.putImageData(new ImageData(regionToRgba(region, hexToRgb(st.brush.color), Math.round(255 * st.brush.opacity)) as unknown as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  const img: ClothingImage = { id: uid('img'), name: 'Filled area', dataUrl: out.toDataURL('image/png'), width, height };
  st.addRegionFill(img);
  useUI.getState().log('info', `Filled ${regionSize(region).toLocaleString()} pixels`);
  return true;
}
