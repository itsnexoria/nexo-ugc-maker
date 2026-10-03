import type { ClothingImage, ClothingKind, ClothingLayer, FillLayer, ImageLayer, PaintLayer, PatternLayer, ShapeLayer, TextLayer } from '../types';
import { uid } from '../utils/ids';
import { clipBounds, TEMPLATES } from './templates';

export type NewLayerType = ClothingLayer['type'];

/** Default clip for a freshly added layer: chest for graphics, whole template for area fills. */
export function defaultClip(kind: ClothingKind, type: NewLayerType): string {
  if (kind === 'tshirt') return 'all';
  if (type === 'fill' || type === 'pattern' || type === 'paint') return 'all';
  return 'torso.front';
}

function base(name: string, clip: string) {
  return { id: uid('lyr'), name, visible: true, locked: false, opacity: 1, blend: 'normal' as const, clip };
}

export function makeLayer(kind: ClothingKind, type: NewLayerType, clip?: string, image?: ClothingImage): ClothingLayer {
  const c = clip ?? defaultClip(kind, type);
  const b = clipBounds(kind, c);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const small = TEMPLATES[kind].width < 200;
  switch (type) {
    case 'fill':
      return { ...base('Color fill', c), type: 'fill', color: '#1a1b20', color2: null, angle: 90 } satisfies FillLayer;
    case 'pattern':
      return { ...base('Pattern', c), type: 'pattern', pattern: 'stripes', color: '#e3242b', color2: '#16171b', size: small ? 6 : 10, angle: 0 } satisfies PatternLayer;
    case 'text':
      return {
        ...base('Text', c),
        type: 'text',
        text: 'NEXO',
        font: 'Chakra Petch',
        size: small ? 26 : 30,
        color: '#ffffff',
        bold: true,
        italic: false,
        stroke: '#000000',
        strokeWidth: 0,
        align: 'center',
        x: cx,
        y: cy,
        rotation: 0,
      } satisfies TextLayer;
    case 'shape':
      return {
        ...base('Shape', c),
        type: 'shape',
        shape: 'rect',
        x: cx,
        y: cy,
        w: Math.min(60, b.w * 0.6),
        h: Math.min(40, b.h * 0.4),
        rotation: 0,
        fill: '#e3242b',
        stroke: '#000000',
        strokeWidth: 0,
        radius: 0,
      } satisfies ShapeLayer;
    case 'image': {
      const iw = image?.width ?? 100;
      const ih = image?.height ?? 100;
      const k = Math.min((b.w * 0.8) / iw, (b.h * 0.8) / ih, 1.5);
      return {
        ...base(image?.name ?? 'Image', c),
        type: 'image',
        imageId: image?.id ?? '',
        x: cx,
        y: cy,
        w: Math.max(4, iw * k),
        h: Math.max(4, ih * k),
        rotation: 0,
        flipX: false,
      } satisfies ImageLayer;
    }
    case 'paint':
      return { ...base('Paint', c), type: 'paint', strokes: [] } satisfies PaintLayer;
  }
}

export const FONTS = ['Chakra Petch', 'IBM Plex Sans', 'Arial', 'Georgia', 'Courier New', 'Impact', 'Trebuchet MS', 'Verdana'];

export const PATTERNS: { id: PatternLayer['pattern']; label: string }[] = [
  { id: 'stripes', label: 'Stripes' },
  { id: 'checker', label: 'Checker' },
  { id: 'dots', label: 'Dots' },
  { id: 'grid', label: 'Grid' },
  { id: 'zigzag', label: 'Zigzag' },
  { id: 'camo', label: 'Camo' },
];
