import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Brush,
  Copy,
  Crosshair,
  Eraser,
  Eye,
  EyeOff,
  FlipHorizontal2,
  BrushCleaning,
  Folder,
  FolderOpen,
  Contrast,
  Image as ImageIcon,
  Layers as LayersIcon,
  Lock,
  LockOpen,
  MousePointer2,
  PaintBucket,
  Shapes,
  Trash2,
  Type,
  Upload,
  Grid2x2,
  FileUp,
  History as HistoryIcon,
  Send,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
} from 'lucide-react';
import { ColorField, NumberField, SliderField } from '../components/ui/Fields';
import { Section } from '../components/ui/Section';
import { Tip } from '../components/ui/Tooltip';
import { importClothingTemplate, pickFiles, uploadClothingImage } from '../editor/importers';
import { selectedLayer, unusedClothingImageIds, useClothing, type ClothingTool } from '../store/clothing';
import { useUI } from '../store/ui';
import { translateClip } from '../store/clothing';
import type { BlendMode, ClothingKind, ClothingLayer, PatternId, ShapeType } from '../types';
import { PATTERNS, SYSTEM_FONTS, WEB_FONTS } from './layers';
import { presetsFor } from './presets';
import { hiddenInList } from './groups';
import { KIND_ORDER, TEMPLATES, clipBounds, clipOptions } from './templates';

// ------------------------------------------------------------------ toolbox

const TOOLS: { id: ClothingTool; label: string; key: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Select and move', key: 'V', icon: <MousePointer2 size={17} /> },
  { id: 'place', label: 'Place on model: click the 3D model to put the selected layer there', key: 'P', icon: <Crosshair size={17} /> },
  { id: 'brush', label: 'Brush: paint on the template or straight onto the 3D model', key: 'B', icon: <Brush size={17} /> },
  { id: 'eraser', label: 'Eraser', key: 'E', icon: <Eraser size={17} /> },
  { id: 'fill', label: 'Fill: click an area to cover exactly that area with a new layer of the brush colour', key: 'G', icon: <PaintBucket size={17} /> },
];

