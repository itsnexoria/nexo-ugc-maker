import { create } from 'zustand';

export type ThemeId = 'nexo' | 'graphite' | 'daylight';
export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  theme: ThemeId;
  showGrid: boolean;
  snap: boolean;
  gridSize: number;
  cameraSensitivity: number;
  autoSave: boolean;
  confirmDelete: boolean;
  shadows: boolean;
  ambient: number;
  environment: boolean;
  envIntensity: number;
  quality: Quality;
  displayName: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'nexo',
  showGrid: true,
  snap: false,
  gridSize: 0.5,
  cameraSensitivity: 1,
  autoSave: true,
  confirmDelete: true,
  shadows: true,
  ambient: 0.35,
  environment: true,
  envIntensity: 0.9,
  quality: 'medium',
  displayName: 'Creator',
};

const KEY = 'nexo-ugc-settings-v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore corrupt settings */
  }
  return DEFAULT_SETTINGS;
}

interface SettingsState extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  set: (key, value) => {
    set({ [key]: value } as Partial<SettingsState>);
    persist(get());
  },
  reset: () => {
    set({ ...DEFAULT_SETTINGS });
    persist(get());
  },
}));

function persist(s: Settings) {
  const data: Settings = {
    theme: s.theme,
    showGrid: s.showGrid,
    snap: s.snap,
    gridSize: s.gridSize,
    cameraSensitivity: s.cameraSensitivity,
    autoSave: s.autoSave,
    confirmDelete: s.confirmDelete,
    shadows: s.shadows,
    ambient: s.ambient,
    environment: s.environment,
    envIntensity: s.envIntensity,
    quality: s.quality,
    displayName: s.displayName,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage may be full or blocked */
  }
}

export function applyTheme(theme: ThemeId) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
}
