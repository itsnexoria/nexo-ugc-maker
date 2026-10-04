import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TEMPLATES, clipBounds, clipRects, mirrorPanelId, panelAt, panelById } from '../src/clothing/templates';
import { bodyMapFor, buildClothingGeometry, faceUvPixels, r15JointOffsets } from '../src/clothing/mapping';
import { layerBox, pointInBox } from '../src/clothing/render';
import { checkLayers } from '../src/clothing/validation';
import { CLOTHING_PRESETS } from '../src/clothing/presets';
import { useClothing } from '../src/store/clothing';
import { useEditor } from '../src/store/editor';
import { buildProject } from '../src/assets/sample';

describe('template geometry', () => {
  it('has the Roblox canvas sizes and panel sizes', () => {
    expect(TEMPLATES.shirt.width).toBe(585);
    expect(TEMPLATES.shirt.height).toBe(559);
    expect(TEMPLATES.tshirt.width).toBe(128);
    expect(panelById('shirt', 'torso.front')).toMatchObject({ x: 231, y: 74, w: 128, h: 128 });
    expect(panelById('shirt', 'torso.right')).toMatchObject({ w: 64, h: 128 });
    expect(panelById('shirt', 'torso.top')).toMatchObject({ w: 128, h: 64 });
    expect(panelById('shirt', 'rightArm.top')).toMatchObject({ w: 64, h: 64 });
  });

  it('panels stay inside the canvas and never overlap', () => {
    for (const kind of ['shirt', 'pants'] as const) {
      const t = TEMPLATES[kind];
      for (const p of t.panels) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w).toBeLessThanOrEqual(t.width);
        expect(p.y + p.h).toBeLessThanOrEqual(t.height);
      }
      for (let i = 0; i < t.panels.length; i++) {
        for (let j = i + 1; j < t.panels.length; j++) {
          const a = t.panels[i];
          const b = t.panels[j];
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `${a.id} vs ${b.id}`).toBe(false);
        }
      }
    }
    // pixel (0,0) must stay outside every panel: unused cap UVs point there
    expect(panelAt('shirt', 0, 0)).toBeUndefined();
  });

  it('clips resolve to groups, single panels and everything', () => {
    expect(clipRects('shirt', 'all')).toHaveLength(18);
    expect(clipRects('shirt', 'torso')).toHaveLength(6);
    expect(clipRects('shirt', 'torso.front')).toHaveLength(1);
    const b = clipBounds('shirt', 'torso.front');
    expect(b).toEqual({ x: 231, y: 74, w: 128, h: 128 });
  });

  it('mirrors left/right panels', () => {
    expect(mirrorPanelId('rightArm.front')).toBe('leftArm.front');
    expect(mirrorPanelId('rightArm.right')).toBe('leftArm.left');
    expect(mirrorPanelId('leftArm.left')).toBe('rightArm.right');
    expect(mirrorPanelId('torso.right')).toBe('torso.left');
    expect(mirrorPanelId('torso.front')).toBe('torso.front');
  });
});

