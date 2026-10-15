import { describe, expect, it } from 'vitest';
import { FILE_FORMAT_VERSION, parseProjectFileText, stringifyProjectFile } from '../src/utils/projectFile';
import { serializeCurrentProject } from '../src/store/serialize';
import { useClothing } from '../src/store/clothing';
import { useEditor } from '../src/store/editor';
import { DEFAULT_MATERIAL } from '../src/assets/materials';
import type { ProjectData } from '../src/types';

const obj = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, kind: 'cube', parentId: null, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], material: { ...DEFAULT_MATERIAL }, visible: true, locked: false, layerId: 'layer_main', ...extra });
const base = (over: Record<string, unknown> = {}) => ({
  version: 1,
  objects: { a: obj('a'), b: obj('b') },
  order: ['a', 'b'],
  layers: [{ id: 'layer_main', name: 'Main', visible: true, locked: false }],
  textures: [],
  models: {},
  rig: 'R6',
  camera: { position: [1, 2, 3], target: [0, 1, 0] },
  ...over,
});
const file = (data: unknown, over: Record<string, unknown> = {}) => JSON.stringify({ app: 'nexo-ugc-studio', version: 1, name: 'T', data, ...over });

describe('project file: versions', () => {
  it('writes the current format with the app version', () => {
    const f = JSON.parse(stringifyProjectFile('Hat', base() as unknown as ProjectData, '9.9.9'));
    expect(f).toMatchObject({ app: 'nexo-ugc-studio', version: FILE_FORMAT_VERSION, savedWith: '9.9.9', name: 'Hat' });
  });

  it('opens a version 1 file and reports it', () => {
    const r = parseProjectFileText(file(base()));
    expect(r.fromVersion).toBe(1);
    expect(Object.keys(r.data.objects)).toEqual(['a', 'b']);
    expect(r.warnings).toEqual([]);
  });

  it('round-trips a current file without changes', () => {
    const r = parseProjectFileText(stringifyProjectFile('X', base() as unknown as ProjectData));
    expect(r.fromVersion).toBe(FILE_FORMAT_VERSION);
    expect(r.data.order).toEqual(['a', 'b']);
    expect(r.warnings).toEqual([]);
  });

  it('refuses a file from a newer version with a clear message', () => {
    expect(() => parseProjectFileText(file(base(), { version: 99, savedWith: '7.0.0' }))).toThrow(/newer version.*7\.0\.0/);
  });

  it('rejects things that are not project files', () => {
    expect(() => parseProjectFileText('nope')).toThrow(/not valid JSON/);
    expect(() => parseProjectFileText(JSON.stringify({ hello: 1 }))).toThrow(/not a Nexo UGC Studio project/);
    expect(() => parseProjectFileText(file({ order: [] }))).toThrow(/missing its scene data/);
  });
});

