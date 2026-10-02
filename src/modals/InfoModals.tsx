import { Modal } from '../components/ui/Overlays';
import { useUI } from '../store/ui';

const SHORTCUTS: [string, string][] = [
  ['Ctrl + Z', 'Undo'],
  ['Ctrl + Y  /  Ctrl + Shift + Z', 'Redo'],
  ['Ctrl + S', 'Save project'],
  ['Delete', 'Delete selected object'],
  ['Ctrl + D', 'Duplicate selected object'],
  ['F', 'Focus selected object'],
  ['F2', 'Rename selected object'],
  ['V  W  E  R', 'Select, move, rotate, scale'],
  ['G  /  X', 'Toggle grid / snap to grid'],
  ['L  /  Z', 'Toggle lighting / wireframe'],
  ['1 – 5', 'Camera: front, back, left, right, 3/4'],
  ['Home', 'Reset camera'],
  ['P', 'Preview mode'],
  ['Esc', 'Deselect, or leave preview'],
  ['Right-click', 'Object menu in the viewport and scene list'],
];

export function ShortcutsModal() {
  const close = useUI((s) => s.closeModal);
  return (
    <Modal title="Keyboard shortcuts" size="narrow" onClose={close}>
      <table className="grid-table plain">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}>
              <td>
                {k.split('  ').map((p, i) => (
                  <span key={i} className="kbd" style={{ marginRight: 4 }}>
                    {p.trim()}
                  </span>
                ))}
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: 10 }}>
        Mouse: left-drag orbits, right-drag pans, scroll zooms. Drag the labels X, Y, Z in number fields to scrub values.
      </p>
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
          Nexo UGC Studio by Nexoria. A browser-based editor for designing Roblox UGC accessories from primitive shapes, previewing them on an R6 or R15 mannequin, and exporting GLB, glTF or OBJ.
        </p>
        <p className="hint">Projects are stored in this browser (IndexedDB). Nothing is uploaded. It does not create Roblox-native files.</p>
      </div>
    </Modal>
  );
}
