import type { CSSProperties } from 'react';
import type { MaterialPreset } from '../assets/materials';

/** CSS approximation of a preset (a lit sphere) so presets are recognisable without a WebGL context each. */
export function MaterialSwatch({ preset, color }: { preset: MaterialPreset; color?: string }) {
  const base = color ?? preset.color ?? '#c9ccd3';
  let bg: string;
  const style: CSSProperties = {};
  if (preset.id === 'chrome') {
    bg = 'linear-gradient(160deg,#fff 0%,#9aa3b5 38%,#2b2f3a 50%,#c9d0de 62%,#fff 100%)';
  } else if (preset.id === 'gold') {
    bg = 'radial-gradient(circle at 32% 28%,#fff3b0 0%,#ffc43a 38%,#a56a00 100%)';
  } else if (preset.id === 'metal') {
    bg = `linear-gradient(150deg,#f2f4f8 0%,${base} 35%,#30343d 70%,${base} 100%)`;
  } else if (preset.id === 'glass') {
    bg = 'radial-gradient(circle at 32% 28%,rgba(255,255,255,0.85) 0%,rgba(150,190,230,0.35) 45%,rgba(60,90,130,0.25) 100%)';
    style.border = '1px solid rgba(180,200,230,0.5)';
  } else if (preset.id === 'neon') {
    bg = `radial-gradient(circle at 50% 50%,#fff 0%,${base} 45%,${base} 100%)`;
    style.boxShadow = `0 0 12px ${base}`;
  } else if (preset.id === 'matte') {
    bg = `radial-gradient(circle at 40% 36%,${base} 0%,${base} 60%,#555 100%)`;
  } else {
    bg = `radial-gradient(circle at 32% 28%,#fff 0%,${base} 22%,#3a3d46 100%)`;
  }
  return <span className="mat-swatch" style={{ background: bg, ...style }} />;
}
