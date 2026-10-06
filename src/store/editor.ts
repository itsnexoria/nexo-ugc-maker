import { create } from 'zustand';
import type {
  AnimationId,
  CameraState,
  Layer,
  MaterialProps,
  ModelAsset,
  PartSpec,
  PrimitiveKind,
  ProjectData,
  RigType,
  SaveStatus,
  SceneObject,
  ShapeKind,
  Snapshot,
  SlotId,
  Stroke,
  TextureAsset,
  ToolMode,
  Vec3,
} from '../types';
import { applyPresetToMaterial, DEFAULT_MATERIAL } from '../assets/materials';
import { SLOT_ANCHORS } from '../assets/avatar';
import { LOW_POLY_KINDS, SHAPE_LABELS } from '../utils/geometry';
import { emptyPaint, forgetPaint, strokeScale } from '../utils/paint';
import { objectTriangles } from '../utils/validation';
import { uid } from '../utils/ids';
import { decomposeMatrix, isFiniteVec, localMatrix, subVec, worldMatrix } from '../utils/math';
import {
  buildChildrenIndex,
  DEFAULT_LAYERS,
  instantiate,
  isDescendant,
  rootOf,
  subtreeIds,
  uniqueName,
} from '../utils/scene';
import { DEFAULT_CAMERA } from './viewport';
import { useUI } from './ui';
import * as THREE from 'three';

const HISTORY_LIMIT = 100;
const MERGE_WINDOW_MS = 900;

export interface ProjectInfo {
  id: string;
  name: string;
  createdAt: number;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
}

export interface EditorState {
  screen: 'boot' | 'home' | 'editor' | 'clothing';
  project: ProjectInfo;
  /** Bumped by every change that should be persisted */
  revision: number;

  objects: Record<string, SceneObject>;
  order: string[];
  childrenIndex: Record<string, string[]>;
  layers: Layer[];
  textures: TextureAsset[];
  models: Record<string, ModelAsset>;
  rig: RigType;
  camera: CameraState;

  selectedId: string | null;
  selectedAvatarPart: string | null;
  tool: ToolMode;
  transformSpace: 'world' | 'local';
  animation: AnimationId;

  past: Snapshot[];
  future: Snapshot[];
  lastKey: string | null;
  lastTime: number;

  // navigation / project
  setScreen: (s: EditorState['screen']) => void;
  /** Marks the project as changed (used by the clothing studio, which keeps its own history) */
  touch: () => void;
  loadProject: (info: { id: string; name: string; createdAt: number; updatedAt?: number }, data: ProjectData) => void;
  serialize: () => ProjectData;
  setProjectName: (name: string) => void;
  setSaveStatus: (s: SaveStatus, savedAt?: number) => void;
  setCamera: (c: CameraState) => void;

  // selection / tools
  select: (id: string | null) => void;
  selectAvatarPart: (name: string | null) => void;
  setTool: (t: ToolMode) => void;
  setTransformSpace: (s: 'world' | 'local') => void;
  setAnimation: (a: AnimationId) => void;

  // scene editing (all undoable)
  addPrimitive: (kind: Exclude<ShapeKind, 'group' | 'imported'>) => string;
  addImported: (model: ModelAsset, name: string) => string;
  addAccessory: (spec: PartSpec, slot: SlotId) => string;
  updateObject: (id: string, patch: Partial<SceneObject>, key?: string, label?: string) => void;
  setTransform: (id: string, patch: Partial<Pick<SceneObject, 'position' | 'rotation' | 'scale'>>, key?: string) => void;
  setMaterial: (id: string, patch: Partial<MaterialProps>, key?: string) => void;
  applyMaterialPreset: (id: string, presetId: string) => void;
  applyMaterialToAll: (sourceId: string) => void;
  renameObject: (id: string, name: string) => void;
  toggleVisible: (id: string) => void;
  toggleLock: (id: string) => void;
  setObjectLayer: (id: string, layerId: string) => void;
  duplicateObject: (id: string) => string | null;
  removeObject: (id: string) => void;
  reparent: (id: string, newParentId: string | null) => void;
  setRig: (rig: RigType) => void;
  setDetail: (id: string, detail: 'low' | 'normal') => void;
  beginPaintStroke: (id: string, stroke: Stroke) => number;
  extendPaintStroke: (id: string, index: number, points: [number, number][]) => void;
  setPaintRes: (id: string, res: 128 | 256 | 512) => void;
  clearPaint: (id: string) => void;
  removePaint: (id: string) => void;
  /** Switches the heaviest primitives to low-poly until the visible triangle count fits the budget. */
  optimizeTriangles: (budget: number) => { before: number; after: number; changed: number };

