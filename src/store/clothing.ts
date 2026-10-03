import { create } from 'zustand';
import type { ClothingData, ClothingImage, ClothingKind, ClothingLayer, ImageLayer, PaintLayer, ShapeLayer, Stroke, TextLayer } from '../types';
import { makeLayer, type NewLayerType } from '../clothing/layers';
import { TEMPLATES, mirrorGroupId, mirrorPanelId, panelById } from '../clothing/templates';
import { useEditor } from './editor';
import { useUI } from './ui';

const HISTORY_LIMIT = 60;
const MERGE_WINDOW_MS = 900;

export type ClothingTool = 'select' | 'place' | 'brush' | 'eraser';
export type ViewMode = 'split' | '2d' | '3d';

type Designs = Record<ClothingKind, ClothingLayer[]>;

const emptyDesigns = (): Designs => ({ shirt: [], pants: [], tshirt: [] });

export interface ClothingState {
  designs: Designs;
  images: ClothingImage[];
  activeKind: ClothingKind;
  selectedId: string | null;
  tool: ClothingTool;
  brush: { color: string; size: number };
  showGuides: boolean;
  viewMode: ViewMode;
  /** which clothing kinds are drawn on the 3D mannequin */
  shown: Record<ClothingKind, boolean>;

  revision: number;
  imageRev: number;
  /** bumped per kind so only the edited design re-renders */
  designVersion: Record<ClothingKind, number>;

  past: Designs[];
  future: Designs[];
  lastKey: string | null;
  lastTime: number;

  load: (data: ClothingData) => void;
  serialize: () => ClothingData;
  setActiveKind: (k: ClothingKind) => void;
  select: (id: string | null) => void;
  setTool: (t: ClothingTool) => void;
  setBrush: (patch: Partial<{ color: string; size: number }>) => void;
  setShowGuides: (v: boolean) => void;
  setViewMode: (v: ViewMode) => void;
  setShown: (k: ClothingKind, v: boolean) => void;

  addLayer: (type: NewLayerType, opts?: { clip?: string; image?: ClothingImage }) => string;
  insertLayers: (layers: ClothingLayer[], replace?: boolean) => void;
  updateLayer: (id: string, patch: Partial<ClothingLayer>, key?: string) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => string | null;
  mirrorLayer: (id: string) => string | null;
  moveLayer: (id: string, delta: number) => void;
  reorderLayer: (id: string, toIndex: number) => void;
  clearDesign: () => void;

  beginStroke: (stroke: Stroke) => { layerId: string; index: number };
  extendStroke: (layerId: string, index: number, point: [number, number]) => void;

  addImage: (img: ClothingImage) => void;
  removeImage: (id: string) => void;

  undo: () => void;
  redo: () => void;
}

