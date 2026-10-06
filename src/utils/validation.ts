import * as THREE from 'three';
import type { Layer, ModelAsset, SceneObject, TextureAsset } from '../types';
import { getModelGeometry, getPrimitiveGeometry, triangleCount } from './geometry';
import { isFiniteVec, worldMatrix } from './math';

/**
 * Roblox-oriented limits. The triangle and texture caps follow Roblox's published UGC
 * validation rules for rigid accessories. Size thresholds are this tool's own sanity
 * checks, not official numbers, and are labelled that way in the UI.
 */
export const LIMITS = {
  maxTriangles: 4000,
  warnTriangles: 3000,
  maxTexture: 1024,
  minSize: 0.2,
  maxSize: 8,
  farFromOrigin: 6,
} as const;

export type Severity = 'ok' | 'info' | 'warn' | 'error';

export interface CheckResult {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
  /** Object ids to select when the row is clicked */
  objectIds?: string[];
}

export interface ValidationInput {
  objects: Record<string, SceneObject>;
  order: string[];
  layers: Layer[];
  textures: TextureAsset[];
  models: Record<string, ModelAsset>;
}

export interface ValidationReport {
  results: CheckResult[];
  errors: number;
  warnings: number;
  triangles: number;
  size: [number, number, number] | null;
  meshCount: number;
}

function geometryFor(o: SceneObject, models: Record<string, ModelAsset>): THREE.BufferGeometry | null {
  if (o.kind === 'group') return null;
  if (o.kind === 'imported') {
    const m = o.modelId ? models[o.modelId] : undefined;
    return m ? getModelGeometry(m) : null;
  }
  return getPrimitiveGeometry(o.kind, o.detail); // painted parts have the same triangle count
}

