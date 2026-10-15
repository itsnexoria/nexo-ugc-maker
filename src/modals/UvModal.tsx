import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../components/ui/Overlays';
import { NumberField } from '../components/ui/Fields';
import { ownGeometry } from '../editor/modifiers';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { UV_OP_LABEL, editUv, hasUsableUvs, uvToTexture, type UvOp } from '../utils/uvOps';

const SIZE = 340;
const PAD = 24;
const SPAN = SIZE - PAD * 2;

/**
 * Shows where a part's triangles land on its texture (with the material's tiling, offset and turn applied),
 * lets you drag or scroll to change that placement, and edits the mesh's own uvs (flip, turn, fill, auto unwrap).
 */
export function UvModal() {
  const close = useUI((s) => s.closeModal);
  const toast = useUI((s) => s.toast);
  const id = useEditor((s) => s.selectedId);
  const obj = useEditor((s) => (s.selectedId ? s.objects[s.selectedId] : undefined));
  const models = useEditor((s) => s.models);
  const textures = useEditor((s) => s.textures);
  const setMaterial = useEditor((s) => s.setMaterial);
  const setObjectMesh = useEditor((s) => s.setObjectMesh);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const geometry = useMemo(() => (obj ? ownGeometry(obj, models) : null), [obj, models]);
  const mat = obj?.material;
  const tex = mat?.textureId ? textures.find((t) => t.id === mat.textureId) : undefined;
  const usable = geometry ? hasUsableUvs(geometry) : false;

  useEffect(() => {
    setImg(null);
    if (!tex) return;
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = tex.dataUrl;
  }, [tex]);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#17171b';
    ctx.fillRect(PAD, PAD, SPAN, SPAN);
    if (img) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(img, PAD, PAD, SPAN, SPAN);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = '#4a4a55';
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD + 0.5, PAD + 0.5, SPAN, SPAN);
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      ctx.moveTo(PAD + (SPAN * i) / 4, PAD);
      ctx.lineTo(PAD + (SPAN * i) / 4, PAD + SPAN);
      ctx.moveTo(PAD, PAD + (SPAN * i) / 4);
      ctx.lineTo(PAD + SPAN, PAD + (SPAN * i) / 4);
    }
    ctx.strokeStyle = 'rgba(120,120,135,0.35)';
    ctx.stroke();
    if (!geometry || !mat) return;
    const uv = geometry.attributes.uv;
    const idx = geometry.index;
    const n = idx ? idx.count : uv?.count ?? 0;
    if (!uv) return;
    const pt = (i: number): [number, number] => {
      const [tu, tv] = uvToTexture(uv.getX(i), uv.getY(i), mat.texRepeat as [number, number], mat.texOffset as [number, number], mat.texRotation);
      return [PAD + tu * SPAN, PAD + (1 - tv) * SPAN];
    };
    ctx.strokeStyle = '#ff6b70';
    ctx.fillStyle = 'rgba(255,107,112,0.10)';
    ctx.lineWidth = 0.8;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SIZE, SIZE);
    ctx.clip();
    for (let t = 0; t < n; t += 3) {
      const a = pt(idx ? idx.getX(t) : t);
      const b = pt(idx ? idx.getX(t + 1) : t + 1);
      const d = pt(idx ? idx.getX(t + 2) : t + 2);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }, [geometry, mat, img]);

  if (!id || !obj || !mat) return null;
  const set = (patch: Partial<typeof mat>, key: string) => setMaterial(id, patch, key);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const scale = (e.currentTarget as HTMLElement).getBoundingClientRect().width / SIZE;
    const du = (e.clientX - d.x) / (SPAN * scale);
    const dv = -(e.clientY - d.y) / (SPAN * scale);
    drag.current = { x: e.clientX, y: e.clientY };
    set({ texOffset: [mat.texOffset[0] + du, mat.texOffset[1] + dv] }, 'uvdrag');
  };
  const onWheel = (e: React.WheelEvent) => {
    const f = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    set({ texRepeat: [Math.max(0.05, Math.min(32, mat.texRepeat[0] * f)), Math.max(0.05, Math.min(32, mat.texRepeat[1] * f))] }, 'uvwheel');
  };

  const run = (op: UvOp) => {
    if (!geometry) return;
    if (obj.paint) return toast('error', 'Hand-painted parts keep their uvs, because the paint is tied to them.');
    if (setObjectMesh(id, editUv(geometry, op), `${UV_OP_LABEL[op]} (uv): ${obj.name}`)) toast('success', `${UV_OP_LABEL[op]}: done. You can undo this.`);
  };

  return (
    <Modal title={`UV layout: ${obj.name}`} size="narrow" onClose={close} footer={<button className="btn primary" onClick={close}>Done</button>}>
      <canvas
        ref={canvas}
        width={SIZE}
        height={SIZE}
        style={{ width: '100%', maxWidth: SIZE, touchAction: 'none', cursor: 'grab', border: '1px solid var(--border)', display: 'block', margin: '0 auto' }}
        role="img"
        aria-label="Where this part's triangles sit on its texture. Drag to move, scroll to change tiling."
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onWheel={onWheel}
      />
      <p className="hint">
        {!tex ? 'This part has no texture yet, so the grid is empty. ' : ''}
        {!usable ? 'This mesh has no usable uvs: use Auto unwrap. ' : 'Drag to move the triangles on the texture, scroll to tile them.'}
      </p>
      <div className="grid-2" style={{ gap: 6 }}>
        <NumberField label="Offset X" value={mat.texOffset[0]} step={0.01} precision={3} onChange={(v) => set({ texOffset: [v, mat.texOffset[1]] }, 'uvox')} />
        <NumberField label="Offset Y" value={mat.texOffset[1]} step={0.01} precision={3} onChange={(v) => set({ texOffset: [mat.texOffset[0], v] }, 'uvoy')} />
        <NumberField label="Tile X" value={mat.texRepeat[0]} step={0.05} min={0.05} max={32} precision={2} onChange={(v) => set({ texRepeat: [v, mat.texRepeat[1]] }, 'uvrx')} />
        <NumberField label="Tile Y" value={mat.texRepeat[1]} step={0.05} min={0.05} max={32} precision={2} onChange={(v) => set({ texRepeat: [mat.texRepeat[0], v] }, 'uvry')} />
        <NumberField label="Turn°" value={mat.texRotation} step={1} min={-180} max={180} precision={0} onChange={(v) => set({ texRotation: v }, 'uvrot')} />
        <button className="btn sm" onClick={() => set({ texOffset: [0, 0], texRepeat: [1, 1], texRotation: 0 }, 'uvreset')}>
          Reset placement
        </button>
      </div>
      <h3 className="panel-title" style={{ marginTop: 10 }}>
        Change the mesh's uvs
      </h3>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {(Object.keys(UV_OP_LABEL) as UvOp[]).map((op) => (
          <button key={op} className="btn sm" disabled={!geometry} onClick={() => run(op)}>
            {UV_OP_LABEL[op]}
          </button>
        ))}
      </div>
    </Modal>
  );
}
