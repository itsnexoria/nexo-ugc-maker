import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildProject } from '../src/assets/sample';
import { applyReduction, autoFitBudget, booleanObjects, geometryInSpaceOf, mirrorObject, ownGeometry, previewReduction } from '../src/editor/modifiers';
import { useEditor } from '../src/store/editor';
import { geometryToModelAsset, triangleCount } from '../src/utils/geometry';
import { signedVolume } from '../src/utils/meshOps';

const S = () => useEditor.getState();
const parts = () => Object.values(S().objects).filter((o) => o.kind !== 'group');

function fresh() {
  S().loadProject({ id: 'p', name: 'T', createdAt: 1 }, buildProject('blank'));
}

/** a cube of the given size and position under the accessory root */
function addCube(x: number, size = 1): string {
  const id = S().addPrimitive('cube');
  S().setTransform(id, { position: [x, 1, 0], scale: [size, size, size] });
  return id;
}

const bboxOf = (id: string) => {
  const o = S().objects[id];
  const g = geometryInSpaceOf(o, S().objects, S().models, o.parentId)!;
  g.computeBoundingBox();
  return g.boundingBox!;
};

describe('mirrorObject', () => {
  beforeEach(fresh);

  it('adds a mirrored copy across the centre line and keeps the original', () => {
    const id = addCube(1.5);
    const n = parts().length;
    const copy = mirrorObject(id)!;
    expect(parts()).toHaveLength(n + 1);
    expect(S().objects[id].visible).toBe(true);
    const a = bboxOf(id);
    const b = bboxOf(copy);
    expect(b.min.x).toBeCloseTo(-a.max.x);
    expect(b.max.x).toBeCloseTo(-a.min.x);
    expect(b.min.y).toBeCloseTo(a.min.y);
    expect(S().objects[copy].name).toContain('mirrored');
    expect(signedVolume(ownGeometry(S().objects[copy], S().models)!)).toBeGreaterThan(0);
  });

  it('is one undo step and selects the copy', () => {
    const id = addCube(1);
    const before = parts().length;
    const copy = mirrorObject(id)!;
    expect(S().selectedId).toBe(copy);
    S().undo();
    expect(parts()).toHaveLength(before);
  });

  it('mirrors a whole group into a new group', () => {
    const a = addCube(1);
    const b = addCube(2);
    const root = S().objects[a].parentId!;
    const groupBefore = Object.values(S().objects).filter((o) => o.kind === 'group').length;
    const mirrored = mirrorObject(root)!;
    const groups = Object.values(S().objects).filter((o) => o.kind === 'group');
    expect(groups).toHaveLength(groupBefore + 1);
    expect(S().objects[mirrored].kind).toBe('group');
    const kids = parts().filter((o) => o.parentId === mirrored);
    expect(kids.length).toBeGreaterThanOrEqual(2);
    void b;
  });

  it('returns null for an unknown part', () => {
    expect(mirrorObject('nope')).toBeNull();
  });
});

describe('booleanObjects', () => {
  beforeEach(fresh);

  it('cuts one part out of another, hides both originals and can be undone', () => {
    const a = addCube(0, 2);
    const b = addCube(1, 2);
    const result = booleanObjects(a, b, 'subtract')!;
    expect(result).toBeTruthy();
    expect(S().objects[a].visible).toBe(false);
    expect(S().objects[b].visible).toBe(false);
    const g = ownGeometry(S().objects[result], S().models)!;
    expect(signedVolume(g)).toBeCloseTo(8 / 2, 0); // two 2-stud cubes overlapping by half: 8 - 4
    S().undo();
    expect(S().objects[a].visible).toBe(true);
    expect(S().objects[result]).toBeUndefined();
  });

  it('join and keep-overlap give the expected volumes', () => {
    const a = addCube(0, 2);
    const b = addCube(1, 2);
    const u = booleanObjects(a, b, 'union')!;
    expect(signedVolume(ownGeometry(S().objects[u], S().models)!)).toBeCloseTo(12, 0);
    const i = booleanObjects(a, b, 'intersect')!;
    expect(signedVolume(ownGeometry(S().objects[i], S().models)!)).toBeCloseTo(4, 0);
  });

  it('keep-overlap of parts that do not touch explains itself instead of making an empty part', () => {
    const a = addCube(0);
    const b = addCube(10);
    const n = parts().length;
    expect(booleanObjects(a, b, 'intersect')).toBeNull();
    expect(parts()).toHaveLength(n);
  });

  it('refuses groups', () => {
    const a = addCube(0);
    expect(booleanObjects(a, S().objects[a].parentId!, 'union')).toBeNull();
  });
});

describe('reducing triangles', () => {
  beforeEach(fresh);

  function addSphereMesh(): string {
    const g = new THREE.SphereGeometry(1, 48, 24);
    return S().addImported(geometryToModelAsset('m_heavy', 'Heavy', g), 'Heavy');
  }

  it('previews without changing the project, then applies as one undo step', async () => {
    const id = addSphereMesh();
    const modelBefore = S().objects[id].modelId;
    const r = (await previewReduction(id, 500))!;
    expect(r.after).toBeLessThan(r.before / 2);
    expect(S().objects[id].modelId).toBe(modelBefore); // nothing changed yet
    expect(applyReduction(id, r.geometry)).toBe(true);
    expect(S().objects[id].modelId).not.toBe(modelBefore);
    expect(triangleCount(ownGeometry(S().objects[id], S().models)!)).toBe(r.after);
    S().undo();
    expect(S().objects[id].modelId).toBe(modelBefore);
  });

  it('a primitive becomes a reduced mesh and keeps its transform', async () => {
    const id = S().addPrimitive('sphere');
    S().setTransform(id, { position: [0.5, 1, 0], scale: [2, 2, 2] });
    const r = (await previewReduction(id, 60))!;
    applyReduction(id, r.geometry);
    const o = S().objects[id];
    expect(o.kind).toBe('imported');
    expect(o.position).toEqual([0.5, 1, 0]);
    expect(o.scale).toEqual([2, 2, 2]);
  });

  it('hand-painted parts are refused', () => {
    const id = S().addPrimitive('cube');
    S().updateObject(id, { paint: { res: 256, strokes: [] } } as never);
    expect(S().setObjectMesh(id, new THREE.BoxGeometry(), 'x')).toBe(false);
  });

  it('autoFitBudget brings the total under the limit, shrinking the heaviest parts first', async () => {
    const heavy = addSphereMesh();
    const light = S().addPrimitive('cube');
    const total = () => parts().filter((o) => o.visible).reduce((n, o) => n + triangleCount(ownGeometry(o, S().models)!), 0);
    const before = total();
    expect(before).toBeGreaterThan(2000);
    const r = await autoFitBudget(1500);
    expect(r.before).toBe(before);
    expect(r.after).toBeLessThanOrEqual(1700);
    expect(r.changed).toBeGreaterThan(0);
    expect(triangleCount(ownGeometry(S().objects[light], S().models)!)).toBe(12); // a small part is left alone
    expect(triangleCount(ownGeometry(S().objects[heavy], S().models)!)).toBeLessThan(2000);
  });

  it('autoFitBudget does nothing when already within the limit', async () => {
    addCube(0);
    const r = await autoFitBudget(4000);
    expect(r.changed).toBe(0);
  });
});
