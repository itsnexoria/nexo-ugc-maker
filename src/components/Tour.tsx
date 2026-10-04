import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '../store/ui';

interface Step {
  selector: string;
  title: string;
  body: string;
}

const ACCESSORY_STEPS: Step[] = [
  { selector: '.toolbox', title: 'Toolbox', body: 'Pick Select, Move, Rotate or Scale on top. Below them, add parts, meshes and ready-made hats, hair, face, back, shoulder and waist items. The last two buttons import a 3D model or a texture.' },
  { selector: '.viewport-area', title: '3D viewport', body: 'Drag to orbit, right-drag to pan, scroll to zoom. Click a part to select it, then use the gizmo. Use R6/R15, the camera buttons and the animation bar to check the fit.' },
  { selector: '.right', title: 'Properties and Validation', body: 'Edit position, size, rotation, color, material and texture of the selected part. The Validation tab checks triangles, size and textures against Roblox limits, and can reduce triangles for you.' },
  { selector: '.bottom', title: 'Scene, materials and assets', body: 'The Scene tab is your hierarchy (drag to group). Materials has presets and a live preview. Textures, Layers and Assets hold the rest. Everything here is also reachable from the viewport.' },
  { selector: '.tb-center', title: 'Undo, save and preview', body: 'Ctrl+Z and Ctrl+Y undo and redo. Projects autosave in this browser. Preview hides the editor for a clean look at your accessory on the animated avatar.' },
  { selector: '.tb-right .btn.primary', title: 'Export', body: 'Export GLB, glTF or OBJ. Turn on "Join into one mesh" for a single mesh and one baked texture, which is what Roblox accessories need. Press ? any time for shortcuts.' },
];

const CLOTHING_STEPS: Step[] = [
  { selector: '.kind-tabs', title: 'Shirt, Pants, T-Shirt', body: 'Each item has its own design. The eye icon shows or hides it on the 3D model, so you can check a full outfit.' },
  { selector: '.design-wrap', title: 'The template', body: "This is Roblox's flat template. Dashed boxes are the panels that wrap the body; dimmed areas are ignored. Scroll to zoom, Space + drag to pan. Drag layers to move, and use the handles to scale and rotate." },
  { selector: '.cl-pane:last-child', title: 'Live 3D preview', body: 'Your design appears on the mannequin as you work. Try the brush right on the model, or use Place on model to drop a layer where you click.' },
  { selector: '.toolbox', title: 'Tools', body: 'Select, Place on model, Brush and Eraser on top. Below: add text, shapes, images, fills, patterns and paint layers, or import an existing shirt PNG to keep editing it.' },
  { selector: '.cl-layers', title: 'Layers', body: 'Drag layers to reorder them, use the eye and lock icons, and double-click a name to rename it. Everything is undoable.' },
  { selector: '.right-body', title: 'Properties', body: '"Applies to" limits a layer to one panel or one sleeve so it does not spill. Mirror copies a layer to the opposite side. Brush settings (softness, opacity, symmetry) appear here.' },
  { selector: '.bottom', title: 'Presets and images', body: 'Start from a preset (jacket, hoodie, jeans...) and edit it, or upload images. Dropping a picture on the editor adds it too.' },
  { selector: '.tb-right .btn.primary', title: 'Export', body: 'Download a PNG per item, or all of them as a ZIP. Shirts and pants are exactly 585 × 559. Always test on an avatar in Roblox before uploading.' },
];

export const TOUR_KEY = (mode: 'accessory' | 'clothing') => `nexo-tour-${mode}-v1`;

export function tourSeen(mode: 'accessory' | 'clothing'): boolean {
  try {
    return localStorage.getItem(TOUR_KEY(mode)) === '1';
  } catch {
    return true;
  }
}

export function Tour() {
  const mode = useUI((s) => s.tour);
  const end = useUI((s) => s.endTour);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const steps = mode === 'clothing' ? CLOTHING_STEPS : ACCESSORY_STEPS;
  const step = steps[Math.min(i, steps.length - 1)];

  useEffect(() => setI(0), [mode]);

  const finish = () => {
    if (mode) {
      try {
        localStorage.setItem(TOUR_KEY(mode), '1');
      } catch {
        /* ignore */
      }
    }
    end();
  };

  useLayoutEffect(() => {
    if (!mode) return;
    const measure = () => {
      const el = document.querySelector(step.selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [mode, step.selector]);

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') setI((n) => Math.min(steps.length - 1, n + 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mode) return null;
  const last = i >= steps.length - 1;
  const W = 320;
  const pad = 6;
  let left = window.innerWidth / 2 - W / 2;
  let top = window.innerHeight / 2 - 90;
  if (rect) {
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;
    if (spaceRight >= W + 24) {
      left = rect.right + 14;
      top = Math.min(window.innerHeight - 220, Math.max(12, rect.top + 12));
    } else if (spaceLeft >= W + 24) {
      left = rect.left - W - 14;
      top = Math.min(window.innerHeight - 220, Math.max(12, rect.top + 12));
    } else {
      left = Math.min(window.innerWidth - W - 12, Math.max(12, rect.left + rect.width / 2 - W / 2));
      top = rect.bottom + 14 + 200 < window.innerHeight ? rect.bottom + 14 : Math.max(12, rect.top - 214);
    }
  }

  return createPortal(
    <div className="tour" role="dialog" aria-label="Guided tour">
      {rect && <div className="tour-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />}
      {!rect && <div className="tour-dim" />}
      <div className="tour-card" style={{ left, top, width: W }}>
        <div className="tour-step">
          Step {i + 1} of {steps.length}
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn ghost sm" onClick={finish}>
            Skip tour
          </button>
          <div className="grow" />
          <button className="btn sm" disabled={i === 0} onClick={() => setI((n) => Math.max(0, n - 1))}>
            Back
          </button>
          <button className="btn primary sm" onClick={() => (last ? finish() : setI((n) => n + 1))} autoFocus>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
