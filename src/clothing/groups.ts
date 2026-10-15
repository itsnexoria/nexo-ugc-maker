import type { ClothingLayer, GroupLayer } from '../types';

/**
 * Layer groups ("folders"). The layer list stays flat and ordered bottom to top. A group is a header layer
 * with `type: 'group'`; its members have `groupId` set and sit directly after it:
 *
 *   [ ..., header, memberA, memberB, other, ... ]
 *
 * Groups do not nest. Everything here is a pure function over arrays so it can be tested without the editor.
 */

export const isGroup = (l: ClothingLayer): l is GroupLayer => l.type === 'group';

export function groupIndex(layers: ClothingLayer[]): Map<string, GroupLayer> {
  const m = new Map<string, GroupLayer>();
  for (const l of layers) if (isGroup(l)) m.set(l.id, l);
  return m;
}

export interface Effective {
  /** shown: the layer and its group are both visible */
  visible: boolean;
  /** cannot be edited: the layer or its group is locked */
  locked: boolean;
  /** the layer's opacity times its group's */
  opacity: number;
}

export function effectiveOf(l: ClothingLayer, groups: Map<string, GroupLayer>): Effective {
  const g = l.groupId ? groups.get(l.groupId) : undefined;
  return {
    visible: l.visible && (!g || g.visible),
    locked: l.locked || !!g?.locked,
    opacity: l.opacity * (g ? g.opacity : 1),
  };
}

/** Convenience for one-off checks (builds the group lookup each time). */
export const effective = (layers: ClothingLayer[], l: ClothingLayer): Effective => effectiveOf(l, groupIndex(layers));

export const membersOf = (layers: ClothingLayer[], groupId: string): ClothingLayer[] => layers.filter((l) => l.groupId === groupId);

/** Layers whose group is collapsed in the list (so the list can skip them). */
export function hiddenInList(layers: ClothingLayer[]): Set<string> {
  const groups = groupIndex(layers);
  const hidden = new Set<string>();
  for (const l of layers) if (l.groupId && groups.get(l.groupId)?.collapsed) hidden.add(l.id);
  return hidden;
}

/**
 * Repairs the invariants after any edit: a member needs a header that comes before it, and members sit right
 * after their header. Returns the same array when nothing needed fixing.
 */
export function normalizeGroups(layers: ClothingLayer[]): ClothingLayer[] {
  if (!layers.some((l) => isGroup(l) || l.groupId)) return layers;
  const headerAt = new Map<string, number>();
  layers.forEach((l, i) => isGroup(l) && headerAt.set(l.id, i));
  let changed = false;
  const fixed = layers.map((l, i) => {
    if (isGroup(l) && l.groupId) {
      changed = true;
      const { groupId: _x, ...rest } = l;
      return rest as ClothingLayer;
    }
    if (l.groupId && !(headerAt.has(l.groupId) && (headerAt.get(l.groupId) as number) < i)) {
      changed = true;
      const { groupId: _x, ...rest } = l;
      return rest as ClothingLayer;
    }
    return l;
  });
  // members directly after their header, keeping their relative order
  const byGroup = new Map<string, ClothingLayer[]>();
  for (const l of fixed) if (l.groupId) (byGroup.get(l.groupId) ?? byGroup.set(l.groupId, []).get(l.groupId)!).push(l);
  const out: ClothingLayer[] = [];
  for (const l of fixed) {
    if (l.groupId) continue;
    out.push(l);
    if (isGroup(l)) out.push(...(byGroup.get(l.id) ?? []));
  }
  if (!changed && out.length === fixed.length && out.every((l, i) => l === fixed[i])) return layers;
  return out;
}

let counter = 0;
const newGroupId = () => `grp_${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * Puts the chosen layers (bottom to top) in a new group placed where the lowest of them was.
 * Layers that were in another group leave it. Group headers in `ids` are ignored.
 */
export function groupLayers(layers: ClothingLayer[], ids: string[], name = 'Group'): { layers: ClothingLayer[]; groupId: string } | null {
  const chosen = layers.filter((l) => ids.includes(l.id) && !isGroup(l));
  if (!chosen.length) return null;
  const groupId = newGroupId();
  const header: GroupLayer = { id: groupId, name, type: 'group', visible: true, locked: false, opacity: 1, blend: 'normal', clip: 'all', collapsed: false };
  const chosenIds = new Set(chosen.map((c) => c.id));
  const firstIndex = layers.findIndex((l) => chosenIds.has(l.id));
  const rest = layers.filter((l) => !chosenIds.has(l.id));
  // insert where the first chosen layer was, counted among the layers that stay
  const at = layers.slice(0, firstIndex).filter((l) => !chosenIds.has(l.id)).length;
  const members = chosen.map((l) => ({ ...l, groupId }) as ClothingLayer);
  const out = [...rest.slice(0, at), header, ...members, ...rest.slice(at)];
  return { layers: normalizeGroups(out), groupId };
}

/** Removes the group header and keeps its layers where they are. */
export function ungroup(layers: ClothingLayer[], groupId: string): ClothingLayer[] {
  return layers.filter((l) => l.id !== groupId).map((l) => (l.groupId === groupId ? ((({ groupId: _x, ...rest }) => rest)(l) as ClothingLayer) : l));
}

/** Ids to delete when deleting `ids`: a deleted group takes its layers with it. */
export function withMembers(layers: ClothingLayer[], ids: string[]): Set<string> {
  const out = new Set(ids);
  for (const l of layers) if (l.groupId && out.has(l.groupId)) out.add(l.id);
  return out;
}

/**
 * Moves one layer so it ends up at `toIndex` of the list without it (the same meaning the layer panel uses).
 * A group moves together with its layers. A layer dropped between the members of a group (or right after its
 * header) joins that group; dropped anywhere else it is outside every group.
 */
export function reorderLayers(layers: ClothingLayer[], id: string, toIndex: number): ClothingLayer[] {
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return layers;
  const moving = layers[i];

  if (isGroup(moving)) {
    const block = layers.filter((l) => l.id === moving.id || l.groupId === moving.id);
    const blockIds = new Set(block.map((b) => b.id));
    const orig = toIndex >= i ? toIndex + 1 : toIndex; // insert before the layer now at `orig`
    let anchor: ClothingLayer | undefined = layers[Math.max(0, Math.min(layers.length, orig))];
    if (anchor && blockIds.has(anchor.id)) return layers;
    // never drop a whole group into the middle of another group
    if (anchor?.groupId) anchor = layers.find((l) => l.id === anchor!.groupId) ?? anchor;
    const rest = layers.filter((l) => !blockIds.has(l.id));
    const at = anchor ? rest.findIndex((l) => l.id === anchor!.id) : rest.length;
    return normalizeGroups([...rest.slice(0, at), ...block, ...rest.slice(at)]);
  }

  const rest = layers.filter((l) => l.id !== id);
  const at = Math.max(0, Math.min(rest.length, toIndex));
  const prev = rest[at - 1];
  const next = rest[at];
  let gid: string | undefined;
  if (prev) {
    const prevGroup = isGroup(prev) ? prev.id : prev.groupId;
    // inside a block: right after its header, or between two of its members
    if (prevGroup && (isGroup(prev) || next?.groupId === prevGroup)) gid = prevGroup;
  }
  const placed = gid ? ({ ...moving, groupId: gid } as ClothingLayer) : (({ groupId: _x, ...rest2 }) => rest2 as ClothingLayer)(moving);
  return normalizeGroups([...rest.slice(0, at), placed, ...rest.slice(at)]);
}
