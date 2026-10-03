import * as THREE from 'three';
import type { ClothingKind } from '../types';
import { drawLayers, type RenderEnv } from './render';
import { TEMPLATES } from './templates';
import { useClothing } from '../store/clothing';

/**
 * One offscreen canvas per clothing kind holding the flattened design.
 * The 2D editor, the 3D preview and the exporter all read from here, so what you see is what you export.
 */
const canvases = new Map<ClothingKind, HTMLCanvasElement>();
const rendered = new Map<ClothingKind, string>();
const imageEls = new Map<string, { url: string; el: HTMLImageElement | null }>();

function imageEnv(): RenderEnv {
  return {
    getImage: (id) => {
      const img = useClothing.getState().images.find((i) => i.id === id);
      if (!img) return null;
      const hit = imageEls.get(id);
      if (hit && hit.url === img.dataUrl) return hit.el;
      const entry = { url: img.dataUrl, el: null as HTMLImageElement | null };
      imageEls.set(id, entry);
      const el = new Image();
      el.onload = () => {
        entry.el = el;
        useClothing.setState((s) => ({ imageRev: s.imageRev + 1 }));
      };
      el.src = img.dataUrl;
      return null;
    },
  };
}

export function canvasFor(kind: ClothingKind): HTMLCanvasElement {
  let c = canvases.get(kind);
  if (!c) {
    const spec = TEMPLATES[kind];
    c = document.createElement('canvas');
    c.width = Math.round(spec.width * spec.scale);
    c.height = Math.round(spec.height * spec.scale);
    canvases.set(kind, c);
  }
  return c;
}

/** Re-renders the kind's canvas when its layers or images changed. Returns true if it redrew. */
export function ensureComposite(kind: ClothingKind): boolean {
  const s = useClothing.getState();
  const key = `${s.revision}:${s.imageRev}:${s.designVersion[kind]}`;
  if (rendered.get(kind) === key) return false;
  const c = canvasFor(kind);
  const ctx = c.getContext('2d');
  if (!ctx) return false;
  drawLayers(ctx, kind, s.designs[kind], imageEnv());
  rendered.set(kind, key);
  return true;
}

export function getComposite(kind: ClothingKind): HTMLCanvasElement {
  ensureComposite(kind);
  return canvasFor(kind);
}

// ------------------------------------------------------------------ 3D textures

const textures = new Map<ClothingKind, THREE.CanvasTexture>();

export function clothingTexture(kind: ClothingKind): THREE.CanvasTexture {
  let t = textures.get(kind);
  if (!t) {
    t = new THREE.CanvasTexture(canvasFor(kind));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.generateMipmaps = true;
    textures.set(kind, t);
  }
  return t;
}

/** Call once per frame: redraws dirty designs and flags the matching textures for upload. */
export function syncTextures(): void {
  for (const kind of ['shirt', 'pants', 'tshirt'] as ClothingKind[]) {
    if (ensureComposite(kind)) {
      const t = textures.get(kind);
      if (t) t.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------------ export

export function exportCanvas(kind: ClothingKind, size?: number): HTMLCanvasElement {
  const spec = TEMPLATES[kind];
  const src = getComposite(kind);
  const out = document.createElement('canvas');
  const w = kind === 'tshirt' ? (size ?? spec.width) : spec.width;
  const h = kind === 'tshirt' ? (size ?? spec.height) : spec.height;
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the PNG.'))), 'image/png'));
}
