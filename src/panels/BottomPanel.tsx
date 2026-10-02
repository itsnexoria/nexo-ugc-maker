import { useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useUI, type BottomTab } from '../store/ui';
import { AssetsTab, ConsoleTab, LayersTab, MaterialsTab, ObjectsTab, TexturesTab } from './BottomTabs';
import { SceneTab } from './SceneTab';

const TABS: { id: BottomTab; label: string }[] = [
  { id: 'scene', label: 'Scene' },
  { id: 'objects', label: 'Objects' },
  { id: 'materials', label: 'Materials' },
  { id: 'textures', label: 'Textures' },
  { id: 'layers', label: 'Layers' },
  { id: 'assets', label: 'Assets' },
  { id: 'console', label: 'Console' },
];

export function BottomPanel() {
  const tab = useUI((s) => s.bottomTab);
  const open = useUI((s) => s.bottomOpen);
  const height = useUI((s) => s.bottomHeight);
  const setTab = useUI((s) => s.setBottomTab);
  const toggle = useUI((s) => s.toggleBottom);
  const setHeight = useUI((s) => s.setBottomHeight);
  const objectCount = useEditor((s) => Object.keys(s.objects).length);
  const texCount = useEditor((s) => s.textures.length);
  const errors = useUI((s) => s.logs.filter((l) => l.level === 'error').length);
  const drag = useRef<{ y: number; h: number } | null>(null);

  return (
    <section className="bottom" style={{ height: open ? height : undefined }} aria-label="Bottom panel">
      {open && (
        <div
          className="resize-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize panel"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { y: e.clientY, h: height };
          }}
          onPointerMove={(e) => drag.current && setHeight(drag.current.h + (drag.current.y - e.clientY))}
          onPointerUp={() => (drag.current = null)}
        />
      )}
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={open && tab === t.id} className={`tab ${open && tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'objects' && objectCount > 0 && <span className="count">{objectCount}</span>}
            {t.id === 'textures' && texCount > 0 && <span className="count">{texCount}</span>}
            {t.id === 'console' && errors > 0 && <span className="count err">{errors}</span>}
          </button>
        ))}
        <div className="grow" />
        <button className="icon-btn" onClick={toggle} aria-label={open ? 'Collapse panel' : 'Expand panel'} aria-expanded={open}>
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      {open && (
        <div className="bottom-body" role="tabpanel">
          {tab === 'scene' && <SceneTab />}
          {tab === 'objects' && <ObjectsTab />}
          {tab === 'materials' && <MaterialsTab />}
          {tab === 'textures' && <TexturesTab />}
          {tab === 'layers' && <LayersTab />}
          {tab === 'assets' && <AssetsTab />}
          {tab === 'console' && <ConsoleTab />}
        </div>
      )}
    </section>
  );
}