export function objectTriangles(o: SceneObject, models: Record<string, ModelAsset>): number {
  const g = geometryFor(o, models);
  return g ? triangleCount(g) : 0;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

export function validateProject(input: ValidationInput): ValidationReport {
  const { objects, layers, textures, models } = input;
  const all = Object.values(objects);
  const meshes = all.filter((o) => o.kind !== 'group');
  const results: CheckResult[] = [];
  const layerById = new Map(layers.map((l) => [l.id, l]));

  // --- empty scene / object exists
  if (all.length === 0) {
    results.push({ id: 'empty', severity: 'error', title: 'Empty scene', detail: 'Add a preset from the Assets tab or a part from the toolbox.' });
    return { results, errors: 1, warnings: 0, triangles: 0, size: null, meshCount: 0 };
  }
  results.push({ id: 'object', severity: 'ok', title: 'Valid object', detail: `${all.length} object${all.length === 1 ? '' : 's'} in the scene.` });

  // --- mesh exists (visible ones count for export)
  const visibleMeshes = meshes.filter((o) => o.visible && (layerById.get(o.layerId)?.visible ?? true));
  if (meshes.length === 0) {
    results.push({ id: 'mesh', severity: 'error', title: 'No mesh found', detail: 'The scene only contains empty groups. Add a part.' });
  } else if (visibleMeshes.length === 0) {
    results.push({ id: 'mesh', severity: 'error', title: 'All meshes are hidden', detail: 'Hidden parts are left out of exports.' });
  } else {
    results.push({ id: 'mesh', severity: 'ok', title: 'Mesh exists', detail: `${visibleMeshes.length} visible mesh part${visibleMeshes.length === 1 ? '' : 's'}.` });
  }

  const missingModel = meshes.filter((o) => o.kind === 'imported' && !(o.modelId && models[o.modelId]));
  if (missingModel.length) {
    results.push({ id: 'model-missing', severity: 'error', title: 'Imported mesh data is missing', detail: missingModel.map((o) => o.name).join(', '), objectIds: missingModel.map((o) => o.id) });
  }

  // --- transforms / scale
  const badTransform = all.filter((o) => !isFiniteVec(o.position) || !isFiniteVec(o.rotation) || !isFiniteVec(o.scale));
  if (badTransform.length) {
    results.push({ id: 'transform', severity: 'error', title: 'Invalid transform', detail: `${badTransform.map((o) => o.name).join(', ')} has a NaN or infinite value.`, objectIds: badTransform.map((o) => o.id) });
  } else {
    results.push({ id: 'transform', severity: 'ok', title: 'Transforms are valid' });
  }

  const badScale = all.filter((o) => isFiniteVec(o.scale) && o.scale.some((s) => s <= 0.0001));
  if (badScale.length) {
    results.push({
      id: 'scale',
      severity: 'error',
      title: 'Invalid scale',
      detail: `${badScale.map((o) => o.name).join(', ')} has a zero or negative scale axis. Set it above 0.`,
      objectIds: badScale.map((o) => o.id),
    });
  } else {
    const extreme = meshes.filter((o) => isFiniteVec(o.scale) && Math.max(...o.scale) / Math.min(...o.scale) > 40);
    if (extreme.length) {
      results.push({ id: 'scale', severity: 'warn', title: 'Extreme stretching', detail: `${extreme.map((o) => o.name).join(', ')} is stretched more than 40:1 on one axis.`, objectIds: extreme.map((o) => o.id) });
    } else {
      results.push({ id: 'scale', severity: 'ok', title: 'Scale acceptable' });
    }
  }

  // --- triangles
  let triangles = 0;
  for (const o of visibleMeshes) triangles += objectTriangles(o, models);
  if (triangles > LIMITS.maxTriangles) {
    results.push({
      id: 'tris',
      severity: 'error',
      title: 'Triangle count over the limit',
      detail: `${triangles.toLocaleString()} triangles. Roblox rigid accessories are capped at ${LIMITS.maxTriangles.toLocaleString()}. Remove or simplify parts.`,
    });
  } else if (triangles > LIMITS.warnTriangles) {
    results.push({ id: 'tris', severity: 'warn', title: 'High polygon count', detail: `${triangles.toLocaleString()} of ${LIMITS.maxTriangles.toLocaleString()} triangles used.` });
  } else if (visibleMeshes.length) {
    results.push({ id: 'tris', severity: 'ok', title: 'Polygon count acceptable', detail: `${triangles.toLocaleString()} of ${LIMITS.maxTriangles.toLocaleString()} triangles.` });
  }

  // --- world-space bounds (vertex accurate)
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let vertexBudget = 120_000;
  for (const o of visibleMeshes) {
    const g = geometryFor(o, models);
    if (!g || !isFiniteVec(o.position) || !isFiniteVec(o.rotation) || !isFiniteVec(o.scale)) continue;
    const m = worldMatrix(objects, o.id);
    const pos = g.attributes.position;
    if (vertexBudget > 0) {
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        box.expandByPoint(v);
      }
      vertexBudget -= pos.count;
    } else if (g.boundingBox) {
      box.union(g.boundingBox.clone().applyMatrix4(m));
    }
  }
  let size: [number, number, number] | null = null;
  if (!box.isEmpty()) {
    const s = box.getSize(new THREE.Vector3());
    size = [s.x, s.y, s.z];
    const dims = `${fmt(s.x)} × ${fmt(s.y)} × ${fmt(s.z)} studs`;
    const smallest = Math.min(s.x, s.y, s.z);
    const largest = Math.max(s.x, s.y, s.z);
    if (smallest < 0.001) {
      results.push({ id: 'dims', severity: 'error', title: 'Flat bounding box', detail: `${dims}. The accessory needs volume on every axis.` });
    } else if (largest > LIMITS.maxSize) {
      results.push({ id: 'dims', severity: 'warn', title: 'Dimensions very large', detail: `${dims}. Larger than ${LIMITS.maxSize} studs is unusual for an accessory (Studio guideline, not a Roblox rule).` });
    } else if (largest < LIMITS.minSize) {
      results.push({ id: 'dims', severity: 'warn', title: 'Dimensions very small', detail: `${dims}. Smaller than ${LIMITS.minSize} studs may be rejected as too small.` });
    } else {
      results.push({ id: 'dims', severity: 'ok', title: 'Dimensions acceptable', detail: dims });
    }
    const c = box.getCenter(new THREE.Vector3());
    const roots = all.filter((o) => !o.parentId && o.slot);
    if (roots.length === 1 && c.distanceTo(new THREE.Vector3(...roots[0].position)) > LIMITS.farFromOrigin) {
      results.push({ id: 'placement', severity: 'warn', title: 'Accessory is far from its attachment point', detail: 'Use "Snap to slot" in the Object section so it sits on the avatar.' });
    }
  }

  // --- textures
  const usedIds = new Set<string>();
  const missing: SceneObject[] = [];
  const painted = meshes.filter((o) => o.paint && o.paint.strokes.length > 0);
  for (const o of meshes) {
    if (o.paint) continue; // painted parts replace their texture mapping
    const id = o.material.textureId;
    if (!id) continue;
    usedIds.add(id);
    if (!textures.some((t) => t.id === id)) missing.push(o);
  }
  if (missing.length) {
    results.push({ id: 'tex-missing', severity: 'error', title: 'Missing textures', detail: `${missing.map((o) => o.name).join(', ')} references a texture that is no longer in the library.`, objectIds: missing.map((o) => o.id) });
  } else if (usedIds.size === 0 && painted.length === 0) {
    results.push({ id: 'tex', severity: 'info', title: 'No texture applied', detail: 'Optional. Colours and materials export, but Roblox uploads normally use one texture map.' });
  } else {
    const bits = [usedIds.size ? `${usedIds.size} texture${usedIds.size === 1 ? '' : 's'} in use` : '', painted.length ? `${painted.length} hand-painted part${painted.length === 1 ? '' : 's'}` : ''].filter(Boolean);
    results.push({ id: 'tex', severity: 'ok', title: 'Texture detected', detail: `${bits.join(', ')}.` });
  }
  for (const id of usedIds) {
    const t = textures.find((x) => x.id === id);
    if (!t) continue;
    const pot = (n: number) => (n & (n - 1)) === 0;
    if (t.width > LIMITS.maxTexture || t.height > LIMITS.maxTexture) {
      results.push({ id: `texres-${id}`, severity: 'error', title: 'Texture resolution too high', detail: `"${t.name}" is ${t.width}×${t.height}. Roblox accepts up to ${LIMITS.maxTexture}×${LIMITS.maxTexture}.` });
    } else if (!pot(t.width) || !pot(t.height)) {
      results.push({ id: `texres-${id}`, severity: 'warn', title: 'Texture is not a power of two', detail: `"${t.name}" is ${t.width}×${t.height}. 256, 512 or 1024 compress best.` });
    } else {
      results.push({ id: `texres-${id}`, severity: 'ok', title: 'Texture resolution acceptable', detail: `"${t.name}" is ${t.width}×${t.height}.` });
    }
  }

  // --- structure notes
  if (visibleMeshes.length > 1) {
    results.push({
      id: 'parts',
      severity: 'info',
      title: `${visibleMeshes.length} separate parts`,
      detail: 'Roblox accessories upload as a single mesh. Turn on "Join into one mesh" in the export dialog to get one mesh and one baked texture.',
    });
  }
  if (visibleMeshes.some((o) => o.material.opacity < 1)) {
    results.push({ id: 'alpha', severity: 'info', title: 'Transparent materials in use', detail: 'Transparency needs to be handled with a texture alpha channel or a separate setup in Roblox.' });
  }

  const errors = results.filter((r) => r.severity === 'error').length;
  const warnings = results.filter((r) => r.severity === 'warn').length;
  return { results, errors, warnings, triangles, size, meshCount: visibleMeshes.length };
}