export function ClothingToolbox() {
  const tool = useClothing((s) => s.tool);
  const setTool = useClothing((s) => s.setTool);
  const addLayer = useClothing((s) => s.addLayer);
  const setTab = useUI((s) => s.setBottomTab);
  return (
    <nav className="toolbox" aria-label="Clothing tools">
      {TOOLS.map((t) => (
        <Tip key={t.id} label={t.label} shortcut={t.key} side="right">
          <button className={`icon-btn tool ${tool === t.id ? 'active' : ''}`} onClick={() => setTool(t.id)} aria-label={t.label} aria-pressed={tool === t.id}>
            {t.icon}
          </button>
        </Tip>
      ))}
      <div className="tool-sep" />
      <Tip label="Add text" shortcut="T" side="right">
        <button className="icon-btn tool" aria-label="Add text" onClick={() => addLayer('text')}>
          <Type size={17} />
        </button>
      </Tip>
      <Tip label="Add shape" side="right">
        <button className="icon-btn tool" aria-label="Add shape" onClick={() => addLayer('shape')}>
          <Shapes size={17} />
        </button>
      </Tip>
      <Tip label="Add image (upload)" side="right">
        <button
          className="icon-btn tool"
          aria-label="Add image"
          onClick={async () => {
            const files = await pickFiles('image/png,image/jpeg,image/webp,image/gif', true);
            for (const f of files) await uploadClothingImage(f, true);
          }}
        >
          <ImageIcon size={17} />
        </button>
      </Tip>
      <Tip label="Import an existing shirt, pants or T-shirt PNG to keep editing" side="right">
        <button
          className="icon-btn tool"
          aria-label="Import existing clothing PNG"
          onClick={async () => {
            const [f] = await pickFiles('image/png,image/jpeg,image/webp', false);
            if (f) await importClothingTemplate(f);
          }}
        >
          <FileUp size={17} />
        </button>
      </Tip>
      <Tip label="Add color fill" side="right">
        <button className="icon-btn tool" aria-label="Add color fill" onClick={() => addLayer('fill')}>
          <PaintBucket size={17} />
        </button>
      </Tip>
      <Tip label="Add pattern" side="right">
        <button className="icon-btn tool" aria-label="Add pattern" onClick={() => addLayer('pattern')}>
          <Grid2x2 size={17} />
        </button>
      </Tip>
      <Tip label="Add paint layer" side="right">
        <button
          className="icon-btn tool"
          aria-label="Add paint layer"
          onClick={() => {
            addLayer('paint');
            setTool('brush');
          }}
        >
          <LayersIcon size={17} />
        </button>
      </Tip>
      <div className="tool-sep" />
      <Tip label="Presets" side="right">
        <button className="icon-btn tool" aria-label="Presets" onClick={() => setTab('assets')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l2.4 5 5.6.8-4 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.6-.8z" />
          </svg>
        </button>
      </Tip>
    </nav>
  );
}

// ------------------------------------------------------------------ kind tabs + layers

export function KindTabs() {
  const active = useClothing((s) => s.activeKind);
  const setActive = useClothing((s) => s.setActiveKind);
  const shown = useClothing((s) => s.shown);
  const setShown = useClothing((s) => s.setShown);
  return (
    <div className="kind-tabs" role="group" aria-label="Clothing item">
      {KIND_ORDER.map((k) => (
        <div key={k} className={`kind-tab ${active === k ? 'on' : ''}`}>
          <button aria-pressed={active === k} className="kind-name" onClick={() => setActive(k)}>
            {TEMPLATES[k].label}
          </button>
          <button className="icon-btn sm" aria-label={shown[k] ? `Hide ${TEMPLATES[k].label} on model` : `Show ${TEMPLATES[k].label} on model`} title="Show on the 3D model" onClick={() => setShown(k, !shown[k])}>
            {shown[k] ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        </div>
      ))}
    </div>
  );
}

const TYPE_ICON: Record<ClothingLayer['type'], ReactNode> = {
  fill: <PaintBucket size={12} />,
  pattern: <Grid2x2 size={12} />,
  image: <ImageIcon size={12} />,
  text: <Type size={12} />,
  shape: <Shapes size={12} />,
  paint: <Brush size={12} />,
  group: <Folder size={12} />,
};

export function LayersList() {
  const kind = useClothing((s) => s.activeKind);
  const layers = useClothing((s) => s.designs[s.activeKind]);
  const selectedIds = useClothing((s) => s.selectedIds);
  const select = useClothing((s) => s.select);
  const update = useClothing((s) => s.updateLayer);
  const move = useClothing((s) => s.moveLayer);
  const remove = useClothing((s) => s.removeLayer);
  const reorder = useClothing((s) => s.reorderLayer);
  const groupSelected = useClothing((s) => s.groupSelected);
  const ungroupLayer = useClothing((s) => s.ungroupLayer);
  const hidden = useMemo(() => hiddenInList(layers), [layers]);
  const selectedGroup = layers.find((l) => l.type === 'group' && selectedIds.includes(l.id));
  const canGroup = layers.some((l) => l.type !== 'group' && selectedIds.includes(l.id));
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; above: boolean } | null>(null);

  if (!layers.length) {
    return (
      <div className="empty" style={{ minHeight: 110 }}>
        <strong>No layers yet</strong>
        <span>Start from a preset in the bottom panel, or add text, a shape or an image from the toolbox.</span>
      </div>
    );
  }
  return (
    <>
      <div className="row" style={{ padding: '4px 6px', gap: 4 }}>
        <button className="btn sm" disabled={!canGroup} title="Put the selected layers in a folder (Ctrl+G)" onClick={() => void groupSelected()}>
          <Folder size={13} /> Group
        </button>
        <button className="btn sm" disabled={!selectedGroup} title="Take the layers out of the selected folder (Ctrl+Shift+G)" onClick={() => selectedGroup && ungroupLayer(selectedGroup.id)}>
          Ungroup
        </button>
      </div>
    <ul className="layer-list" aria-label={`${TEMPLATES[kind].label} layers`}>
      {[...layers].reverse().filter((l) => !hidden.has(l.id)).map((l) => (
        <li key={l.id}>
          <div
            style={l.groupId ? { paddingLeft: 18 } : undefined}
            className={`lrow ${l.type === 'group' ? 'group' : ''} ${selectedIds.includes(l.id) ? 'selected' : ''} ${!l.visible ? 'muted' : ''} ${drop?.id === l.id ? (drop.above ? 'drop-above' : 'drop-below') : ''} ${dragId === l.id ? 'dragging' : ''}`}
            onClick={(e) => {
              const st = useClothing.getState();
              if (e.shiftKey) st.selectRange(l.id);
              else if (e.ctrlKey || e.metaKey) st.toggleSelect(l.id);
              else select(l.id);
            }}
            draggable={editing !== l.id}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/nexo-layer', l.id);
              e.dataTransfer.effectAllowed = 'move';
              setDragId(l.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDrop(null);
            }}
            onDragOver={(e) => {
              if (!dragId || dragId === l.id) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setDrop({ id: l.id, above: e.clientY < r.top + r.height / 2 });
            }}
            onDragLeave={() => setDrop((d) => (d?.id === l.id ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              const from = e.dataTransfer.getData('text/nexo-layer') || dragId;
              const above = drop?.above ?? true;
              setDrop(null);
              setDragId(null);
              if (!from || from === l.id) return;
              const fromIdx = layers.findIndex((x) => x.id === from);
              const r = layers.findIndex((x) => x.id === l.id);
              // the list shows the top layer first, so "above" means a higher array index
              let slot = above ? r + 1 : r;
              if (fromIdx < slot) slot -= 1;
              reorder(from, slot);
            }}
          >
            <button className="icon-btn sm" aria-label={l.visible ? 'Hide layer' : 'Show layer'} onClick={(e) => (e.stopPropagation(), update(l.id, { visible: !l.visible }, `${l.id}:vis`))}>
              {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            {l.type === 'group' ? (
              <button className="icon-btn sm" aria-expanded={!l.collapsed} aria-label={l.collapsed ? `Open ${l.name}` : `Close ${l.name}`} onClick={(e) => (e.stopPropagation(), update(l.id, { collapsed: !l.collapsed } as Partial<ClothingLayer>, `${l.id}:collapse`))}>
                {l.collapsed ? <Folder size={13} /> : <FolderOpen size={13} />}
              </button>
            ) : (
              <span className="tree-icon">{TYPE_ICON[l.type]}</span>
            )}
            {l.mask && (
              <span className="mask-badge" title={l.mask.enabled === false ? 'Mask (off)' : 'Has a mask'} aria-label={l.mask.enabled === false ? 'Mask off' : 'Has a mask'}>
                <Contrast size={11} />
              </span>
            )}
            {editing === l.id ? (
              <input
                className="tree-input"
                autoFocus
                defaultValue={l.name}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => (e.target.value.trim() && update(l.id, { name: e.target.value.trim() }), setEditing(null))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setEditing(null);
                  e.stopPropagation();
                }}
              />
            ) : (
              <span className="tree-name truncate" onDoubleClick={() => setEditing(l.id)} title="Double-click to rename">
                {l.name}
              </span>
            )}
            <span className="lrow-actions">
              <button className="icon-btn sm" aria-label="Move up" onClick={(e) => (e.stopPropagation(), move(l.id, 1))}>
                <ArrowUp size={12} />
              </button>
              <button className="icon-btn sm" aria-label="Move down" onClick={(e) => (e.stopPropagation(), move(l.id, -1))}>
                <ArrowDown size={12} />
              </button>
              <button className="icon-btn sm" aria-label={l.locked ? 'Unlock layer' : 'Lock layer'} onClick={(e) => (e.stopPropagation(), update(l.id, { locked: !l.locked }, `${l.id}:lock`))}>
                {l.locked ? <Lock size={12} /> : <LockOpen size={12} />}
              </button>
              <button className="icon-btn sm" aria-label="Delete layer" onClick={(e) => (e.stopPropagation(), remove(l.id))}>
                <Trash2 size={12} />
              </button>
            </span>
          </div>
        </li>
      ))}
    </ul>
    </>
  );
}

