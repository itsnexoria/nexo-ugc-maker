import { create } from 'zustand';
import type { Vec3 } from '../types';

/** Transform of the object being dragged with the gizmo, so the Properties panel can follow live. */
interface LiveState {
  id: string | null;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  set: (v: Omit<LiveState, 'set' | 'clear'>) => void;
  clear: () => void;
}

export const useLive = create<LiveState>((set) => ({
  id: null,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  set: (v) => set(v),
  clear: () => set({ id: null }),
}));
