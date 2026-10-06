import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TransformControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEditor } from '../store/editor';
import { useLive } from '../store/live';
import { useSettings } from '../store/settings';
import { useViewport } from '../store/viewport';
import { DEG, round } from '../utils/math';
import { viewportApi } from './api';

/** Transform gizmo for the selected object. Edits are written to the store once, on release. */
export function Gizmo() {
  const selectedId = useEditor((s) => s.selectedId);
  const exists = useEditor((s) => (s.selectedId ? !!s.objects[s.selectedId] : false));
  const locked = useEditor((s) => {
    const o = s.selectedId ? s.objects[s.selectedId] : null;
    if (!o) return false;
    return o.locked || !!s.layers.find((l) => l.id === o.layerId)?.locked;
  });
  const hidden = useEditor((s) => {
    const o = s.selectedId ? s.objects[s.selectedId] : null;
    if (!o) return false;
    return !o.visible || !(s.layers.find((l) => l.id === o.layerId)?.visible ?? true);
  });
  const tool = useEditor((s) => s.tool);
  const space = useEditor((s) => s.transformSpace);
  const snap = useSettings((s) => s.snap);
  const gridSize = useSettings((s) => s.gridSize);
  const preview = useViewport((s) => s.previewMode);
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    setTarget(selectedId && exists ? (viewportApi.registry.get(selectedId) ?? null) : null);
  }, [selectedId, exists]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // re-resolve if the registry changes underneath us (e.g. undo recreated the node)
  useFrame(() => {
    if (!selectedId) return;
    const cur = viewportApi.registry.get(selectedId) ?? null;
    if (cur !== target) setTarget(cur);
  });

  if (!target || preview || tool === 'select' || tool === 'paint' || locked || hidden || !selectedId) return null;
  const mode = tool === 'move' ? 'translate' : tool;

  const push = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const o = target;
      useLive.getState().set({
        id: selectedId,
        position: [o.position.x, o.position.y, o.position.z],
        rotation: [o.rotation.x / DEG, o.rotation.y / DEG, o.rotation.z / DEG],
        scale: [o.scale.x, o.scale.y, o.scale.z],
      });
    });
  };

  return (
    <TransformControls
      object={target}
      mode={mode}
      space={space}
      size={0.85}
      translationSnap={snap ? gridSize : null}
      rotationSnap={snap ? (15 * Math.PI) / 180 : null}
      scaleSnap={snap ? 0.1 : null}
      onMouseDown={() => {
        viewportApi.dragging = true;
      }}
      onObjectChange={push}
      onMouseUp={() => {
        viewportApi.dragging = false;
        const o = target;
        const patch = {
          position: [round(o.position.x, 4), round(o.position.y, 4), round(o.position.z, 4)] as [number, number, number],
          rotation: [round(o.rotation.x / DEG, 3), round(o.rotation.y / DEG, 3), round(o.rotation.z / DEG, 3)] as [number, number, number],
          scale: [round(o.scale.x, 4), round(o.scale.y, 4), round(o.scale.z, 4)] as [number, number, number],
        };
        // Single undo step per drag
        useEditor.getState().setTransform(selectedId, patch, undefined);
        useLive.getState().clear();
      }}
    />
  );
}

/** Red bounding box around the selected object or group. */
export function SelectionBox() {
  const selectedId = useEditor((s) => (useViewport.getState().previewMode ? null : s.selectedId));
  const preview = useViewport((s) => s.previewMode);
  const helper = useRef<THREE.Box3Helper | null>(null);
  const box = useRef(new THREE.Box3());
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    const h = new THREE.Box3Helper(box.current, new THREE.Color('#ff3b44'));
    (h.material as THREE.LineBasicMaterial).depthTest = false;
    (h.material as THREE.LineBasicMaterial).transparent = true;
    (h.material as THREE.LineBasicMaterial).opacity = 0.9;
    h.renderOrder = 999;
    helper.current = h;
    group.current?.add(h);
    return () => {
      group.current?.remove(h);
      h.dispose();
    };
  }, []);

  useFrame(() => {
    const h = helper.current;
    if (!h) return;
    if (preview) {
      h.visible = false;
      return;
    }
    const obj = selectedId ? viewportApi.registry.get(selectedId) : null;
    if (!obj || !obj.visible) {
      h.visible = false;
      return;
    }
    obj.updateWorldMatrix(true, true);
    box.current.setFromObject(obj);
    h.visible = !box.current.isEmpty();
  });

  return <group ref={group} />;
}