// ------------------------------------------------------------------ properties

const SHAPES: { id: ShapeType; label: string }[] = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'star', label: 'Star' },
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="slider-row" style={{ gridTemplateColumns: '72px 1fr' }}>
      <span className="slider-label">{label}</span>
      <div className="row" style={{ gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function MultiProperties() {
  const kind = useClothing((s) => s.activeKind);
  const ids = useClothing((s) => s.selectedIds);
  const layers = useClothing((s) => s.designs[s.activeKind]);
  const updateMany = useClothing((s) => s.updateLayers);
  const removeMany = useClothing((s) => s.removeLayers);
  const dupMany = useClothing((s) => s.duplicateLayers);
  const align = useClothing((s) => s.alignLayers);
  const sel = layers.filter((l) => ids.includes(l.id));
  const movable = sel.filter((l) => l.type === 'image' || l.type === 'text' || l.type === 'shape').length;
  const opts = clipOptions(kind);
  const sameOpacity = sel.every((l) => l.opacity === sel[0].opacity) ? sel[0].opacity : 1;
  const clip = sel.every((l) => l.clip === sel[0].clip) ? sel[0].clip : '';
  const ALIGN = [
    ['left', AlignHorizontalJustifyStart, 'Align left'],
    ['center', AlignHorizontalJustifyCenter, 'Align centers horizontally'],
    ['right', AlignHorizontalJustifyEnd, 'Align right'],
    ['top', AlignVerticalJustifyStart, 'Align top'],
    ['middle', AlignVerticalJustifyCenter, 'Align centers vertically'],
    ['bottom', AlignVerticalJustifyEnd, 'Align bottom'],
  ] as const;
  return (
    <Section title={`${sel.length} layers selected`}>
      <p className="hint">Shift+click selects a range, Ctrl/Cmd+click adds or removes one, and dragging on empty template space draws a selection box. Drag any selected layer to move them together.</p>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => updateMany(ids, { visible: sel.some((l) => !l.visible) })}>
          {sel.some((l) => !l.visible) ? 'Show all' : 'Hide all'}
        </button>
        <button className="btn sm" onClick={() => updateMany(ids, { locked: !sel.every((l) => l.locked) })}>
          {sel.every((l) => l.locked) ? 'Unlock all' : 'Lock all'}
        </button>
        <button className="btn sm" onClick={() => dupMany(ids)}>
          <Copy size={13} /> Duplicate
        </button>
        <button className="btn sm danger" onClick={() => removeMany(ids)}>
          <Trash2 size={13} /> Delete
        </button>
      </div>
      <SliderField label="Opacity" value={sameOpacity} onChange={(v) => updateMany(ids, { opacity: v }, 'multi:opacity')} />
      <Row label="Blend">
        <select className="select" aria-label="Blend mode for all" defaultValue="" onChange={(e) => e.target.value && updateMany(ids, { blend: e.target.value as BlendMode })}>
          <option value="">Keep each layer's</option>
          <option value="normal">Normal</option>
          <option value="multiply">Multiply</option>
          <option value="screen">Screen</option>
          <option value="overlay">Overlay</option>
        </select>
      </Row>
      <div className="field">
        <label htmlFor="multi-clip">Applies to</label>
        <select id="multi-clip" className="select" value={clip} onChange={(e) => e.target.value && updateMany(ids, { clip: e.target.value })}>
          {clip === '' && <option value="">Mixed</option>}
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {movable > 1 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 2 }} role="group" aria-label="Align">
          {ALIGN.map(([how, Icon, label]) => (
            <Tip key={how} label={label}>
              <button className="icon-btn boxed" aria-label={label} onClick={() => align(ids, how)}>
                <Icon size={14} />
              </button>
            </Tip>
          ))}
        </div>
      )}
    </Section>
  );
}

