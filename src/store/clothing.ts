import { create } from 'zustand';
import type { ClothingData, ClothingImage, ClothingKind, ClothingLayer, ImageLayer, PaintLayer, PatternId, ShapeLayer, Stroke, TextLayer } from '../types';
import { makeLayer, type NewLayerType } from '../clothing/layers';
import { effectiveOf, groupIndex, groupLayers, isGroup, normalizeGroups, reorderLayers, ungroup, withMembers } from '../clothing/groups';
import { TEMPLATES, mirrorGroupId, mirrorPanelId, panelAt, panelById } from '../clothing/templates';
import { layerBox } from '../clothing/render';
import { R15_DEFAULTS, getR15Calibration, setR15Calibration, type R15Calibration } from '../clothing/mapping';
import { useEditor } from './editor';
import { useUI } from './ui';

const HISTORY_LIMIT = 60;
const MERGE_WINDOW_MS = 900;

export type ClothingTool = 'select' | 'place' | 'brush' | 'eraser' | 'fill';

export interface FillOptions {
  /** 0 to 100 */
  tolerance: number;
  contiguous: boolean;
  /** grow the filled area by this many template pixels, to cover anti-aliased edges */
  expand: number;
}
export type ViewMode = 'split' | '2d' | '3d';

export interface BrushState {
  color: string;
  size: number;
  hardness: number;
  opacity: number;
  symmetry: boolean;
  /** solid colour, repeating pattern, or a gradient from colour to colour2 */
  fillType: 'solid' | 'pattern' | 'gradient';
  color2: string;
  pattern: PatternId;
  patternSize: number;
}

export interface HistoryEntry {
  designs: Designs;
  /** what the action that followed this state was */
  label: string;
  /** The image library as it was, kept only by actions that change the library (deleting images), so undo can bring them back */
  images?: ClothingImage[];
}

const KINDS: ClothingKind[] = ['shirt', 'pants', 'tshirt'];

/** Images in the library that no layer in any design uses. */
export function unusedClothingImageIds(designs: Record<ClothingKind, ClothingLayer[]>, images: ClothingImage[]): string[] {
  const used = new Set<string>();
  for (const k of KINDS) for (const l of designs[k] ?? []) if (l.type === 'image') used.add(l.imageId);
  return images.filter((i) => !used.has(i.id)).map((i) => i.id);
}

/** The design tab an undo/redo step changed, preferring the one already on screen. */
function changedKind(a: Record<ClothingKind, ClothingLayer[]>, b: Record<ClothingKind, ClothingLayer[]>, active: ClothingKind): ClothingKind | null {
  if (a[active] !== b[active]) return active;
  return KINDS.find((k) => a[k] !== b[k]) ?? null;
}

/** Where a point lands on the opposite side of the body (left/right mirror), or null off-template. */
export function mirrorPoint(kind: ClothingKind, pt: [number, number]): [number, number] | null {
  const src = panelAt(kind, pt[0], pt[1]);
  if (!src) return null;
  const dst = panelById(kind, mirrorPanelId(src.id));
  if (!dst) return null;
  return [dst.x + dst.w / 2 - (pt[0] - (src.x + src.w / 2)), dst.y + (pt[1] - src.y)];
}

type Designs = Record<ClothingKind, ClothingLayer[]>;

const emptyDesigns = (): Designs => ({ shirt: [], pants: [], tshirt: [] });

export interface ClothingState {
  designs: Designs;
  images: ClothingImage[];
  activeKind: ClothingKind;
  selectedId: string | null;
  /** every selected layer (selectedId is the primary one shown in Properties) */
  selectedIds: string[];
  tool: ClothingTool;
  brush: BrushState;
  recentColors: string[];
  r15Cal: R15Calibration;
  setR15Cal: (patch: Partial<R15Calibration> | 'reset') => void;
  showGuides: boolean;
  /** snap moving layers to panel edges, centres and other layers (hold Alt to bypass) */
  snap: boolean;
  /** Extra thickness (studs) added to the clothing on the 3D preview to imitate puffy layered clothing. 0 = off. */
  puffiness: number;
  viewMode: ViewMode;
  /** which clothing kinds are drawn on the 3D mannequin */
  shown: Record<ClothingKind, boolean>;

  revision: number;
  imageRev: number;
  /** bumped per kind so only the edited design re-renders */
  designVersion: Record<ClothingKind, number>;

  past: HistoryEntry[];
  future: HistoryEntry[];
  lastKey: string | null;
  lastTime: number;

