import { memo, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { SLOT_BONE } from '../assets/avatar';
import { objectMenu } from '../editor/actions';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { useViewport } from '../store/viewport';
import { DEG } from '../utils/math';
import { getModelGeometry, getPrimitiveGeometry } from '../utils/geometry';
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
    const animating = useEditor.getState().animation !== 'rest';
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
  const texAsset = useEditor((s) => (obj.material.textureId ? s.textures.find((t) => t.id === obj.material.textureId) : undefined));
  const texRef = useRef<THREE.Texture | null>(null);
  const latest = useRef(obj.material);
  latest.current = obj.material;
  const m = obj.material;

  useEffect(() => {
    material.color.set(m.color);
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
  }, [material, m.color, m.metalness, m.roughness, m.emissive, m.emissiveIntensity, m.opacity, wireframe]);

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
      material.dispose();
    },
    [material],
  );

  return material;
}

const MeshPart = memo(function MeshPart({ obj, pickable }: { obj: SceneObject; pickable: boolean }) {
  const material = useObjectMaterial(obj);
  const model = useEditor((s) => (obj.modelId ? s.models[obj.modelId] : undefined));
  const geometry = useMemo(() => {
    if (obj.kind === 'imported') return model ? getModelGeometry(model) : getPrimitiveGeometry('cube');
    return getPrimitiveGeometry(obj.kind, obj.detail);
  }, [obj.kind, obj.detail, model]);

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