describe('project file: repairs', () => {
  it('drops unknown shapes and cleans the order list', () => {
    const r = parseProjectFileText(file(base({ objects: { a: obj('a'), z: obj('z', { kind: 'dragon' }) }, order: ['z', 'a', 'a', 'ghost'] })));
    expect(Object.keys(r.data.objects)).toEqual(['a']);
    expect(r.data.order).toEqual(['a']);
    expect(r.warnings.join(' ')).toMatch(/unknown shape/);
  });

  it('appends parts missing from the order', () => {
    const r = parseProjectFileText(file(base({ order: ['b'] })));
    expect(r.data.order).toEqual(['b', 'a']);
  });

  it('moves parts with a missing parent to the top level', () => {
    const r = parseProjectFileText(file(base({ objects: { a: obj('a', { parentId: 'gone' }), b: obj('b') } })));
    expect(r.data.objects.a.parentId).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/lost its parent/);
  });

  it('breaks parent loops that would hang the editor', () => {
    const r = parseProjectFileText(file(base({ objects: { a: obj('a', { parentId: 'b' }), b: obj('b', { parentId: 'a' }) } })));
    const loops = Object.values(r.data.objects).filter((o) => o.parentId === null);
    expect(loops.length).toBeGreaterThan(0);
    for (const o of Object.values(r.data.objects)) {
      let steps = 0;
      let p = o.parentId ? r.data.objects[o.parentId] : undefined;
      while (p && steps++ < 10) p = p.parentId ? r.data.objects[p.parentId] : undefined;
      expect(steps).toBeLessThan(10);
    }
  });

  it('clears a texture reference whose texture is not in the file', () => {
    const r = parseProjectFileText(file(base({ objects: { a: obj('a', { material: { ...DEFAULT_MATERIAL, textureId: 'missing' } }) }, order: ['a'] })));
    expect(r.data.objects.a.material.textureId).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/texture that is not in the file/);
  });

  it('keeps good textures and drops damaged ones', () => {
    const good = { id: 't1', name: 'ok', dataUrl: 'data:image/png;base64,AAAA', width: 4, height: 4, source: 'upload', createdAt: 1 };
    const bad = { id: 't2', name: 'bad', dataUrl: 'javascript:alert(1)' };
    const r = parseProjectFileText(file(base({ textures: [good, bad] })));
    expect(r.data.textures.map((t) => t.id)).toEqual(['t1']);
  });

  it('drops imported meshes whose data is missing', () => {
    const r = parseProjectFileText(file(base({ objects: { a: obj('a', { kind: 'imported', modelId: 'm' }), b: obj('b') } })));
    expect(Object.keys(r.data.objects)).toEqual(['b']);
  });

  it('adds default layers when none exist and fixes bad layer ids and out-of-range numbers', () => {
    const r = parseProjectFileText(file(base({ layers: [], objects: { a: obj('a', { layerId: 'nope', material: { ...DEFAULT_MATERIAL, opacity: 7, roughness: -3 } }) }, order: ['a'] })));
    expect(r.data.layers.length).toBeGreaterThan(0);
    expect(r.data.layers.some((l) => l.id === r.data.objects.a.layerId)).toBe(true);
    expect(r.data.objects.a.material.opacity).toBe(1);
    expect(r.data.objects.a.material.roughness).toBe(0);
  });

  it('repairs clothing data: damaged images and layers pointing at missing pictures are dropped', () => {
    const clothing = {
      version: 1,
      activeKind: 'wrong',
      images: [{ id: 'i1', name: 'a', dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 }, { id: 'i2', dataUrl: 5 }],
      designs: { shirt: [{ id: 'l1', type: 'image', imageId: 'i1' }, { id: 'l2', type: 'image', imageId: 'gone' }, { id: 'l3', type: 'bogus' }], pants: 'oops' },
    };
    const r = parseProjectFileText(file(base({ clothing })));
    expect(r.data.clothing?.images.map((i) => i.id)).toEqual(['i1']);
    expect(r.data.clothing?.designs.shirt.map((l) => l.id)).toEqual(['l1']);
    expect(r.data.clothing?.designs.pants).toEqual([]);
    expect(r.data.clothing?.activeKind).toBe('shirt');
  });
});

describe('project file: clothing projects keep their designs', () => {
  it('serializeCurrentProject includes the clothing designs on the clothing screen (project download used to drop them)', () => {
    useClothing.getState().load({ version: 1, designs: { shirt: [], pants: [], tshirt: [] }, images: [], activeKind: 'shirt' });
    useClothing.getState().addLayer('paint');
    useEditor.setState({ screen: 'clothing' });
    const data = serializeCurrentProject();
    expect(data.clothing?.designs.shirt).toHaveLength(1);
    const back = parseProjectFileText(stringifyProjectFile('Shirt', data));
    expect(back.data.clothing?.designs.shirt).toHaveLength(1);
    useEditor.setState({ screen: 'editor' });
    expect(serializeCurrentProject().clothing).toBeUndefined();
  });
});

describe('project file: clothing groups and masks', () => {
  const img = { id: 'i1', name: 'a', dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 };
  const clothing = (shirt: unknown[]) => ({ version: 1, activeKind: 'shirt', images: [img], designs: { shirt, pants: [], tshirt: [] } });

  it('keeps groups and valid masks', () => {
    const shirt = [
      { id: 'g', type: 'group', collapsed: false, groupId: undefined },
      { id: 'a', type: 'fill', groupId: 'g', mask: { strokes: [], invert: false, enabled: true } },
    ];
    const r = parseProjectFileText(file(base({ clothing: clothing(shirt) })));
    expect(r.data.clothing!.designs.shirt.map((l) => l.id)).toEqual(['g', 'a']);
    expect(r.data.clothing!.designs.shirt[1].mask).toBeDefined();
    expect(r.warnings).toEqual([]);
  });

  it('repairs orphaned group membership and drops a damaged mask', () => {
    const shirt = [
      { id: 'a', type: 'fill', groupId: 'ghost' },
      { id: 'b', type: 'fill', mask: 'oops' },
    ];
    const r = parseProjectFileText(file(base({ clothing: clothing(shirt) })));
    const [a, b] = r.data.clothing!.designs.shirt;
    expect(a.groupId).toBeUndefined();
    expect(b.mask).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/mask .* damaged/);
  });
});
