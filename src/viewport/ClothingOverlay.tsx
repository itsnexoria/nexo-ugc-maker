import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { useEditor } from '../store/editor';
import { useClothing } from '../store/clothing';
import { useUI } from '../store/ui';
import type { ClothingKind, Vec3 } from '../types';
import { buildClothingGeometry, buildTshirtGeometry, bodyMapFor, kindCovers, type BodyMap } from '../clothing/mapping';
import { TEMPLATES, panelAt } from '../clothing/templates';
import { clothingTexture } from '../clothing/composite';
import { viewportApi } from './api';

const noRaycast = () => null;
const INFLATE: Record<ClothingKind, number> = { pants: 0.02, shirt: 0.045, tshirt: 0.07 };
const ORDER: Record<ClothingKind, number> = { pants: 1, shirt: 2, tshirt: 3 };

/** Active stroke while painting directly on the 3D model */
let stroke: { layerId: string; index: number; mirrorIndex: number | null; panelId: string } | null = null;

function uvToTemplate(kind: ClothingKind, e: ThreeEvent<PointerEvent | MouseEvent>): [number, number] | null {
  if (!e.uv) return null;
  const spec = TEMPLATES[kind];
  return [e.uv.x * spec.width, (1 - e.uv.y) * spec.height];
}

function useHandlers(kind: ClothingKind) {
  const active = useClothing((s) => s.activeKind === kind);
  const tool = useClothing((s) => s.tool);
  if (!active) return { raycast: noRaycast } as const;

  const paint = tool === 'brush' || tool === 'eraser';
  const place = tool === 'place';
  if (!paint && !place) return { raycast: undefined } as const;

  return {
    raycast: undefined,
    onPointerDown: paint
      ? (e: ThreeEvent<PointerEvent>) => {
          if (e.button !== 0) return;
          const pt = uvToTemplate(kind, e);
          if (!pt) return;
          const panel = panelAt(kind, pt[0], pt[1]);
          if (!panel) return;
          e.stopPropagation();
          if (viewportApi.controls) viewportApi.controls.enabled = false;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          const s = useClothing.getState();
          const r = s.beginStroke({ color: s.brush.color, size: s.brush.size, erase: tool === 'eraser', points: [pt] });
          stroke = { layerId: r.layerId, index: r.index, mirrorIndex: r.mirrorIndex, panelId: panel.id };
        }
      : undefined,
    onPointerMove: paint
      ? (e: ThreeEvent<PointerEvent>) => {
          if (!stroke) return;
          const pt = uvToTemplate(kind, e);
          if (!pt) return;
          const panel = panelAt(kind, pt[0], pt[1]);
          if (!panel) return;
          const s = useClothing.getState();
          // crossing onto another panel starts a new stroke so no line is drawn across the template
          if (panel.id !== stroke.panelId) {
            const r = s.beginStroke({ color: s.brush.color, size: s.brush.size, erase: tool === 'eraser', points: [pt] });
            stroke = { layerId: r.layerId, index: r.index, mirrorIndex: r.mirrorIndex, panelId: panel.id };
            return;
          }
          s.extendStroke(stroke.layerId, stroke.index, pt, stroke.mirrorIndex);
        }
      : undefined,
    onPointerUp: paint
      ? (e: ThreeEvent<PointerEvent>) => {
          if (!stroke) return;
          stroke = null;
          if (viewportApi.controls) viewportApi.controls.enabled = true;
          (e.target as Element).releasePointerCapture?.(e.pointerId);
        }
      : undefined,
    onClick: place
      ? (e: ThreeEvent<MouseEvent>) => {
          const pt = uvToTemplate(kind, e);
          if (!pt) return;
          const panel = panelAt(kind, pt[0], pt[1]);
          const s = useClothing.getState();
          const layer = s.designs[kind].find((l) => l.id === s.selectedId);
          if (!panel || !layer || !(layer.type === 'image' || layer.type === 'text' || layer.type === 'shape')) {
            useUI.getState().toast('warn', 'Select an image, text or shape layer, then click the model to place it.');
            return;
          }
          e.stopPropagation();
          s.updateLayer(layer.id, { x: pt[0], y: pt[1], clip: kind === 'tshirt' ? 'all' : panel.id });
        }
      : undefined,
  } as const;
}

function ClothingBox({ kind, map, size }: { kind: ClothingKind; map: BodyMap; size: Vec3 }) {
  const geometry = useMemo(() => buildClothingGeometry(kind, map, size, INFLATE[kind]), [kind, map, size]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const handlers = useHandlers(kind);
  return (
    <mesh geometry={geometry} renderOrder={ORDER[kind]} {...handlers}>
      <meshStandardMaterial map={clothingTexture(kind)} transparent roughness={0.85} metalness={0} depthWrite={false} alphaTest={0.01} />
    </mesh>
  );
}

function TshirtPlane({ map, size }: { map: BodyMap; size: Vec3 }) {
  const geometry = useMemo(() => buildTshirtGeometry(map, size), [map, size]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const handlers = useHandlers('tshirt');
  return (
    <mesh geometry={geometry} position={[0, 0, -(size[2] / 2 + INFLATE.tshirt)]} renderOrder={ORDER.tshirt} {...handlers}>
      <meshStandardMaterial map={clothingTexture('tshirt')} transparent roughness={0.85} metalness={0} depthWrite={false} alphaTest={0.01} side={THREE.FrontSide} />
    </mesh>
  );
}

/** Draws the clothing layers on one avatar bone, so they follow the animation. */
export function ClothingOverlay({ bone, size }: { bone: string; size: Vec3 }) {
  const rig = useEditor((s) => s.rig);
  const shown = useClothing((s) => s.shown);
  const map = useMemo(() => bodyMapFor(rig, bone), [rig, bone]);
  const sizeKey = size.join(',');
  const stableSize = useMemo(() => size, [sizeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!map) return null;
  return (
    <>
      {(['pants', 'shirt'] as ClothingKind[]).map((k) => (shown[k] && kindCovers(k, map.part) ? <ClothingBox key={k} kind={k} map={map} size={stableSize} /> : null))}
      {shown.tshirt && map.part === 'torso' && <TshirtPlane map={map} size={stableSize} />}
    </>
  );
}