  load: (data: ClothingData) => void;
  serialize: () => ClothingData;
  setActiveKind: (k: ClothingKind) => void;
  select: (id: string | null) => void;
  toggleSelect: (id: string) => void;
  selectRange: (id: string) => void;
  selectMany: (ids: string[]) => void;
  setTool: (t: ClothingTool) => void;
  setBrush: (patch: Partial<BrushState>) => void;
  setShowGuides: (v: boolean) => void;
  setSnap: (v: boolean) => void;
  /** Layer whose mask the brush and eraser currently paint on (null = painting normally) */
  fillOpts: FillOptions;
  setFillOpts: (patch: Partial<FillOptions>) => void;
  /** Adds a layer covering the whole template that shows `img` (a picture of the filled area). One undo step. */
  addRegionFill: (img: ClothingImage) => string;
  maskEdit: string | null;
  setMaskEdit: (id: string | null) => void;
  addMask: (id: string) => void;
  removeMask: (id: string) => void;
  clearMask: (id: string) => void;
  /** Moves the selected layers by whole pixels (arrow keys). Held keys merge into one undo step. */
  nudgeSelected: (dx: number, dy: number) => void;
  setPuffiness: (v: number) => void;
  setViewMode: (v: ViewMode) => void;
  setShown: (k: ClothingKind, v: boolean) => void;

