import * as THREE from 'three';
import type { ClothingKind } from '../types';
import { drawLayers, type RenderEnv } from './render';
import { TEMPLATES } from './templates';
import { useClothing } from '../store/clothing';
import { useSettings, type Quality } from '../store/settings';

/**
 * One offscreen canvas per clothing kind holding the flattened design.
 * The 2D editor and the 3D preview read from here. Exports render a separate full-resolution copy.
 */
const canvases = new Map<ClothingKind, HTMLCanvasElement>();
const rendered = new Map<ClothingKind, string>();
const imageEls = new Map<string, { url: string; el: HTMLImageElement | null }>();
let fontRev = 0;

if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.addEventListener?.('loadingdone', () => {
    fontRev += 1;
    useClothing.setState((s) => ({ imageRev: s.imageRev + 1 }));
  });
}

/** T-shirts are drawn at 4x for crisp exports; weaker machines preview them at a lower density. */
export function previewScale(kind: ClothingKind, quality: Quality = useSettings.getState().quality): number {
  if (kind !== 'tshirt') return 1;
  return quality === 'low' ? 2 : quality === 'medium' ? 3 : 4;
}

function imageEnv(): RenderEnv {
  return {
    version: useClothing.getState().imageRev + fontRev * 1000,
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
  const spec = TEMPLATES[kind];
  const k = previewScale(kind);
  const w = Math.round(spec.width * k);
  let c = canvases.get(kind);
  if (!c || c.width !== w) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round(spec.height * k);
    canvases.set(kind, c);
    rendered.delete(kind);
    textures.get(kind)?.dispose();
    textures.delete(kind);
  }
  return c;
}

/** Version key of what is currently drawn on a kind's canvas (changes whenever the design changes). */
export function compositeKey(kind: ClothingKind): string {
  return rendered.get(kind) ?? '';
}

/** Re-renders the kind's canvas when its layers or images changed. Returns true if it redrew. */
export function ensureComposite(kind: ClothingKind): boolean {
  const s = useClothing.getState();
  const c = canvasFor(kind);
  const key = `${s.revision}:${s.imageRev}:${s.designVersion[kind]}:${c.width}`;
  if (rendered.get(kind) === key) return false;
  const ctx = c.getContext('2d');
  if (!ctx) return false;
  drawLayers(ctx, kind, s.designs[kind], imageEnv(), previewScale(kind));
  rendered.set(kind, key);
  return true;
}

export function getComposite(kind: ClothingKind): HTMLCanvasElement {
  ensureComposite(kind);
  return canvasFor(kind);
}

/** Full-resolution render for export and checks, independent of the preview quality. */
export function renderFull(kind: ClothingKind): HTMLCanvasElement {
  const spec = TEMPLATES[kind];
  const c = document.createElement('canvas');
  c.width = Math.round(spec.width * spec.scale);
  c.height = Math.round(spec.height * spec.scale);
  const ctx = c.getContext('2d');
  if (ctx) drawLayers(ctx, kind, useClothing.getState().designs[kind], imageEnv(), spec.scale);
  return c;
}

// ------------------------------------------------------------------ 3D textures

const textures = new Map<ClothingKind, THREE.CanvasTexture>();
const lastUpload = new Map<ClothingKind, number>();

export function clothingTexture(kind: ClothingKind): THREE.CanvasTexture {
  let t = textures.get(kind);
  if (!t) {
    t = new THREE.CanvasTexture(canvasFor(kind));
    t.colorSpace = THREE.SRGBColorSpace;
    const low = useSettings.getState().quality === 'low';
    t.anisotropy = low ? 1 : 4;
    t.generateMipmaps = !low;
    t.minFilter = low ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
    textures.set(kind, t);
  }
  return t;
}

/** Drops cached textures (used when the render quality changes the preview setup). */
export function resetTextures(): void {
  textures.forEach((t) => t.dispose());
  textures.clear();
  lastUpload.clear();
}

/** Minimum gap between GPU uploads while painting: weaker settings upload less often. */
const UPLOAD_GAP: Record<Quality, number> = { low: 66, medium: 33, high: 16 };

/**
 * Call once per frame: makes sure every design is drawn and flags a texture for upload when what it
 * last uploaded is older than the canvas. The uploaded version is tracked on the texture itself because
 * the 2D editor and the 3D preview share one canvas: whichever redraws it first must not hide the change
 * from the other. Uploads are rate-limited so a fast brush cannot flood a slow GPU.
 */
export function syncTextures(): void {
  const gap = UPLOAD_GAP[useSettings.getState().quality];
  const now = performance.now();
  for (const kind of ['shirt', 'pants', 'tshirt'] as ClothingKind[]) {
    ensureComposite(kind);
    const t = textures.get(kind);
    if (!t) continue;
    const key = compositeKey(kind);
    if (t.userData.uploadedKey === key) continue;
    if (now - (lastUpload.get(kind) ?? 0) < gap) continue;
    lastUpload.set(kind, now);
    t.userData.uploadedKey = key;
    t.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ export

export function exportCanvas(kind: ClothingKind, size?: number): HTMLCanvasElement {
  const spec = TEMPLATES[kind];
  const src = renderFull(kind);
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
