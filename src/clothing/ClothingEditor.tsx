import { useEffect, useState } from 'react';
import { tourSeen } from '../components/Tour';
import { ChevronDown, ChevronUp, Grid3x3, Maximize, RotateCcw } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { Tip } from '../components/ui/Tooltip';
import { ConsoleTab } from '../panels/BottomTabs';
import { handleDroppedFiles } from '../editor/importers';
import { useEditor } from '../store/editor';
import { useClothing, type ViewMode } from '../store/clothing';
import { useUI } from '../store/ui';
import { CAMERA_TARGET, DEFAULT_CAMERA, useViewport } from '../store/viewport';
import type { AnimationId } from '../types';
import { ClothingPreview } from '../viewport/ClothingPreview';
import { DesignCanvas } from './DesignCanvas';
import { ClothingToolbox, ImagesTab, KindTabs, LayerProperties, LayersList, PresetsTab } from './ClothingPanels';
import { TEMPLATES } from './templates';

const ANIMS: { id: AnimationId; label: string }[] = [
  { id: 'rest', label: 'Rest' },
  { id: 'idle', label: 'Idle' },
  { id: 'walk', label: 'Walk' },
  { id: 'run', label: 'Run' },
  { id: 'jump', label: 'Jump' },
];

const VIEWS: { label: string; pos: [number, number, number] }[] = [
  { label: 'Front', pos: [0, 3.6, -11] },
  { label: 'Back', pos: [0, 3.6, 11] },
  { label: 'Left', pos: [-11, 3.6, 0] },
  { label: 'Right', pos: [11, 3.6, 0] },
  { label: '3/4', pos: [-6.2, 4.2, -8.4] },
];

function PreviewControls() {
  const rig = useEditor((s) => s.rig);
  const setRig = useEditor((s) => s.setRig);
  const anim = useEditor((s) => s.animation);
  const setAnim = useEditor((s) => s.setAnimation);
  const request = useViewport((s) => s.requestCamera);
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
          {VIEWS.map((v) => (
            <button key={v.label} onClick={() => request(v.pos, CAMERA_TARGET)}>
              {v.label}
            </button>
          ))}
        </div>
        <Tip label="Reset camera">
          <button className="icon-btn boxed" aria-label="Reset camera" onClick={() => request(DEFAULT_CAMERA.position, DEFAULT_CAMERA.target)}>
            <RotateCcw size={14} />
          </button>
        </Tip>
      </div>
      <div className="vp-bc">
        <div className="seg" role="group" aria-label="Animation preview">
          {ANIMS.map((a) => (
            <button key={a.id} className={anim === a.id ? 'on' : ''} aria-pressed={anim === a.id} onClick={() => setAnim(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function CenterBar() {
  const mode = useClothing((s) => s.viewMode);
  const setMode = useClothing((s) => s.setViewMode);
  const guides = useClothing((s) => s.showGuides);
  const setGuides = useClothing((s) => s.setShowGuides);
  const kind = useClothing((s) => s.activeKind);
  const tool = useClothing((s) => s.tool);
  const hints: Record<string, string> = {
    select: 'Drag layers to move them. Space + drag pans, scroll zooms.',
    place: 'Select a layer, then click the 3D model to place it.',
    brush: 'Paint on the template or straight onto the 3D model.',
    eraser: 'Erase paint on the selected paint layer.',
  };
  return (
    <div className="cl-bar">
      <div className="seg" role="group" aria-label="Layout">
        {(['split', '2d', '3d'] as ViewMode[]).map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {m === 'split' ? 'Split' : m.toUpperCase()}
          </button>
        ))}
      </div>
      <Tip label="Show panel outlines and labels">
        <button className={`icon-btn boxed ${guides ? 'active' : ''}`} aria-pressed={guides} aria-label="Toggle template guides" onClick={() => setGuides(!guides)}>
          <Grid3x3 size={14} />
        </button>
      </Tip>
      <Tip label="Fit template to view">
        <button className="icon-btn boxed" aria-label="Fit template" onClick={() => window.dispatchEvent(new Event('nexo:fit-design'))}>
          <Maximize size={14} />
        </button>
      </Tip>
      <span className="hint grow truncate">{hints[tool]}</span>
      <span className="faint">
        {TEMPLATES[kind].label} · {TEMPLATES[kind].width} × {TEMPLATES[kind].height}
      </span>
    </div>
  );
}

type BTab = 'presets' | 'images' | 'console';

function Bottom() {
  const open = useUI((s) => s.bottomOpen);
  const toggle = useUI((s) => s.toggleBottom);
  const height = useUI((s) => s.bottomHeight);
  const tabUi = useUI((s) => s.bottomTab);
  const setTabUi = useUI((s) => s.setBottomTab);
  const tab: BTab = tabUi === 'textures' ? 'images' : tabUi === 'console' ? 'console' : 'presets';
  const imgCount = useClothing((s) => s.images.length);
  const set = (t: BTab) => setTabUi(t === 'images' ? 'textures' : t === 'console' ? 'console' : 'assets');
  return (
    <section className="bottom" style={{ height: open ? Math.min(height, 240) : undefined }} aria-label="Presets and images">
      <div className="tabs" role="tablist">
        {(['presets', 'images', 'console'] as BTab[]).map((t) => (
          <button key={t} role="tab" aria-selected={open && tab === t} className={`tab ${open && tab === t ? 'active' : ''}`} onClick={() => (set(t), !open && toggle())}>
            {t[0].toUpperCase() + t.slice(1)}
            {t === 'images' && imgCount > 0 && <span className="count">{imgCount}</span>}
          </button>
        ))}
        <div className="grow" />
        <button className="icon-btn" onClick={toggle} aria-label={open ? 'Collapse panel' : 'Expand panel'} aria-expanded={open}>
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      {open && (
        <div className="bottom-body" role="tabpanel">
          {tab === 'presets' && <PresetsTab />}
          {tab === 'images' && <ImagesTab />}
          {tab === 'console' && <ConsoleTab />}
        </div>
      )}
    </section>
  );
}

export function ClothingWorkspace() {
  const mode = useClothing((s) => s.viewMode);
  const [dragOver, setDragOver] = useState(false);
  const projectId = useEditor((s) => s.project.id);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!tourSeen('clothing') && !useUI.getState().modal) useUI.getState().startTour('clothing');
    }, 1200);
    return () => clearTimeout(t);
  }, [projectId]);
  return (
    <div className="app clothing">
      <TopBar mode="clothing" />
      <div className="workspace">
        <ClothingToolbox />
        <div className="center">
          <CenterBar />
          <div
            className={`cl-main mode-${mode} ${dragOver ? 'dragover' : ''}`}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                setDragOver(true);
              }
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              setDragOver(false);
              if (!e.dataTransfer.files.length) return;
              e.preventDefault();
              void handleDroppedFiles(Array.from(e.dataTransfer.files));
            }}
          >
            {mode !== '3d' && (
              <div className="cl-pane">
                <DesignCanvas />
              </div>
            )}
            {mode !== '2d' && (
              <div className="cl-pane">
                <ClothingPreview />
                <PreviewControls />
              </div>
            )}
          </div>
          <Bottom />
        </div>
        <aside className="right" aria-label="Layers and properties">
          <KindTabs />
          <div className="cl-layers">
            <div className="col-title" style={{ padding: '6px 10px 0', marginBottom: 4 }}>
              Layers
            </div>
            <LayersList />
          </div>
          <div className="right-body">
            <LayerProperties />
          </div>
        </aside>
      </div>
    </div>
  );
}
