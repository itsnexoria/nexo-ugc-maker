/**
 * Shrinks big pictures so projects stay small and saves stay fast.
 * - never upscales
 * - keeps transparency (re-encodes to WebP when the browser can, otherwise PNG)
 * - only keeps the result when it is actually smaller
 */
export const TEXTURE_MAX_DIM = 1024; // Roblox accepts up to 1024 x 1024 for accessory textures
export const CLOTHING_IMAGE_MAX_DIM = 1170; // twice the 585 px classic template width, plenty for any layer
const RECOMPRESS_ABOVE_CHARS = 400_000; // ~300 KB of image data

export interface OptimizeResult {
  dataUrl: string;
  width: number;
  height: number;
  changed: boolean;
  /** size before, in characters of the data URL (about 1.37x the file size) */
  before: number;
  after: number;
}

/** The size an image of w x h should be drawn at so its longest side is at most maxDim. */
export function planScale(width: number, height: number, maxDim: number): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (!(longest > maxDim) || width <= 0 || height <= 0) return { width, height, scaled: false };
  const k = maxDim / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: true };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('This image took too long to decode.')), 10_000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('This image could not be decoded.'));
    };
    img.src = dataUrl;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the image.'));
    r.readAsDataURL(blob);
  });
}

const toBlob = (c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> => new Promise((res) => c.toBlob((b) => res(b), type, quality));

export async function optimizeDataUrl(dataUrl: string, opts: { maxDim: number; force?: boolean }): Promise<OptimizeResult> {
  const before = dataUrl.length;
  const unchanged = (width: number, height: number): OptimizeResult => ({ dataUrl, width, height, changed: false, before, after: before });
  if (typeof document === 'undefined') return unchanged(0, 0);
  let img: HTMLImageElement;
  try {
    img = await loadImage(dataUrl);
  } catch {
    return unchanged(0, 0);
  }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const plan = planScale(w, h, opts.maxDim);
  if (!plan.scaled && !opts.force && before < RECOMPRESS_ABOVE_CHARS) return unchanged(w, h);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return unchanged(w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, plan.width, plan.height);
    // Resizing already changes the pixels, so a high-quality WebP is fine. Without resizing only a lossless PNG is
    // allowed, because pixel-exact art (clothing templates) must not be degraded just to save space.
    let blob = plan.scaled ? await toBlob(canvas, 'image/webp', 0.92) : null;
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/png');
    if (!blob) return unchanged(w, h);
    const out = await blobToDataUrl(blob);
    // re-encoding the same pixels is only worth it when it clearly saves space
    if (!plan.scaled && out.length > before * 0.85) return unchanged(w, h);
    return { dataUrl: out, width: plan.width, height: plan.height, changed: true, before, after: out.length };
  } catch {
    return unchanged(w, h);
  }
}
