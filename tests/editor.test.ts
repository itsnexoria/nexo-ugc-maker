import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from '../src/store/editor';
import { buildProject } from '../src/assets/sample';
import { ASSETS } from '../src/assets/presets';
import * as projects from '../src/store/projects';

function fresh(template: 'blank' | 'cyber-crown' | 'hat' = 'blank') {
  const data = buildProject(template);
  useEditor.getState().loadProject({ id: 'p1', name: 'Test', createdAt: 1 }, data);
}

describe('editor store', () => {
  beforeEach(() => fresh('blank'));

  it('adds a primitive inside a new accessory group', () => {
    const id = useEditor.getState().addPrimitive('cube');
    const s = useEditor.getState();
    expect(s.objects[id].kind).toBe('cube');
    const parent = s.objects[s.objects[id].parentId!];
    expect(parent.kind).toBe('group');
    expect(s.selectedId).toBe(id);
  });

  it('undo/redo move', () => {
    const id = useEditor.getState().addPrimitive('sphere');
    const before = [...useEditor.getState().objects[id].position];
    useEditor.getState().setTransform(id, { position: [3, 4, 5] }, 'k');
    expect(useEditor.getState().objects[id].position).toEqual([3, 4, 5]);
    useEditor.getState().undo();
    expect(useEditor.getState().objects[id].position).toEqual(before);
    useEditor.getState().redo();
    expect(useEditor.getState().objects[id].position).toEqual([3, 4, 5]);
  });

  it('merges continuous edits with the same key into one undo step', () => {
    const id = useEditor.getState().addPrimitive('cube');
    const base = useEditor.getState().past.length;
    for (let i = 1; i <= 5; i++) useEditor.getState().setTransform(id, { position: [i, 0, 0] }, 'drag');
    expect(useEditor.getState().past.length).toBe(base + 1);
    useEditor.getState().undo();
    expect(useEditor.getState().objects[id].position).toEqual([0, 0.6, 0]);
  });

  it('undo color change and delete', () => {
    const id = useEditor.getState().addPrimitive('cube');
    const original = useEditor.getState().objects[id].material.color;
    useEditor.getState().setMaterial(id, { color: '#ff0000' });
    expect(useEditor.getState().objects[id].material.color).toBe('#ff0000');
    useEditor.getState().undo();
    expect(useEditor.getState().objects[id].material.color).toBe(original);
    useEditor.getState().removeObject(id);
    expect(useEditor.getState().objects[id]).toBeUndefined();
    useEditor.getState().undo();
    expect(useEditor.getState().objects[id]).toBeDefined();
  });

  it('duplicates a group with children and fresh ids', () => {
    const horns = ASSETS.find((a) => a.id === 'hat-horns')!;
    const rootId = useEditor.getState().addAccessory(horns.build(), 'hat');
    const before = Object.keys(useEditor.getState().objects).length;
    const copy = useEditor.getState().duplicateObject(rootId)!;
    const s = useEditor.getState();
    expect(Object.keys(s.objects).length).toBe(before * 2);
    expect(s.childrenIndex[copy].length).toBe(s.childrenIndex[rootId].length);
    expect(s.objects[copy].name).not.toBe(s.objects[rootId].name);
  });

  it('reparenting keeps the world position', () => {
    const horns = ASSETS.find((a) => a.id === 'hat-horns')!;
    const rootId = useEditor.getState().addAccessory(horns.build(), 'hat');
    const cubeId = useEditor.getState().addPrimitive('cube');
    useEditor.getState().reparent(cubeId, null);
    const s = useEditor.getState();
    expect(s.objects[cubeId].parentId).toBeNull();
    // cube was at local (0,0.6,0) under the hat anchor (0,5.2,0) -> world y 5.8
    expect(s.objects[cubeId].position[1]).toBeCloseTo(5.8, 2);
    expect(rootId).toBeTruthy();
  });

  it('refuses to parent an object under its own descendant', () => {
    const horns = ASSETS.find((a) => a.id === 'hat-horns')!;
    const rootId = useEditor.getState().addAccessory(horns.build(), 'hat');
    const child = useEditor.getState().childrenIndex[rootId][0];
    useEditor.getState().reparent(rootId, child);
    expect(useEditor.getState().objects[rootId].parentId).toBeNull();
  });

  it('switching rig shifts slotted accessories and is undoable', () => {
    const hat = ASSETS.find((a) => a.id === 'hat-basic')!;
    const id = useEditor.getState().addAccessory(hat.build(), 'hat');
    const y6 = useEditor.getState().objects[id].position[1];
    useEditor.getState().setRig('R15');
    expect(useEditor.getState().objects[id].position[1]).toBeCloseTo(y6 + 0.2, 3);
    useEditor.getState().undo();
    expect(useEditor.getState().objects[id].position[1]).toBeCloseTo(y6, 3);
  });

  it('all presets generate real geometry', () => {
    for (const a of ASSETS) {
      const id = useEditor.getState().addAccessory(a.build(), a.slot);
      const kids = useEditor.getState().childrenIndex[id] ?? [];
      expect(kids.length, a.name).toBeGreaterThan(0);
    }
  });
});

describe('projects', () => {
  it('serialises and restores a project', () => {
    fresh('cyber-crown');
    const s = useEditor.getState();
    const data = s.serialize();
    expect(Object.keys(data.objects).length).toBeGreaterThan(10);
    const file = projects.toProjectFile('X', data);
    const parsed = projects.parseProjectFile(file);
    expect(Object.keys(parsed.data.objects).length).toBe(Object.keys(data.objects).length);
  });

  it('saves, lists, duplicates, renames and deletes', async () => {
    const { meta } = await projects.createProject('Alpha', 'hat');
    expect((await projects.listProjects()).some((p) => p.id === meta.id)).toBe(true);
    const copy = await projects.duplicateProject(meta.id);
    expect(copy?.name).toBe('Alpha copy');
    await projects.renameProject(meta.id, 'Beta');
    expect((await projects.loadProject(meta.id))?.meta.name).toBe('Beta');
    await projects.deleteProject(meta.id);
    expect(await projects.loadProject(meta.id)).toBeNull();
  });

  it('rejects invalid project files', () => {
    expect(() => projects.parseProjectFile('nope')).toThrow();
    expect(() => projects.parseProjectFile('{"app":"other"}')).toThrow();
  });
});
