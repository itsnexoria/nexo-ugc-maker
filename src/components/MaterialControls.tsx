import { memo } from 'react';
import { MATERIAL_PRESETS } from '../assets/materials';
import { useEditor } from '../store/editor';
import { ColorField, SliderField } from './ui/Fields';

/** Base colour, preset, metallic, roughness, transparency and emission for one part. */
export const MaterialControls = memo(function MaterialControls({ id }: { id: string }) {
  const m = useEditor((s) => s.objects[id]?.material);
  const locked = useEditor((s) => s.objects[id]?.locked ?? false);
  const setMaterial = useEditor((s) => s.setMaterial);
  const applyPreset = useEditor((s) => s.applyMaterialPreset);
  if (!m) return null;
  const set = (patch: Partial<typeof m>, field: string) => setMaterial(id, patch, `${id}:mat:${field}`);

  return (
    <div className="col" style={{ gap: 7 }}>
      <div className="slider-row" style={{ gridTemplateColumns: '72px 1fr' }}>
        <span className="slider-label">Material</span>
        <select className="select" value={m.preset ?? 'custom'} disabled={locked} aria-label="Material preset" onChange={(e) => e.target.value !== 'custom' && applyPreset(id, e.target.value)}>
          <option value="custom">Custom</option>
          {MATERIAL_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <ColorField label="Color" value={m.color} disabled={locked} onChange={(v) => set({ color: v }, 'color')} />
      <SliderField label="Metallic" value={m.metalness} disabled={locked} onChange={(v) => set({ metalness: v }, 'metalness')} />
      <SliderField label="Roughness" value={m.roughness} disabled={locked} onChange={(v) => set({ roughness: v }, 'roughness')} />
      <SliderField label="Transparency" value={1 - m.opacity} disabled={locked} onChange={(v) => set({ opacity: 1 - v }, 'opacity')} />
      <ColorField label="Emission" value={m.emissive} disabled={locked} onChange={(v) => set({ emissive: v, emissiveIntensity: m.emissiveIntensity || 1 }, 'emissive')} />
      <SliderField label="Glow" value={m.emissiveIntensity} min={0} max={6} step={0.05} disabled={locked} onChange={(v) => set({ emissiveIntensity: v }, 'glow')} />
    </div>
  );
});
