import { create } from 'zustand';
import type { AssetCategory, PartSpec, SlotId, UserAsset } from '../types';
import { uid } from '../utils/ids';

const KEY = 'nexo-ugc-user-assets-v1';

function load(): UserAsset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UserAsset[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

interface State {
  assets: UserAsset[];
  add: (name: string, category: AssetCategory, slot: SlotId, spec: PartSpec) => boolean;
  remove: (id: string) => void;
}

export const useUserAssets = create<State>((set, get) => ({
  assets: load(),
  add: (name, category, slot, spec) => {
    const asset: UserAsset = { id: uid('asset'), name, category, slot, spec, createdAt: Date.now() };
    const next = [...get().assets, asset];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      return false;
    }
    set({ assets: next });
    return true;
  },
  remove: (id) => {
    const next = get().assets.filter((a) => a.id !== id);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    set({ assets: next });
  },
}));
