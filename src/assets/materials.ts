import type { MaterialProps } from '../types';

export const DEFAULT_MATERIAL: MaterialProps = {
  color: '#c9ccd3',
  metalness: 0,
  roughness: 0.55,
  opacity: 1,
  emissive: '#000000',
  emissiveIntensity: 0,
  textureId: null,
  texRepeat: [1, 1],
  texOffset: [0, 0],
  texRotation: 0,
};

export interface MaterialPreset {
  id: string;
  name: string;
  /** Short plain-language description shown under the swatch */
  note: string;
  /** Colour applied by the preset; omit to keep the object's current colour */
  color?: string;
  metalness: number;
  roughness: number;
  opacity: number;
  /** Neon uses the base colour as its glow colour */
  emissiveFromColor?: boolean;
  emissive?: string;
  emissiveIntensity: number;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: 'plastic', name: 'Plastic', note: 'Smooth, slightly glossy', metalness: 0, roughness: 0.42, opacity: 1, emissiveIntensity: 0 },
  { id: 'metal', name: 'Metal', note: 'Brushed metal in the current colour', metalness: 1, roughness: 0.38, opacity: 1, emissiveIntensity: 0 },
  { id: 'gold', name: 'Gold', note: 'Polished gold', color: '#ffc43a', metalness: 1, roughness: 0.22, opacity: 1, emissiveIntensity: 0 },
  { id: 'chrome', name: 'Chrome', note: 'Mirror finish', color: '#eceef2', metalness: 1, roughness: 0.04, opacity: 1, emissiveIntensity: 0 },
  { id: 'glass', name: 'Glass', note: 'Transparent and glossy', metalness: 0, roughness: 0.05, opacity: 0.35, emissiveIntensity: 0 },
  { id: 'neon', name: 'Neon', note: 'Glows in its own colour', metalness: 0, roughness: 0.4, opacity: 1, emissiveFromColor: true, emissiveIntensity: 1.3 },
  { id: 'matte', name: 'Matte', note: 'No shine at all', metalness: 0, roughness: 1, opacity: 1, emissiveIntensity: 0 },
];

export function getPreset(id: string): MaterialPreset | undefined {
  return MATERIAL_PRESETS.find((p) => p.id === id);
}

/** Returns the material with a preset applied. Texture settings are preserved. */
export function applyPresetToMaterial(m: MaterialProps, presetId: string): MaterialProps {
  const p = getPreset(presetId);
  if (!p) return m;
  const color = p.color ?? m.color;
  return {
    ...m,
    color,
    metalness: p.metalness,
    roughness: p.roughness,
    opacity: p.opacity,
    emissive: p.emissiveFromColor ? color : (p.emissive ?? '#000000'),
    emissiveIntensity: p.emissiveIntensity,
    preset: p.id,
  };
}

/** Compact helper for presets/sample content */
export function mat(partial: Partial<MaterialProps> = {}): MaterialProps {
  return { ...DEFAULT_MATERIAL, ...partial };
}

/** Multiplies a #rrggbb colour's brightness (used to give glowing parts a dark diffuse base). */
export function darken(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
