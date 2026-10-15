import * as THREE from 'three';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { worldMatrix } from '../utils/math';
import { getModelGeometry, getPaintGeometry, getPrimitiveGeometry, triangleCount as trisOf } from '../utils/geometry';
import { booleanGeometry, decimate, mirrorGeometry, triangleCount, type BooleanOp } from '../utils/meshOps';
import { subtreeIds } from '../utils/scene';
import type { SceneObject } from '../types';

type Objects = Record<string, SceneObject>;
type Models = ReturnType<typeof useEditor.getState>['models'];

/** The mesh of a part in its own space (before its position, rotation and size are applied). */
export function ownGeometry(o: SceneObject, models: Models): THREE.BufferGeometry | null {
  if (o.kind === 'group') return null;
  if (o.paint) return getPaintGeometry(o.kind, o.detail, o.modelId ? models[o.modelId] : undefined);
  if (o.kind === 'imported') return o.modelId && models[o.modelId] ? getModelGeometry(models[o.modelId]) : null;
  return getPrimitiveGeometry(o.kind, o.detail);
}

/** The mesh of a part placed in the space of `spaceParentId` (null = the scene). */
export function geometryInSpaceOf(o: SceneObject, objects: Objects, models: Models, spaceParentId: string | null): THREE.BufferGeometry | null {
  const g = ownGeometry(o, models);
  if (!g) return null;
  const toWorld = worldMatrix(objects, o.id);
  const space = spaceParentId ? worldMatrix(objects, spaceParentId) : new THREE.Matrix4();
  return g.clone().applyMatrix4(space.clone().invert().multiply(toWorld));
}

function layerOf(o: SceneObject) {
  return o.layerId;
}

/** Mirrors a part (or a whole group) across the centre line of the thing it sits in. The original stays. */
export function mirrorObject(id: string): string | null {
  const s = useEditor.getState();
  const src = s.objects[id];
  if (!src) return null;
  const ids = src.kind === 'group' ? subtreeIds(s.objects, s.order, id).filter((i) => s.objects[i].kind !== 'group') : [id];
  const specs: { name: string; geometry: THREE.BufferGeometry; material: SceneObject['material']; layerId: string }[] = [];
  for (const pid of ids) {
    const o = s.objects[pid];
    const g = geometryInSpaceOf(o, s.objects, s.models, src.parentId);
    if (!g) continue;
    specs.push({ name: `${o.name} (mirrored)`, geometry: mirrorGeometry(g), material: o.material, layerId: layerOf(o) });
  }
  if (!specs.length) {
    useUI.getState().toast('warn', 'There is nothing to mirror in this selection.');
    return null;
  }
  const out = s.addMeshObjects(`Mirrored ${src.name}`, specs, { parentId: src.parentId, ...(src.kind === 'group' ? { groupName: `${src.name} (mirrored)` } : {}) });
  useUI.getState().toast('success', `Mirrored ${src.name} across the centre line. The original is still there.`);
  return out;
}

export const BOOLEAN_LABEL: Record<BooleanOp, string> = { union: 'Join', subtract: 'Cut out', intersect: 'Keep overlap' };

