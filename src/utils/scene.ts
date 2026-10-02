import type { Layer, MaterialProps, PartSpec, SceneObject, Vec3 } from '../types';
import { DEFAULT_MATERIAL } from '../assets/materials';
import { uid } from './ids';

export const DEFAULT_LAYERS: Layer[] = [
  { id: 'layer_main', name: 'Main', visible: true, locked: false },
  { id: 'layer_details', name: 'Details', visible: true, locked: false },
  { id: 'layer_glow', name: 'Glow', visible: true, locked: false },
];

export function layerIdFor(key: PartSpec['layer'], layers: Layer[]): string {
  const wanted = key === 'details' ? 'layer_details' : key === 'glow' ? 'layer_glow' : 'layer_main';
  return layers.find((l) => l.id === wanted)?.id ?? layers[0]?.id ?? 'layer_main';
}

export interface InstantiateOut {
  objects: Record<string, SceneObject>;
  order: string[];
}

/** Turns a PartSpec tree into SceneObjects (fresh ids). Returns the root id. */
export function instantiate(
  spec: PartSpec,
  parentId: string | null,
  layers: Layer[],
  out: InstantiateOut,
  rootPosition?: Vec3,
): string {
  const id = uid('obj');
  const material: MaterialProps = { ...DEFAULT_MATERIAL, ...spec.material };
  const obj: SceneObject = {
    id,
    name: spec.name,
    kind: spec.kind,
    parentId,
    position: rootPosition ?? spec.position ?? [0, 0, 0],
    rotation: spec.rotation ?? [0, 0, 0],
    scale: spec.scale ?? [1, 1, 1],
    material,
    visible: true,
    locked: false,
    layerId: layerIdFor(spec.layer, layers),
    slot: spec.slot,
  };
  out.objects[id] = obj;
  out.order.push(id);
  for (const child of spec.children ?? []) instantiate(child, id, layers, out);
  return id;
}

export function buildChildrenIndex(objects: Record<string, SceneObject>, order: string[]): Record<string, string[]> {
  const idx: Record<string, string[]> = { root: [] };
  for (const id of order) {
    const o = objects[id];
    if (!o) continue;
    const key = o.parentId ?? 'root';
    (idx[key] ??= []).push(id);
  }
  return idx;
}

export function subtreeIds(objects: Record<string, SceneObject>, order: string[], id: string): string[] {
  const idx = buildChildrenIndex(objects, order);
  const out: string[] = [];
  const walk = (cur: string) => {
    out.push(cur);
    (idx[cur] ?? []).forEach(walk);
  };
  walk(id);
  return out;
}

export function rootOf(objects: Record<string, SceneObject>, id: string): SceneObject | undefined {
  let cur: SceneObject | undefined = objects[id];
  let guard = 0;
  while (cur?.parentId && guard++ < 64) cur = objects[cur.parentId];
  return cur;
}

export function isDescendant(objects: Record<string, SceneObject>, id: string, ancestorId: string): boolean {
  let cur: SceneObject | undefined = objects[id];
  let guard = 0;
  while (cur && guard++ < 64) {
    if (cur.id === ancestorId) return true;
    cur = cur.parentId ? objects[cur.parentId] : undefined;
  }
  return false;
}

export function uniqueName(base: string, objects: Record<string, SceneObject>): string {
  const names = new Set(Object.values(objects).map((o) => o.name));
  if (!names.has(base)) return base;
  const stem = base.replace(/\s+\d+$/, '');
  let i = 2;
  while (names.has(`${stem} ${i}`)) i++;
  return `${stem} ${i}`;
}

/** Converts an object subtree back into a PartSpec (used by "Save as asset"). Root position is dropped. */
export function toSpec(objects: Record<string, SceneObject>, order: string[], id: string, layers: Layer[], isRoot = true): PartSpec {
  const o = objects[id];
  const idx = buildChildrenIndex(objects, order);
  const layerName = layers.find((l) => l.id === o.layerId)?.id;
  const layer: PartSpec['layer'] = layerName === 'layer_details' ? 'details' : layerName === 'layer_glow' ? 'glow' : 'main';
  return {
    name: o.name,
    kind: o.kind === 'imported' ? 'cube' : o.kind,
    position: isRoot ? undefined : [...o.position],
    rotation: isRoot ? undefined : [...o.rotation],
    scale: [...o.scale],
    material: { ...o.material },
    layer,
    slot: o.slot,
    children: (idx[id] ?? []).map((c) => toSpec(objects, order, c, layers, false)),
  };
}
