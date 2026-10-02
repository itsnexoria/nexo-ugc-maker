import { Crosshair, Grid3x3, Magnet, PersonStanding, RotateCcw, Scan, SunMedium, X } from 'lucide-react';
import { focusSelection } from '../editor/actions';
import { useEditor } from '../store/editor';
import { useSettings } from '../store/settings';
import { CAMERA_TARGET, CAMERA_VIEWS, DEFAULT_CAMERA, useViewport, type CameraViewId } from '../store/viewport';
import { useValidation } from '../hooks/useValidation';
import type { AnimationId } from '../types';
import { Tip } from './ui/Tooltip';

const ANIMS: { id: AnimationId; label: string }[] = [
  { id: 'rest', label: 'Rest' },
  { id: 'idle', label: 'Idle' },
  { id: 'walk', label: 'Walk' },
  { id: 'run', label: 'Run' },
  { id: 'jump', label: 'Jump' },
];

export function ViewportOverlay() {
  const rig = useEditor((s) => s.rig);
  const setRig = useEditor((s) => s.setRig);
  const animation = useEditor((s) => s.animation);
  const setAnimation = useEditor((s) => s.setAnimation);
  const preview = useViewport((s) => s.previewMode);
  const setPreview = useViewport((s) => s.setPreviewMode);
  const wire = useViewport((s) => s.wireframe);
  const lighting = useViewport((s) => s.lighting);
  const showAvatar = useViewport((s) => s.showAvatar);
  const requestCamera = useViewport((s) => s.requestCamera);
  const showGrid = useSettings((s) => s.showGrid);
  const snap = useSettings((s) => s.snap);
  const setSetting = useSettings((s) => s.set);
  const report = useValidation();

  const view = (id: CameraViewId) => requestCamera(CAMERA_VIEWS[id].position, CAMERA_TARGET);

  return (
    <>
      <div className="vp-tl">
        <div className="seg" role="group" aria-label="Avatar rig">
          {(['R6', 'R15'] as const).map((r) => (
            <button key={r} className={rig === r ? 'on' : ''} aria-pressed={rig === r} onClick={() => setRig(r)}>
              {r}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Camera angle">
          {(Object.keys(CAMERA_VIEWS) as CameraViewId[]).map((id, i) => (
            <Tip key={id} label={`${CAMERA_VIEWS[id].label} view`} shortcut={String(i + 1)} side="bottom">
              <button onClick={() => view(id)}>{CAMERA_VIEWS[id].label}</button>
            </Tip>
          ))}
        </div>
        <Tip label="Reset camera" shortcut="Home">
          <button className="icon-btn boxed" aria-label="Reset camera" onClick={() => requestCamera(DEFAULT_CAMERA.position, DEFAULT_CAMERA.target)}>
            <RotateCcw size={14} />
          </button>
        </Tip>
        <Tip label="Focus selected" shortcut="F">
          <button className="icon-btn boxed" aria-label="Focus selected" onClick={focusSelection}>
            <Crosshair size={14} />
          </button>
        </Tip>
      </div>

      {!preview && (
        <div className="vp-tr">
          <Tip label="Grid" shortcut="G" side="bottom">
            <button className={`icon-btn boxed ${showGrid ? 'active' : ''}`} aria-pressed={showGrid} aria-label="Toggle grid" onClick={() => setSetting('showGrid', !showGrid)}>
              <Grid3x3 size={14} />
            </button>
          </Tip>
          <Tip label="Lighting (off = flat)" shortcut="L" side="bottom">
            <button className={`icon-btn boxed ${lighting ? 'active' : ''}`} aria-pressed={lighting} aria-label="Toggle lighting" onClick={() => useViewport.getState().setLighting(!lighting)}>
              <SunMedium size={14} />
            </button>
          </Tip>
          <Tip label="Wireframe" shortcut="Z" side="bottom">
            <button className={`icon-btn boxed ${wire ? 'active' : ''}`} aria-pressed={wire} aria-label="Toggle wireframe" onClick={() => useViewport.getState().setWireframe(!wire)}>
              <Scan size={14} />
            </button>
          </Tip>
          <Tip label="Show avatar" side="bottom">
            <button className={`icon-btn boxed ${showAvatar ? 'active' : ''}`} aria-pressed={showAvatar} aria-label="Toggle avatar" onClick={() => useViewport.getState().setShowAvatar(!showAvatar)}>
              <PersonStanding size={14} />
            </button>
          </Tip>
          <Tip label="Snap to grid" shortcut="X" side="bottom">
            <button className={`icon-btn boxed ${snap ? 'active' : ''}`} aria-pressed={snap} aria-label="Toggle snap to grid" onClick={() => setSetting('snap', !snap)}>
              <Magnet size={14} />
            </button>
          </Tip>
        </div>
      )}

      <div className="vp-bc">
        <div className="seg" role="group" aria-label="Animation preview">
          {ANIMS.map((a) => (
            <button key={a.id} className={animation === a.id ? 'on' : ''} aria-pressed={animation === a.id} onClick={() => setAnimation(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {!preview && (
        <div className="vp-bl num" aria-label="Scene statistics">
          <span>{report.meshCount} parts</span>
          <span>{report.triangles.toLocaleString()} tris</span>
          {report.size && <span>{report.size.map((n) => Math.round(n * 100) / 100).join(' × ')} studs</span>}
        </div>
      )}

      {preview && (
        <button className="btn vp-exit" onClick={() => setPreview(false)}>
          <X size={14} /> Exit preview <span className="kbd">Esc</span>
        </button>
      )}
    </>
  );
}