  // layers
  addLayer: (name: string) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  removeLayer: (id: string) => void;

  // library data (not part of undo)
  addTexture: (t: TextureAsset) => void;
  replaceTexture: (id: string, t: Pick<TextureAsset, 'dataUrl' | 'width' | 'height' | 'name'>) => void;
  renameTexture: (id: string, name: string) => void;
  deleteTexture: (id: string) => void;
  addModel: (m: ModelAsset) => void;

  // history
  undo: () => void;
  redo: () => void;
}

const emptyInfo: ProjectInfo = { id: '', name: 'Untitled', createdAt: 0, saveStatus: 'saved', lastSavedAt: null };

export const useEditor = create<EditorState>((set, get) => {
  const snapshot = (): Snapshot => {
    const s = get();
    return { objects: s.objects, order: s.order, layers: s.layers };
  };

  /** Single entry point for every undoable change. */
  const commit = (label: string, next: Partial<Snapshot>, key?: string) => {
    const s = get();
    const now = Date.now();
    const merge = !!key && s.lastKey === key && now - s.lastTime < MERGE_WINDOW_MS && s.past.length > 0;
    const past = merge ? s.past : [...s.past, snapshot()].slice(-HISTORY_LIMIT);
    const objects = next.objects ?? s.objects;
    const order = next.order ?? s.order;
    set({
      objects,
      order,
      layers: next.layers ?? s.layers,
      childrenIndex: next.objects || next.order ? buildChildrenIndex(objects, order) : s.childrenIndex,
      past,
      future: [],
      lastKey: key ?? null,
      lastTime: now,
      revision: s.revision + 1,
      project: { ...s.project, saveStatus: 'unsaved' },
    });
    if (!merge) useUI.getState().log('info', label);
  };

  const patchObject = (id: string, patch: Partial<SceneObject>): Record<string, SceneObject> | null => {
    const s = get();
    const cur = s.objects[id];
    if (!cur) return null;
    return { ...s.objects, [id]: { ...cur, ...patch } };
  };

  /** Where new parts go: inside the accessory group of the selection, else the first group, else a fresh group. */
  const ensureAccessoryRoot = (): { parentId: string; extra?: Partial<Snapshot> } => {
    const s = get();
    if (s.selectedId && s.objects[s.selectedId]) {
      const r = rootOf(s.objects, s.selectedId);
      if (r && r.kind === 'group') return { parentId: r.id };
    }
    const firstRoot = (s.childrenIndex.root ?? []).map((id) => s.objects[id]).find((o) => o?.kind === 'group');
    if (firstRoot) return { parentId: firstRoot.id };
    const out = { objects: { ...s.objects }, order: [...s.order] };
    const id = instantiate(
      { name: 'My Accessory', kind: 'group', slot: 'accessory' },
      null,
      s.layers,
      out,
      SLOT_ANCHORS[s.rig].accessory,
    );
    return { parentId: id, extra: { objects: out.objects, order: out.order } };
  };

  return {
    screen: 'boot',
    project: emptyInfo,
    revision: 0,
    objects: {},
    order: [],
    childrenIndex: { root: [] },
    layers: DEFAULT_LAYERS,
    textures: [],
    models: {},
    rig: 'R6',
    camera: { position: DEFAULT_CAMERA.position, target: DEFAULT_CAMERA.target },
    selectedId: null,
    selectedAvatarPart: null,
    tool: 'select',
    transformSpace: 'world',
    animation: 'rest',
    past: [],
    future: [],
    lastKey: null,
    lastTime: 0,

    setScreen: (screen) => set({ screen }),

    touch: () => set((s) => ({ revision: s.revision + 1, project: { ...s.project, saveStatus: 'unsaved' } })),

    loadProject: (info, data) =>
      set({
        screen: data.clothing ? 'clothing' : 'editor',
        project: {
          id: info.id,
          name: info.name,
          createdAt: info.createdAt,
          saveStatus: 'saved',
          lastSavedAt: info.updatedAt ?? Date.now(),
        },
        objects: data.objects,
        order: data.order,
        childrenIndex: buildChildrenIndex(data.objects, data.order),
        layers: data.layers.length ? data.layers : DEFAULT_LAYERS,
        textures: data.textures,
        models: data.models,
        rig: data.rig,
        camera: data.camera,
        selectedId: null,
        selectedAvatarPart: null,
        animation: 'rest',
        past: [],
        future: [],
        lastKey: null,
        revision: 0,
      }),

    serialize: () => {
      const s = get();
      // Only keep imported meshes that are still referenced
      const used = new Set(Object.values(s.objects).map((o) => o.modelId).filter(Boolean) as string[]);
      const models: Record<string, ModelAsset> = {};
      for (const id of used) if (s.models[id]) models[id] = s.models[id];
      return {
        version: 1,
        objects: s.objects,
        order: s.order,
        layers: s.layers,
        textures: s.textures,
        models,
        rig: s.rig,
        camera: s.camera,
      };
    },

    setProjectName: (name) => {
      const clean = name.trim().slice(0, 60) || 'Untitled';
      set((s) => ({ project: { ...s.project, name: clean, saveStatus: 'unsaved' }, revision: s.revision + 1 }));
    },
    setSaveStatus: (status, savedAt) =>
      set((s) => ({ project: { ...s.project, saveStatus: status, lastSavedAt: savedAt ?? s.project.lastSavedAt } })),
    setCamera: (camera) => set((s) => ({ camera, revision: s.revision + 1, project: { ...s.project, saveStatus: s.project.saveStatus === 'saved' ? 'unsaved' : s.project.saveStatus } })),

    select: (id) => set({ selectedId: id, selectedAvatarPart: null }),
    selectAvatarPart: (name) => set({ selectedAvatarPart: name, selectedId: null }),
    setTool: (tool) => set({ tool }),
    setTransformSpace: (transformSpace) => set({ transformSpace }),
    setAnimation: (animation) => set({ animation }),

    // ------------------------------------------------------------------ editing

    addPrimitive: (kind) => {
      const { parentId, extra } = ensureAccessoryRoot();
      const s = get();
      const objects = { ...(extra?.objects ?? s.objects) };
      const order = [...(extra?.order ?? s.order)];
      const id = uid('obj');
      const label = SHAPE_LABELS[kind];
      objects[id] = {
        id,
        name: uniqueName(label, objects),
        kind,
        parentId,
        position: [0, 0.6, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        material: { ...DEFAULT_MATERIAL },
        visible: true,
        locked: false,
        layerId: s.layers[0]?.id ?? 'layer_main',
      };
      order.push(id);
      commit(`Added ${label.toLowerCase()}`, { objects, order });
      set({ selectedId: id, selectedAvatarPart: null });
      return id;
    },

    addImported: (model, name) => {
      const { parentId, extra } = ensureAccessoryRoot();
      const s = get();
      set((st) => ({ models: { ...st.models, [model.id]: model } }));
      const objects = { ...(extra?.objects ?? s.objects) };
      const order = [...(extra?.order ?? s.order)];
      const id = uid('obj');
      objects[id] = {
        id,
        name: uniqueName(name, objects),
        kind: 'imported',
        modelId: model.id,
        parentId,
        position: [0, 0.6, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        material: { ...DEFAULT_MATERIAL },
        visible: true,
        locked: false,
        layerId: s.layers[0]?.id ?? 'layer_main',
      };
      order.push(id);
      commit(`Imported mesh "${name}" (${model.triangles} triangles)`, { objects, order });
      set({ selectedId: id, selectedAvatarPart: null });
      return id;
    },

    addAccessory: (spec, slot) => {
      const s = get();
      const out = { objects: { ...s.objects }, order: [...s.order] };
      const rootSpec: PartSpec = { ...spec, name: uniqueName(spec.name, s.objects), slot };
      const id = instantiate(rootSpec, null, s.layers, out, SLOT_ANCHORS[s.rig][slot]);
      commit(`Added ${spec.name}`, out);
      set({ selectedId: id, selectedAvatarPart: null });
      return id;
    },

    updateObject: (id, patch, key, label = 'Edited object') => {
      const objects = patchObject(id, patch);
      if (objects) commit(label, { objects }, key);
    },

    setTransform: (id, patch, key) => {
      for (const v of Object.values(patch)) if (v && !isFiniteVec(v)) return;
      const objects = patchObject(id, patch);
      if (objects) commit('Transformed object', { objects }, key ?? `${id}:transform`);
    },

    setMaterial: (id, patch, key) => {
      const cur = get().objects[id];
      if (!cur) return;
      const objects = patchObject(id, { material: { ...cur.material, ...patch, preset: undefined } });
      if (objects) commit('Changed material', { objects }, key ?? `${id}:material`);
    },

    applyMaterialPreset: (id, presetId) => {
      const cur = get().objects[id];
      if (!cur) return;
      const objects = patchObject(id, { material: applyPresetToMaterial(cur.material, presetId) });
      if (objects) commit(`Applied ${presetId} material`, { objects });
    },

    applyMaterialToAll: (sourceId) => {
      const s = get();
      const src = s.objects[sourceId];
      if (!src) return;
      const root = rootOf(s.objects, sourceId);
      if (!root) return;
      const objects = { ...s.objects };
      for (const id of subtreeIds(s.objects, s.order, root.id)) {
        if (objects[id].kind !== 'group') objects[id] = { ...objects[id], material: { ...src.material } };
      }
      commit('Applied material to all parts', { objects });
    },

    renameObject: (id, name) => {
      const clean = name.trim().slice(0, 48);
      if (!clean) return;
      const objects = patchObject(id, { name: clean });
      if (objects) commit(`Renamed to "${clean}"`, { objects });
    },

    toggleVisible: (id) => {
      const cur = get().objects[id];
      if (!cur) return;
      const objects = patchObject(id, { visible: !cur.visible });
      if (objects) commit(cur.visible ? `Hid ${cur.name}` : `Showed ${cur.name}`, { objects });
    },

    toggleLock: (id) => {
      const cur = get().objects[id];
      if (!cur) return;
      const objects = patchObject(id, { locked: !cur.locked });
      if (objects) commit(cur.locked ? `Unlocked ${cur.name}` : `Locked ${cur.name}`, { objects });
    },

    setObjectLayer: (id, layerId) => {
      const objects = patchObject(id, { layerId });
      if (objects) commit('Changed layer', { objects });
    },

    duplicateObject: (id) => {
      const s = get();
      const src = s.objects[id];
      if (!src) return null;
      const ids = subtreeIds(s.objects, s.order, id);
      const map = new Map<string, string>();
      ids.forEach((old) => map.set(old, uid('obj')));
      const objects = { ...s.objects };
      const order = [...s.order];
      for (const old of ids) {
        const o = s.objects[old];
        const nid = map.get(old)!;
        const isRoot = old === id;
        objects[nid] = {
          ...o,
          id: nid,
          name: isRoot ? uniqueName(o.name, objects) : o.name,
          parentId: isRoot ? o.parentId : map.get(o.parentId!) ?? o.parentId,
          position: isRoot ? ([o.position[0] + 0.4, o.position[1], o.position[2]] as Vec3) : o.position,
          material: { ...o.material },
        };
        order.push(nid);
      }
      commit(`Duplicated ${src.name}`, { objects, order });
      const nid = map.get(id)!;
      set({ selectedId: nid, selectedAvatarPart: null });
      return nid;
    },

    removeObject: (id) => {
      const s = get();
      const src = s.objects[id];
      if (!src) return;
      const gone = new Set(subtreeIds(s.objects, s.order, id));
      const objects: Record<string, SceneObject> = {};
      for (const [oid, o] of Object.entries(s.objects)) if (!gone.has(oid)) objects[oid] = o;
      const order = s.order.filter((oid) => !gone.has(oid));
      commit(`Deleted ${src.name}`, { objects, order });
      if (s.selectedId && gone.has(s.selectedId)) set({ selectedId: null });
    },

    reparent: (id, newParentId) => {
      const s = get();
      const o = s.objects[id];
      if (!o || o.parentId === newParentId) return;
      if (newParentId) {
        const target = s.objects[newParentId];
        if (!target || isDescendant(s.objects, newParentId, id)) return;
      }
      // keep the same world transform under the new parent
      const world = worldMatrix(s.objects, id);
      const parentWorld = newParentId ? worldMatrix(s.objects, newParentId) : new THREE.Matrix4();
      const local = decomposeMatrix(parentWorld.clone().invert().multiply(world));
      const objects = { ...s.objects, [id]: { ...o, parentId: newParentId, ...local } };
      // moving to the end of the order list also moves it to the end of its new sibling list
      const order = [...s.order.filter((x) => x !== id), id];
      commit(`Moved ${o.name}`, { objects, order });
    },

    setRig: (rig) => {
      const s = get();
      if (s.rig === rig) return;
      // Accessories keep their slot: shift roots by the difference between rig attachment points.
      const objects = { ...s.objects };
      for (const id of s.childrenIndex.root ?? []) {
        const o = objects[id];
        if (!o?.slot) continue;
        const delta = subVec(SLOT_ANCHORS[rig][o.slot], SLOT_ANCHORS[s.rig][o.slot]);
        objects[id] = { ...o, position: [o.position[0] + delta[0], o.position[1] + delta[1], o.position[2] + delta[2]] };
      }
      const prevRig = s.rig;
      const past = [...s.past, snapshot()].slice(-HISTORY_LIMIT);
      set({
        rig,
        objects,
        past,
        future: [],
        lastKey: null,
        revision: s.revision + 1,
        project: { ...s.project, saveStatus: 'unsaved' },
      });
      useUI.getState().log('info', `Switched rig ${prevRig} → ${rig}`);
    },

    beginPaintStroke: (id, stroke) => {
      const cur = get().objects[id];
      if (!cur || cur.kind === 'group') return -1;
      const paint = cur.paint ?? emptyPaint();
      const strokes = [...paint.strokes, stroke];
      const objects = patchObject(id, { paint: { ...paint, strokes } });
      if (objects) {
        commit(`${stroke.erase ? 'Erased on' : 'Painted on'} ${cur.name}`, { objects });
        // later points of this stroke merge into this same undo step
        set({ lastKey: `paint:${id}:${strokes.length - 1}`, lastTime: Date.now() });
      }
      return strokes.length - 1;
    },

    extendPaintStroke: (id, index, points) => {
      const cur = get().objects[id];
      if (!cur?.paint || !cur.paint.strokes[index] || !points.length) return;
      const st = cur.paint.strokes[index];
      const fresh: [number, number][] = [];
      let last = st.points[st.points.length - 1];
      for (const pt of points) {
        if (last && Math.hypot(last[0] - pt[0], last[1] - pt[1]) < 0.3) continue;
        fresh.push(pt);
        last = pt;
      }
      if (!fresh.length) return;
      const strokes = cur.paint.strokes.slice();
      strokes[index] = { ...st, points: [...st.points, ...fresh] };
      const objects = patchObject(id, { paint: { ...cur.paint, strokes } });
      if (objects) commit('Painted', { objects }, `paint:${id}:${index}`);
    },

    setPaintRes: (id, res) => {
      const cur = get().objects[id];
      if (!cur) return;
      const old = cur.paint?.res ?? res;
      const k = res / old;
      const paint = { res, strokes: (cur.paint?.strokes ?? []).map((st) => strokeScale(st, k)) };
      const objects = patchObject(id, { paint });
      if (objects) commit(`Painted texture size ${res}`, { objects });
    },

    clearPaint: (id) => {
      const cur = get().objects[id];
      if (!cur?.paint) return;
      const objects = patchObject(id, { paint: { ...cur.paint, strokes: [] } });
      if (objects) commit(`Cleared paint on ${cur.name}`, { objects });
    },

    removePaint: (id) => {
      const cur = get().objects[id];
      if (!cur?.paint) return;
      const { paint: _drop, ...rest } = cur;
      void _drop;
      const objects = { ...get().objects, [id]: rest as SceneObject };
      commit(`Removed paint from ${cur.name}`, { objects });
      forgetPaint(id);
    },

    setDetail: (id, detail) => {
      const objects = patchObject(id, { detail });
      if (objects) commit(detail === 'low' ? 'Switched to low-poly' : 'Switched to normal detail', { objects });
    },

    optimizeTriangles: (budget) => {
      const s = get();
      const tris = (o: SceneObject) => objectTriangles(o, s.models);
      const visible = Object.values(s.objects).filter((o) => o.kind !== 'group' && o.visible);
      const before = visible.reduce((n, o) => n + tris(o), 0);
      let total = before;
      const objects = { ...s.objects };
      let changed = 0;
      const candidates = visible
        .filter((o) => o.detail !== 'low' && LOW_POLY_KINDS.includes(o.kind))
        .sort((a, b) => tris(b) - tris(a));
      for (const o of candidates) {
        if (total <= budget) break;
        const saved = tris(o) - tris({ ...o, detail: 'low' });
        if (saved <= 0) continue;
        objects[o.id] = { ...o, detail: 'low' };
        total -= saved;
        changed += 1;
      }
      if (changed) commit(`Reduced triangles ${before} → ${total}`, { objects });
      return { before, after: total, changed };
    },

    // ------------------------------------------------------------------ layers

    addLayer: (name) => {
      const s = get();
      const layers = [...s.layers, { id: uid('layer'), name: name.trim() || 'Layer', visible: true, locked: false }];
      commit('Added layer', { layers });
    },
    updateLayer: (id, patch) => {
      const s = get();
      commit('Edited layer', { layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
    },
    removeLayer: (id) => {
      const s = get();
      if (s.layers.length <= 1) return;
      const layers = s.layers.filter((l) => l.id !== id);
      const fallback = layers[0].id;
      const objects = { ...s.objects };
      for (const [oid, o] of Object.entries(objects)) if (o.layerId === id) objects[oid] = { ...o, layerId: fallback };
      commit('Removed layer', { layers, objects });
    },

    // ------------------------------------------------------------------ library data

    addTexture: (t) =>
      set((s) => ({
        textures: [...s.textures, t],
        revision: s.revision + 1,
        project: { ...s.project, saveStatus: 'unsaved' },
      })),
    replaceTexture: (id, t) =>
      set((s) => ({
        textures: s.textures.map((x) => (x.id === id ? { ...x, ...t } : x)),
        revision: s.revision + 1,
        project: { ...s.project, saveStatus: 'unsaved' },
      })),
    renameTexture: (id, name) =>
      set((s) => ({
        textures: s.textures.map((x) => (x.id === id ? { ...x, name: name.trim() || x.name } : x)),
        revision: s.revision + 1,
        project: { ...s.project, saveStatus: 'unsaved' },
      })),
    deleteTexture: (id) => {
      const s = get();
      const objects = { ...s.objects };
      let touched = false;
      for (const [oid, o] of Object.entries(objects)) {
        if (o.material.textureId === id) {
          objects[oid] = { ...o, material: { ...o.material, textureId: null } };
          touched = true;
        }
      }
      set((st) => ({ textures: st.textures.filter((t) => t.id !== id) }));
      if (touched) commit('Deleted texture', { objects });
      else set((st) => ({ revision: st.revision + 1, project: { ...st.project, saveStatus: 'unsaved' } }));
    },
    addModel: (m) => set((s) => ({ models: { ...s.models, [m.id]: m } })),

    // ------------------------------------------------------------------ history

    undo: () => {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      const future = [snapshot(), ...s.future].slice(0, HISTORY_LIMIT);
      set({
        objects: prev.objects,
        order: prev.order,
        layers: prev.layers,
        childrenIndex: buildChildrenIndex(prev.objects, prev.order),
        past: s.past.slice(0, -1),
        future,
        lastKey: null,
        selectedId: s.selectedId && prev.objects[s.selectedId] ? s.selectedId : null,
        revision: s.revision + 1,
        project: { ...s.project, saveStatus: 'unsaved' },
      });
      useUI.getState().log('info', 'Undo');
    },

    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      const past = [...s.past, snapshot()].slice(-HISTORY_LIMIT);
      set({
        objects: next.objects,
        order: next.order,
        layers: next.layers,
        childrenIndex: buildChildrenIndex(next.objects, next.order),
        past,
        future: s.future.slice(1),
        lastKey: null,
        selectedId: s.selectedId && next.objects[s.selectedId] ? s.selectedId : null,
        revision: s.revision + 1,
        project: { ...s.project, saveStatus: 'unsaved' },
      });
      useUI.getState().log('info', 'Redo');
    },
  };
});

export type { PrimitiveKind };
export const selectedObject = (s: EditorState): SceneObject | null => (s.selectedId ? (s.objects[s.selectedId] ?? null) : null);
export { localMatrix };
