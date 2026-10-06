import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, Link2, Link2Off, Lock, LockOpen, Magnet, Save, Trash2 } from 'lucide-react';
import { SLOT_ANCHORS, SLOT_LABELS, BONES } from '../assets/avatar';
import { duplicateSelection, requestDelete } from '../editor/actions';
import { MaterialControls } from '../components/MaterialControls';
import { TextureControls } from '../components/TextureControls';
import { Section } from '../components/ui/Section';
import { forgetPaint } from '../utils/paint';
import { useEditor } from '../store/editor';
import { useLive } from '../store/live';
import { useUI } from '../store/ui';
import { useUserAssets } from '../store/userAssets';
import { usePaintBrush } from '../store/paintBrush';
import { ColorField, NumberField, SliderField, Switch } from '../components/ui/Fields';
import { LOW_POLY_KINDS, SHAPE_LABELS, getModelGeometry, getPrimitiveGeometry, triangleCount } from '../utils/geometry';
import { toSpec } from '../utils/scene';
import type { SceneObject, SlotId, Vec3 } from '../types';

function TransformSection({ obj }: { obj: SceneObject }) {
  const setTransform = useEditor((s) => s.setTransform);
  const live = useLive();
  const dragging = live.id === obj.id;
  const pos = dragging ? live.position : obj.position;
  const rot = dragging ? live.rotation : obj.rotation;
  const scl = dragging ? live.scale : obj.scale;
  const [uniform, setUniform] = useState(false);
  const locked = obj.locked;

  const setVec = (key: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2, v: number) => {
    const cur = key === 'position' ? obj.position : key === 'rotation' ? obj.rotation : obj.scale;
    const next = [...cur] as Vec3;
    if (key === 'scale' && uniform && cur[axis] > 0) {
      const f = v / cur[axis];
      next[0] = cur[0] * f;
      next[1] = cur[1] * f;
      next[2] = cur[2] * f;
    } else next[axis] = v;
    setTransform(obj.id, { [key]: next }, `${obj.id}:${key}`);
  };

  const row = (label: string, key: 'position' | 'rotation' | 'scale', vals: Vec3, step: number, min?: number, extra?: React.ReactNode) => (
    <div>
      <div className="prop-label row" style={{ justifyContent: 'space-between' }}>
        <span>{label}</span>
        {extra}
      </div>
      <div className="vec3">
        {(['X', 'Y', 'Z'] as const).map((a, i) => (
          <NumberField key={a} label={a} tone={a.toLowerCase() as 'x' | 'y' | 'z'} value={vals[i]} step={step} min={min} disabled={locked} onChange={(v) => setVec(key, i as 0 | 1 | 2, v)} />
        ))}
      </div>
    </div>
  );

  return (
    <Section title="Transform">
      {row('Position (studs)', 'position', pos, 0.1)}
      {row('Rotation (degrees)', 'rotation', rot, 5)}
      {row(
        'Scale (size in studs)',
        'scale',
        scl,
        0.1,
        0.01,
        <button className={`icon-btn sm ${uniform ? 'active' : ''}`} aria-pressed={uniform} title={uniform ? 'Uniform scale on' : 'Uniform scale off'} onClick={() => setUniform((u) => !u)}>
          {uniform ? <Link2 size={13} /> : <Link2Off size={13} />}
        </button>,
      )}
      {obj.locked && <p className="hint">This part is locked. Unlock it in the Object section to edit.</p>}
    </Section>
  );
}

