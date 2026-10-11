import { create } from 'zustand';

/** Preview-only settings for checking an item against different bodies and outfits. Never exported. */
export type Outfit = 'none' | 'tee-jeans' | 'hoodie-track' | 'jacket-cargo' | 'formal';
export type Headwear = 'none' | 'short-hair' | 'long-hair' | 'beanie';

export const SKIN_TONES = [
  { id: 'mannequin', label: 'Mannequin', color: null },
  { id: 'pale', label: 'Pale', color: '#f6d7c3' },
  { id: 'light', label: 'Light', color: '#ffdbac' },
  { id: 'fair', label: 'Fair', color: '#f1c27d' },
  { id: 'tan', label: 'Tan', color: '#c68642' },
  { id: 'brown', label: 'Brown', color: '#8d5524' },
  { id: 'deep', label: 'Deep', color: '#5c3a21' },
  { id: 'dark', label: 'Dark', color: '#3b2219' },
] as const;

export const BODY_PRESETS = [
  { id: 'normal', label: 'Normal', height: 1, width: 1, head: 1 },
  { id: 'slender', label: 'Slender', height: 1.05, width: 0.75, head: 0.95 },
  { id: 'wide', label: 'Wide', height: 0.95, width: 1.1, head: 1.05 },
  { id: 'tall', label: 'Tall', height: 1.1, width: 0.9, head: 1 },
  { id: 'short', label: 'Short', height: 0.88, width: 0.95, head: 1.1 },
] as const;

interface Fit {
  skin: string;
  height: number;
  width: number;
  head: number;
  outfit: Outfit;
  headwear: Headwear;
}

const DEFAULT: Fit = { skin: 'mannequin', height: 1, width: 1, head: 1, outfit: 'none', headwear: 'none' };
const KEY = 'nexo-testfit-v1';

function load(): Fit {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as Partial<Fit>) };
  } catch {
    /* ignore */
  }
  return DEFAULT;
}

interface State extends Fit {
  set: (patch: Partial<Fit>) => void;
  reset: () => void;
}

export const useTestFit = create<State>((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch);
    const { skin, height, width, head, outfit, headwear } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ skin, height, width, head, outfit, headwear }));
    } catch {
      /* ignore */
    }
  },
  reset: () => get().set(DEFAULT),
}));

export const isFitActive = (f: Pick<Fit, 'height' | 'width' | 'head'>) => f.height !== 1 || f.width !== 1 || f.head !== 1;
