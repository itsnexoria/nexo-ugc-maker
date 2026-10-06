import { Modal } from '../components/ui/Overlays';
import { useUI } from '../store/ui';
import { useEditor } from '../store/editor';

const SHORTCUTS: [string, string][] = [
  ['Ctrl + Z', 'Undo'],
  ['Ctrl + Y  /  Ctrl + Shift + Z', 'Redo'],
  ['Ctrl + S', 'Save project'],
  ['Delete', 'Delete selected object'],
  ['Ctrl + D', 'Duplicate selected object'],
  ['F', 'Focus selected object'],
  ['F2', 'Rename selected object'],
  ['V  W  E  R  B', 'Select, move, rotate, scale, paint'],
  ['G  /  X', 'Toggle grid / snap to grid'],
  ['L  /  Z', 'Toggle lighting / wireframe'],
  ['1 – 5', 'Camera: front, back, left, right, 3/4'],
  ['Home', 'Reset camera'],
  ['P', 'Preview mode'],
  ['Esc', 'Deselect, or leave preview'],
  ['Right-click', 'Object menu in the viewport and scene list'],
];

const CLOTHING_SHORTCUTS: [string, string][] = [
  ['Ctrl + Z', 'Undo'],
  ['Ctrl + Y  /  Ctrl + Shift + Z', 'Redo'],
  ['Ctrl + S', 'Save project'],
  ['Ctrl + D', 'Duplicate selected layer'],
  ['Delete', 'Delete selected layer'],
  ['V', 'Select and move layers'],
  ['P', 'Place on model (click the 3D model)'],
  ['B  /  E', 'Brush / eraser'],
  ['T', 'Add text'],
  ['Space + drag', 'Pan the template'],
  ['Scroll', 'Zoom the template'],
  ['Shift (while rotating)', 'Snap rotation to 15°'],
  ['Esc', 'Deselect and return to Select'],
];

export function ShortcutsModal() {
  const close = useUI((s) => s.closeModal);
  const clothing = useEditor((s) => s.screen === 'clothing');
  return (
    <Modal title="Keyboard shortcuts" size="narrow" onClose={close}>
      <table className="grid-table plain">
        <tbody>
          {(clothing ? CLOTHING_SHORTCUTS : SHORTCUTS).map(([k, d]) => (
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
          Nexo UGC Studio by Nexoria. A browser-based editor for designing Roblox UGC accessories from primitive shapes, and for painting classic shirts, pants and T-shirts on a live 3D mannequin. Exports GLB, glTF, OBJ and clothing PNGs.
        </p>
        <p className="hint">Projects are stored in this browser (IndexedDB). Nothing is uploaded. It does not create Roblox-native files.</p>
      </div>
    </Modal>
  );
}
