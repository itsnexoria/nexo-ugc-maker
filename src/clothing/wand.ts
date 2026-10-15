/**
 * Region selection by colour ("magic wand"), on plain RGBA pixel data so it can be tested without a canvas.
 */
export interface RegionOptions {
  /** 0 to 100: how different a pixel may be from the clicked one and still count */
  tolerance: number;
  /** only pixels connected to the click, or every similar pixel */
  contiguous: boolean;
}

/** Largest difference over the four channels (0-255). Transparent pixels all count as the same colour. */
export function colorDistance(d: ArrayLike<number>, i: number, j: number): number {
  const ai = d[i + 3];
  const aj = d[j + 3];
  if (ai === 0 && aj === 0) return 0;
  return Math.max(Math.abs(d[i] - d[j]), Math.abs(d[i + 1] - d[j + 1]), Math.abs(d[i + 2] - d[j + 2]), Math.abs(ai - aj));
}

/** Returns one byte per pixel: 1 where the pixel is in the region. */
export function selectRegion(data: ArrayLike<number>, width: number, height: number, sx: number, sy: number, opts: RegionOptions): Uint8Array {
  const out = new Uint8Array(width * height);
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return out;
  const seed = (y0 * width + x0) * 4;
  const limit = Math.max(0, Math.min(100, opts.tolerance)) * 2.55;
  const matches = (p: number) => colorDistance(data, p * 4, seed) <= limit;

  if (!opts.contiguous) {
    for (let p = 0; p < width * height; p++) if (matches(p)) out[p] = 1;
    return out;
  }
  // scanline flood fill: fast, and no recursion to overflow
  const stack: number[] = [x0, y0];
  while (stack.length) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    let p = y * width + x;
    if (out[p] || !matches(p)) continue;
    while (x > 0 && !out[p - 1] && matches(p - 1)) {
      x--;
      p--;
    }
    let up = false;
    let down = false;
    while (x < width && !out[p] && matches(p)) {
      out[p] = 1;
      if (y > 0) {
        const m = matches(p - width) && !out[p - width];
        if (m && !up) stack.push(x, y - 1);
        up = m;
      }
      if (y < height - 1) {
        const m = matches(p + width) && !out[p + width];
        if (m && !down) stack.push(x, y + 1);
        down = m;
      }
      x++;
      p++;
    }
  }
  return out;
}

/** Grows the region by `px` pixels in every direction, which hides the thin halo that anti-aliased edges leave. */
export function expandRegion(region: Uint8Array, width: number, height: number, px: number): Uint8Array {
  let cur = region;
  for (let step = 0; step < Math.round(px); step++) {
    const next = cur.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (cur[p]) continue;
        if ((x > 0 && cur[p - 1]) || (x < width - 1 && cur[p + 1]) || (y > 0 && cur[p - width]) || (y < height - 1 && cur[p + width])) next[p] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

export function regionSize(region: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < region.length; i++) n += region[i];
  return n;
}

/** RGBA pixels: `color` where the region is, transparent elsewhere. */
export function regionToRgba(region: Uint8Array, rgb: [number, number, number], alpha = 255): Uint8ClampedArray {
  const out = new Uint8ClampedArray(region.length * 4);
  for (let p = 0; p < region.length; p++) {
    if (!region[p]) continue;
    out[p * 4] = rgb[0];
    out[p * 4 + 1] = rgb[1];
    out[p * 4 + 2] = rgb[2];
    out[p * 4 + 3] = alpha;
  }
  return out;
}
