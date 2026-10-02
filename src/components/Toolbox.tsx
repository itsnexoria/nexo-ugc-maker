import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Backpack,
  Bird,
  Box,
  Circle,
  Cone,
  Cylinder,
  Disc,
  Donut,
  Gem,
  Glasses,
  HardHat,
  Hexagon,
  Image as ImageIcon,
  Move3d,
  MousePointer2,
  Rotate3d,
  Scale3d,
  Scissors,
  Shapes,
  Upload,
  Triangle,
  Spline,
  Waves,
  Wand2,
} from 'lucide-react';
import { CATEGORY_LABELS } from '../assets/presets';
import { importModelFile, pickFiles, uploadTexture } from '../editor/importers';
import { useEditor } from '../store/editor';
import type { AssetCategory, ShapeKind, ToolMode } from '../types';
import { AssetGrid } from './AssetGrid';
import { Tip } from './ui/Tooltip';

type PickerKey = 'part' | 'mesh' | AssetCategory;

const PART_KINDS: { kind: Exclude<ShapeKind, 'group' | 'imported'>; label: string; icon: ReactNode }[] = [
  { kind: 'cube', label: 'Cube', icon: <Box size={16} /> },
  { kind: 'sphere', label: 'Sphere', icon: <Circle size={16} /> },
  { kind: 'cylinder', label: 'Cylinder', icon: <Cylinder size={16} /> },
  { kind: 'cone', label: 'Cone', icon: <Cone size={16} /> },
  { kind: 'torus', label: 'Torus', icon: <Donut size={16} /> },
];

const MESH_KINDS: typeof PART_KINDS = [
  { kind: 'capsule', label: 'Capsule', icon: <Waves size={16} /> },
  { kind: 'wedge', label: 'Wedge', icon: <Triangle size={16} /> },
  { kind: 'pyramid', label: 'Pyramid', icon: <Hexagon size={16} /> },
  { kind: 'icosphere', label: 'Icosphere', icon: <Gem size={16} /> },
  { kind: 'torusknot', label: 'Torus knot', icon: <Spline size={16} /> },
  { kind: 'arch', label: 'Arch', icon: <Wand2 size={16} /> },
];

const TOOLS: { id: ToolMode; label: string; key: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: <MousePointer2 size={17} /> },
  { id: 'move', label: 'Move', key: 'W', icon: <Move3d size={17} /> },
  { id: 'rotate', label: 'Rotate', key: 'E', icon: <Rotate3d size={17} /> },
  { id: 'scale', label: 'Scale', key: 'R', icon: <Scale3d size={17} /> },
];

export function Toolbox() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const addPrimitive = useEditor((s) => s.addPrimitive);
  const [open, setOpen] = useState<{ key: PickerKey; y: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (popRef.current?.contains(t) || t.closest('[data-picker-btn]')) return;
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const toggle = (key: PickerKey) => (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOpen((cur) => (cur?.key === key ? null : { key, y: r.top }));
  };

  const pickerBtn = (key: PickerKey, label: string, icon: ReactNode) => (
    <Tip label={label} side="right" key={key}>
      <button data-picker-btn className={`icon-btn tool ${open?.key === key ? 'active' : ''}`} onClick={toggle(key)} aria-label={label} aria-haspopup="true">
        {icon}
      </button>
    </Tip>
  );

  return (
    <nav className="toolbox" aria-label="Asset tools">
      {TOOLS.map((t) => (
        <Tip key={t.id} label={t.label} shortcut={t.key} side="right">
          <button className={`icon-btn tool ${tool === t.id ? 'active' : ''}`} onClick={() => setTool(t.id)} aria-label={t.label} aria-pressed={tool === t.id}>
            {t.icon}
          </button>
        </Tip>
      ))}
      <div className="tool-sep" />
      {pickerBtn('part', 'Add Part', <Box size={17} />)}
      {pickerBtn('mesh', 'Add Mesh', <Shapes size={17} />)}
      {pickerBtn('accessories', 'Add Accessory', <Gem size={17} />)}
      {pickerBtn('hats', 'Add Hat', <HardHat size={17} />)}
      {pickerBtn('hair', 'Add Hair', <Scissors size={17} />)}
      {pickerBtn('face', 'Add Face Accessory', <Glasses size={17} />)}
      {pickerBtn('shoulder', 'Add Shoulder Accessory', <Bird size={17} />)}
      {pickerBtn('back', 'Add Back Accessory', <Backpack size={17} />)}
      {pickerBtn('waist', 'Add Waist Accessory', <Disc size={17} />)}
      <div className="tool-sep" />
      <Tip label="Import Model (.obj, .glb, .gltf)" side="right">
        <button
          className="icon-btn tool"
          aria-label="Import Model"
          onClick={async () => {
            const [f] = await pickFiles('.obj,.glb,.gltf');
            if (f) await importModelFile(f);
          }}
        >
          <Upload size={17} />
        </button>
      </Tip>
      <Tip label="Upload Texture (PNG, JPG)" side="right">
        <button
          className="icon-btn tool"
          aria-label="Upload Texture"
          onClick={async () => {
            const files = await pickFiles('image/png,image/jpeg,image/webp', true);
            for (const f of files) await uploadTexture(f);
          }}
        >
          <ImageIcon size={17} />
        </button>
      </Tip>

      {open && (
        <div className="picker" ref={popRef} style={{ top: Math.min(open.y - 6, window.innerHeight - 380) }} role="dialog" aria-label="Add">
          <div className="picker-head">
            {open.key === 'part' ? 'Add part' : open.key === 'mesh' ? 'Add mesh' : `Add ${CATEGORY_LABELS[open.key as AssetCategory].toLowerCase()}`}
          </div>
          {(open.key === 'part' || open.key === 'mesh') && (
            <div className="picker-list">
              {(open.key === 'part' ? PART_KINDS : MESH_KINDS).map((k) => (
                <button
                  key={k.kind}
                  className="picker-item"
                  onClick={() => {
                    addPrimitive(k.kind);
                    setOpen(null);
                  }}
                >
                  {k.icon}
                  <span>{k.label}</span>
                </button>
              ))}
              {open.key === 'mesh' && (
                <button
                  className="picker-item"
                  onClick={async () => {
                    setOpen(null);
                    const [f] = await pickFiles('.obj,.glb,.gltf');
                    if (f) await importModelFile(f);
                  }}
                >
                  <Upload size={16} />
                  <span>Import .obj / .glb</span>
                </button>
              )}
            </div>
          )}
          {open.key !== 'part' && open.key !== 'mesh' && (
            <div className="picker-assets">
              <AssetGrid category={open.key as AssetCategory} compact onPicked={() => setOpen(null)} />
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
