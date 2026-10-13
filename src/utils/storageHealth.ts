import { create } from 'zustand';
import type { ProjectData } from '../types';

export type StorageLevel = 'ok' | 'warn' | 'critical';

export const WARN_RATIO = 0.8;
export const CRITICAL_RATIO = 0.95;
/** A single project above this is slow to save and to back up. */
export const LARGE_PROJECT_BYTES = 25 * 1024 * 1024;

export function storageLevel(used: number | null, quota: number | null): StorageLevel {
  if (used === null || quota === null || quota <= 0) return 'ok';
  const r = used / quota;
  return r >= CRITICAL_RATIO ? 'critical' : r >= WARN_RATIO ? 'warn' : 'ok';
}

/** Rough size of a project's payload in bytes (images and meshes dominate; the rest is small). */
export function estimateProjectBytes(data: ProjectData): number {
  let n = 0;
  for (const t of data.textures ?? []) n += t.dataUrl?.length ?? 0;
  for (const i of data.clothing?.images ?? []) n += i.dataUrl?.length ?? 0;
  for (const m of Object.values(data.models ?? {})) n += (m.positions?.length ?? 0) + (m.normals?.length ?? 0) + (m.uvs?.length ?? 0) + (m.index?.length ?? 0);
  return n;
}

interface HealthState {
  used: number | null;
  quota: number | null;
  level: StorageLevel;
  projectBytes: number;
  /** the level the user dismissed; the banner returns only if things get worse */
  dismissed: StorageLevel | null;
  lastCheck: number;
  check: (force?: boolean) => Promise<void>;
  setProjectBytes: (n: number) => void;
  dismiss: () => void;
}

const rank: Record<StorageLevel, number> = { ok: 0, warn: 1, critical: 2 };

export const useStorageHealth = create<HealthState>((set, get) => ({
  used: null,
  quota: null,
  level: 'ok',
  projectBytes: 0,
  dismissed: null,
  lastCheck: 0,
  check: async (force = false) => {
    const now = Date.now();
    if (!force && now - get().lastCheck < 20_000) return;
    set({ lastCheck: now });
    try {
      const est = await navigator.storage?.estimate?.();
      const used = est?.usage ?? null;
      const quota = est?.quota ?? null;
      const level = storageLevel(used, quota);
      const dismissed = get().dismissed && rank[level] > rank[get().dismissed!] ? null : get().dismissed;
      set({ used, quota, level, dismissed });
    } catch {
      /* estimate is optional */
    }
  },
  setProjectBytes: (projectBytes) => set({ projectBytes }),
  dismiss: () => set((s) => ({ dismissed: s.level })),
}));

/** True when the banner should mention storage (full disk or an oversized project). */
export function storageNeedsAttention(s: Pick<HealthState, 'level' | 'projectBytes' | 'dismissed'>): boolean {
  if (s.dismissed !== null && rank[s.dismissed] >= rank[s.level]) return false;
  return s.level !== 'ok' || s.projectBytes >= LARGE_PROJECT_BYTES;
}
