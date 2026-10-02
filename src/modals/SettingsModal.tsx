import { useState } from 'react';
import { Modal } from '../components/ui/Overlays';
import { SliderField, SwitchRow, NumberField } from '../components/ui/Fields';
import { applyTheme, useSettings, type Quality, type ThemeId } from '../store/settings';
import { useUI } from '../store/ui';

type Tab = 'editor' | 'viewport' | 'performance';

const THEMES: { id: ThemeId; name: string; note: string }[] = [
  { id: 'nexo', name: 'Nexo Dark', note: 'Near-black with red accents' },
  { id: 'graphite', name: 'Graphite', note: 'Softer blue-grey dark' },
  { id: 'daylight', name: 'Daylight', note: 'Light interface' },
];

const QUALITY: { id: Quality; name: string; note: string }[] = [
  { id: 'low', name: 'Low', note: 'No anti-aliasing, 512 px shadows, 1× pixel ratio. For older laptops.' },
  { id: 'medium', name: 'Medium', note: 'Anti-aliasing, 1024 px shadows, up to 1.5× pixel ratio.' },
  { id: 'high', name: 'High', note: 'Anti-aliasing, 2048 px shadows, up to 2× pixel ratio.' },
];

export function SettingsModal() {
  const close = useUI((s) => s.closeModal);
  const st = useSettings();
  const [tab, setTab] = useState<Tab>('editor');

  return (
    <Modal
      title="Settings"
      onClose={close}
      footer={
        <>
          <button
            className="btn"
            onClick={() => {
              st.reset();
              applyTheme('nexo');
            }}
          >
            Reset to defaults
          </button>
          <div className="grow" />
          <button className="btn primary" onClick={close}>
            Done
          </button>
        </>
      }
    >
      <div className="tabs" role="tablist" style={{ margin: '-16px -16px 14px' }}>
        {(['editor', 'viewport', 'performance'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'editor' && (
        <div className="col" style={{ gap: 14 }}>
          <div className="field">
            <span className="field-label">Theme</span>
            <div className="radio-cards three" role="radiogroup" aria-label="Theme">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={st.theme === t.id}
                  className={`radio-card ${st.theme === t.id ? 'on' : ''}`}
                  onClick={() => {
                    st.set('theme', t.id);
                    applyTheme(t.id);
                  }}
                >
                  <strong>{t.name}</strong>
                  <span>{t.note}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <SwitchRow label="Show grid" checked={st.showGrid} onChange={(v) => st.set('showGrid', v)} />
            <SwitchRow label="Snap to grid" hint="Move in grid steps, rotate in 15° steps, scale in 0.1 steps." checked={st.snap} onChange={(v) => st.set('snap', v)} />
            <SwitchRow label="Auto-save" hint="Saves 1.5 seconds after your last change." checked={st.autoSave} onChange={(v) => st.set('autoSave', v)} />
            <SwitchRow label="Confirm before deleting groups" checked={st.confirmDelete} onChange={(v) => st.set('confirmDelete', v)} />
          </div>
          <div className="slider-row" style={{ gridTemplateColumns: '120px 1fr' }}>
            <span className="slider-label">Grid size (studs)</span>
            <div style={{ maxWidth: 120 }}>
              <NumberField value={st.gridSize} step={0.25} min={0.1} max={4} onChange={(v) => st.set('gridSize', v)} />
            </div>
          </div>
          <SliderField labelWidth={110} label="Camera speed" value={st.cameraSensitivity} min={0.3} max={2.5} step={0.05} onChange={(v) => st.set('cameraSensitivity', v)} />
          <div className="field">
            <label htmlFor="display-name">Display name</label>
            <input id="display-name" className="input" maxLength={24} value={st.displayName} onChange={(e) => st.set('displayName', e.target.value)} />
            <span className="hint">Shown on the profile button. Nothing is sent anywhere; projects stay in this browser.</span>
          </div>
        </div>
      )}

      {tab === 'viewport' && (
        <div className="col" style={{ gap: 14 }}>
          <div>
            <SwitchRow label="Shadows" checked={st.shadows} onChange={(v) => st.set('shadows', v)} />
            <SwitchRow label="Environment reflections" hint="Studio lighting reflected in metal and glass." checked={st.environment} onChange={(v) => st.set('environment', v)} />
          </div>
          <SliderField labelWidth={110} label="Ambient light" value={st.ambient} min={0} max={1.5} step={0.05} onChange={(v) => st.set('ambient', v)} />
          <SliderField labelWidth={110} label="Reflections" value={st.envIntensity} min={0} max={2} step={0.05} disabled={!st.environment} onChange={(v) => st.set('envIntensity', v)} />
        </div>
      )}

      {tab === 'performance' && (
        <div className="field">
          <span className="field-label">Render quality</span>
          <div className="radio-cards" role="radiogroup" aria-label="Render quality">
            {QUALITY.map((q) => (
              <button key={q.id} role="radio" aria-checked={st.quality === q.id} className={`radio-card ${st.quality === q.id ? 'on' : ''}`} onClick={() => st.set('quality', q.id)}>
                <strong>{q.name}</strong>
                <span>{q.note}</span>
              </button>
            ))}
          </div>
          <span className="hint">Changing quality restarts the viewport, which keeps your project and camera.</span>
        </div>
      )}
    </Modal>
  );
}
