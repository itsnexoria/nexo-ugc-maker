import { useEffect, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { BODY_PRESETS, SKIN_TONES, useTestFit, type Headwear, type Outfit } from '../store/testfit';
import { SliderField } from './ui/Fields';
import { Tip } from './ui/Tooltip';

/** Popover with preview-only body, skin, outfit and headwear controls. */
export function TestFitButton({ align = 'right' }: { align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useTestFit();
  const changed = t.skin !== 'mannequin' || t.height !== 1 || t.width !== 1 || t.head !== 1 || t.outfit !== 'none' || t.headwear !== 'none';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="testfit" ref={ref}>
      <Tip label="Test fit: try other bodies, skin tones, outfits and hair">
        <button className={`btn boxed-btn ${changed ? 'is-on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <UserRound size={14} /> Test fit{changed ? ' •' : ''}
        </button>
      </Tip>
      {open && (
        <div className={`testfit-pop ${align}`} role="dialog" aria-label="Test fit">
          <div className="field">
            <span className="field-label">Skin tone</span>
            <div className="swatches" style={{ paddingLeft: 0 }}>
              {SKIN_TONES.map((s) => (
                <button
                  key={s.id}
                  className={`swatch big ${t.skin === s.id ? 'on' : ''}`}
                  style={{ background: s.color ?? 'repeating-linear-gradient(45deg,#9aa0ab 0 4px,#c7cbd4 4px 8px)' }}
                  aria-label={s.label}
                  aria-pressed={t.skin === s.id}
                  title={s.label}
                  onClick={() => t.set({ skin: s.id })}
                />
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Body</span>
            <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
              {BODY_PRESETS.map((b) => (
                <button key={b.id} className={`btn sm ${t.height === b.height && t.width === b.width && t.head === b.head ? 'is-on' : ''}`} onClick={() => t.set({ height: b.height, width: b.width, head: b.head })}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <SliderField label="Height" value={t.height} min={0.85} max={1.15} step={0.01} onChange={(v) => t.set({ height: v })} />
          <SliderField label="Width" value={t.width} min={0.7} max={1.15} step={0.01} onChange={(v) => t.set({ width: v })} />
          <SliderField label="Head" value={t.head} min={0.85} max={1.2} step={0.01} onChange={(v) => t.set({ head: v })} />
          <div className="row">
            <label className="dim" style={{ width: 72 }} htmlFor="tf-outfit">
              Outfit
            </label>
            <select id="tf-outfit" className="select" value={t.outfit} onChange={(e) => t.set({ outfit: e.target.value as Outfit })}>
              <option value="none">None (bare mannequin)</option>
              <option value="tee-jeans">Tee and jeans</option>
              <option value="hoodie-track">Hoodie and track pants</option>
              <option value="jacket-cargo">Jacket and cargo pants</option>
              <option value="formal">White shirt and black pants</option>
            </select>
          </div>
          <div className="row">
            <label className="dim" style={{ width: 72 }} htmlFor="tf-head">
              Headwear
            </label>
            <select id="tf-head" className="select" value={t.headwear} onChange={(e) => t.set({ headwear: e.target.value as Headwear })}>
              <option value="none">None</option>
              <option value="short-hair">Short hair</option>
              <option value="long-hair">Long hair</option>
              <option value="beanie">Beanie</option>
            </select>
          </div>
          <div className="row">
            <button className="btn sm" onClick={() => t.reset()} disabled={!changed}>
              Reset
            </button>
            <span className="hint grow">Preview only. It never changes your project or exports. Real avatars vary, so treat it as a quick sanity check.</span>
          </div>
        </div>
      )}
    </div>
  );
}