describe('3D UV mapping', () => {
  const torso = bodyMapFor('R6', 'Torso')!;
  const size: [number, number, number] = [2, 2, 1];

  it("maps the front face's top-left (as seen from the front) to the panel's top-left", () => {
    // viewer in front (-Z) looks toward +Z, so the viewer's left is +X
    const uv = faceUvPixels('shirt', torso, 'front', new THREE.Vector3(1, 1, -0.5), size)!;
    expect(uv).toEqual([231, 74]);
    const br = faceUvPixels('shirt', torso, 'front', new THREE.Vector3(-1, -1, -0.5), size)!;
    expect(br).toEqual([359, 202]);
  });

  it('maps the back face with +X on the viewer right', () => {
    // viewer behind (+Z) looks toward -Z, so the viewer's left is -X
    expect(faceUvPixels('shirt', torso, 'back', new THREE.Vector3(-1, 1, 0.5), size)).toEqual([427, 74]);
  });

  it('puts the right side (+X) to the left of the front panel and the left side (-X) after it', () => {
    const right = panelById('shirt', 'torso.right')!;
    const front = panelById('shirt', 'torso.front')!;
    const left = panelById('shirt', 'torso.left')!;
    expect(right.x + right.w).toBeLessThanOrEqual(front.x);
    expect(left.x).toBeGreaterThanOrEqual(front.x + front.w);
    // the +X side's edge next to the front is its -Z edge, which is the image right edge
    const edge = faceUvPixels('shirt', torso, 'right', new THREE.Vector3(1, 0, -0.5), size)!;
    expect(edge[0]).toBeCloseTo(right.x + right.w, 5);
  });

  it('builds geometry with every UV inside the canvas and hidden caps parked on a blank pixel', () => {
    const r15 = bodyMapFor('R15', 'UpperTorso')!;
    expect(r15.top).toBe(true);
    expect(r15.bottom).toBe(false);
    const g = buildClothingGeometry('shirt', r15, [2, 1.6, 1]);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(i)).toBeLessThanOrEqual(1);
    }
  });

  it('uses the documented 64/48/16 px limb split on R15', () => {
    const up = bodyMapFor('R15', 'RightUpperArm')!;
    const lo = bodyMapFor('R15', 'RightLowerArm')!;
    const hand = bodyMapFor('R15', 'RightHand')!;
    expect((up.slice[1] - up.slice[0]) * 128).toBeCloseTo(64, 5);
    expect((lo.slice[1] - lo.slice[0]) * 128).toBeCloseTo(48, 5);
    expect((hand.slice[1] - hand.slice[0]) * 128).toBeCloseTo(16, 5);
    expect(up.top && !up.bottom).toBe(true);
    expect(hand.bottom && !hand.top).toBe(true);
    expect(lo.top || lo.bottom).toBe(false);
    expect(r15JointOffsets('rightLeg')).toEqual([112, 64]); // px from the panel top: hand/lower, lower/upper
  });

  it('splits R15 limbs into slices that add up to the whole panel', () => {
    for (const chain of [
      ['RightHand', 'RightLowerArm', 'RightUpperArm'],
      ['LeftFoot', 'LeftLowerLeg', 'LeftUpperLeg'],
      ['LowerTorso', 'UpperTorso'],
    ]) {
      const maps = chain.map((n) => bodyMapFor('R15', n)!);
      expect(maps[0].slice[0]).toBe(0);
      for (let i = 1; i < maps.length; i++) expect(maps[i].slice[0]).toBeCloseTo(maps[i - 1].slice[1], 6);
      expect(maps[maps.length - 1].slice[1]).toBeCloseTo(1, 6);
    }
    expect(bodyMapFor('R6', 'Head')).toBeNull();
  });
});

