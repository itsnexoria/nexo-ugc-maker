import { describe, expect, it } from 'vitest';
import { expandRegion, regionSize, regionToRgba, selectRegion } from '../src/clothing/wand';

/** 6x4 image from a picture: '.' transparent, r red, b blue, R slightly different red */
function img(rows: string[]): { data: Uint8ClampedArray; w: number; h: number } {
  const h = rows.length;
  const w = rows[0].length;
  const data = new Uint8ClampedArray(w * h * 4);
  const colors: Record<string, [number, number, number, number]> = { '.': [0, 0, 0, 0], r: [255, 0, 0, 255], R: [245, 10, 10, 255], b: [0, 0, 255, 255] };
  rows.forEach((row, y) => [...row].forEach((c, x) => data.set(colors[c], (y * w + x) * 4)));
  return { data, w, h };
}
const at = (r: Uint8Array, w: number, x: number, y: number) => r[y * w + x];

describe('selectRegion', () => {
  const pic = img(['rr.bb.', 'rr.bb.', '..rr..', 'bb.rrb']);

  it('contiguous fill stays inside the clicked blob', () => {
    const r = selectRegion(pic.data, pic.w, pic.h, 0, 0, { tolerance: 0, contiguous: true });
    expect(regionSize(r)).toBe(4);
    expect(at(r, pic.w, 1, 1)).toBe(1);
    expect(at(r, pic.w, 2, 2)).toBe(0); // red, but not connected to the clicked blob
  });

  it('non-contiguous selects every matching pixel', () => {
    const r = selectRegion(pic.data, pic.w, pic.h, 0, 0, { tolerance: 0, contiguous: false });
    expect(regionSize(r)).toBe(4 + 2 + 2); // top-left blob, middle pair, bottom pair
    expect(at(r, pic.w, 3, 3)).toBe(1);
  });

  it('transparent areas are one colour, so the empty parts of the template can be filled', () => {
    const r = selectRegion(pic.data, pic.w, pic.h, 2, 0, { tolerance: 0, contiguous: true });
    expect(at(r, pic.w, 2, 0)).toBe(1);
    expect(at(r, pic.w, 2, 1)).toBe(1);
    expect(regionSize(r)).toBe(2); // the gap column only: it is walled in by the coloured blobs
    expect(at(r, pic.w, 0, 2)).toBe(0); // another empty area, not connected
    expect(at(r, pic.w, 0, 0)).toBe(0);
    // with 'every similar pixel' all the empty parts are found
    expect(regionSize(selectRegion(pic.data, pic.w, pic.h, 2, 0, { tolerance: 0, contiguous: false }))).toBe(9); // every transparent pixel in the picture
  });

  it('tolerance decides whether a near colour joins in', () => {
    const near = img(['rRr', 'bbb']);
    expect(regionSize(selectRegion(near.data, near.w, near.h, 0, 0, { tolerance: 0, contiguous: true }))).toBe(1);
    expect(regionSize(selectRegion(near.data, near.w, near.h, 0, 0, { tolerance: 10, contiguous: true }))).toBe(3);
  });

  it('a click outside the image selects nothing', () => {
    expect(regionSize(selectRegion(pic.data, pic.w, pic.h, -1, 0, { tolerance: 50, contiguous: true }))).toBe(0);
    expect(regionSize(selectRegion(pic.data, pic.w, pic.h, 99, 99, { tolerance: 50, contiguous: false }))).toBe(0);
  });

  it('handles a large image without overflowing the stack', () => {
    const w = 700;
    const h = 700;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    expect(regionSize(selectRegion(data, w, h, 10, 10, { tolerance: 0, contiguous: true }))).toBe(w * h);
  });

  it('a spiral corridor is followed to its end', () => {
    const maze = img(['rrrrr', 'bbbbr', 'rrrbr', 'rbbbr', 'rrrrr']);
    const r = selectRegion(maze.data, maze.w, maze.h, 0, 0, { tolerance: 0, contiguous: true });
    expect(at(r, maze.w, 0, 4)).toBe(1);
    expect(at(r, maze.w, 2, 2)).toBe(1);
  });
});

describe('expandRegion / regionToRgba', () => {
  it('grows by whole pixels', () => {
    const pic = img(['...', '.r.', '...']);
    const one = selectRegion(pic.data, 3, 3, 1, 1, { tolerance: 0, contiguous: true });
    expect(regionSize(expandRegion(one, 3, 3, 0))).toBe(1);
    expect(regionSize(expandRegion(one, 3, 3, 1))).toBe(5); // plus shape
    expect(regionSize(expandRegion(one, 3, 3, 2))).toBe(9);
  });

  it('paints only the region', () => {
    const rgba = regionToRgba(Uint8Array.from([1, 0]), [10, 20, 30], 200);
    expect(Array.from(rgba)).toEqual([10, 20, 30, 200, 0, 0, 0, 0]);
  });
});
