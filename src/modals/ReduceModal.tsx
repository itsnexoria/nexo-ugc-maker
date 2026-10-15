import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { Modal } from '../components/ui/Overlays';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { LIMITS } from '../utils/validation';

/** Draws a mesh's edges from a three-quarter view, scaled to fit the canvas. */
function drawWire(canvas: HTMLCanvasElement | null, g: THREE.BufferGeometry | null, color: string) {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!g) return;
  const pos = g.attributes.position;
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  const ay = 0.6;
  const ax = -0.35;
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const project = (i: number): [number, number] => {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    return [x1, y * cx - z1 * sx];
  };
  g.computeBoundingSphere();
  const r = g.boundingSphere?.radius || 1;
  const c = g.boundingSphere!.center;
  const [ox, oy] = (() => {
    const p = project(0);
    void p;
    const x = c.x;
    const y = c.y;
    const z = c.z;
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    return [x1, y * cx - z1 * sx];
  })();
  const k = (Math.min(canvas.width, canvas.height) / 2 - 6) / r;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let t = 0; t < n; t += 3) {
    const a = project(idx ? idx.getX(t) : t);
    const b = project(idx ? idx.getX(t + 1) : t + 1);
    const d = project(idx ? idx.getX(t + 2) : t + 2);
    for (const [p, q] of [[a, b], [b, d], [d, a]] as [number, number][][]) {
      ctx.moveTo(canvas.width / 2 + (p[0] - ox) * k, canvas.height / 2 - (p[1] - oy) * k);
      ctx.lineTo(canvas.width / 2 + (q[0] - ox) * k, canvas.height / 2 - (q[1] - oy) * k);
    }
  }
  ctx.stroke();
}

export function ReduceModal() {
  const close = useUI((s) => s.closeModal);
  const toast = useUI((s) => s.toast);
  const id = useEditor((s) => s.selectedId);
  const name = useEditor((s) => (s.selectedId ? s.objects[s.selectedId]?.name : ''));
  const [percent, setPercent] = useState(50);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ before: number; after: number } | null>(null);
  const result = useRef<THREE.BufferGeometry | null>(null);
  const beforeCanvas = useRef<HTMLCanvasElement>(null);
  const afterCanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let live = true;
    if (!id) return;
    setBusy(true);
    const timer = setTimeout(() => {
      void import('../editor/modifiers').then(async (m) => {
        const base = await m.previewReduction(id, 1_000_000);
        if (!base || !live) return;
        const r = await m.previewReduction(id, Math.max(4, Math.round((base.before * percent) / 100)));
        if (!r || !live) return;
        result.current = r.geometry;
        setInfo({ before: r.before, after: r.after });
        drawWire(beforeCanvas.current, r.original, '#8a8a95');
        drawWire(afterCanvas.current, r.geometry, '#ff6b70');
        setBusy(false);
      });
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id, percent]);

  const apply = async () => {
    if (!id || !result.current) return;
    const m = await import('../editor/modifiers');
    if (m.applyReduction(id, result.current)) toast('success', `Reduced “${name}” from ${info?.before.toLocaleString()} to ${info?.after.toLocaleString()} triangles.`);
    close();
  };

  return (
    <Modal
      title={`Reduce triangles: ${name}`}
      size="narrow"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !info || info.after >= info.before} onClick={() => void apply()}>
            Apply
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 10 }}>
        <figure style={{ margin: 0, flex: 1 }}>
          <canvas ref={beforeCanvas} width={220} height={200} style={{ width: '100%', background: 'var(--bg-sunken, #0f0f12)', border: '1px solid var(--border)' }} aria-label="Wireframe before" />
          <figcaption className="hint">Before: {info ? info.before.toLocaleString() : '…'} triangles</figcaption>
        </figure>
        <figure style={{ margin: 0, flex: 1 }}>
          <canvas ref={afterCanvas} width={220} height={200} style={{ width: '100%', background: 'var(--bg-sunken, #0f0f12)', border: '1px solid var(--border)' }} aria-label="Wireframe after" />
          <figcaption className="hint">After: {info ? info.after.toLocaleString() : '…'} triangles</figcaption>
        </figure>
      </div>
      <label className="row" style={{ marginTop: 10, gap: 8 }}>
        <span style={{ width: 90 }}>Keep {percent}%</span>
        <input type="range" min={5} max={100} step={1} value={percent} aria-label="Percent of triangles to keep" onChange={(e) => setPercent(Number(e.target.value))} style={{ flex: 1 }} />
      </label>
      <p className="hint">
        Collapses the least important edges first, so the silhouette and textures stay in place. Roblox accessories are limited to {LIMITS.maxTriangles.toLocaleString()} triangles. You can undo this.
      </p>
    </Modal>
  );
}