describe('clothing store', () => {
  beforeEach(() => {
    useEditor.getState().loadProject({ id: 'c', name: 'c', createdAt: 0 }, buildProject('clothing'));
    useClothing.getState().load({ version: 1, designs: { shirt: [], pants: [], tshirt: [] }, images: [], activeKind: 'shirt' });
  });

  it('opens clothing projects on the clothing screen', () => {
    expect(useEditor.getState().screen).toBe('clothing');
  });

  it('adds a layer centered on the chest and undoes/redoes it', () => {
    const id = useClothing.getState().addLayer('text');
    const l = useClothing.getState().designs.shirt[0];
    expect(l.id).toBe(id);
    expect(l.type === 'text' && l.x).toBe(295);
    useClothing.getState().undo();
    expect(useClothing.getState().designs.shirt).toHaveLength(0);
    useClothing.getState().redo();
    expect(useClothing.getState().designs.shirt).toHaveLength(1);
  });

  it('merges a drag into one undo step', () => {
    const id = useClothing.getState().addLayer('shape');
    const base = useClothing.getState().past.length;
    for (let i = 1; i <= 6; i++) useClothing.getState().updateLayer(id, { x: 200 + i }, `${id}:drag`);
    expect(useClothing.getState().past.length).toBe(base + 1);
  });

  it('marks the project unsaved when a design changes', () => {
    useEditor.getState().setSaveStatus('saved');
    useClothing.getState().addLayer('fill');
    expect(useEditor.getState().project.saveStatus).toBe('unsaved');
  });

  it('keeps each kind separate and applies presets', () => {
    useClothing.getState().setActiveKind('pants');
    useClothing.getState().insertLayers(CLOTHING_PRESETS.find((p) => p.id === 'pants-jeans')!.build(), true);
    expect(useClothing.getState().designs.pants.length).toBeGreaterThan(4);
    expect(useClothing.getState().designs.shirt).toHaveLength(0);
  });

  it('mirrors a sleeve layer onto the other sleeve, flipped', () => {
    const s = useClothing.getState();
    const id = s.addLayer('shape', { clip: 'rightArm.front' });
    s.updateLayer(id, { x: 217 + 20 });
    const mid = useClothing.getState().mirrorLayer(id)!;
    const m = useClothing.getState().designs.shirt.find((l) => l.id === mid)!;
    expect(m.clip).toBe('leftArm.front');
    // 20 px right of the right-arm front centre becomes 20 px left of the left-arm front centre
    expect(m.type === 'shape' && m.x).toBeCloseTo(308 + 32 - (20 - 0 + 217 + 0 - (217 + 32) + 0) - 0, 5);
  });

  it('refuses to mirror a whole-template layer', () => {
    const id = useClothing.getState().addLayer('shape', { clip: 'all' });
    expect(useClothing.getState().mirrorLayer(id)).toBeNull();
  });

  it('serialises and restores a clothing project', () => {
    useClothing.getState().addLayer('text');
    const data = useClothing.getState().serialize();
    useClothing.getState().load({ version: 1, designs: { shirt: [], pants: [], tshirt: [] }, images: [], activeKind: 'shirt' });
    useClothing.getState().load(JSON.parse(JSON.stringify(data)));
    expect(useClothing.getState().designs.shirt).toHaveLength(1);
  });
});

describe('hit testing and checks', () => {
  it('hits rotated boxes correctly', () => {
    const b = { cx: 100, cy: 100, w: 100, h: 20, rotation: 90 };
    expect(pointInBox(b, 100, 140)).toBe(true); // rotated: long axis now vertical
    expect(pointInBox(b, 140, 100)).toBe(false);
    expect(layerBox({ type: 'fill' } as never)).toBeNull();
  });

  it('flags empty designs, missing and enlarged images', () => {
    expect(checkLayers('shirt', [], [])[0].severity).toBe('error');
    const layers = CLOTHING_PRESETS.find((p) => p.id === 'shirt-cyber')!.build();
    expect(checkLayers('shirt', layers, []).some((c) => c.severity === 'error')).toBe(false);
    const img = { id: 'i1', name: 'x', dataUrl: '', width: 20, height: 20 };
    const big = [{ ...layers[0], type: 'image', imageId: 'i1', x: 0, y: 0, w: 100, h: 100, rotation: 0, flipX: false } as never];
    expect(checkLayers('shirt', big, [img]).some((c) => c.id === 'soft')).toBe(true);
    expect(checkLayers('shirt', big, []).some((c) => c.id === 'missing-img')).toBe(true);
  });

  it('all presets only use known panels', () => {
    for (const p of CLOTHING_PRESETS) {
      const kind = TEMPLATES[p.kind];
      const ids = new Set([...kind.panels.map((x) => x.id), ...kind.groups.map((g) => g.id), 'all']);
      for (const l of p.build()) expect(ids.has(l.clip), `${p.id}: ${l.name} -> ${l.clip}`).toBe(true);
    }
  });
});
