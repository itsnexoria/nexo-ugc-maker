import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ModelAsset, SceneObject, TextureAsset } from '../types';
import { getModelGeometry, getPrimitiveGeometry, triangleCount } from './geometry';
import { DEG, worldMatrix } from './math';

/**
 * Joins every visible part into ONE mesh and bakes their materials into ONE texture atlas,
 * which is the shape Roblox accessories need. Each part gets a square cell in the atlas:
 * flat-colour parts use a single colour, textured parts get their image tiled into the cell.
 */
export type AtlasSize = 512 | 1024;

export interface BakeInput {
  objects: Record<string, SceneObject>;
  order: string[];
  textures: TextureAsset[];
  models: Record<string, ModelAsset>;
  layers: { id: string; visible: boolean }[];
}

export interface BakeResult {
  geometry: THREE.BufferGeometry;
  atlas: HTMLCanvasElement | null;
  parts: number;
  triangles: number;
  /** true when any part is see-through, so the atlas carries an alpha channel */
  hasAlpha: boolean;
  gridSize: number;
}

export function atlasGrid(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(count)));
}

/** UV rectangle (v up) of a cell in a grid x grid atlas. */
export function cellUv(grid: number, index: number): { u0: number; v0: number; u1: number; v1: number } {
  const col = index % grid;
  const row = Math.floor(index / grid);
  return { u0: col / grid, u1: (col + 1) / grid, v1: 1 - row / grid, v0: 1 - (row + 1) / grid };
}

/** Flat colour for a part: base colour plus its glow, because Roblox accessories have no emission map. */
export function bakedColor(o: SceneObject): string {
  const c = new THREE.Color(o.material.color);
  if (o.material.emissiveIntensity > 0) {
    c.add(new THREE.Color(o.material.emissive).multiplyScalar(Math.min(1.5, o.material.emissiveIntensity)));
    c.r = Math.min(1, c.r);
    c.g = Math.min(1, c.g);
    c.b = Math.min(1, c.b);
  }
  return `#${c.getHexString()}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('A texture could not be loaded for baking.'));
    img.src = url;
  });
}

function geometryOf(o: SceneObject, models: Record<string, ModelAsset>): THREE.BufferGeometry | null {
  if (o.kind === 'group') return null;
  if (o.kind === 'imported') {
    const m = o.modelId ? models[o.modelId] : undefined;
    return m ? getModelGeometry(m) : null;
  }
  return getPrimitiveGeometry(o.kind, o.detail);
}

function visibleChain(o: SceneObject, input: BakeInput): boolean {
  let cur: SceneObject | undefined = o;
  let guard = 0;
  while (cur && guard++ < 64) {
    const layer = input.layers.find((l) => l.id === cur!.layerId);
    if (!cur.visible || layer?.visible === false) return false;
    cur = cur.parentId ? input.objects[cur.parentId] : undefined;
  }
  return true;
}

export async function bakeMerged(input: BakeInput, atlasSize: AtlasSize, origin: THREE.Vector3 | null, includeHidden = false): Promise<BakeResult> {
  const parts = input.order
    .map((id) => input.objects[id])
    .filter((o): o is SceneObject => !!o && o.kind !== 'group' && (includeHidden || visibleChain(o, input)) && !!geometryOf(o, input.models));
  if (!parts.length) throw new Error('There is nothing visible to export. Add a part or show hidden parts.');

  const grid = atlasGrid(parts.length);
  const cell = atlasSize / grid;
  const pad = 1.5 / atlasSize;
  const hasDom = typeof document !== 'undefined';
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  if (hasDom) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = atlasSize;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) canvas = null;
  }

  const images = new Map<string, HTMLImageElement>();
  const geos: THREE.BufferGeometry[] = [];
  let triangles = 0;
  let hasAlpha = false;
  const shift = origin ? new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z) : new THREE.Matrix4();

  for (let i = 0; i < parts.length; i++) {
    const o = parts[i];
    const src = geometryOf(o, input.models)!;
    let g = src.index ? src.toNonIndexed() : src.clone();
    g.applyMatrix4(shift.clone().multiply(worldMatrix(input.objects, o.id)));
    g.deleteAttribute('color');
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const tex = o.material.textureId ? input.textures.find((t) => t.id === o.material.textureId) : undefined;
    const rect = cellUv(grid, i);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) {
      if (tex) {
        const u = Math.min(1, Math.max(0, uv.getX(k)));
        const v = Math.min(1, Math.max(0, uv.getY(k)));
        uv.setXY(k, rect.u0 + pad + u * (rect.u1 - rect.u0 - pad * 2), rect.v0 + pad + v * (rect.v1 - rect.v0 - pad * 2));
      } else {
        uv.setXY(k, (rect.u0 + rect.u1) / 2, (rect.v0 + rect.v1) / 2);
      }
    }
    uv.needsUpdate = true;
    geos.push(g);
    triangles += triangleCount(g);
    if (o.material.opacity < 1) hasAlpha = true;

    if (ctx) {
      const col = i % grid;
      const row = Math.floor(i / grid);
      const x = col * cell;
      const y = row * cell;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cell, cell);
      ctx.clip();
      ctx.globalAlpha = Math.max(0, Math.min(1, o.material.opacity));
      if (tex) {
        let img = images.get(tex.id);
        if (!img) {
          img = await loadImage(tex.dataUrl);
          images.set(tex.id, img);
        }
        ctx.translate(x + cell / 2, y + cell / 2);
        ctx.rotate(-o.material.texRotation * DEG);
        ctx.translate(-cell / 2 + o.material.texOffset[0] * cell, -cell / 2 - o.material.texOffset[1] * cell);
        const pat = ctx.createPattern(img, 'repeat');
        if (pat && typeof DOMMatrix !== 'undefined') {
          pat.setTransform(new DOMMatrix().scale(cell / (o.material.texRepeat[0] * img.width), cell / (o.material.texRepeat[1] * img.height)));
          ctx.fillStyle = pat;
          ctx.fillRect(-cell, -cell, cell * 3, cell * 3);
        }
        const tint = new THREE.Color(o.material.color);
        if (tint.r < 0.99 || tint.g < 0.99 || tint.b < 0.99) {
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = `#${tint.getHexString()}`;
          ctx.fillRect(-cell, -cell, cell * 3, cell * 3);
        }
      } else {
        ctx.fillStyle = bakedColor(o);
        ctx.fillRect(x, y, cell, cell);
      }
      ctx.restore();
    }
  }

  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) throw new Error('The parts could not be combined into one mesh.');
  merged.computeBoundingBox();
  return { geometry: merged, atlas: canvas, parts: parts.length, triangles, hasAlpha, gridSize: grid };
}
