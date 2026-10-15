import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/ui/Overlays';
import { comboFromEvent, comboParts, formatCombo, isReservedCombo } from '../commands/keys';
import { conflictFor, effectiveKeys, getCommands, withBinding, type CommandScreen } from '../commands/registry';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { useEditor } from '../store/editor';

const MOUSE_NOTES: Record<'editor' | 'clothing', [string, string][]> = {
  editor: [
    ['Left-drag / right-drag / scroll', 'Orbit / pan / zoom the viewport'],
    ['Right-click', 'Object menu in the viewport and scene list'],
    ['Drag X, Y, Z labels', 'Scrub values in number fields'],
  ],
  clothing: [
    ['Shift / Ctrl + click', 'Select a range / add to selection'],
    ['Space + drag, scroll', 'Pan, zoom the template'],
    ['Shift (while rotating)', 'Snap rotation to 15°'],
  ],
};

function Keycaps({ combo }: { combo: string }) {
  return (
    <>
      {comboParts(combo).map((p, i) => (
        <span key={i} className="kbd" style={{ marginRight: 4 }}>
          {p}
        </span>
      ))}
    </>
  );
}

export function ShortcutsModal() {
  const close = useUI((s) => s.closeModal);
  const screen = useEditor((s) => (s.screen === 'clothing' ? 'clothing' : 'editor')) as CommandScreen;
  const overrides = useSettings((s) => s.shortcuts);
  const setSetting = useSettings((s) => s.set);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const commands = useMemo(() => getCommands().filter((c) => c.screens.includes(screen) && (c.keys?.length || Object.prototype.hasOwnProperty.call(overrides, c.id))), [screen, overrides]);
  const all = useMemo(() => getCommands(), []);
  const groups = useMemo(() => [...new Set(commands.map((c) => c.group))], [commands]);

  useEffect(() => {
    if (!capturing) return;
    document.body.dataset.recordingKey = '1';
    const cmd = all.find((c) => c.id === capturing);
    const onKey = (e: KeyboardEvent) => {
      const combo = comboFromEvent(e);
      if (!combo) return; // just a modifier so far
      e.preventDefault();
      e.stopPropagation();
      if (combo === 'escape') {
        setCapturing(null);
        setMessage(null);
        return;
      }
      if (!cmd) return;
      if (isReservedCombo(combo)) {
        setMessage(`${formatCombo(combo)} is used by the browser or the command palette. Try another key.`);
        return;
      }
      const clash = conflictFor(all, combo, cmd.id, screen, overrides);
      if (clash) {
        setMessage(`${formatCombo(combo)} is already used by “${clash.title}”. Change that one first, or pick another key.`);
        return;
      }
      setSetting('shortcuts', withBinding(overrides, cmd, combo));
      setCapturing(null);
      setMessage(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      delete document.body.dataset.recordingKey;
    };
  }, [capturing, all, overrides, screen, setSetting]);

  return (
    <Modal
      title="Keyboard shortcuts"
      size="narrow"
      onClose={close}
      footer={
        <>
          <span className="hint grow">Press Ctrl + K anywhere to search every command.</span>
          <button className="btn" disabled={!Object.keys(overrides).length} onClick={() => setSetting('shortcuts', {})}>
            Reset all
          </button>
        </>
      }
    >
      <div aria-live="polite" className="hint" style={{ minHeight: 18, color: message ? 'var(--warn)' : undefined }}>
        {capturing ? message ?? 'Press the new key combination, or Esc to cancel.' : 'Click Change to give a command a different key.'}
      </div>
      {groups.map((g) => (
        <div key={g}>
          <h3 className="panel-title" style={{ marginTop: 10 }}>
            {g}
          </h3>
          <table className="grid-table plain">
            <tbody>
              {commands
                .filter((c) => c.group === g)
                .map((c) => {
                  const keys = effectiveKeys(c, overrides);
                  const changed = Object.prototype.hasOwnProperty.call(overrides, c.id);
                  return (
                    <tr key={c.id}>
                      <td style={{ width: '38%' }}>{keys.length ? keys.map((k, i) => <span key={k}>{i > 0 && <span className="dim" style={{ marginRight: 4 }}>or</span>}<Keycaps combo={k} /></span>) : <span className="dim">not set</span>}</td>
                      <td>{c.title}</td>
                      <td className="r" style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn sm" aria-label={`Change the shortcut for ${c.title}`} aria-pressed={capturing === c.id} onClick={() => (setMessage(null), setCapturing(capturing === c.id ? null : c.id))}>
                          {capturing === c.id ? 'Press a key…' : 'Change'}
                        </button>
                        {changed && (
                          <button className="btn sm" aria-label={`Reset the shortcut for ${c.title}`} onClick={() => setSetting('shortcuts', withBinding(overrides, c, null))}>
                            Reset
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      ))}
      <h3 className="panel-title" style={{ marginTop: 10 }}>
        Mouse
      </h3>
      <table className="grid-table plain">
        <tbody>
          {MOUSE_NOTES[screen].map(([k, d]) => (
            <tr key={k}>
              <td style={{ width: '38%' }}>{k}</td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function AboutModal() {
  const close = useUI((s) => s.closeModal);
  return (
    <Modal title="About" size="narrow" onClose={close}>
      <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 12 }}>
        <img src={`${import.meta.env.BASE_URL}brand/ugclogo-original.png`} alt="Nexo UGC Studio by Nexoria" width={200} height={200} style={{ background: '#fff', border: '1px solid var(--border)' }} />
        <p className="dim">
          Nexo UGC Studio by Nexoria. A browser-based editor for designing Roblox UGC accessories from primitive shapes, and for painting classic shirts, pants and T-shirts on a live 3D mannequin. Exports GLB, glTF, OBJ and clothing PNGs.
        </p>
        <p className="hint">Projects are stored in this browser (IndexedDB). Nothing is uploaded. It does not create Roblox-native files.</p>
      </div>
    </Modal>
  );
}