export const useClothing = create<ClothingState>((set, get) => {
  const touch = () => useEditor.getState().touch();

  const commit = (label: string, designs: Designs, key?: string, kinds: ClothingKind[] = ['shirt', 'pants', 'tshirt']) => {
    const s = get();
    const now = Date.now();
    const merge = !!key && s.lastKey === key && now - s.lastTime < MERGE_WINDOW_MS && s.past.length > 0;
    const past = merge ? s.past : [...s.past, s.designs].slice(-HISTORY_LIMIT);
    const designVersion = { ...s.designVersion };
    for (const k of kinds) designVersion[k] = s.designVersion[k] + 1;
    set({ designs, past, future: [], lastKey: key ?? null, lastTime: now, revision: s.revision + 1, designVersion });
    if (!merge) useUI.getState().log('info', label);
    touch();
  };

  const withLayers = (kind: ClothingKind, layers: ClothingLayer[]): Designs => ({ ...get().designs, [kind]: layers });

  const findKind = (id: string): ClothingKind | null => {
    const d = get().designs;
    for (const k of ['shirt', 'pants', 'tshirt'] as ClothingKind[]) if (d[k].some((l) => l.id === id)) return k;
    return null;
  };

  return {
    designs: emptyDesigns(),
    images: [],
    activeKind: 'shirt',
    selectedId: null,
    tool: 'select',
    brush: { color: '#e3242b', size: 6 },
    showGuides: true,
    viewMode: 'split',
    shown: { shirt: true, pants: true, tshirt: true },
    revision: 0,
    imageRev: 0,
    designVersion: { shirt: 0, pants: 0, tshirt: 0 },
    past: [],
    future: [],
    lastKey: null,
    lastTime: 0,

    load: (data) =>
      set((s) => ({
        designs: { shirt: data.designs?.shirt ?? [], pants: data.designs?.pants ?? [], tshirt: data.designs?.tshirt ?? [] },
        images: data.images ?? [],
        activeKind: data.activeKind ?? 'shirt',
        selectedId: null,
        tool: 'select',
        past: [],
        future: [],
        lastKey: null,
        revision: s.revision + 1,
        imageRev: s.imageRev + 1,
        designVersion: { shirt: s.designVersion.shirt + 1, pants: s.designVersion.pants + 1, tshirt: s.designVersion.tshirt + 1 },
      })),

    serialize: () => {
      const s = get();
      return { version: 1, designs: s.designs, images: s.images, activeKind: s.activeKind };
    },

    setActiveKind: (activeKind) => set({ activeKind, selectedId: null, tool: 'select' }),
    select: (selectedId) => set({ selectedId }),
    setTool: (tool) => set({ tool }),
    setBrush: (patch) => set((s) => ({ brush: { ...s.brush, ...patch } })),
    setShowGuides: (showGuides) => set({ showGuides }),
    setViewMode: (viewMode) => set({ viewMode }),
    setShown: (k, v) => set((s) => ({ shown: { ...s.shown, [k]: v } })),

    addLayer: (type, opts) => {
      const s = get();
      const layer = makeLayer(s.activeKind, type, opts?.clip, opts?.image);
      commit(`Added ${type} layer`, withLayers(s.activeKind, [...s.designs[s.activeKind], layer]), undefined, [s.activeKind]);
      set({ selectedId: layer.id });
      return layer.id;
    },

    insertLayers: (layers, replace = false) => {
      const s = get();
      const next = replace ? layers : [...s.designs[s.activeKind], ...layers];
      commit(replace ? 'Applied preset' : 'Added preset layers', withLayers(s.activeKind, next), undefined, [s.activeKind]);
      set({ selectedId: layers[layers.length - 1]?.id ?? null });
    },

    updateLayer: (id, patch, key) => {
      const kind = findKind(id);
      if (!kind) return;
      const s = get();
      const layers = s.designs[kind].map((l) => (l.id === id ? ({ ...l, ...patch } as ClothingLayer) : l));
      commit('Edited layer', withLayers(kind, layers), key ?? `${id}:edit`, [kind]);
    },

    removeLayer: (id) => {
      const kind = findKind(id);
      if (!kind) return;
      const s = get();
      const layer = s.designs[kind].find((l) => l.id === id);
      commit(`Deleted ${layer?.name ?? 'layer'}`, withLayers(kind, s.designs[kind].filter((l) => l.id !== id)), undefined, [kind]);
      if (s.selectedId === id) set({ selectedId: null });
    },

    duplicateLayer: (id) => {
      const kind = findKind(id);
      if (!kind) return null;
      const s = get();
      const idx = s.designs[kind].findIndex((l) => l.id === id);
      const src = s.designs[kind][idx];
      const copy = { ...src, id: `${src.id}_c${Date.now().toString(36)}`, name: `${src.name} copy` } as ClothingLayer;
      if (copy.type === 'image' || copy.type === 'text' || copy.type === 'shape') {
        (copy as ImageLayer | TextLayer | ShapeLayer).x += 8;
        (copy as ImageLayer | TextLayer | ShapeLayer).y += 8;
      }
      if (copy.type === 'paint') (copy as PaintLayer).strokes = [...copy.strokes];
      const layers = [...s.designs[kind]];
      layers.splice(idx + 1, 0, copy);
      commit(`Duplicated ${src.name}`, withLayers(kind, layers), undefined, [kind]);
      set({ selectedId: copy.id });
      return copy.id;
    },

    mirrorLayer: (id) => {
      const kind = findKind(id);
      if (!kind) return null;
      const s = get();
      const src = s.designs[kind].find((l) => l.id === id)!;
      if (src.type === 'paint') {
        useUI.getState().toast('warn', 'Paint layers cannot be mirrored. Duplicate and repaint the other side.');
        return null;
      }
      const copy = { ...src, id: `${src.id}_m${Date.now().toString(36)}`, name: `${src.name} (mirrored)` } as ClothingLayer;
      const sp = panelById(kind, src.clip);
      if (sp) {
        const dp = panelById(kind, mirrorPanelId(src.clip));
        if (!dp) return null;
        copy.clip = dp.id;
        if (copy.type === 'image' || copy.type === 'text' || copy.type === 'shape') {
          const c = copy as ImageLayer | TextLayer | ShapeLayer;
          c.x = dp.x + dp.w / 2 - ((src as ImageLayer).x - (sp.x + sp.w / 2));
          c.y = dp.y + dp.h / 2 + ((src as ImageLayer).y - (sp.y + sp.h / 2));
          c.rotation = -c.rotation;
          if (c.type === 'image') c.flipX = !c.flipX;
        }
      } else if (src.clip !== 'all' && mirrorGroupId(src.clip) !== src.clip) {
        copy.clip = mirrorGroupId(src.clip);
      } else {
        useUI.getState().toast('warn', 'Set the layer to one panel or one sleeve/leg first, then mirror it.');
        return null;
      }
      const layers = [...s.designs[kind]];
      layers.splice(layers.findIndex((l) => l.id === id) + 1, 0, copy);
      commit(`Mirrored ${src.name}`, withLayers(kind, layers), undefined, [kind]);
      set({ selectedId: copy.id });
      return copy.id;
    },

    moveLayer: (id, delta) => {
      const kind = findKind(id);
      if (!kind) return;
      const layers = [...get().designs[kind]];
      const i = layers.findIndex((l) => l.id === id);
      const j = Math.max(0, Math.min(layers.length - 1, i + delta));
      if (i === j) return;
      const [l] = layers.splice(i, 1);
      layers.splice(j, 0, l);
      commit('Reordered layers', withLayers(kind, layers), undefined, [kind]);
    },

    reorderLayer: (id, toIndex) => {
      const kind = findKind(id);
      if (!kind) return;
      const layers = [...get().designs[kind]];
      const i = layers.findIndex((l) => l.id === id);
      if (i < 0 || i === toIndex) return;
      const [l] = layers.splice(i, 1);
      layers.splice(Math.max(0, Math.min(layers.length, toIndex)), 0, l);
      commit('Reordered layers', withLayers(kind, layers), undefined, [kind]);
    },

    clearDesign: () => {
      const k = get().activeKind;
      commit(`Cleared ${TEMPLATES[k].label.toLowerCase()} design`, withLayers(k, []), undefined, [k]);
      set({ selectedId: null });
    },

    beginStroke: (stroke) => {
      const s = get();
      const kind = s.activeKind;
      const layers = s.designs[kind];
      let target = layers.find((l) => l.id === s.selectedId && l.type === 'paint' && !l.locked) as PaintLayer | undefined;
      let next = layers;
      if (!target) {
        target = makeLayer(kind, 'paint') as PaintLayer;
        next = [...layers, target];
      }
      const updated: PaintLayer = { ...target, strokes: [...target.strokes, stroke] };
      next = next.map((l) => (l.id === updated.id ? updated : l));
      if (!next.some((l) => l.id === updated.id)) next = [...next, updated];
      commit(stroke.erase ? 'Erased' : 'Painted', withLayers(kind, next), undefined, [kind]);
      set({ selectedId: updated.id });
      return { layerId: updated.id, index: updated.strokes.length - 1 };
    },

    extendStroke: (layerId, index, point) => {
      const kind = findKind(layerId);
      if (!kind) return;
      const s = get();
      const layers = s.designs[kind].map((l) => {
        if (l.id !== layerId || l.type !== 'paint') return l;
        const strokes = l.strokes.slice();
        const st = strokes[index];
        if (!st) return l;
        const last = st.points[st.points.length - 1];
        if (last && Math.hypot(last[0] - point[0], last[1] - point[1]) < 0.4) return l;
        strokes[index] = { ...st, points: [...st.points, point] };
        return { ...l, strokes };
      });
      commit('Painted', withLayers(kind, layers), `stroke:${layerId}:${index}`, [kind]);
    },

    addImage: (img) => set((s) => ({ images: [...s.images, img], imageRev: s.imageRev + 1 })),
    removeImage: (id) => {
      const s = get();
      const designs: Designs = { shirt: [], pants: [], tshirt: [] };
      for (const k of Object.keys(s.designs) as ClothingKind[]) designs[k] = s.designs[k].filter((l) => !(l.type === 'image' && l.imageId === id));
      set({ images: s.images.filter((i) => i.id !== id) });
      commit('Removed image', designs);
    },

    undo: () => {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      set({
        designs: prev,
        past: s.past.slice(0, -1),
        future: [s.designs, ...s.future].slice(0, HISTORY_LIMIT),
        lastKey: null,
        revision: s.revision + 1,
        designVersion: { shirt: s.designVersion.shirt + 1, pants: s.designVersion.pants + 1, tshirt: s.designVersion.tshirt + 1 },
        selectedId: s.selectedId && Object.values(prev).some((arr) => arr.some((l) => l.id === s.selectedId)) ? s.selectedId : null,
      });
      useUI.getState().log('info', 'Undo');
      touch();
    },

    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      set({
        designs: next,
        past: [...s.past, s.designs].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        lastKey: null,
        revision: s.revision + 1,
        designVersion: { shirt: s.designVersion.shirt + 1, pants: s.designVersion.pants + 1, tshirt: s.designVersion.tshirt + 1 },
        selectedId: s.selectedId && Object.values(next).some((arr) => arr.some((l) => l.id === s.selectedId)) ? s.selectedId : null,
      });
      useUI.getState().log('info', 'Redo');
      touch();
    },
  };
});

export function selectedLayer(s: ClothingState): ClothingLayer | null {
  if (!s.selectedId) return null;
  return s.designs[s.activeKind].find((l) => l.id === s.selectedId) ?? null;
}
