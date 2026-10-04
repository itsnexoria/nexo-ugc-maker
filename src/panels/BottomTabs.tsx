import { useMemo, useState } from 'react';
import { Eye, EyeOff, ImagePlus, Lock, LockOpen, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { AssetGrid, ImportModelButton } from '../components/AssetGrid';
import { MaterialControls } from '../components/MaterialControls';
import { MaterialPreview } from '../components/MaterialPreview';
import { MaterialSwatch } from '../components/MaterialSwatch';
import { ColorField } from '../components/ui/Fields';
import { ACCESSORY_CATEGORIES, CATEGORY_LABELS, CATEGORY_ORDER } from '../assets/presets';
import { MATERIAL_PRESETS } from '../assets/materials';
import { applyMaterialPresetToSelection } from '../editor/library';
import { pickFiles, textureFromFile, uploadTexture } from '../editor/importers';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { SHAPE_LABELS, getModelGeometry, getPrimitiveGeometry, triangleCount } from '../utils/geometry';
import type { AssetCategory } from '../types';

export function ObjectsTab() {
  const objects = useEditor((s) => s.objects);
  const order = useEditor((s) => s.order);
  const layers = useEditor((s) => s.layers);
  const models = useEditor((s) => s.models);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const toggleVisible = useEditor((s) => s.toggleVisible);
  const toggleLock = useEditor((s) => s.toggleLock);

  const rows = useMemo(
    () =>
      order
        .map((id) => objects[id])
        .filter(Boolean)
        .map((o) => {
          let size = '—';
          let tris = 0;
          if (o.kind !== 'group') {
            const g = o.kind === 'imported' ? (o.modelId && models[o.modelId] ? getModelGeometry(models[o.modelId]) : null) : getPrimitiveGeometry(o.kind, o.detail);
            if (g?.boundingBox) {
              const b = g.boundingBox;
              size = [(b.max.x - b.min.x) * o.scale[0], (b.max.y - b.min.y) * o.scale[1], (b.max.z - b.min.z) * o.scale[2]].map((n) => Math.round(n * 100) / 100).join(' × ');
              tris = triangleCount(g);
            }
          }
          return { o, size, tris, layer: layers.find((l) => l.id === o.layerId)?.name ?? '—' };
        }),
    [objects, order, layers, models],
  );

  if (!rows.length) {
    return (
      <div className="empty">
        <strong>No objects</strong>
        <span>Parts you add appear here with their size and triangle count.</span>
      </div>
    );
  }
  return (
    <table className="grid-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Size (studs)</th>
          <th className="r">Tris</th>
          <th>Layer</th>
          <th className="c">Show</th>
          <th className="c">Lock</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ o, size, tris, layer }) => (
          <tr key={o.id} className={selectedId === o.id ? 'selected' : ''} onClick={() => select(o.id)}>
            <td className="truncate">{o.name}</td>
            <td className="dim">{SHAPE_LABELS[o.kind]}</td>
            <td className="num dim">{size}</td>
            <td className="num r">{tris || '—'}</td>
            <td className="dim">{layer}</td>
            <td className="c">
              <button className="icon-btn sm" aria-label={o.visible ? 'Hide' : 'Show'} onClick={(e) => (e.stopPropagation(), toggleVisible(o.id))}>
                {o.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
            </td>
            <td className="c">
              <button className="icon-btn sm" aria-label={o.locked ? 'Unlock' : 'Lock'} onClick={(e) => (e.stopPropagation(), toggleLock(o.id))}>
                {o.locked ? <Lock size={12} /> : <LockOpen size={12} />}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MaterialsTab() {
  const id = useEditor((s) => s.selectedId);
  const obj = useEditor((s) => (s.selectedId ? s.objects[s.selectedId] : undefined));
  const applyAll = useEditor((s) => s.applyMaterialToAll);
  const isPart = !!obj && obj.kind !== 'group';

  return (
    <div className="mat-tab">
      <div className="mat-col presets">
        <div className="col-title">Presets</div>
        <div className="preset-grid">
          {MATERIAL_PRESETS.map((p) => (
            <button key={p.id} className={`preset ${obj?.material.preset === p.id ? 'on' : ''}`} onClick={() => applyMaterialPresetToSelection(p.id)} title={p.note}>
              <MaterialSwatch preset={p} color={isPart ? obj!.material.color : undefined} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mat-col preview">
        <div className="col-title">Live preview</div>
        {isPart ? <MaterialPreview obj={obj!} /> : <div className="empty"><span>Select a part to preview its material.</span></div>}
      </div>
      <div className="mat-col controls">
        <div className="col-title row">
          <span className="grow">{isPart ? obj!.name : 'Material'}</span>
          {isPart && (
            <button className="btn sm" onClick={() => applyAll(obj!.id)} title="Copy this material to every part in the same accessory">
              Apply to all parts
            </button>
          )}
        </div>
        {isPart && id ? <MaterialControls id={id} /> : <div className="empty"><span>No part selected.</span></div>}
      </div>
    </div>
  );
}

export function TexturesTab() {
  const textures = useEditor((s) => s.textures);
  const objects = useEditor((s) => s.objects);
  const selectedId = useEditor((s) => s.selectedId);
  const setMaterial = useEditor((s) => s.setMaterial);
  const rename = useEditor((s) => s.renameTexture);
  const del = useEditor((s) => s.deleteTexture);
  const replace = useEditor((s) => s.replaceTexture);
  const askConfirm = useUI((s) => s.askConfirm);
  const toast = useUI((s) => s.toast);
  const [editing, setEditing] = useState<string | null>(null);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of Object.values(objects)) if (o.material.textureId) m.set(o.material.textureId, (m.get(o.material.textureId) ?? 0) + 1);
    return m;
  }, [objects]);
  const sel = selectedId ? objects[selectedId] : null;
  const canApply = !!sel && sel.kind !== 'group';

  return (
    <div className="tex-tab">
      <div className="tex-actions">
        <button
          className="btn"
          onClick={async () => {
            const files = await pickFiles('image/png,image/jpeg,image/webp', true);
            for (const f of files) await uploadTexture(f);
          }}
        >
          <Upload size={14} /> Upload texture
        </button>
        <span className="hint">PNG, JPG or WebP. You can also drop images on the viewport. Roblox accepts up to 1024×1024.</span>
      </div>
      {textures.length === 0 ? (
        <div className="empty">
          <strong>No textures yet</strong>
          <span>Upload an image or add a starter texture from the Assets tab.</span>
        </div>
      ) : (
        <div className="tex-grid">
          {textures.map((t) => {
            const inUse = usage.get(t.id) ?? 0;
            const tooBig = t.width > 1024 || t.height > 1024;
            return (
              <div key={t.id} className="tex-card">
                <div className="tex-img" style={{ backgroundImage: `url(${t.dataUrl})` }} />
                <div className="tex-info">
                  {editing === t.id ? (
                    <input
                      className="input"
                      autoFocus
                      defaultValue={t.name}
                      onFocus={(e) => e.currentTarget.select()}
                      onBlur={(e) => (rename(t.id, e.target.value), setEditing(null))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') setEditing(null);
                        e.stopPropagation();
                      }}
                    />
                  ) : (
                    <div className="truncate tex-name" title="Double-click to rename" onDoubleClick={() => setEditing(t.id)}>
                      {t.name}
                    </div>
                  )}
                  <div className={`hint num ${tooBig ? 'warn-text' : ''}`}>
                    {t.width}×{t.height}
                    {tooBig ? ' · over 1024' : ''} · {inUse ? `used by ${inUse}` : 'unused'}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn sm" disabled={!canApply} title={canApply ? 'Apply to selected part' : 'Select a part first'} onClick={() => selectedId && setMaterial(selectedId, { textureId: t.id, color: '#ffffff' })}>
                      Apply
                    </button>
                    <button
                      className="icon-btn sm"
                      aria-label="Replace image"
                      title="Replace image"
                      onClick={async () => {
                        const [f] = await pickFiles('image/png,image/jpeg,image/webp');
                        if (!f) return;
                        try {
                          const n = await textureFromFile(f);
                          replace(t.id, { dataUrl: n.dataUrl, width: n.width, height: n.height, name: t.name });
                          toast('success', `Replaced "${t.name}"`);
                        } catch (e) {
                          toast('error', e instanceof Error ? e.message : 'Could not replace the texture.');
                        }
                      }}
                    >
                      <RefreshCw size={12} />
                    </button>
                    <button
                      className="icon-btn sm"
                      aria-label="Delete texture"
                      title="Delete texture"
                      onClick={() =>
                        askConfirm({
                          title: `Delete “${t.name}”?`,
                          body: inUse ? `It is used by ${inUse} part${inUse === 1 ? '' : 's'}. They will lose the texture. You can undo this.` : 'Remove this texture from the library.',
                          confirmLabel: 'Delete',
                          danger: true,
                          onConfirm: () => del(t.id),
                        })
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LayersTab() {
  const layers = useEditor((s) => s.layers);
  const objects = useEditor((s) => s.objects);
  const update = useEditor((s) => s.updateLayer);
  const remove = useEditor((s) => s.removeLayer);
  const add = useEditor((s) => s.addLayer);
  const askText = useUI((s) => s.askText);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of Object.values(objects)) m.set(o.layerId, (m.get(o.layerId) ?? 0) + 1);
    return m;
  }, [objects]);

  return (
    <div className="layers-tab">
      <div className="row" style={{ padding: '8px 10px' }}>
        <span className="hint grow">Layers group parts so you can hide or lock them together, for example the glowing details.</span>
        <button className="btn sm" onClick={() => askText({ title: 'New layer', label: 'Layer name', initial: 'Layer', confirmLabel: 'Add layer', onSubmit: add })}>
          <Plus size={13} /> Add layer
        </button>
      </div>
      {layers.map((l) => (
        <div key={l.id} className="layer-row">
          <button className="icon-btn sm" aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} onClick={() => update(l.id, { visible: !l.visible })}>
            {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button className="icon-btn sm" aria-label={l.locked ? `Unlock ${l.name}` : `Lock ${l.name}`} onClick={() => update(l.id, { locked: !l.locked })}>
            {l.locked ? <Lock size={13} /> : <LockOpen size={13} />}
          </button>
          <input
            className="layer-name"
            defaultValue={l.name}
            key={l.name}
            aria-label="Layer name"
            onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && update(l.id, { name: e.target.value.trim() })}
            onKeyDown={(e) => (e.key === 'Enter' && e.currentTarget.blur(), e.stopPropagation())}
          />
          <span className="faint num">{counts.get(l.id) ?? 0} objects</span>
          <button className="icon-btn sm" aria-label={`Delete ${l.name}`} disabled={layers.length <= 1} onClick={() => remove(l.id)}>
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function AssetsTab() {
  const [cat, setCat] = useState<AssetCategory>('hats');
  return (
    <div className="assets-tab">
      <div className="asset-cats" role="tablist" aria-label="Asset categories">
        {CATEGORY_ORDER.map((c) => (
          <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
        <div className="grow" />
        <div className="asset-cat-actions">
          <ImportModelButton />
          <ImportTexture />
        </div>
      </div>
      <div className="asset-body">
        <AssetGrid category={cat} />
      </div>
    </div>
  );
}

function ImportTexture() {
  return (
    <button
      className="btn"
      onClick={async () => {
        const files = await pickFiles('image/png,image/jpeg,image/webp', true);
        for (const f of files) await uploadTexture(f);
      }}
    >
      <ImagePlus size={14} /> Upload texture
    </button>
  );
}

export function ConsoleTab() {
  const logs = useUI((s) => s.logs);
  const clear = useUI((s) => s.clearLogs);
  return (
    <div className="console">
      <div className="console-bar">
        <span className="hint grow">{logs.length} messages</span>
        <button className="btn sm" onClick={clear}>
          Clear
        </button>
      </div>
      <div className="console-lines" role="log">
        {logs.length === 0 && <div className="empty"><span>The console is empty.</span></div>}
        {[...logs].reverse().map((l) => (
          <div key={l.id} className={`log ${l.level}`}>
            <span className="log-time num">{new Date(l.time).toLocaleTimeString([], { hour12: false })}</span>
            <span className="log-level">{l.level}</span>
            <span>{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { ACCESSORY_CATEGORIES, ColorField };
