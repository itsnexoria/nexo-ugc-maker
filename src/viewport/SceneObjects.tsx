import { memo, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { SLOT_BONE } from '../assets/avatar';
import { objectMenu } from '../editor/actions';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { useViewport } from '../store/viewport';
import { DEG } from '../utils/math';
import { getModelGeometry, getPaintGeometry, getPrimitiveGeometry } from '../utils/geometry';
import { paintCanvasFor, usePaintRev } from '../utils/paint';
import { findMirrorPartner, mirrorPaintHit } from '../utils/mirrorPaint';
import { usePaintBrush } from '../store/paintBrush';
import { isFitActive, useTestFit } from '../store/testfit';
import type { SceneObject, SlotId } from '../types';
import { viewportApi } from './api';
import { applyTextureTransform, loadBaseTexture } from './textures';

const noRaycast = () => null;
const _m = new THREE.Matrix4();

/** Keeps a root accessory attached to its avatar bone while the avatar animates. */
function Follower({ slot, children }: { slot?: SlotId; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.matrixAutoUpdate = false;
  }, []);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const rig = useEditor.getState().rig;
    const fit = useTestFit.getState();
    const animating = useEditor.getState().animation !== 'rest' || isFitActive(fit);
    const boneName = slot ? SLOT_BONE[rig][slot] : null;
    const bone = boneName ? viewportApi.bones.get(boneName) : null;
    const inv = boneName ? viewportApi.restInverse.get(boneName) : null;
    if (animating && bone && inv) {
      bone.updateWorldMatrix(true, false);
      g.matrix.copy(_m.copy(bone.matrixWorld).multiply(inv));
    } else {
      g.matrix.identity();
    }
    g.matrixWorldNeedsUpdate = true;
  });
  return <group ref={ref}>{children}</group>;
}

export function useObjectMaterial(obj: SceneObject): THREE.MeshStandardMaterial {
  const material = useMemo(() => new THREE.MeshStandardMaterial(), []);
  const wireframe = useViewport((s) => s.wireframe);
  const painted = !!obj.paint;
  const textures = useEditor((s) => s.textures);
  const paintRev = usePaintRev((s) => s.rev);
  const paintTex = useRef<THREE.CanvasTexture | null>(null);
  const texAsset = useEditor((s) => (!obj.paint && obj.material.textureId ? s.textures.find((t) => t.id === obj.material.textureId) : undefined));
  const texRef = useRef<THREE.Texture | null>(null);
  const latest = useRef(obj.material);
  latest.current = obj.material;
  const m = obj.material;

  useEffect(() => {
    material.color.set(painted ? '#ffffff' : m.color);
    material.metalness = m.metalness;
    material.roughness = m.roughness;
    material.emissive.set(m.emissive);
    material.emissiveIntensity = m.emissiveIntensity;
    const transparent = m.opacity < 1;
    if (material.transparent !== transparent) material.needsUpdate = true;
    material.transparent = transparent;
    material.opacity = m.opacity;
    material.depthWrite = !transparent;
    material.wireframe = wireframe;
  }, [material, painted, m.color, m.metalness, m.roughness, m.emissive, m.emissiveIntensity, m.opacity, wireframe]);

  // hand-painted texture: one canvas per part, updated in place as strokes arrive
  useEffect(() => {
    if (!obj.paint) {
      if (paintTex.current) {
        if (material.map === paintTex.current) {
          material.map = null;
          material.needsUpdate = true;
        }
        paintTex.current.dispose();
        paintTex.current = null;
      }
      return;
    }
    const canvas = paintCanvasFor(obj, textures);
    if (!canvas) return;
    if (!paintTex.current || paintTex.current.image !== canvas) {
      paintTex.current?.dispose();
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      paintTex.current = t;
      material.map = t;
      material.needsUpdate = true;
    } else {
      paintTex.current.needsUpdate = true;
    }
  }, [material, obj, textures, paintRev]);

  useEffect(() => {
    let cancelled = false;
    const release = () => {
      texRef.current?.dispose();
      texRef.current = null;
    };
    if (!texAsset) {
      release();
      if (material.map) {
        material.map = null;
        material.needsUpdate = true;
      }
      return;
    }
    loadBaseTexture(texAsset, (base) => {
      if (cancelled) return;
      release();
      const clone = base.clone();
      clone.needsUpdate = true;
      applyTextureTransform(clone, latest.current.texRepeat, latest.current.texOffset, latest.current.texRotation);
      texRef.current = clone;
      material.map = clone;
      material.needsUpdate = true;
    });
    return () => {
      cancelled = true;
    };
  }, [material, texAsset?.id, texAsset?.dataUrl]);

  useEffect(() => {
    if (texRef.current) applyTextureTransform(texRef.current, m.texRepeat, m.texOffset, m.texRotation);
  }, [m.texRepeat, m.texOffset, m.texRotation]);

  useEffect(
    () => () => {
      texRef.current?.dispose();
      paintTex.current?.dispose();
      material.dispose();
    },
    [material],
  );

  return material;
}