function ObjectSection({ obj }: { obj: SceneObject }) {
  const layers = useEditor((s) => s.layers);
  const rig = useEditor((s) => s.rig);
  const models = useEditor((s) => s.models);
  const toggleVisible = useEditor((s) => s.toggleVisible);
  const toggleLock = useEditor((s) => s.toggleLock);
  const setLayer = useEditor((s) => s.setObjectLayer);
  const updateObject = useEditor((s) => s.updateObject);
  const setTransform = useEditor((s) => s.setTransform);
  const rename = useEditor((s) => s.renameObject);
  const setDetail = useEditor((s) => s.setDetail);
  const addUser = useUserAssets((s) => s.add);
  const askText = useUI((s) => s.askText);
  const toast = useUI((s) => s.toast);
  const [name, setName] = useState(obj.name);
  useEffect(() => setName(obj.name), [obj.name, obj.id]);

  const tris = obj.kind === 'group' ? null : triangleCount(obj.kind === 'imported' ? (obj.modelId && models[obj.modelId] ? getModelGeometry(models[obj.modelId]) : getPrimitiveGeometry('cube')) : getPrimitiveGeometry(obj.kind, obj.detail));

  return (
    <Section title="Object">
      <div className="field">
        <label htmlFor="obj-name">Name</label>
        <input
          id="obj-name"
          className="input"
          value={name}
          maxLength={48}
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== obj.name && rename(obj.id, name)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setName(obj.name);
              (e.target as HTMLInputElement).blur();
            }
            e.stopPropagation();
          }}
        />
      </div>
      <div className="kv">
        <span className="dim">Type</span>
        <span>{SHAPE_LABELS[obj.kind]}</span>
        {tris !== null && (
          <>
            <span className="dim">Triangles</span>
            <span className="num">{tris.toLocaleString()}</span>
          </>
        )}
      </div>
      {LOW_POLY_KINDS.includes(obj.kind) && (
        <div className="field">
          <label htmlFor="obj-detail">Detail</label>
          <select id="obj-detail" className="select" value={obj.detail ?? 'normal'} onChange={(e) => setDetail(obj.id, e.target.value as 'low' | 'normal')}>
            <option value="normal">Normal</option>
            <option value="low">Low-poly (far fewer triangles)</option>
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="obj-layer">Layer</label>
        <select id="obj-layer" className="select" value={obj.layerId} onChange={(e) => setLayer(obj.id, e.target.value)}>
          {layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      {obj.kind === 'group' && !obj.parentId && (
        <div className="field">
          <label htmlFor="obj-slot">Attachment slot</label>
          <div className="row">
            <select id="obj-slot" className="select" value={obj.slot ?? 'accessory'} onChange={(e) => updateObject(obj.id, { slot: e.target.value as SlotId }, undefined, 'Changed slot')}>
              {(Object.keys(SLOT_LABELS) as SlotId[]).map((s) => (
                <option key={s} value={s}>
                  {SLOT_LABELS[s]}
                </option>
              ))}
            </select>
            <button
              className="btn sm"
              title="Move the accessory to this slot's attachment point on the avatar"
              onClick={() => {
                const slot = obj.slot ?? 'accessory';
                setTransform(obj.id, { position: [...SLOT_ANCHORS[rig][slot]] as Vec3 });
                toast('success', `Snapped to the ${SLOT_LABELS[slot].toLowerCase()} slot`);
              }}
            >
              <Magnet size={13} /> Snap
            </button>
          </div>
        </div>
      )}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => toggleVisible(obj.id)} aria-pressed={!obj.visible}>
          {obj.visible ? <Eye size={13} /> : <EyeOff size={13} />} {obj.visible ? 'Visible' : 'Hidden'}
        </button>
        <button className="btn sm" onClick={() => toggleLock(obj.id)} aria-pressed={obj.locked}>
          {obj.locked ? <Lock size={13} /> : <LockOpen size={13} />} {obj.locked ? 'Locked' : 'Unlocked'}
        </button>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={duplicateSelection}>
          <Copy size={13} /> Duplicate
        </button>
        {obj.kind === 'group' && !obj.parentId && (
          <button
            className="btn sm"
            onClick={() =>
              askText({
                title: 'Save as asset',
                label: 'Asset name',
                initial: obj.name,
                confirmLabel: 'Save asset',
                onSubmit: (value) => {
                  const ed = useEditor.getState();
                  const spec = { ...toSpec(ed.objects, ed.order, obj.id, ed.layers), name: value };
                  const slot = obj.slot ?? 'accessory';
                  const cat = slot === 'hat' ? 'hats' : slot === 'hair' ? 'hair' : slot === 'face' ? 'face' : slot === 'back' ? 'back' : slot === 'shoulder' ? 'shoulder' : slot === 'waist' ? 'waist' : 'accessories';
                  if (Object.values(ed.objects).some((o) => o.parentId === obj.id && o.kind === 'imported')) {
                    toast('warn', 'Imported meshes are saved as cubes in assets. Keep the project file for the real mesh.');
                  }
                  if (addUser(value, cat, slot, spec)) toast('success', `Saved "${value}" to your ${cat} library`);
                  else toast('error', 'Could not save the asset. Browser storage may be full.');
                },
              })
            }
          >
            <Save size={13} /> Save as asset
          </button>
        )}
        <button className="btn sm danger" onClick={() => requestDelete(obj.id)}>
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </Section>
  );
}