  addBaseImage: (img: ClothingImage, fit?: 'exact' | 'contain') => string;
  addLayer: (type: NewLayerType, opts?: { clip?: string; image?: ClothingImage }) => string;
  insertLayers: (layers: ClothingLayer[], replace?: boolean) => void;
  updateLayer: (id: string, patch: Partial<ClothingLayer>, key?: string) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => string | null;
  removeLayers: (ids: string[]) => void;
  duplicateLayers: (ids: string[]) => void;
  updateLayers: (ids: string[], patch: Partial<ClothingLayer>, key?: string) => void;
  moveLayersBy: (ids: string[], dx: number, dy: number, key?: string) => void;
  alignLayers: (ids: string[], how: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  copyLayersToKind: (ids: string[] | 'all', target: ClothingKind) => number;
  jumpHistory: (steps: number) => void;
  mirrorLayer: (id: string) => string | null;
  /** Puts the chosen layers into a new group. Returns the group's id. */
  groupSelected: () => string | null;
  /** Dissolves a group; its layers stay where they are. */
  ungroupLayer: (groupId: string) => void;
  moveLayer: (id: string, delta: number) => void;
  reorderLayer: (id: string, toIndex: number) => void;
  clearDesign: () => void;

  beginStroke: (stroke: Stroke) => { layerId: string; index: number; mirrorIndex: number | null };
  extendStroke: (layerId: string, index: number, point: [number, number], mirrorIndex?: number | null) => void;
  /** Several points in one commit (pointer events are batched to one update per frame) */
  extendStrokeMany: (layerId: string, index: number, points: [number, number][], mirrorIndex?: number | null) => void;

  addImage: (img: ClothingImage) => void;
  removeImage: (id: string) => void;
  /** Deletes every image no layer uses (one undo step). Returns how many were removed. */
  removeUnusedImages: () => number;
  /** Swaps in smaller versions of library images without touching layers or history. */
  replaceImages: (updates: { id: string; dataUrl: string; width: number; height: number }[]) => void;

  undo: () => void;
  redo: () => void;
}

/** Clothing parts differ between a shirt (arms) and pants (legs); everything else lines up one to one. */
export function translateClip(clip: string, from: ClothingKind, to: ClothingKind): string {
  if (from === to) return clip;
  const swap = (part: string) => {
    if (from === 'shirt' && to === 'pants') return part.replace('rightArm', 'rightLeg').replace('leftArm', 'leftLeg');
    if (from === 'pants' && to === 'shirt') return part.replace('rightLeg', 'rightArm').replace('leftLeg', 'leftArm');
    return part;
  };
  return swap(clip);
}

function keepSelection(s: ClothingState, designs: Designs) {
  const all = new Set(Object.values(designs).flatMap((arr) => arr.map((l) => l.id)));
  const ids = s.selectedIds.filter((id) => all.has(id));
  return { selectedIds: ids, selectedId: s.selectedId && all.has(s.selectedId) ? s.selectedId : (ids[ids.length - 1] ?? null) };
}

export const useClothing = create<ClothingState>((set, get) => {
  const touch = () => useEditor.getState().touch();

  const commit = (label: string, designs: Designs, key?: string, kinds: ClothingKind[] = ['shirt', 'pants', 'tshirt'], images?: ClothingImage[]) => {
    const s = get();
    const now = Date.now();
    // A brush stroke is one undo step however long the pointer rests mid-drag; everything else merges by time.
    const perStroke = !!key && key.startsWith('stroke:');
    const merge = !!key && !images && s.lastKey === key && (perStroke || now - s.lastTime < MERGE_WINDOW_MS) && s.past.length > 0;
    const entry: HistoryEntry = { designs: s.designs, label, ...(images ? { images: s.images } : {}) };
    const past = merge ? s.past : [...s.past, entry].slice(-HISTORY_LIMIT);
    const designVersion = { ...s.designVersion };
    for (const k of kinds) designVersion[k] = s.designVersion[k] + 1;
    set({ designs, past, future: [], lastKey: key ?? null, lastTime: now, revision: s.revision + 1, designVersion, ...(images ? { images, imageRev: s.imageRev + 1 } : {}) });
    if (!merge) useUI.getState().log('info', label);
    touch();
  };

  /** every edit goes through here, so group membership can never be left inconsistent */
  const withLayers = (kind: ClothingKind, layers: ClothingLayer[]): Designs => ({ ...get().designs, [kind]: normalizeGroups(layers) });

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
    selectedIds: [],
    tool: 'select',
    brush: { color: '#e3242b', size: 6, hardness: 1, opacity: 1, symmetry: false, fillType: 'solid', color2: '#16171b', pattern: 'stripes', patternSize: 6 },
    recentColors: [],
    r15Cal: { ...R15_DEFAULTS },
    showGuides: true,
    snap: true,
    maskEdit: null,
    fillOpts: { tolerance: 12, contiguous: true, expand: 1 },
    setFillOpts: (patch) => set((s) => ({ fillOpts: { ...s.fillOpts, ...patch } })),
    addRegionFill: (img) => {
      const s = get();
      const kind = s.activeKind;
      const spec = TEMPLATES[kind];
      const layer = { ...(makeLayer(kind, 'image', 'all', img) as ImageLayer), name: 'Filled area', x: spec.width / 2, y: spec.height / 2, w: spec.width, h: spec.height };
      commit('Filled an area', withLayers(kind, [...s.designs[kind], layer]), undefined, [kind], [...s.images, img]);
      set({ selectedId: layer.id, selectedIds: [layer.id] });
      return layer.id;
    },
    puffiness: 0,
    viewMode: 'split',
    shown: { shirt: true, pants: true, tshirt: true },
    revision: 0,
    imageRev: 0,
    designVersion: { shirt: 0, pants: 0, tshirt: 0 },
    past: [],
    future: [],
    lastKey: null,
    lastTime: 0,

    setR15Cal: (patch) => {
      const next = setR15Calibration(patch === 'reset' ? { ...R15_DEFAULTS } : patch);
      set((s) => ({ r15Cal: { ...next }, revision: s.revision + 1 }));
      useEditor.getState().touch();
    },

    load: (data) => {
      setR15Calibration(data.r15 ?? { ...R15_DEFAULTS });
      set((s) => ({ r15Cal: { ...getR15Calibration() },
        designs: { shirt: data.designs?.shirt ?? [], pants: data.designs?.pants ?? [], tshirt: data.designs?.tshirt ?? [] },
        images: data.images ?? [],
        activeKind: data.activeKind ?? 'shirt',
        selectedId: null,
        selectedIds: [],
        tool: 'select',
        past: [],
        future: [],
        lastKey: null,
        revision: s.revision + 1,
        imageRev: s.imageRev + 1,
        designVersion: { shirt: s.designVersion.shirt + 1, pants: s.designVersion.pants + 1, tshirt: s.designVersion.tshirt + 1 },
      }));
    },

    serialize: () => {
      const s = get();
      const r15 = getR15Calibration();
      const isDefault = r15.torsoLower === R15_DEFAULTS.torsoLower && r15.limbUpper === R15_DEFAULTS.limbUpper && r15.limbLower === R15_DEFAULTS.limbLower;
      return { version: 1, designs: s.designs, images: s.images, activeKind: s.activeKind, ...(isDefault ? {} : { r15: { ...r15 } }) };
    },

    setActiveKind: (activeKind) => set({ activeKind, selectedId: null, selectedIds: [], tool: 'select', maskEdit: null }),
    select: (selectedId) => set((s) => ({ selectedId, selectedIds: selectedId ? [selectedId] : [], maskEdit: s.maskEdit && s.maskEdit === selectedId ? s.maskEdit : null })),
    setMaskEdit: (id) =>
      set((s) => {
        if (id === null) return { maskEdit: null };
        const layer = s.designs[s.activeKind].find((l) => l.id === id);
        if (!layer?.mask) return {};
        // painting a mask needs a brush: switch to it so Edit mask does something right away
        return { maskEdit: id, selectedId: id, selectedIds: [id], tool: s.tool === 'brush' || s.tool === 'eraser' ? s.tool : 'brush' };
      }),
    addMask: (id) => {
      const s = get();
      const kind = findKind(id);
      const layer = kind ? s.designs[kind].find((l) => l.id === id) : null;
      if (!kind || !layer || layer.mask) return;
      const layers = s.designs[kind].map((l) => (l.id === id ? ({ ...l, mask: { strokes: [], invert: false, enabled: true } } as ClothingLayer) : l));
      commit(`Added a mask to ${layer.name}`, withLayers(kind, layers), undefined, [kind]);
      get().setMaskEdit(id);
    },
    removeMask: (id) => {
      const s = get();
      const kind = findKind(id);
      const layer = kind ? s.designs[kind].find((l) => l.id === id) : null;
      if (!kind || !layer?.mask) return;
      const layers = s.designs[kind].map((l) => {
        if (l.id !== id) return l;
        const { mask: _gone, ...rest } = l;
        return rest as ClothingLayer;
      });
      commit(`Removed the mask from ${layer.name}`, withLayers(kind, layers), undefined, [kind]);
      if (get().maskEdit === id) set({ maskEdit: null });
    },
    clearMask: (id) => {
      const s = get();
      const kind = findKind(id);
      const layer = kind ? s.designs[kind].find((l) => l.id === id) : null;
      if (!kind || !layer?.mask || !layer.mask.strokes.length) return;
      const layers = s.designs[kind].map((l) => (l.id === id ? ({ ...l, mask: { ...l.mask!, strokes: [] } } as ClothingLayer) : l));
      commit(`Cleared the mask on ${layer.name}`, withLayers(kind, layers), undefined, [kind]);
    },
    toggleSelect: (id) =>
      set((s) => {
        const has = s.selectedIds.includes(id);
        const ids = has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id];
        return { selectedIds: ids, selectedId: has ? (ids[ids.length - 1] ?? null) : id };
      }),
    selectRange: (id) =>
      set((s) => {
        const layers = s.designs[s.activeKind];
        const a = layers.findIndex((l) => l.id === (s.selectedId ?? id));
        const b = layers.findIndex((l) => l.id === id);
        if (a < 0 || b < 0) return { selectedId: id, selectedIds: [id] };
        const [lo, hi] = a < b ? [a, b] : [b, a];
        return { selectedIds: layers.slice(lo, hi + 1).map((l) => l.id), selectedId: id };
      }),
    selectMany: (ids) => set({ selectedIds: ids, selectedId: ids[ids.length - 1] ?? null }),
    setTool: (tool) => set({ tool }),
    setBrush: (patch) => set((s) => ({ brush: { ...s.brush, ...patch } })),
    setShowGuides: (showGuides) => set({ showGuides }),
    setSnap: (snap) => set({ snap }),
    nudgeSelected: (dx, dy) => {
      const s = get();
      const all = s.designs[s.activeKind];
      const gi = groupIndex(all);
      const ids = s.selectedIds.filter((id) => {
        const l = all.find((x) => x.id === id);
        if (!l || isGroup(l)) return false;
        const e = effectiveOf(l, gi);
        return !e.locked && e.visible;
      });
      if (ids.length) s.moveLayersBy(ids, dx, dy, 'nudge');
    },
    setPuffiness: (puffiness) => set({ puffiness: Math.max(0, Math.min(0.5, puffiness)) }),
    setViewMode: (viewMode) => set({ viewMode }),
    setShown: (k, v) => set((s) => ({ shown: { ...s.shown, [k]: v } })),

    addBaseImage: (img, fit = 'contain') => {
      const s = get();
      const kind = s.activeKind;
      const spec = TEMPLATES[kind];
      const k = fit === 'exact' ? 1 : Math.min(spec.width / img.width, spec.height / img.height);
      const w = fit === 'exact' ? spec.width : img.width * k;
      const h = fit === 'exact' ? spec.height : img.height * k;
      const layer: ImageLayer = {
        id: `lyr_base${Date.now().toString(36)}`,
        name: `Imported ${spec.label.toLowerCase()}`,
        visible: true,
        locked: false,
        opacity: 1,
        blend: 'normal',
        clip: 'all',
        type: 'image',
        imageId: img.id,
        x: spec.width / 2,
        y: spec.height / 2,
        w,
        h,
        rotation: 0,
        flipX: false,
      };
      // goes to the bottom of the stack so everything you add sits on top of it
      commit(`Imported ${spec.label.toLowerCase()} image`, withLayers(kind, [layer, ...s.designs[kind]]), undefined, [kind]);
      set({ selectedId: layer.id, selectedIds: [layer.id] });
      return layer.id;
    },

    addLayer: (type, opts) => {
      const s = get();
      const layer = makeLayer(s.activeKind, type, opts?.clip, opts?.image);
      commit(`Added ${type} layer`, withLayers(s.activeKind, [...s.designs[s.activeKind], layer]), undefined, [s.activeKind]);
      set({ selectedId: layer.id, selectedIds: [layer.id] });
      return layer.id;
    },

    insertLayers: (layers, replace = false) => {
      const s = get();
      const next = replace ? layers : [...s.designs[s.activeKind], ...layers];
      commit(replace ? 'Applied preset' : 'Added preset layers', withLayers(s.activeKind, next), undefined, [s.activeKind]);
      set({ selectedId: layers[layers.length - 1]?.id ?? null, selectedIds: layers.length ? [layers[layers.length - 1].id] : [] });
    },

    updateLayer: (id, patch, key) => {
      const kind = findKind(id);
      if (!kind) return;
      const s = get();
      const cur = s.designs[kind].find((l) => l.id === id);
      const layers = s.designs[kind].map((l) => (l.id === id ? ({ ...l, ...patch } as ClothingLayer) : l));
      commit(`Edited ${cur?.name ?? 'layer'}`, withLayers(kind, layers), key ?? `${id}:edit`, [kind]);
    },

    removeLayer: (id) => {
      const kind = findKind(id);
      if (!kind) return;
      const s = get();
      const layer = s.designs[kind].find((l) => l.id === id);
      // deleting a group deletes the layers inside it
      const gone = withMembers(s.designs[kind], [id]);
      commit(`Deleted ${layer?.name ?? 'layer'}${gone.size > 1 ? ` and ${gone.size - 1} layer${gone.size === 2 ? '' : 's'}` : ''}`, withLayers(kind, s.designs[kind].filter((l) => !gone.has(l.id))), undefined, [kind]);
      set((st) => ({ selectedId: st.selectedId && gone.has(st.selectedId) ? null : st.selectedId, selectedIds: st.selectedIds.filter((x) => !gone.has(x)) }));
    },

    duplicateLayer: (id) => {
      const kind = findKind(id);
      if (!kind) return null;
      const s = get();
      const idx = s.designs[kind].findIndex((l) => l.id === id);
      const src = s.designs[kind][idx];
      if (isGroup(src)) {
        // a duplicated group brings copies of its layers along
        const gid = `${src.id}_c${Date.now().toString(36)}`;
        const block = s.designs[kind].filter((l) => l.groupId === src.id).map((l, i) => ({ ...l, id: `${l.id}_c${Date.now().toString(36)}${i}`, groupId: gid }) as ClothingLayer);
        const header = { ...src, id: gid, name: `${src.name} copy` } as ClothingLayer;
        const all = [...s.designs[kind]];
        const end = idx + 1 + block.length;
        all.splice(end, 0, header, ...block);
        commit(`Duplicated ${src.name}`, withLayers(kind, all), undefined, [kind]);
        set({ selectedId: gid, selectedIds: [gid] });
        return gid;
      }
      const copy = { ...src, id: `${src.id}_c${Date.now().toString(36)}`, name: `${src.name} copy` } as ClothingLayer;
      if (copy.type === 'image' || copy.type === 'text' || copy.type === 'shape') {
        (copy as ImageLayer | TextLayer | ShapeLayer).x += 8;
        (copy as ImageLayer | TextLayer | ShapeLayer).y += 8;
      }
      if (copy.type === 'paint') (copy as PaintLayer).strokes = [...copy.strokes];
      const layers = [...s.designs[kind]];
      layers.splice(idx + 1, 0, copy);
      commit(`Duplicated ${src.name}`, withLayers(kind, layers), undefined, [kind]);
      set({ selectedId: copy.id, selectedIds: [copy.id] });
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
      // a mask is painted for one side only, so the mirrored copy starts without one
      delete copy.mask;
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
      set({ selectedId: copy.id, selectedIds: [copy.id] });
      return copy.id;
    },

    removeLayers: (ids) => {
      const s = get();
      const kind = s.activeKind;
      const gone = withMembers(s.designs[kind], ids);
      const layers = s.designs[kind].filter((l) => !gone.has(l.id));
      if (layers.length === s.designs[kind].length) return;
      commit(gone.size === 1 ? 'Deleted layer' : `Deleted ${gone.size} layers`, withLayers(kind, layers), undefined, [kind]);
      set({ selectedId: null, selectedIds: [] });
    },

    duplicateLayers: (ids) => {
      const s = get();
      const kind = s.activeKind;
      const layers = [...s.designs[kind]];
      const copies: ClothingLayer[] = [];
      for (const l of s.designs[kind]) {
        if (!ids.includes(l.id) || isGroup(l)) continue;
        const c = { ...l, id: `${l.id}_c${Date.now().toString(36)}${copies.length}`, name: `${l.name} copy` } as ClothingLayer;
        if (c.type === 'image' || c.type === 'text' || c.type === 'shape') {
          (c as ImageLayer | TextLayer | ShapeLayer).x += 8;
          (c as ImageLayer | TextLayer | ShapeLayer).y += 8;
        }
        copies.push(c);
      }
      if (!copies.length) return;
      commit(`Duplicated ${copies.length} layer${copies.length === 1 ? '' : 's'}`, withLayers(kind, [...layers, ...copies]), undefined, [kind]);
      set({ selectedId: copies[copies.length - 1].id, selectedIds: copies.map((c) => c.id) });
    },

    updateLayers: (ids, patch, key) => {
      const s = get();
      const kind = s.activeKind;
      const set_ = new Set(ids);
      const layers = s.designs[kind].map((l) => (set_.has(l.id) ? ({ ...l, ...patch } as ClothingLayer) : l));
      commit(`Edited ${ids.length} layers`, withLayers(kind, layers), key ?? `multi:${Object.keys(patch).join(',')}`, [kind]);
    },

    moveLayersBy: (ids, dx, dy, key) => {
      const s = get();
      const kind = s.activeKind;
      const set_ = new Set(ids);
      const layers = s.designs[kind].map((l) =>
        set_.has(l.id) && (l.type === 'image' || l.type === 'text' || l.type === 'shape') ? ({ ...l, x: l.x + dx, y: l.y + dy } as ClothingLayer) : l,
      );
      commit(`Moved ${ids.length} layers`, withLayers(kind, layers), key ?? `multi:move`, [kind]);
    },

    alignLayers: (ids, how) => {
      const s = get();
      const kind = s.activeKind;
      const items = s.designs[kind].filter((l): l is ImageLayer | TextLayer | ShapeLayer => ids.includes(l.id) && (l.type === 'image' || l.type === 'text' || l.type === 'shape'));
      if (items.length < 2) return;
      const box = (l: ImageLayer | TextLayer | ShapeLayer) => {
        const b = layerBox(l)!;
        return { l, x0: b.cx - b.w / 2, x1: b.cx + b.w / 2, y0: b.cy - b.h / 2, y1: b.cy + b.h / 2 };
      };
      const bs = items.map(box);
      const X0 = Math.min(...bs.map((b) => b.x0));
      const X1 = Math.max(...bs.map((b) => b.x1));
      const Y0 = Math.min(...bs.map((b) => b.y0));
      const Y1 = Math.max(...bs.map((b) => b.y1));
      const patch = new Map<string, { x?: number; y?: number }>();
      for (const b of bs) {
        const w = b.x1 - b.x0;
        const h = b.y1 - b.y0;
        const p: { x?: number; y?: number } = {};
        if (how === 'left') p.x = X0 + w / 2;
        if (how === 'right') p.x = X1 - w / 2;
        if (how === 'center') p.x = (X0 + X1) / 2;
        if (how === 'top') p.y = Y0 + h / 2;
        if (how === 'bottom') p.y = Y1 - h / 2;
        if (how === 'middle') p.y = (Y0 + Y1) / 2;
        patch.set(b.l.id, p);
      }
      const layers = s.designs[kind].map((l) => (patch.has(l.id) ? ({ ...l, ...patch.get(l.id) } as ClothingLayer) : l));
      commit(`Aligned ${items.length} layers (${how})`, withLayers(kind, layers), undefined, [kind]);
    },

    copyLayersToKind: (ids, target) => {
      const s = get();
      const from = s.activeKind;
      if (from === target) return 0;
      if (from === 'tshirt' || target === 'tshirt') {
        useUI.getState().toast('warn', 'T-shirts use a different canvas, so layers cannot be copied to or from them.');
        return 0;
      }
      // folders do not travel between templates: their layers arrive as plain layers
      const src = s.designs[from].filter((l) => !isGroup(l) && (ids === 'all' || ids.includes(l.id) || (!!l.groupId && ids.includes(l.groupId))));
      if (!src.length) return 0;
      const copies = src.map((l, i) => ({ ...l, groupId: undefined, id: `${l.id}_to${target}${Date.now().toString(36)}${i}`, name: `${l.name} (from ${TEMPLATES[from].label})`, clip: translateClip(l.clip, from, target) }) as ClothingLayer);
      const designs = { ...s.designs, [target]: [...s.designs[target], ...copies] };
      commit(`Copied ${copies.length} layer${copies.length === 1 ? '' : 's'} to ${TEMPLATES[target].label}`, designs, undefined, [target]);
      return copies.length;
    },

    jumpHistory: (steps) => {
      // positive = redo that many actions, negative = undo
      for (let i = 0; i < Math.abs(steps); i++) (steps < 0 ? get().undo() : get().redo());
    },

    moveLayer: (id, delta) => {
      const kind = findKind(id);
      if (!kind) return;
      const layers = get().designs[kind];
      const i = layers.findIndex((l) => l.id === id);
      const j = Math.max(0, Math.min(layers.length - 1, i + delta));
      if (i === j) return;
      const next = reorderLayers(layers, id, j);
      if (next !== layers) commit('Reordered layers', withLayers(kind, next), undefined, [kind]);
    },

    reorderLayer: (id, toIndex) => {
      const kind = findKind(id);
      if (!kind) return;
      const layers = get().designs[kind];
      const next = reorderLayers(layers, id, toIndex);
      if (next !== layers) commit('Reordered layers', withLayers(kind, next), undefined, [kind]);
    },

    groupSelected: () => {
      const s = get();
      const kind = s.activeKind;
      const res = groupLayers(s.designs[kind], s.selectedIds);
      if (!res) return null;
      commit('Grouped layers', withLayers(kind, res.layers), undefined, [kind]);
      set({ selectedId: res.groupId, selectedIds: [res.groupId] });
      return res.groupId;
    },

    ungroupLayer: (groupId) => {
      const s = get();
      const kind = findKind(groupId);
      if (!kind || !isGroup(s.designs[kind].find((l) => l.id === groupId)!)) return;
      const members = s.designs[kind].filter((l) => l.groupId === groupId).map((l) => l.id);
      commit('Ungrouped layers', withLayers(kind, ungroup(s.designs[kind], groupId)), undefined, [kind]);
      set({ selectedId: members[members.length - 1] ?? null, selectedIds: members });
    },

    clearDesign: () => {
      const k = get().activeKind;
      commit(`Cleared ${TEMPLATES[k].label.toLowerCase()} design`, withLayers(k, []), undefined, [k]);
      set({ selectedId: null, selectedIds: [] });
    },

    beginStroke: (stroke) => {
      const ms = get();
      if (ms.maskEdit) {
        const kind = ms.activeKind;
        const target = ms.designs[kind].find((l) => l.id === ms.maskEdit);
        if (target?.mask) {
          // the brush hides, the eraser reveals; the colour is irrelevant for a mask
          const full: Stroke = { ...stroke, color: '#000000', hardness: stroke.hardness ?? ms.brush.hardness, alpha: stroke.alpha ?? ms.brush.opacity };
          const strokes = [...target.mask.strokes, full];
          const index = strokes.length - 1;
          const layers = ms.designs[kind].map((l) => (l.id === target.id ? ({ ...l, mask: { ...target.mask!, strokes } } as ClothingLayer) : l));
          commit(stroke.erase ? 'Revealed' : 'Masked', withLayers(kind, layers), undefined, [kind]);
          set({ lastKey: `stroke:${target.id}:mask${index}`, lastTime: Date.now() });
          return { layerId: target.id, index, mirrorIndex: null };
        }
        set({ maskEdit: null });
      }
      const s = get();
      const kind = s.activeKind;
      const layers = s.designs[kind];
      const b = s.brush;
      const fill: Stroke['fill'] = stroke.erase || b.fillType === 'solid' ? undefined : b.fillType === 'pattern' ? { type: 'pattern', pattern: b.pattern, color2: b.color2, size: b.patternSize } : { type: 'gradient', color2: b.color2 };
      const full: Stroke = { ...stroke, hardness: stroke.hardness ?? b.hardness, alpha: stroke.alpha ?? b.opacity, ...(fill ? { fill } : {}) };
      const gi = groupIndex(layers);
      let target = layers.find((l) => l.id === s.selectedId && l.type === 'paint' && !effectiveOf(l, gi).locked) as PaintLayer | undefined;
      let next = layers;
      if (!target) {
        target = makeLayer(kind, 'paint') as PaintLayer;
        next = [...layers, target];
      }
      const strokes = [...target.strokes, full];
      const index = strokes.length - 1;
      let mirrorIndex: number | null = null;
      if (s.brush.symmetry) {
        const mp = mirrorPoint(kind, full.points[0]);
        if (mp) {
          strokes.push({ ...full, points: [mp] });
          mirrorIndex = strokes.length - 1;
        }
      }
      const updated: PaintLayer = { ...target, strokes };
      next = next.map((l) => (l.id === updated.id ? updated : l));
      if (!next.some((l) => l.id === updated.id)) next = [...next, updated];
      commit(stroke.erase ? 'Erased' : 'Painted', withLayers(kind, next), undefined, [kind]);
      // later points of this stroke merge into this same undo step
      set({ lastKey: `stroke:${updated.id}:${index}`, lastTime: Date.now() });
      const colors = [stroke.color, ...get().recentColors.filter((c) => c !== stroke.color)].slice(0, 8);
      set({ selectedId: updated.id, selectedIds: [updated.id], recentColors: stroke.erase ? get().recentColors : colors });
      return { layerId: updated.id, index, mirrorIndex };
    },

    extendStroke: (layerId, index, point, mirrorIndex = null) => get().extendStrokeMany(layerId, index, [point], mirrorIndex),

    extendStrokeMany: (layerId, index, points, mirrorIndex = null) => {
      if (!points.length) return;
      const kind = findKind(layerId);
      if (!kind) return;
      const s = get();
      const add = (st: Stroke, pts: [number, number][]): Stroke => {
        const fresh: [number, number][] = [];
        let last = st.points[st.points.length - 1];
        for (const pt of pts) {
          if (last && Math.hypot(last[0] - pt[0], last[1] - pt[1]) < 0.4) continue;
          fresh.push(pt);
          last = pt;
        }
        return fresh.length ? { ...st, points: [...st.points, ...fresh] } : st;
      };
      let changed = false;
      if (s.maskEdit === layerId) {
        const layers = s.designs[kind].map((l) => {
          if (l.id !== layerId || !l.mask || !l.mask.strokes[index]) return l;
          const grown = add(l.mask.strokes[index], points);
          if (grown === l.mask.strokes[index]) return l;
          changed = true;
          const strokes = l.mask.strokes.slice();
          strokes[index] = grown;
          return { ...l, mask: { ...l.mask, strokes } } as ClothingLayer;
        });
        if (changed) commit('Masked', withLayers(kind, layers), `stroke:${layerId}:mask${index}`, [kind]);
        return;
      }
      const layers = s.designs[kind].map((l) => {
        if (l.id !== layerId || l.type !== 'paint') return l;
        const strokes = l.strokes.slice();
        if (!strokes[index]) return l;
        const grown = add(strokes[index], points);
        if (grown !== strokes[index]) changed = true;
        strokes[index] = grown;
        if (mirrorIndex !== null && strokes[mirrorIndex]) {
          const mps = points.map((p) => mirrorPoint(kind, p)).filter((p): p is [number, number] => !!p);
          const mg = add(strokes[mirrorIndex], mps);
          if (mg !== strokes[mirrorIndex]) changed = true;
          strokes[mirrorIndex] = mg;
        }
        return { ...l, strokes };
      });
      if (!changed) return;
      commit('Painted', withLayers(kind, layers), `stroke:${layerId}:${index}`, [kind]);
    },

    addImage: (img) => set((s) => ({ images: [...s.images, img], imageRev: s.imageRev + 1 })),
    removeImage: (id) => {
      const s = get();
      const designs: Designs = { shirt: [], pants: [], tshirt: [] };
      for (const k of KINDS) designs[k] = s.designs[k].filter((l) => !(l.type === 'image' && l.imageId === id));
      // the library change goes through history, so undo restores the image together with its layers
      commit('Removed image', designs, undefined, KINDS, s.images.filter((i) => i.id !== id));
      set((st) => keepSelection(st, designs));
    },

    removeUnusedImages: () => {
      const s = get();
      const gone = new Set(unusedClothingImageIds(s.designs, s.images));
      if (!gone.size) return 0;
      commit(`Removed ${gone.size} unused image${gone.size === 1 ? '' : 's'}`, s.designs, undefined, [], s.images.filter((i) => !gone.has(i.id)));
      return gone.size;
    },

    replaceImages: (updates) => {
      if (!updates.length) return;
      const byId = new Map(updates.map((u) => [u.id, u]));
      set((s) => ({
        images: s.images.map((i) => (byId.has(i.id) ? { ...i, ...byId.get(i.id)! } : i)),
        imageRev: s.imageRev + 1,
        revision: s.revision + 1,
      }));
      touch();
    },

    undo: () => {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      const kind = changedKind(s.designs, prev.designs, s.activeKind);
      const switched = !!kind && kind !== s.activeKind;
      set({
        designs: prev.designs,
        past: s.past.slice(0, -1),
        future: [{ designs: s.designs, label: prev.label, ...(prev.images ? { images: s.images } : {}) }, ...s.future].slice(0, HISTORY_LIMIT),
        lastKey: null,
        revision: s.revision + 1,
        designVersion: { shirt: s.designVersion.shirt + 1, pants: s.designVersion.pants + 1, tshirt: s.designVersion.tshirt + 1 },
        ...(prev.images ? { images: prev.images, imageRev: s.imageRev + 1 } : {}),
        ...keepSelection(s, prev.designs),
        ...(switched ? { activeKind: kind!, selectedId: null, selectedIds: [] } : {}),
      });
      useUI.getState().log('info', `Undo: ${prev.label}`);
      if (switched) useUI.getState().toast('info', `Undid “${prev.label}” on the ${TEMPLATES[kind!].label.toLowerCase()} tab`);
      touch();
    },

    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      const kind = changedKind(s.designs, next.designs, s.activeKind);
      const switched = !!kind && kind !== s.activeKind;
      set({
        designs: next.designs,
        past: [...s.past, { designs: s.designs, label: next.label, ...(next.images ? { images: s.images } : {}) }].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        lastKey: null,
        revision: s.revision + 1,
        designVersion: { shirt: s.designVersion.shirt + 1, pants: s.designVersion.pants + 1, tshirt: s.designVersion.tshirt + 1 },
        ...(next.images ? { images: next.images, imageRev: s.imageRev + 1 } : {}),
        ...keepSelection(s, next.designs),
        ...(switched ? { activeKind: kind!, selectedId: null, selectedIds: [] } : {}),
      });
      useUI.getState().log('info', `Redo: ${next.label}`);
      if (switched) useUI.getState().toast('info', `Redid “${next.label}” on the ${TEMPLATES[kind!].label.toLowerCase()} tab`);
      touch();
    },
  };
});

export function selectedLayer(s: ClothingState): ClothingLayer | null {
  if (!s.selectedId) return null;
  return s.designs[s.activeKind].find((l) => l.id === s.selectedId) ?? null;
}