// ---- painting directly on a part (pointer events give the exact texture coordinate under the cursor)
interface Target {
  id: string;
  index: number;
  res: number;
  mirror: boolean;
}
let paintTargets: Target[] = [];
let paintSource = '';
let pendingPts = new Map<number, [number, number][]>();
let paintRaf = 0;

function flushPaint(): void {
  if (paintRaf) cancelAnimationFrame(paintRaf);
  paintRaf = 0;
  const items = paintTargets.map((t, i) => ({ id: t.id, index: t.index, points: pendingPts.get(i) ?? [] })).filter((x) => x.points.length);
  if (items.length) useEditor.getState().extendPaintStrokes(items);
  pendingPts = new Map();
}

function toPx(u: number, v: number, res: number): [number, number] {
  return [u * res, (1 - v) * res];
}

function mirroredPoint(e: ThreeEvent<PointerEvent>, t: Target): [number, number] | null {
  const ed = useEditor.getState();
  const hit = mirrorPaintHit(ed.objects, ed.models, paintSource, t.id, e.point);
  // ignore reflections that land far from the partner's surface (e.g. the twin is missing)
  return hit && hit.distance < 0.6 ? toPx(hit.u, hit.v, t.res) : null;
}

function beginPaint(e: ThreeEvent<PointerEvent>, id: string): void {
  if (e.button !== 0 || !e.uv) return;
  const ed = useEditor.getState();
  const brush = usePaintBrush.getState();
  const res = ed.objects[id]?.paint?.res ?? 256;
  e.stopPropagation();
  if (viewportApi.controls) viewportApi.controls.enabled = false;
  (e.target as Element).setPointerCapture?.(e.pointerId);
  ed.select(id);
  const mk = (r: number, pt: [number, number]) => ({ color: brush.color, size: Math.max(1, (brush.sizePct / 100) * r), erase: brush.erase, hardness: brush.hardness, alpha: brush.opacity, points: [pt] });
  const items = [{ id, stroke: mk(res, toPx(e.uv.x, e.uv.y, res)) }];
  paintSource = id;
  let partner: string | null = null;
  if (brush.symmetry) {
    partner = findMirrorPartner(ed.objects, id);
    if (partner) {
      const pres = ed.objects[partner]?.paint?.res ?? 256;
      const hit = mirrorPaintHit(ed.objects, ed.models, id, partner, e.point);
      if (hit && hit.distance < 0.6) items.push({ id: partner, stroke: mk(pres, toPx(hit.u, hit.v, pres)) });
    } else {
      useUI.getState().toast('info', 'No matching left/right part found for symmetry, so only this part is painted.');
    }
  }
  const idx = ed.beginPaintStrokes(items);
  if (idx[0] < 0) return;
  if (!brush.erase) brush.use(brush.color);
  const after = useEditor.getState().objects;
  paintTargets = items.map((it, i) => ({ id: it.id, index: idx[i], res: after[it.id]?.paint?.res ?? 256, mirror: i > 0 })).filter((t) => t.index >= 0);
  pendingPts = new Map();
}

