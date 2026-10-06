import { useCallback, useEffect, useRef, useState } from 'react';
import { selectedLayer, useClothing } from '../store/clothing';
import type { ClothingLayer, ImageLayer, ShapeLayer, TextLayer } from '../types';
import { ensureComposite, canvasFor, getComposite } from './composite';
import { flushStroke, queueStrokePoint } from './strokeBatch';
import { layerBox, pointInBox, type LayerBox } from './render';
import { TEMPLATES } from './templates';
import { r15JointOffsets } from './mapping';
import { useEditor } from '../store/editor';

interface View {
  zoom: number;
  x: number;
  y: number;
}

type Drag =
  | { mode: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { mode: 'move'; id: string; sx: number; sy: number; ox: number; oy: number }
  | { mode: 'scale'; id: string; cx: number; cy: number; d0: number; w: number; h: number; size: number }
  | { mode: 'rotate'; id: string; cx: number; cy: number; offset: number }
  | { mode: 'paint'; layerId: string; index: number; mirrorIndex: number | null };

const HANDLE = 5;

let checkerTile: HTMLCanvasElement | null = null;
function checkerPattern(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  if (!checkerTile) {
    checkerTile = document.createElement('canvas');
    checkerTile.width = checkerTile.height = 16;
    const g = checkerTile.getContext('2d')!;
    g.fillStyle = '#2a2a30';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#222227';
    g.fillRect(0, 0, 8, 8);
    g.fillRect(8, 8, 8, 8);
  }
  return ctx.createPattern(checkerTile, 'repeat') ?? '#26262b';
}

function handlePoints(b: LayerBox): { corners: [number, number][]; rot: [number, number] } {
  const a = (b.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const pt = (lx: number, ly: number): [number, number] => [b.cx + lx * c - ly * s, b.cy + lx * s + ly * c];
  return {
    corners: [pt(-b.w / 2, -b.h / 2), pt(b.w / 2, -b.h / 2), pt(b.w / 2, b.h / 2), pt(-b.w / 2, b.h / 2)],
    rot: pt(0, -b.h / 2 - 22),
  };
}

export function DesignCanvas() {
  const kind = useClothing((s) => s.activeKind);
  const revision = useClothing((s) => s.revision);
  const imageRev = useClothing((s) => s.imageRev);
  const dv = useClothing((s) => s.designVersion[s.activeKind]);
  const selectedId = useClothing((s) => s.selectedId);
  const tool = useClothing((s) => s.tool);
  const showGuides = useClothing((s) => s.showGuides);
  const spec = TEMPLATES[kind];
  const rig = useEditor((s) => s.rig);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 400, h: 400 });
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mx: number; my: number; view: View } | null>(null);
  const hover = useRef<[number, number] | null>(null);
  const [, bump] = useState(0);

  const fit = useCallback(() => {
    const pad = 28;
    const zoom = Math.min((size.w - pad * 2) / spec.width, (size.h - pad * 2) / spec.height);
    setView({ zoom, x: (size.w - spec.width * zoom) / 2, y: (size.h - spec.height * zoom) / 2 });
  }, [size.w, size.h, spec.width, spec.height]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => fit(), [fit, kind]);
  useEffect(() => {
    const h = () => fit();
    window.addEventListener('nexo:fit-design', h);
    return () => window.removeEventListener('nexo:fit-design', h);
  }, [fit]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.matches?.('input,textarea,select')) space.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const toTemplate = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const r = canvas.current!.getBoundingClientRect();
      return [(clientX - r.left - view.x) / view.zoom, (clientY - r.top - view.y) / view.zoom];
    },
    [view],
  );

  // ---------------------------------------------------------------- drawing
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.zoom, view.zoom);

    // transparency checkerboard inside the template (one cached 16 px tile, filled as a pattern)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, spec.width, spec.height);
    ctx.clip();
    ctx.fillStyle = checkerPattern(ctx);
    ctx.fillRect(0, 0, spec.width, spec.height);
    ctx.restore();

    ensureComposite(kind);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(canvasFor(kind), 0, 0, spec.width, spec.height);

    // dim everything Roblox ignores
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, spec.width, spec.height);
    for (const p of spec.panels) ctx.rect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = 'rgba(8,8,10,0.62)';
    ctx.fill('evenodd');
    ctx.restore();

    if (showGuides) {
      ctx.lineWidth = 1 / view.zoom;
      ctx.setLineDash([4 / view.zoom, 3 / view.zoom]);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `${Math.max(7, 9 / view.zoom)}px "IBM Plex Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const p of spec.panels) {
        ctx.strokeRect(p.x + 0.5 / view.zoom, p.y + 0.5 / view.zoom, p.w - 1 / view.zoom, p.h - 1 / view.zoom);
        if (spec.kind !== 'tshirt' && view.zoom > 0.55) {
          const short = p.label.replace('Right sleeve', 'R sleeve').replace('Left sleeve', 'L sleeve').replace('Right leg', 'R leg').replace('Left leg', 'L leg');
          const text = short.split(' ').slice(-1)[0] === 'side' ? short.replace(' side', '') : short;
          // dark outline keeps labels readable on light designs
          ctx.lineWidth = 2.5 / view.zoom;
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          ctx.lineJoin = 'round';
          ctx.strokeText(text, p.x + p.w / 2, p.y + 3 / view.zoom, p.w - 4);
          ctx.fillText(text, p.x + p.w / 2, p.y + 3 / view.zoom, p.w - 4);
          ctx.lineWidth = 1 / view.zoom;
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        }
      }
      ctx.setLineDash([]);
      if (rig === 'R15' && spec.kind !== 'tshirt') {
        // where R15 segments meet: clothing blends across these lines on R15 avatars
        ctx.strokeStyle = 'rgba(190,120,255,0.9)';
        ctx.lineWidth = 1.2 / view.zoom;
        ctx.setLineDash([2 / view.zoom, 2 / view.zoom]);
        for (const p of spec.panels) {
          if (p.face === 'top' || p.face === 'bottom') continue;
          for (const off of r15JointOffsets(p.part === 'torso' ? 'torso' : 'rightArm')) {
            const y = p.y + p.h - (128 - off);
            ctx.beginPath();
            ctx.moveTo(p.x, y);
            ctx.lineTo(p.x + p.w, y);
            ctx.stroke();
          }
        }
        ctx.setLineDash([]);
      }
    }
    ctx.lineWidth = 1 / view.zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(0, 0, spec.width, spec.height);

    // selection
    const sel = selectedLayer(useClothing.getState());
    const box = sel && sel.visible ? layerBox(sel) : null;
    if (box) {
      const { corners, rot } = handlePoints({ ...box });
      ctx.strokeStyle = '#ff3b44';
      ctx.lineWidth = 1.5 / view.zoom;
      ctx.beginPath();
      corners.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.stroke();
      const top: [number, number] = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2];
      ctx.beginPath();
      ctx.moveTo(top[0], top[1]);
      ctx.lineTo(rot[0], rot[1]);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      const hs = HANDLE / view.zoom;
      for (const p of corners) ctx.fillRect(p[0] - hs / 2, p[1] - hs / 2, hs, hs);
      ctx.fillStyle = '#ff3b44';
      ctx.beginPath();
      ctx.arc(rot[0], rot[1], hs * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    if ((tool === 'brush' || tool === 'eraser') && hover.current) {
      const br = useClothing.getState().brush;
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : br.color;
      ctx.lineWidth = 1.2 / view.zoom;
      ctx.beginPath();
      ctx.arc(hover.current[0], hover.current[1], br.size / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }, [size, view, kind, revision, imageRev, dv, selectedId, tool, showGuides, spec, bump, rig]);

  // ---------------------------------------------------------------- interaction
  const hitHandle = (layer: ClothingLayer, x: number, y: number): 'rotate' | 'scale' | null => {
    const box = layerBox(layer);
    if (!box) return null;
    const { corners, rot } = handlePoints(box);
    const r = (HANDLE + 4) / view.zoom;
    if (Math.hypot(x - rot[0], y - rot[1]) <= r) return 'rotate';
    if (corners.some((p) => Math.hypot(x - p[0], y - p[1]) <= r)) return 'scale';
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        // second finger: cancel whatever the first one started and switch to pinch-zoom / two-finger pan
        drag.current = null;
        const [a, b] = [...touches.current.values()];
        pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view };
        el.setPointerCapture(e.pointerId);
        return;
      }
    }
    const s = useClothing.getState();
    const [x, y] = toTemplate(e.clientX, e.clientY);

    if (e.button === 1 || (e.button === 0 && space.current)) {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      return;
    }
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);

    if (tool === 'brush' || tool === 'eraser') {
      if (e.altKey && tool === 'brush') {
        // eyedropper: Alt+click picks the colour under the pointer
        const src = getComposite(kind);
        const px = src.getContext('2d', { willReadFrequently: true })?.getImageData(Math.floor((x * src.width) / spec.width), Math.floor((y * src.height) / spec.height), 1, 1).data;
        if (px && px[3] > 0) s.setBrush({ color: `#${[px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}` });
        return;
      }
      const r = s.beginStroke({ color: s.brush.color, size: s.brush.size, erase: tool === 'eraser', points: [[x, y]] });
      drag.current = { mode: 'paint', layerId: r.layerId, index: r.index, mirrorIndex: r.mirrorIndex };
      return;
    }

    const layers = s.designs[s.activeKind];
    const sel = layers.find((l) => l.id === s.selectedId);
    if (sel && !sel.locked && sel.visible) {
      const h = hitHandle(sel, x, y);
      const box = layerBox(sel);
      if (h && box) {
        if (h === 'rotate') {
          drag.current = { mode: 'rotate', id: sel.id, cx: box.cx, cy: box.cy, offset: -Math.PI / 2 };
        } else {
          const size = sel.type === 'text' ? sel.size : 0;
          drag.current = { mode: 'scale', id: sel.id, cx: box.cx, cy: box.cy, d0: Math.max(1, Math.hypot(x - box.cx, y - box.cy)), w: box.w, h: box.h, size };
        }
        return;
      }
    }
    // topmost movable layer under the pointer
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (!l.visible || l.locked) continue;
      const b = layerBox(l);
      if (b && pointInBox(b, x, y)) {
        s.select(l.id);
        drag.current = { mode: 'move', id: l.id, sx: x, sy: y, ox: b.cx, oy: b.cy };
        return;
      }
    }
    s.select(null);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current && touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()];
        const p0 = pinch.current;
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const r = e.currentTarget.getBoundingClientRect();
        const zoom = Math.min(8, Math.max(0.2, p0.view.zoom * (dist / p0.dist)));
        const k = zoom / p0.view.zoom;
        // keep the point between the fingers fixed, and follow it as the fingers move
        const ax = p0.mx - r.left;
        const ay = p0.my - r.top;
        setView({ zoom, x: mx - r.left - (ax - p0.view.x) * k, y: my - r.top - (ay - p0.view.y) * k });
        return;
      }
    }
    const [x, y] = toTemplate(e.clientX, e.clientY);
    const d = drag.current;
    const s = useClothing.getState();
    if (tool === 'brush' || tool === 'eraser') {
      hover.current = [x, y];
      if (!d) bump((n) => n + 1);
    }
    if (!d) return;
    if (d.mode === 'pan') {
      setView((v) => ({ ...v, x: d.vx + (e.clientX - d.sx), y: d.vy + (e.clientY - d.sy) }));
    } else if (d.mode === 'move') {
      s.updateLayer(d.id, { x: d.ox + (x - d.sx), y: d.oy + (y - d.sy) } as Partial<ClothingLayer>, `${d.id}:drag`);
    } else if (d.mode === 'scale') {
      const k = Math.max(0.05, Math.hypot(x - d.cx, y - d.cy) / d.d0);
      const layer = s.designs[s.activeKind].find((l) => l.id === d.id);
      if (!layer) return;
      if (layer.type === 'text') s.updateLayer(d.id, { size: Math.max(4, d.size * k) } as Partial<TextLayer>, `${d.id}:scale`);
      else s.updateLayer(d.id, { w: Math.max(2, d.w * k), h: Math.max(2, d.h * k) } as Partial<ImageLayer | ShapeLayer>, `${d.id}:scale`);
    } else if (d.mode === 'rotate') {
      let deg = ((Math.atan2(y - d.cy, x - d.cx) - d.offset) * 180) / Math.PI + 0;
      deg = ((deg % 360) + 540) % 360 - 180;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      s.updateLayer(d.id, { rotation: Math.round(deg * 10) / 10 } as Partial<ClothingLayer>, `${d.id}:rot`);
    } else if (d.mode === 'paint') {
      queueStrokePoint(d.layerId, d.index, d.mirrorIndex, [x, y]);
    }
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    if (drag.current?.mode === 'paint') flushStroke();
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const zoom = Math.min(8, Math.max(0.2, v.zoom * factor));
      const k = zoom / v.zoom;
      return { zoom, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
    });
  };

  const cursor = tool === 'brush' || tool === 'eraser' ? 'none' : space.current ? 'grab' : 'default';

  return (
    <div className="design-wrap" ref={wrap}>
      <canvas
        ref={canvas}
        style={{ width: size.w, height: size.h, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={() => {
          hover.current = null;
          bump((n) => n + 1);
        }}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="design-zoom num">{Math.round(view.zoom * 100)}%</div>
    </div>
  );
}