export function SendToButton() {
  const kind = useClothing((s) => s.activeKind);
  const ids = useClothing((s) => s.selectedIds);
  const copy = useClothing((s) => s.copyLayersToKind);
  const setActive = useClothing((s) => s.setActiveKind);
  const openMenu = useUI((s) => s.openContextMenu);
  const toast = useUI((s) => s.toast);
  const targets = (['shirt', 'pants'] as ClothingKind[]).filter((k) => k !== kind);
  if (kind === 'tshirt') return null;
  return (
    <Tip label="Copy layers to the other item (arms become legs)">
      <button
        className="icon-btn sm"
        aria-label="Send layers to another item"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const items = targets.flatMap((t) => [
            {
              label: ids.length ? `Copy ${ids.length} selected to ${TEMPLATES[t].label}` : `Select layers to copy to ${TEMPLATES[t].label}`,
              disabled: !ids.length,
              onClick: () => {
                const n = copy(ids, t);
                if (n) toast('success', `Copied ${n} layer${n === 1 ? '' : 's'} to ${TEMPLATES[t].label}. Sleeves became ${t === 'pants' ? 'legs' : 'sleeves'}.`, { label: `Open ${TEMPLATES[t].label}`, onClick: () => setActive(t) });
              },
            },
            {
              label: `Copy the whole ${TEMPLATES[kind].label.toLowerCase()} to ${TEMPLATES[t].label}`,
              onClick: () => {
                const n = copy('all', t);
                if (n) toast('success', `Copied ${n} layer${n === 1 ? '' : 's'} to ${TEMPLATES[t].label}`, { label: `Open ${TEMPLATES[t].label}`, onClick: () => setActive(t) });
              },
            },
          ]);
          openMenu(r.left - 200, r.bottom + 4, items);
        }}
      >
        <Send size={12} />
      </button>
    </Tip>
  );
}

export function HistoryPanel() {
  const past = useClothing((s) => s.past);
  const future = useClothing((s) => s.future);
  const jump = useClothing((s) => s.jumpHistory);
  return (
    <ol className="history" aria-label="Undo history">
      <li>
        <button className={`hrow ${past.length === 0 ? 'now' : ''}`} onClick={() => jump(-past.length)}>
          <span className="faint num">0</span> Start
        </button>
      </li>
      {past.map((e, i) => (
        <li key={`p${i}`}>
          {/* each entry stores the state BEFORE its action, so the state after action i is entry i+1 */}
          <button className={`hrow ${i === past.length - 1 ? 'now' : ''}`} onClick={() => jump(-(past.length - 1 - i))}>
            <span className="faint num">{i + 1}</span> {e.label}
          </button>
        </li>
      ))}
      {[...future].map((e, i) => (
        <li key={`f${i}`}>
          <button className="hrow ahead" onClick={() => jump(i + 1)} title="Redo to here">
            <span className="faint num">{past.length + i + 1}</span> {e.label}
          </button>
        </li>
      ))}
      {past.length === 0 && future.length === 0 && <li className="hint" style={{ padding: '6px 12px' }}>No edits yet.</li>}
    </ol>
  );
}

function MaskControls({ layerId }: { layerId: string }) {
  const mask = useClothing((s) => s.designs[s.activeKind].find((l) => l.id === layerId)?.mask);
  const editing = useClothing((s) => s.maskEdit === layerId);
  const update = useClothing((s) => s.updateLayer);
  const addMask = useClothing((s) => s.addMask);
  const removeMask = useClothing((s) => s.removeMask);
  const clearMask = useClothing((s) => s.clearMask);
  const setMaskEdit = useClothing((s) => s.setMaskEdit);
  if (!mask) {
    return (
      <div className="col" style={{ gap: 4 }}>
        <button className="btn sm" onClick={() => addMask(layerId)} title="Hide parts of this layer by painting, without changing the layer itself">
          <Contrast size={13} /> Add mask
        </button>
      </div>
    );
  }
  const set = (patch: Partial<typeof mask>, key?: string) => update(layerId, { mask: { ...mask, ...patch } }, key);
  return (
    <div className="col" style={{ gap: 6 }} role="group" aria-label="Layer mask">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className={`btn sm ${editing ? 'is-on' : ''}`} aria-pressed={editing} onClick={() => setMaskEdit(editing ? null : layerId)}>
          <Contrast size={13} /> {editing ? 'Done editing mask' : 'Edit mask'}
        </button>
        <button className="btn sm" disabled={!mask.strokes.length} onClick={() => clearMask(layerId)}>
          Clear
        </button>
        <button className="btn sm" onClick={() => removeMask(layerId)}>
          <Trash2 size={13} /> Remove
        </button>
      </div>
      <label className="row">
        <input type="checkbox" checked={mask.enabled !== false} onChange={(e) => set({ enabled: e.target.checked }, `${layerId}:maskon`)} /> <span>Mask on</span>
      </label>
      <label className="row">
        <input type="checkbox" checked={mask.invert} onChange={(e) => set({ invert: e.target.checked }, `${layerId}:maskinv`)} /> <span>Invert (show only the painted part)</span>
      </label>
      <span className="hint">{editing ? 'Brush hides, eraser reveals. Nothing on the layer itself changes.' : 'Edit mask to paint where the layer is hidden.'}</span>
    </div>
  );
}

