import { beforeEach, describe, expect, it } from 'vitest';
import { effective, groupLayers, hiddenInList, membersOf, normalizeGroups, reorderLayers, ungroup, withMembers } from '../src/clothing/groups';
import { checkLayers } from '../src/clothing/validation';
import { useClothing } from '../src/store/clothing';
import { makeLayer } from '../src/clothing/layers';
import type { ClothingLayer } from '../src/types';

const L = (id: string, extra: Partial<ClothingLayer> = {}): ClothingLayer => ({ ...makeLayer('shirt', 'shape'), id, name: id, ...extra }) as ClothingLayer;
const ids = (layers: ClothingLayer[]) => layers.map((l) => l.id);
const shape = (layers: ClothingLayer[]) => layers.map((l) => (l.type === 'group' ? `[${l.id}]` : l.groupId ? `${l.groupId}>${l.id}` : l.id));

describe('groupLayers / ungroup', () => {
  const base = ['a', 'b', 'c', 'd'].map((i) => L(i));

  it('groups the chosen layers where the lowest was, in their order', () => {
    const r = groupLayers(base, ['c', 'b'])!;
    const gid = r.groupId;
    expect(shape(r.layers)).toEqual(['a', `[${gid}]`, `${gid}>b`, `${gid}>c`, 'd']);
  });

  it('a non-adjacent selection is pulled together', () => {
    const r = groupLayers(base, ['a', 'c'])!;
    const gid = r.groupId;
    expect(shape(r.layers)).toEqual([`[${gid}]`, `${gid}>a`, `${gid}>c`, 'b', 'd']);
  });

  it('ignores group headers and returns null when nothing can be grouped', () => {
    const r = groupLayers(base, ['a'])!;
    expect(groupLayers(r.layers, [r.groupId])).toBeNull();
    expect(groupLayers(base, [])).toBeNull();
  });

  it('a layer moved to a new group leaves its old group', () => {
    const one = groupLayers(base, ['a', 'b'])!;
    const two = groupLayers(one.layers, ['b'])!;
    expect(membersOf(two.layers, one.groupId).map((l) => l.id)).toEqual(['a']);
    expect(membersOf(two.layers, two.groupId).map((l) => l.id)).toEqual(['b']);
  });

  it('ungroup keeps the layers in place and removes the header', () => {
    const r = groupLayers(base, ['b', 'c'])!;
    const u = ungroup(r.layers, r.groupId);
    expect(shape(u)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('effective state', () => {
  it('a hidden or locked group hides or locks its layers, and opacity multiplies', () => {
    const r = groupLayers(['a', 'b'].map((i) => L(i, { opacity: 0.5 })), ['a'])!;
    const g = r.layers.find((l) => l.type === 'group')!;
    const a = r.layers.find((l) => l.id === 'a')!;
    expect(effective(r.layers, a)).toEqual({ visible: true, locked: false, opacity: 0.5 });
    const dim = r.layers.map((l) => (l.id === g.id ? { ...l, opacity: 0.5 } : l)) as ClothingLayer[];
    expect(effective(dim, a).opacity).toBeCloseTo(0.25);
    const off = r.layers.map((l) => (l.id === g.id ? { ...l, visible: false, locked: true } : l)) as ClothingLayer[];
    expect(effective(off, a)).toMatchObject({ visible: false, locked: true });
    expect(effective(off, off.find((l) => l.id === 'b')!).visible).toBe(true); // not in the group
  });

  it('layers in a hidden group do not count as visible for export checks', () => {
    const r = groupLayers([L('a')], ['a'])!;
    const off = r.layers.map((l) => (l.type === 'group' ? { ...l, visible: false } : l)) as ClothingLayer[];
    expect(checkLayers('shirt', off, []).some((c) => c.id === 'empty')).toBe(true);
    expect(checkLayers('shirt', r.layers, []).some((c) => c.id === 'empty')).toBe(false);
  });

  it('collapsed groups hide their members only in the list', () => {
    const r = groupLayers(['a', 'b', 'c'].map((i) => L(i)), ['a', 'b'])!;
    const collapsed = r.layers.map((l) => (l.type === 'group' ? { ...l, collapsed: true } : l)) as ClothingLayer[];
    expect([...hiddenInList(collapsed)].sort()).toEqual(['a', 'b']);
    expect(effective(collapsed, collapsed.find((l) => l.id === 'a')!).visible).toBe(true);
  });
});

describe('normalizeGroups', () => {
  it('returns the same array when there are no groups', () => {
    const plain = [L('a'), L('b')];
    expect(normalizeGroups(plain)).toBe(plain);
  });

  it('drops membership without a header and pulls members next to their header', () => {
    const r = groupLayers(['a', 'b', 'c'].map((i) => L(i)), ['a'])!;
    const gid = r.groupId;
    const broken = [L('x', { groupId: 'ghost' }), ...r.layers.slice(0, 1), L('z'), r.layers[1]] as ClothingLayer[];
    const fixed = normalizeGroups(broken);
    expect(fixed.find((l) => l.id === 'x')!.groupId).toBeUndefined();
    const si = shape(fixed);
    expect(si.indexOf(`${gid}>a`)).toBe(si.indexOf(`[${gid}]`) + 1);
  });

  it('a member that comes before its header is released', () => {
    const header = groupLayers([L('h')], ['h'])!;
    const gid = header.groupId;
    const out = normalizeGroups([L('early', { groupId: gid }), header.layers[0]]);
    expect(out.find((l) => l.id === 'early')!.groupId).toBeUndefined();
  });

  it('groups never nest', () => {
    const r = groupLayers([L('a')], ['a'])!;
    const nested = r.layers.map((l) => (l.type === 'group' ? { ...l, groupId: 'other' } : l)) as ClothingLayer[];
    expect(nested.find((l) => l.type === 'group')!.groupId).toBe('other');
    expect(normalizeGroups(nested).find((l) => l.type === 'group')!.groupId).toBeUndefined();
  });
});

describe('reorderLayers', () => {
  const setup = () => {
    const r = groupLayers(['a', 'b', 'c', 'd', 'e'].map((i) => L(i)), ['b', 'c'])!;
    return { layers: r.layers, gid: r.groupId };
  };

  it('dropping between two members joins the group', () => {
    const { layers, gid } = setup(); // a, [g], b, c, d, e
    const out = reorderLayers(layers, 'e', 3); // rest = a,g,b,c,d ; index 3 = between b and c
    expect(shape(out)).toEqual(['a', `[${gid}]`, `${gid}>b`, `${gid}>e`, `${gid}>c`, 'd']);
  });

  it('dropping right after the header joins the group', () => {
    const { layers, gid } = setup();
    const out = reorderLayers(layers, 'e', 2);
    expect(shape(out)).toEqual(['a', `[${gid}]`, `${gid}>e`, `${gid}>b`, `${gid}>c`, 'd']);
  });

  it('dropping after the last member leaves the group', () => {
    const { layers, gid } = setup();
    const out = reorderLayers(layers, 'b', 3); // rest = a,g,c,d,e ; index 3 -> after c? (c is last member)
    expect(shape(out)).toEqual(['a', `[${gid}]`, `${gid}>c`, 'b', 'd', 'e']);
  });

  it('a member dragged far away becomes a plain layer', () => {
    const { layers, gid } = setup();
    const out = reorderLayers(layers, 'b', 5);
    expect(shape(out)).toEqual(['a', `[${gid}]`, `${gid}>c`, 'd', 'e', 'b']);
  });

  it('moving a group moves all of its layers with it', () => {
    const { layers, gid } = setup(); // a,[g],b,c,d,e
    // the position counts the list without the header alone (a,b,c,d,e): 5 is the very end, 4 is before 'e'
    const end = reorderLayers(layers, gid, 5);
    expect(shape(end).slice(-3)).toEqual([`[${gid}]`, `${gid}>b`, `${gid}>c`]);
    expect(end).toHaveLength(layers.length);
    expect(shape(reorderLayers(layers, gid, 4))).toEqual(['a', 'd', `[${gid}]`, `${gid}>b`, `${gid}>c`, 'e']);
  });

  it('a group dropped near another group never lands inside it', () => {
    const one = groupLayers(['a', 'b', 'c', 'd'].map((i) => L(i)), ['a', 'b'])!;
    const two = groupLayers(one.layers.filter((l) => l.id !== one.groupId && l.groupId !== one.groupId).length ? one.layers : one.layers, ['c'])!;
    const out = reorderLayers(two.layers, two.groupId, 2);
    // every member still directly follows its header
    for (const l of out) if (l.groupId) expect(out[out.findIndex((x) => x.id === l.groupId)]).toBeDefined();
    expect(normalizeGroups(out)).toBe(out);
  });

  it('is a no-op for an unknown id or dropping a group onto itself', () => {
    const { layers, gid } = setup();
    expect(reorderLayers(layers, 'nope', 0)).toBe(layers);
    expect(reorderLayers(layers, gid, 1)).toBe(layers);
  });
});

describe('withMembers', () => {
  it('deleting a group takes its layers along', () => {
    const r = groupLayers(['a', 'b', 'c'].map((i) => L(i)), ['a', 'b'])!;
    expect([...withMembers(r.layers, [r.groupId])].sort()).toEqual(['a', 'b', r.groupId].sort());
    expect([...withMembers(r.layers, ['a'])]).toEqual(['a']);
  });
});

describe('store: groups', () => {
  beforeEach(() => useClothing.getState().load({ version: 1, designs: { shirt: [], pants: [], tshirt: [] }, images: [], activeKind: 'shirt' }));
  const layers = () => useClothing.getState().designs.shirt;

  it('group selected, hide group, ungroup, all undoable', () => {
    const c = useClothing.getState();
    const a = c.addLayer('shape');
    const b = c.addLayer('shape');
    c.selectMany([a, b]);
    const gid = c.groupSelected()!;
    expect(shape(layers())).toEqual([`[${gid}]`, `${gid}>${a}`, `${gid}>${b}`]);
    expect(useClothing.getState().selectedId).toBe(gid);
    c.updateLayer(gid, { visible: false });
    expect(effective(layers(), layers().find((l) => l.id === a)!).visible).toBe(false);
    c.ungroupLayer(gid);
    expect(layers().map((l) => l.id)).toEqual([a, b]);
    expect(useClothing.getState().selectedIds).toEqual([a, b]);
    c.undo();
    expect(layers().some((l) => l.type === 'group')).toBe(true);
  });

  it('deleting a group deletes its layers; undo brings them all back', () => {
    const c = useClothing.getState();
    const a = c.addLayer('shape');
    const b = c.addLayer('shape');
    c.selectMany([a]);
    const gid = c.groupSelected()!;
    c.removeLayer(gid);
    expect(layers().map((l) => l.id)).toEqual([b]);
    c.undo();
    expect(layers()).toHaveLength(3);
  });

  it('duplicating a group duplicates its layers into a new group', () => {
    const c = useClothing.getState();
    const a = c.addLayer('shape');
    c.selectMany([a]);
    const gid = c.groupSelected()!;
    const copy = c.duplicateLayer(gid)!;
    expect(layers()).toHaveLength(4);
    const members = layers().filter((l) => l.groupId === copy);
    expect(members).toHaveLength(1);
    expect(members[0].id).not.toBe(a);
    expect(layers().filter((l) => l.groupId === gid)).toHaveLength(1);
  });

  it('nudging skips layers whose group is locked', () => {
    const c = useClothing.getState();
    const a = c.addLayer('shape');
    c.selectMany([a]);
    const gid = c.groupSelected()!;
    c.updateLayer(gid, { locked: true });
    c.selectMany([a]);
    const x0 = (layers().find((l) => l.id === a) as { x: number }).x;
    c.nudgeSelected(5, 0);
    expect((layers().find((l) => l.id === a) as { x: number }).x).toBe(x0);
  });

  it('copying layers to another template drops folders but keeps the layers', () => {
    const c = useClothing.getState();
    const a = c.addLayer('shape');
    c.selectMany([a]);
    const gid = c.groupSelected()!;
    expect(c.copyLayersToKind([gid], 'pants')).toBe(1);
    const copied = useClothing.getState().designs.pants;
    expect(copied).toHaveLength(1);
    expect(copied[0].groupId).toBeUndefined();
  });

  it('moving a group up and down keeps its layers attached', () => {
    const c = useClothing.getState();
    const top = c.addLayer('shape');
    const a = c.addLayer('shape');
    c.selectMany([a]);
    const gid = c.groupSelected()!;
    // [top, g, a] -> move the group up (towards the end of the list)
    c.moveLayer(gid, 1);
    const s = shape(layers());
    expect(s.indexOf(`${gid}>${a}`)).toBe(s.indexOf(`[${gid}]`) + 1);
    expect(layers()).toHaveLength(3);
    void top;
  });
});