function movePaint(e: ThreeEvent<PointerEvent>, id: string): void {
  if (!paintTargets.length || paintTargets[0].id !== id || !e.uv) return;
  const push = (i: number, pt: [number, number] | null) => {
    if (!pt) return;
    const list = pendingPts.get(i) ?? [];
    list.push(pt);
    pendingPts.set(i, list);
  };
  push(0, toPx(e.uv.x, e.uv.y, paintTargets[0].res));
  paintTargets.forEach((t, i) => {
    if (t.mirror) push(i, mirroredPoint(e, t));
  });
  if (!paintRaf) paintRaf = requestAnimationFrame(flushPaint);
}

function endPaint(e: ThreeEvent<PointerEvent>): void {
  if (!paintTargets.length) return;
  flushPaint();
  paintTargets = [];
  if (viewportApi.controls) viewportApi.controls.enabled = true;
  (e.target as Element).releasePointerCapture?.(e.pointerId);
}

const MeshPart = memo(function MeshPart({ obj, pickable }: { obj: SceneObject; pickable: boolean }) {
  const material = useObjectMaterial(obj);
  const model = useEditor((s) => (obj.modelId ? s.models[obj.modelId] : undefined));
  const painted = !!obj.paint;
  const geometry = useMemo(() => {
    if (painted) return getPaintGeometry(obj.kind, obj.detail, model);
    if (obj.kind === 'imported') return model ? getModelGeometry(model) : getPrimitiveGeometry('cube');
    return getPrimitiveGeometry(obj.kind, obj.detail);
  }, [obj.kind, obj.detail, model, painted]);
  const paintTool = useEditor((s) => s.tool === 'paint');

  const id = obj.id;
  return (
    <mesh
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      raycast={pickable ? undefined : noRaycast}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        useEditor.getState().select(id);
      }}
      onPointerDown={paintTool && pickable ? (e: ThreeEvent<PointerEvent>) => beginPaint(e, id) : undefined}
      onPointerMove={paintTool && pickable ? (e: ThreeEvent<PointerEvent>) => movePaint(e, id) : undefined}
      onPointerUp={paintTool ? (e: ThreeEvent<PointerEvent>) => endPaint(e) : undefined}
      onContextMenu={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.delta > 4) return;
        e.nativeEvent.preventDefault();
        useEditor.getState().select(id);
        useUI.getState().openContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY, objectMenu(id));
      }}
    />
  );
});

const ObjectNode = memo(function ObjectNode({ id }: { id: string }) {
  const obj = useEditor((s) => s.objects[id]);
  const kids = useEditor((s) => s.childrenIndex[id]);
  const layer = useEditor((s) => s.layers.find((l) => l.id === obj?.layerId));
  const ref = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    viewportApi.registry.set(id, g);
    return () => {
      if (viewportApi.registry.get(id) === g) viewportApi.registry.delete(id);
    };
  }, [id]);

  const rotation = useMemo<[number, number, number]>(
    () => (obj ? [obj.rotation[0] * DEG, obj.rotation[1] * DEG, obj.rotation[2] * DEG] : [0, 0, 0]),
    [obj?.rotation],
  );

  if (!obj) return null;
  const visible = obj.visible && (layer?.visible ?? true);
  const pickable = !obj.locked && !(layer?.locked ?? false);

  return (
    <group ref={ref} position={obj.position} rotation={rotation} scale={obj.scale} visible={visible} name={obj.name} userData={{ objectId: id }}>
      {obj.kind !== 'group' && <MeshPart obj={obj} pickable={pickable} />}
      {kids?.map((k) => <ObjectNode key={k} id={k} />)}
    </group>
  );
});

export function SceneObjects() {
  const roots = useEditor((s) => s.childrenIndex.root);
  const objects = useEditor((s) => s.objects);
  return (
    <>
      {roots?.map((id) => (
        <Follower key={id} slot={objects[id]?.slot}>
          <ObjectNode id={id} />
        </Follower>
      ))}
    </>
  );
}