function PaintSection({ obj }: { obj: SceneObject | undefined }) {
  const brush = usePaintBrush();
  const setRes = useEditor((s) => s.setPaintRes);
  const clear = useEditor((s) => s.clearPaint);
  const remove = useEditor((s) => s.removePaint);
  const canPaint = !!obj && obj.kind !== 'group';
  return (
    <Section title="Paint">
      <ColorField label="Color" value={brush.color} onChange={(v) => brush.set({ color: v })} />
      {brush.recent.length > 0 && (
        <div className="swatches" aria-label="Recent colors">
          {brush.recent.map((c) => (
            <button key={c} className="swatch" style={{ background: c }} aria-label={`Use ${c}`} title={c} onClick={() => brush.set({ color: c })} />
          ))}
        </div>
      )}
      <SliderField label="Size" value={brush.sizePct} min={1} max={30} step={0.5} precision={1} onChange={(v) => brush.set({ sizePct: v })} />
      <SliderField label="Hardness" value={brush.hardness} min={0} max={1} step={0.05} onChange={(v) => brush.set({ hardness: v })} />
      <SliderField label="Opacity" value={brush.opacity} min={0.05} max={1} step={0.05} onChange={(v) => brush.set({ opacity: v })} />
      <div className="slider-row" style={{ gridTemplateColumns: '72px 1fr' }}>
        <span className="slider-label">Eraser</span>
        <Switch checked={brush.erase} onChange={(v) => brush.set({ erase: v })} label="Eraser" />
      </div>
      {canPaint ? (
        <>
          <div className="slider-row" style={{ gridTemplateColumns: '72px 1fr' }}>
            <span className="slider-label">Texture</span>
            <select className="select" aria-label="Paint texture size" value={obj!.paint?.res ?? 256} onChange={(e) => setRes(obj!.id, parseInt(e.target.value, 10) as 128 | 256 | 512)}>
              <option value={128}>128 × 128 (lightest)</option>
              <option value={256}>256 × 256</option>
              <option value={512}>512 × 512 (sharpest)</option>
            </select>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn sm" disabled={!obj!.paint?.strokes.length} onClick={() => clear(obj!.id)}>
              Clear paint
            </button>
            <button
              className="btn sm danger"
              disabled={!obj!.paint}
              title="Go back to the plain color and texture mapping"
              onClick={() => {
                forgetPaint(obj!.id);
                remove(obj!.id);
              }}
            >
              Remove paint
            </button>
          </div>
        </>
      ) : (
        <p className="hint">Select a part, or just start painting on one.</p>
      )}
      <p className="hint">Drag on a part in the viewport. Painting turns the part's color and texture into one hand-painted texture with its own unwrapped UVs, so every face can be painted separately. Drag on empty space to orbit. Esc returns to Select.</p>
    </Section>
  );
}

function AvatarPartInfo({ name }: { name: string }) {
  const rig = useEditor((s) => s.rig);
  const bone = BONES[rig].find((b) => b.name === name);
  if (!bone) return null;
  return (
    <div className="col" style={{ padding: 12 }}>
      <h3 className="panel-title">{bone.name}</h3>
      <div className="kv">
        <span className="dim">Type</span>
        <span>Avatar part ({rig})</span>
        <span className="dim">Size</span>
        <span className="num">{bone.size.join(' × ')} studs</span>
        <span className="dim">Centre</span>
        <span className="num">{bone.center.join(', ')}</span>
      </div>
      <p className="hint">The mannequin is a locked reference so you can judge fit. Select one of your own parts to edit it.</p>
    </div>
  );
}

export function PropertiesPanel() {
  const id = useEditor((s) => s.selectedId);
  const obj = useEditor((s) => (s.selectedId ? s.objects[s.selectedId] : undefined));
  const avatarPart = useEditor((s) => s.selectedAvatarPart);
  const count = useEditor((s) => Object.keys(s.objects).length);
  const painting = useEditor((s) => s.tool === 'paint');

  if (avatarPart) return <AvatarPartInfo name={avatarPart} />;
  if (!id || !obj) {
    return (
      <>
        {painting && <PaintSection obj={undefined} />}
        <div className="empty">
          <strong>{count ? 'Nothing selected' : 'Empty project'}</strong>
          <span>{count ? 'Click a part in the viewport or the Scene list to edit its properties.' : 'Add a part from the toolbox, or pick a preset in the Assets tab.'}</span>
        </div>
      </>
    );
  }
  return (
    <div className="props">
      {painting && <PaintSection obj={obj} />}
      <TransformSection obj={obj} />
      {obj.kind !== 'group' ? (
        <Section title="Appearance">
          {obj.paint && <p className="hint">This part is hand-painted. Color and texture below are the starting layer under your brush strokes.</p>}
          <MaterialControls id={obj.id} />
        </Section>
      ) : (
        <Section title="Appearance">
          <p className="hint">Groups have no material of their own. Select a part inside the group, or use “Apply to all parts” in the Materials tab.</p>
        </Section>
      )}
      <ObjectSection obj={obj} />
      {obj.kind !== 'group' && (
        <Section title="Texture">
          <TextureControls id={obj.id} />
        </Section>
      )}
    </div>
  );
}