/** Combines two parts into one new mesh. The two originals are hidden (not deleted) so the result can be undone or compared. */
export function booleanObjects(aId: string, bId: string, op: BooleanOp): string | null {
  const ui = useUI.getState();
  const s = useEditor.getState();
  const a = s.objects[aId];
  const b = s.objects[bId];
  if (!a || !b || a.kind === 'group' || b.kind === 'group') {
    ui.toast('error', 'Pick two single parts, not groups.');
    return null;
  }
  try {
    const ga = geometryInSpaceOf(a, s.objects, s.models, a.parentId);
    const gb = geometryInSpaceOf(b, s.objects, s.models, a.parentId);
    if (!ga || !gb) throw new Error('One of the parts has no mesh.');
    const result = booleanGeometry(ga, gb, op);
    const tris = triangleCount(result);
    if (!tris) throw new Error(op === 'intersect' ? 'The two parts do not overlap, so there is nothing to keep.' : 'The result is empty.');
    const name = `${a.name} ${op === 'union' ? '+' : op === 'subtract' ? '−' : '∩'} ${b.name}`;
    const id = s.addMeshObjects(`${BOOLEAN_LABEL[op]}: ${a.name} and ${b.name}`, [{ name, geometry: result, material: a.material, layerId: layerOf(a) }], { parentId: a.parentId, hide: [aId, bId] });
    ui.toast('success', `${BOOLEAN_LABEL[op]}: ${tris.toLocaleString()} triangles. The two originals are hidden.`);
    return id;
  } catch (e) {
    ui.toast('error', `The operation did not work: ${e instanceof Error ? e.message : 'unknown problem'}. It needs two solid, closed shapes.`);
    return null;
  }
}

export interface Reduction {
  before: number;
  after: number;
  geometry: THREE.BufferGeometry;
  original: THREE.BufferGeometry;
}

/** Previews reducing a part to about `target` triangles without changing the project. */
export async function previewReduction(id: string, target: number): Promise<Reduction | null> {
  const s = useEditor.getState();
  const o = s.objects[id];
  const g = o ? ownGeometry(o, s.models) : null;
  if (!o || !g) return null;
  const geometry = await decimate(g, target);
  return { before: trisOf(g), after: triangleCount(geometry), geometry, original: g };
}

export function applyReduction(id: string, geometry: THREE.BufferGeometry): boolean {
  const o = useEditor.getState().objects[id];
  if (!o) return false;
  const ok = useEditor.getState().setObjectMesh(id, geometry, `Reduced ${o.name} to ${triangleCount(geometry).toLocaleString()} triangles`);
  if (!ok) useUI.getState().toast('error', 'Hand-painted parts cannot be reduced, because the paint is tied to their triangles.');
  return ok;
}

/**
 * Brings the whole accessory under a triangle budget by reducing the heaviest parts, proportionally.
 * Returns the triangle count afterwards.
 */
export async function autoFitBudget(budget: number): Promise<{ before: number; after: number; changed: number }> {
  const s = useEditor.getState();
  const parts = Object.values(s.objects)
    .filter((o) => o.kind !== 'group' && o.visible)
    .map((o) => ({ o, g: ownGeometry(o, s.models) }))
    .filter((p): p is { o: SceneObject; g: THREE.BufferGeometry } => !!p.g);
  const counts = parts.map((p) => trisOf(p.g));
  const before = counts.reduce((a, b) => a + b, 0);
  if (before <= budget) return { before, after: before, changed: 0 };
  // keep small parts as they are; shrink the rest to share what is left
  const sorted = counts.map((c, i) => ({ c, i })).sort((a, b) => a.c - b.c);
  let remaining = budget;
  let left = sorted.length;
  const targets = new Array<number>(parts.length).fill(0);
  for (const { c, i } of sorted) {
    const fair = Math.floor(remaining / left);
    targets[i] = Math.min(c, Math.max(4, fair));
    remaining -= targets[i];
    left--;
  }
  let changed = 0;
  const results: { id: string; g: THREE.BufferGeometry }[] = [];
  for (let k = 0; k < parts.length; k++) {
    if (targets[k] >= counts[k] || parts[k].o.paint) continue;
    const g = await decimate(parts[k].g, targets[k]);
    results.push({ id: parts[k].o.id, g });
    changed++;
  }
  for (const r of results) useEditor.getState().setObjectMesh(r.id, r.g, 'Fit to the triangle budget');
  const after = Object.values(useEditor.getState().objects)
    .filter((o) => o.kind !== 'group' && o.visible)
    .reduce((n, o) => {
      const g = ownGeometry(o, useEditor.getState().models);
      return n + (g ? trisOf(g) : 0);
    }, 0);
  return { before, after, changed };
}