export function LayerProperties() {
  const kind = useClothing((s) => s.activeKind);
  const multi = useClothing((s) => s.selectedIds.length > 1);
  const layer = useClothing(selectedLayer);
  const images = useClothing((s) => s.images);
  const brush = useClothing((s) => s.brush);
  const setBrush = useClothing((s) => s.setBrush);
  const update = useClothing((s) => s.updateLayer);
  const duplicate = useClothing((s) => s.duplicateLayer);
  const mirror = useClothing((s) => s.mirrorLayer);
  const remove = useClothing((s) => s.removeLayer);
  const tool = useClothing((s) => s.tool);

  const fillOpts = useClothing((s) => s.fillOpts);
  const setFillOpts = useClothing((s) => s.setFillOpts);
  const fillUi = (
    <Section title="Fill">
      <ColorField label="Color" value={brush.color} onChange={(v) => setBrush({ color: v })} />
      <SliderField label="Tolerance" value={fillOpts.tolerance} min={0} max={100} step={1} precision={0} onChange={(v) => setFillOpts({ tolerance: v })} />
      <SliderField label="Grow edge" value={fillOpts.expand} min={0} max={4} step={1} precision={0} onChange={(v) => setFillOpts({ expand: v })} />
      <label className="row">
        <input type="checkbox" checked={fillOpts.contiguous} onChange={(e) => setFillOpts({ contiguous: e.target.checked })} /> <span>Only the connected area</span>
      </label>
      <p className="hint">Click the template to cover that area with a new layer. Tolerance says how different a colour may be and still count. Grow edge covers the soft outline around shapes.</p>
    </Section>
  );
  const recent = useClothing((s) => s.recentColors);
  const brushUi = (
    <Section title={tool === 'eraser' ? 'Eraser' : 'Brush'}>
      {tool === 'brush' && (
        <>
          <ColorField label="Color" value={brush.color} onChange={(v) => setBrush({ color: v })} />
          {recent.length > 0 && (
            <div className="swatches" aria-label="Recent colors">
              {recent.map((c) => (
                <button key={c} className="swatch" style={{ background: c }} aria-label={`Use ${c}`} title={c} onClick={() => setBrush({ color: c })} />
              ))}
            </div>
          )}
        </>
      )}
      <SliderField label="Size" value={brush.size} min={1} max={60} step={1} precision={0} onChange={(v) => setBrush({ size: v })} />
      <SliderField label="Hardness" value={brush.hardness} min={0} max={1} step={0.05} onChange={(v) => setBrush({ hardness: v })} />
      <SliderField label="Opacity" value={brush.opacity} min={0.05} max={1} step={0.05} onChange={(v) => setBrush({ opacity: v })} />
      <Row label="Symmetry">
        <input type="checkbox" checked={brush.symmetry} aria-label="Symmetry painting" onChange={(e) => setBrush({ symmetry: e.target.checked })} />
        <span className="hint">Paint the left and right sides together</span>
      </Row>
      {tool === 'brush' && (
        <>
          <Row label="Fill">
            <select className="select" aria-label="Brush fill" value={brush.fillType} onChange={(e) => setBrush({ fillType: e.target.value as 'solid' | 'pattern' | 'gradient' })}>
              <option value="solid">Solid color</option>
              <option value="pattern">Pattern</option>
              <option value="gradient">Gradient (top to bottom)</option>
            </select>
          </Row>
          {brush.fillType !== 'solid' && <ColorField label="Color 2" value={brush.color2} onChange={(v) => setBrush({ color2: v })} />}
          {brush.fillType === 'pattern' && (
            <>
              <Row label="Pattern">
                <select className="select" aria-label="Brush pattern" value={brush.pattern} onChange={(e) => setBrush({ pattern: e.target.value as PatternId })}>
                  {PATTERNS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Row>
              <SliderField label="Pattern size" value={brush.patternSize} min={2} max={40} step={1} precision={0} onChange={(v) => setBrush({ patternSize: v })} />
            </>
          )}
          {brush.fillType !== 'solid' && <p className="hint">Pattern and gradient strokes have hard edges.</p>}
        </>
      )}
      <p className="hint">Drag on the template or straight on the 3D model. Alt+click on the template picks a color. Each stroke is one undo step.</p>
    </Section>
  );

  if (multi) return <MultiProperties />;

  if (!layer) {
    return (
      <>
        {(tool === 'brush' || tool === 'eraser') && brushUi}
        {tool === 'fill' && fillUi}
        <div className="empty" style={{ minHeight: 100 }}>
          <span>Select a layer to edit it.</span>
        </div>
      </>
    );
  }

  const set = (patch: Record<string, unknown>, key?: string) => update(layer.id, patch as Partial<ClothingLayer>, key ?? `${layer.id}:${Object.keys(patch).join(',')}`);
  if (layer.type === 'group') {
    const count = useClothing.getState().designs[kind].filter((l) => l.groupId === layer.id).length;
    return (
      <Section title="Group">
        <p className="hint">
          A folder with {count} layer{count === 1 ? '' : 's'}. Hiding or locking it affects every layer inside, and its opacity is multiplied into theirs.
        </p>
        <SliderField label="Opacity" value={layer.opacity} onChange={(v) => set({ opacity: v })} />
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={() => duplicate(layer.id)}>
            <Copy size={13} /> Duplicate
          </button>
          <button className="btn sm" onClick={() => useClothing.getState().ungroupLayer(layer.id)}>
            Ungroup
          </button>
          <button className="btn sm" title="Deletes the folder and every layer in it" onClick={() => remove(layer.id)}>
            <Trash2 size={13} /> Delete with layers
          </button>
        </div>
      </Section>
    );
  }
  const movable = layer.type === 'image' || layer.type === 'text' || layer.type === 'shape';
  const opts = clipOptions(kind);
  const b = clipBounds(kind, layer.clip);

  return (
    <>
      {(tool === 'brush' || tool === 'eraser') && brushUi}
      {tool === 'fill' && fillUi}
      <Section title="Layer">
        <div className="field">
          <label htmlFor="lyr-name">Name</label>
          <input id="lyr-name" className="input" value={layer.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        </div>
        <div className="field">
          <label htmlFor="lyr-clip">Applies to</label>
          <select id="lyr-clip" className="select" value={layer.clip} onChange={(e) => set({ clip: e.target.value }, `${layer.id}:clip`)}>
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="hint">Limits the layer to part of the template. Pick one panel to keep it from spilling onto other sides.</span>
        </div>
        <SliderField label="Opacity" value={layer.opacity} onChange={(v) => set({ opacity: v })} />
        <Row label="Blend">
          <select className="select" value={layer.blend} aria-label="Blend mode" onChange={(e) => set({ blend: e.target.value as BlendMode })}>
            <option value="normal">Normal</option>
            <option value="multiply">Multiply (darken)</option>
            <option value="screen">Screen (lighten)</option>
            <option value="overlay">Overlay</option>
          </select>
        </Row>
        <MaskControls layerId={layer.id} />
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {movable && (
            <button className="btn sm" title="Move the layer to the middle of the area it applies to" onClick={() => set({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, `${layer.id}:center`)}>
              <Crosshair size={13} /> Center
            </button>
          )}
          <button className="btn sm" onClick={() => duplicate(layer.id)}>
            <Copy size={13} /> Duplicate
          </button>
          {kind !== 'tshirt' && (
            <button className="btn sm" title="Copy to the opposite side (left/right), flipped" onClick={() => mirror(layer.id)}>
              <FlipHorizontal2 size={13} /> Mirror
            </button>
          )}
          <button className="btn sm danger" onClick={() => remove(layer.id)}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </Section>

      {layer.type === 'fill' && (
        <Section title="Fill">
          <ColorField label="Color" value={layer.color} onChange={(v) => set({ color: v })} />
          <Row label="Gradient">
            <input type="checkbox" checked={!!layer.color2} aria-label="Use gradient" onChange={(e) => set({ color2: e.target.checked ? '#e3242b' : null }, `${layer.id}:grad`)} />
            <span className="hint">Blend into a second color</span>
          </Row>
          {layer.color2 && (
            <>
              <ColorField label="Color 2" value={layer.color2} onChange={(v) => set({ color2: v })} />
              <SliderField label="Angle" value={layer.angle} min={0} max={360} step={5} precision={0} onChange={(v) => set({ angle: v })} />
            </>
          )}
        </Section>
      )}

      {layer.type === 'pattern' && (
        <Section title="Pattern">
          <Row label="Style">
            <select className="select" value={layer.pattern} aria-label="Pattern style" onChange={(e) => set({ pattern: e.target.value as PatternId })}>
              {PATTERNS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Row>
          <ColorField label="Color" value={layer.color} onChange={(v) => set({ color: v })} />
          <ColorField label="Background" value={layer.color2} onChange={(v) => set({ color2: v })} />
          <SliderField label="Size" value={layer.size} min={2} max={80} step={1} precision={0} onChange={(v) => set({ size: v })} />
          <SliderField label="Angle" value={layer.angle} min={0} max={180} step={5} precision={0} onChange={(v) => set({ angle: v })} />
        </Section>
      )}

      {layer.type === 'text' && (
        <Section title="Text">
          <textarea className="input" rows={2} style={{ height: 52, padding: 6, resize: 'none' }} aria-label="Text" value={layer.text} onChange={(e) => set({ text: e.target.value || ' ' })} onKeyDown={(e) => e.stopPropagation()} />
          <Row label="Font">
            <select className="select" value={layer.font} aria-label="Font" onChange={(e) => set({ font: e.target.value })}>
              <optgroup label="Included with the app">
                {WEB_FONTS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Your computer's fonts (may look different elsewhere)">
                {SYSTEM_FONTS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </optgroup>
            </select>
          </Row>
          <SliderField label="Size" value={layer.size} min={4} max={160} step={1} precision={0} onChange={(v) => set({ size: v })} />
          <ColorField label="Color" value={layer.color} onChange={(v) => set({ color: v })} />
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className={`btn sm ${layer.bold ? 'is-on' : ''}`} aria-pressed={layer.bold} onClick={() => set({ bold: !layer.bold }, `${layer.id}:bold`)}>
              <b>B</b>
            </button>
            <button className={`btn sm ${layer.italic ? 'is-on' : ''}`} aria-pressed={layer.italic} onClick={() => set({ italic: !layer.italic }, `${layer.id}:italic`)}>
              <i>I</i>
            </button>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={`btn sm ${layer.align === a ? 'is-on' : ''}`} aria-pressed={layer.align === a} onClick={() => set({ align: a }, `${layer.id}:align`)}>
                {a[0].toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
          <ColorField label="Outline" value={layer.stroke} onChange={(v) => set({ stroke: v })} />
          <SliderField label="Outline size" value={layer.strokeWidth} min={0} max={12} step={0.5} precision={1} onChange={(v) => set({ strokeWidth: v })} />
          <SliderField label="Letter space" value={layer.spacing ?? 0} min={-4} max={40} step={0.5} precision={1} onChange={(v) => set({ spacing: v })} />
          <SliderField label="Curve" value={layer.curve ?? 0} min={-360} max={360} step={5} precision={0} onChange={(v) => set({ curve: v })} />
          <p className="hint">Curve bends the text along an arc: positive like a rainbow, negative like a smile. Curved text is centred.</p>
        </Section>
      )}

      {layer.type === 'shape' && (
        <Section title="Shape">
          <Row label="Shape">
            <select className="select" value={layer.shape} aria-label="Shape" onChange={(e) => set({ shape: e.target.value as ShapeType })}>
              {SHAPES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Fill">
            <input type="checkbox" checked={layer.fill !== 'none'} aria-label="Fill shape" onChange={(e) => set({ fill: e.target.checked ? '#e3242b' : 'none' }, `${layer.id}:fillon`)} />
            {layer.fill !== 'none' && <input type="color" value={layer.fill} aria-label="Fill color" onChange={(e) => set({ fill: e.target.value })} />}
          </Row>
          <ColorField label="Outline" value={layer.stroke} onChange={(v) => set({ stroke: v })} />
          <SliderField label="Outline size" value={layer.strokeWidth} min={0} max={20} step={0.5} precision={1} onChange={(v) => set({ strokeWidth: v })} />
          {layer.shape === 'rect' && <SliderField label="Corners" value={layer.radius} min={0} max={60} step={1} precision={0} onChange={(v) => set({ radius: v })} />}
        </Section>
      )}

      {layer.type === 'image' && (
        <Section title="Image">
          <Row label="Source">
            <select className="select" value={layer.imageId} aria-label="Image source" onChange={(e) => set({ imageId: e.target.value })}>
              {images.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </Row>
          <button className="btn sm" onClick={() => set({ flipX: !layer.flipX }, `${layer.id}:flip`)}>
            <FlipHorizontal2 size={13} /> Flip horizontally
          </button>
          {(() => {
            const src = images.find((i) => i.id === layer.imageId);
            const up = src ? layer.w / src.width : 1;
            return up > 2.2 ? <p className="hint warn-text">Enlarged {up.toFixed(1)}× from the original, so it may look soft.</p> : null;
          })()}
        </Section>
      )}

      {movable && (
        <Section title="Transform">
          <div className="vec3" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <NumberField label="X" tone="x" value={(layer as { x: number }).x} step={1} onChange={(v) => set({ x: v }, `${layer.id}:x`)} />
            <NumberField label="Y" tone="y" value={(layer as { y: number }).y} step={1} onChange={(v) => set({ y: v }, `${layer.id}:y`)} />
          </div>
          {layer.type !== 'text' && (
            <div className="vec3" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <NumberField label="W" value={(layer as { w: number }).w} step={1} min={1} onChange={(v) => set({ w: v }, `${layer.id}:w`)} />
              <NumberField label="H" value={(layer as { h: number }).h} step={1} min={1} onChange={(v) => set({ h: v }, `${layer.id}:h`)} />
            </div>
          )}
          <SliderField label="Rotation" value={(layer as { rotation: number }).rotation} min={-180} max={180} step={1} precision={0} onChange={(v) => set({ rotation: v }, `${layer.id}:rot`)} />
          <p className="hint">Positions are in template pixels. Drag handles on the canvas for quick scaling and rotating (Shift snaps to 15°).</p>
        </Section>
      )}

      {layer.type === 'paint' && (
        <Section title="Paint layer">
          <p className="dim">{layer.strokes.length} stroke{layer.strokes.length === 1 ? '' : 's'}. Use the brush tool to paint, or the eraser to remove paint from this layer.</p>
          <button className="btn sm danger" onClick={() => set({ strokes: [] }, `${layer.id}:clear`)} disabled={!layer.strokes.length}>
            Clear strokes
          </button>
        </Section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ bottom panel

export function PresetsTab() {
  const kind = useClothing((s) => s.activeKind);
  const hasLayers = useClothing((s) => s.designs[s.activeKind].length > 0);
  const insert = useClothing((s) => s.insertLayers);
  const askConfirm = useUI((s) => s.askConfirm);
  const list = presetsFor(kind);

  return (
    <div className="preset-tab">
      <div className="hint" style={{ padding: '8px 12px 0' }}>
        Presets for {TEMPLATES[kind].label}. They are normal layers, so you can change anything afterwards.
      </div>
      <div className="asset-grid" style={{ padding: 10 }}>
        {list.map((p) => (
          <div key={p.id} className="asset-card preset-card">
            <span className="preset-swatch" style={{ background: `linear-gradient(135deg, ${p.swatch[0]} 0 55%, ${p.swatch[1]} 55% 100%)` }} />
            <span className="asset-name">{p.name}</span>
            <span className="asset-desc">{p.description}</span>
            <span className="row" style={{ marginTop: 'auto', gap: 4 }}>
              <button
                className="btn sm primary"
                onClick={() => {
                  const apply = () => insert(p.build(), true);
                  if (hasLayers)
                    askConfirm({
                      title: `Replace the ${TEMPLATES[kind].label.toLowerCase()} design?`,
                      body: `“${p.name}” will replace every layer in this ${TEMPLATES[kind].label.toLowerCase()}. You can undo it with Ctrl+Z.`,
                      confirmLabel: 'Replace',
                      danger: true,
                      onConfirm: apply,
                    });
                  else apply();
                }}
              >
                Use
              </button>
              {hasLayers && (
                <button className="btn sm" onClick={() => insert(p.build(), false)}>
                  Add on top
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ImagesTab() {
  const images = useClothing((s) => s.images);
  const addLayer = useClothing((s) => s.addLayer);
  const remove = useClothing((s) => s.removeImage);
  const designs = useClothing((s) => s.designs);
  const removeUnused = useClothing((s) => s.removeUnusedImages);
  const askConfirm = useUI((s) => s.askConfirm);
  const toast = useUI((s) => s.toast);
  const unused = useMemo(() => new Set(unusedClothingImageIds(designs, images)), [designs, images]);
  return (
    <div className="tex-tab">
      <div className="tex-actions">
        <button
          className="btn"
          onClick={async () => {
            const files = await pickFiles('image/png,image/jpeg,image/webp,image/gif', true);
            for (const f of files) await uploadClothingImage(f, true);
          }}
        >
          <Upload size={14} /> Upload image
        </button>
        <button
          className="btn"
          title="Place an existing shirt, pants or T-shirt PNG at the bottom of this design"
          onClick={async () => {
            const [f] = await pickFiles('image/png,image/jpeg,image/webp', false);
            if (f) await importClothingTemplate(f);
          }}
        >
          <FileUp size={14} /> Import existing clothing PNG
        </button>
        {unused.size > 0 && (
          <button
            className="btn"
            title="Delete library images that no layer uses"
            onClick={() =>
              askConfirm({
                title: `Delete ${unused.size} unused image${unused.size === 1 ? '' : 's'}?`,
                body: 'These images are in the library but no layer uses them. Your designs are not affected. You can undo this.',
                confirmLabel: 'Delete unused',
                danger: true,
                onConfirm: () => toast('success', `Deleted ${removeUnused()} unused image${unused.size === 1 ? '' : 's'}`),
              })
            }
          >
            <BrushCleaning size={14} /> Clean up unused ({unused.size})
          </button>
        )}
        <span className="hint">PNG, JPG, WebP or GIF. You can also drop pictures on the editor.</span>
      </div>
      {images.length === 0 ? (
        <div className="empty">
          <strong>No images yet</strong>
          <span>Upload a logo or artwork, then place it on the chest, back or sleeves.</span>
        </div>
      ) : (
        <div className="tex-grid">
          {images.map((i) => (
            <div key={i.id} className="tex-card">
              <div className="tex-img" style={{ backgroundImage: `url(${i.dataUrl})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat' }} />
              <div className="tex-info">
                <div className="truncate tex-name">{i.name}</div>
                <div className="hint num">
                  {i.width}×{i.height}
                  {unused.has(i.id) ? ' · unused' : ''}
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn sm" onClick={() => addLayer('image', { image: i })}>
                    Add as layer
                  </button>
                  <button
                    className="icon-btn sm"
                    aria-label="Delete image"
                    onClick={() =>
                      askConfirm({
                        title: `Delete “${i.name}”?`,
                        body: 'Layers using this image are removed too. You can undo this.',
                        confirmLabel: 'Delete',
                        danger: true,
                        onConfirm: () => remove(i.id),
                      })
                    }
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type { ClothingKind };
