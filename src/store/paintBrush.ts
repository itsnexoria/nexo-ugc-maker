import { create } from 'zustand';

/** Brush used for painting directly on accessory parts. Size is a percentage of the texture width. */
interface BrushState {
  color: string;
  sizePct: number;
  hardness: number;
  opacity: number;
  erase: boolean;
  /** mirror strokes across the accessory's centre line onto the matching left/right part */
  symmetry: boolean;
  recent: string[];
  set: (patch: Partial<Pick<BrushState, 'color' | 'sizePct' | 'hardness' | 'opacity' | 'erase' | 'symmetry'>>) => void;
  use: (color: string) => void;
}

export const usePaintBrush = create<BrushState>((set, get) => ({
  color: '#e3242b',
  sizePct: 5,
  hardness: 0.8,
  opacity: 1,
  erase: false,
  symmetry: false,
  recent: [],
  set: (patch) => set(patch),
  use: (color) => set({ recent: [color, ...get().recent.filter((c) => c !== color)].slice(0, 8) }),
}));
