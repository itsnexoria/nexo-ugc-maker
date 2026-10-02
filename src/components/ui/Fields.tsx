import { memo, useEffect, useRef, useState } from 'react';
import { clamp, round } from '../../utils/math';

interface NumberFieldProps {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  disabled?: boolean;
  suffix?: string;
  /** Visual tint for the label (e.g. axis colour) */
  tone?: 'x' | 'y' | 'z';
  title?: string;
}

/**
 * Numeric input: type a value, use arrow keys (Shift = x10, Alt = x0.1),
 * or drag the label sideways to scrub. Commits as you scrub, so edits update the viewport live.
 */
export const NumberField = memo(function NumberField({
  value,
  onChange,
  label,
  step = 0.1,
  min = -Infinity,
  max = Infinity,
  precision = 2,
  disabled,
  suffix,
  tone,
  title,
}: NumberFieldProps) {
  const [text, setText] = useState<string | null>(null);
  const scrub = useRef<{ x: number; start: number } | null>(null);

  useEffect(() => setText(null), [value]);

  const commit = (v: number) => {
    if (!Number.isFinite(v)) return;
    onChange(round(clamp(v, min, max), precision + 2));
  };

  const display = text ?? String(round(value, precision));

  return (
    <label className={`numfield ${disabled ? 'disabled' : ''}`} title={title}>
      {label !== undefined && (
        <span
          className={`numfield-label ${tone ?? ''}`}
          onPointerDown={(e) => {
            if (disabled) return;
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            scrub.current = { x: e.clientX, start: value };
          }}
          onPointerMove={(e) => {
            if (!scrub.current) return;
            const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
            commit(scrub.current.start + ((e.clientX - scrub.current.x) / 4) * step * mult);
          }}
          onPointerUp={() => (scrub.current = null)}
          onPointerCancel={() => (scrub.current = null)}
        >
          {label}
        </span>
      )}
      <input
        className="numfield-input num"
        value={display}
        disabled={disabled}
        inputMode="decimal"
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === null) return;
          const v = parseFloat(text.replace(',', '.'));
          if (Number.isFinite(v)) commit(v);
          setText(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(null);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
            commit(value + (e.key === 'ArrowUp' ? 1 : -1) * step * mult);
          }
          e.stopPropagation();
        }}
      />
      {suffix && <span className="numfield-suffix">{suffix}</span>}
    </label>
  );
});

interface SliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  precision?: number;
  labelWidth?: number;
}

export const SliderField = memo(function SliderField({ label, value, onChange, min = 0, max = 1, step = 0.01, disabled, precision = 2, labelWidth }: SliderProps) {
  return (
    <div className="slider-row" style={labelWidth ? { gridTemplateColumns: `${labelWidth}px 1fr 62px` } : undefined}>
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <NumberField value={value} onChange={onChange} step={step} min={min} max={max} precision={precision} disabled={disabled} />
    </div>
  );
});

interface ColorFieldProps {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  disabled?: boolean;
}

export const ColorField = memo(function ColorField({ value, onChange, label, disabled }: ColorFieldProps) {
  const [hex, setHex] = useState<string | null>(null);
  useEffect(() => setHex(null), [value]);
  return (
    <div className="color-row">
      {label && <span className="slider-label">{label}</span>}
      <input type="color" value={value} disabled={disabled} aria-label={label ?? 'Color'} onChange={(e) => onChange(e.target.value)} />
      <input
        className="input num"
        value={hex ?? value}
        disabled={disabled}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => setHex(e.target.value)}
        onBlur={() => {
          if (hex !== null && /^#[0-9a-fA-F]{6}$/.test(hex)) onChange(hex.toLowerCase());
          setHex(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          e.stopPropagation();
        }}
      />
    </div>
  );
});

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="switch-row">
      <div className="grow">
        <div>{label}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
