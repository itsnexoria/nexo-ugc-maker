import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { AVATAR_TONES, BONES, type BoneDef } from '../assets/avatar';
import { useEditor } from '../store/editor';
import { useViewport } from '../store/viewport';
import type { AnimationId, RigType, Vec3 } from '../types';
import { viewportApi } from './api';
import { ClothingOverlay } from './ClothingOverlay';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function makeFaceTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#2b2d35';
  ctx.beginPath();
  ctx.ellipse(42, 54, 7, 10, 0, 0, Math.PI * 2);
  ctx.ellipse(86, 54, 7, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b2d35';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(64, 70, 26, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Tree {
  def: BoneDef;
  children: Tree[];
}

function buildTree(defs: BoneDef[]): Tree[] {
  const nodes = new Map<string, Tree>(defs.map((d) => [d.name, { def: d, children: [] }]));
  const roots: Tree[] = [];
  for (const n of nodes.values()) {
    if (n.def.parent) nodes.get(n.def.parent)?.children.push(n);
    else roots.push(n);
  }
  return roots;
}

interface BoneProps {
  node: Tree;
  parentJoint: Vec3;
  face: THREE.Texture | null;
  selectedPart: string | null;
  wireframe: boolean;
  lighting: boolean;
  clothing: boolean;
}

const Bone = memo(function Bone({ node, parentJoint, face, selectedPart, wireframe, clothing }: BoneProps) {
  const { def } = node;
  const groupRef = useRef<THREE.Group>(null);
  const select = useEditor((s) => s.selectAvatarPart);
  const isHead = def.name === 'Head';
  const selected = selectedPart === def.name;

  useLayoutEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.name = def.name;
    viewportApi.bones.set(def.name, g);
    return () => {
      viewportApi.bones.delete(def.name);
    };
  }, [def.name]);

  const local = sub(def.joint, parentJoint);
  const meshOffset = sub(def.center, def.joint);
  const radius = Math.min(0.1, Math.min(...def.size) * 0.2);

  return (
    <group ref={groupRef} position={local}>
      <group position={meshOffset}>
        <RoundedBox
          args={def.size}
          radius={radius}
          smoothness={3}
          castShadow
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            select(def.name);
          }}
        >
          <meshStandardMaterial
            color={AVATAR_TONES[def.tone]}
            roughness={0.62}
            metalness={0.02}
            emissive={selected ? '#e3242b' : '#000000'}
            emissiveIntensity={selected ? 0.35 : 0}
            wireframe={wireframe}
          />
        </RoundedBox>
        {clothing && <ClothingOverlay bone={def.name} size={def.size} />}
        {isHead && face && (
          <mesh position={[0, 0, -(def.size[2] / 2 + 0.002)]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[def.size[0] * 0.9, def.size[1] * 0.9]} />
            <meshBasicMaterial map={face} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        )}
      </group>
      {node.children.map((c) => (
        <Bone key={c.def.name} node={c} parentJoint={def.joint} face={face} selectedPart={selectedPart} wireframe={wireframe} lighting clothing={clothing} />
      ))}
    </group>
  );
});

/** Procedural placeholder animations driven directly on the bone groups (no React re-renders). */
function animate(rig: RigType, anim: AnimationId, t: number, bones: Map<string, THREE.Object3D>, root: THREE.Object3D) {
  const set = (name: string, x = 0, y = 0, z = 0) => {
    const b = bones.get(name);
    if (b) b.rotation.set(x, y, z);
  };
  const r15 = rig === 'R15';
  const arm = (side: 'Left' | 'Right') => (r15 ? `${side}UpperArm` : `${side} Arm`);
  const leg = (side: 'Left' | 'Right') => (r15 ? `${side}UpperLeg` : `${side} Leg`);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  for (const b of bones.values()) b.rotation.set(0, 0, 0);
  if (anim === 'rest') return;

  if (anim === 'idle') {
    const s = Math.sin(t * 1.8);
    root.position.y = Math.abs(s) * 0.03;
    set(arm('Left'), 0.05 * s, 0, 0.06);
    set(arm('Right'), -0.05 * s, 0, -0.06);
    set('Head', 0.03 * Math.sin(t * 0.9), 0.1 * Math.sin(t * 0.6), 0);
    return;
  }

  if (anim === 'walk' || anim === 'run') {
    const run = anim === 'run';
    const w = t * (run ? 11 : 6.5);
    const swing = run ? 1.0 : 0.62;
    const s = Math.sin(w);
    root.position.y = Math.abs(Math.cos(w)) * (run ? 0.18 : 0.08);
    set(leg('Left'), s * swing);
    set(leg('Right'), -s * swing);
    set(arm('Left'), -s * swing * 0.9, 0, 0.05);
    set(arm('Right'), s * swing * 0.9, 0, -0.05);
    if (r15) {
      set('LeftLowerLeg', -Math.max(0, -s) * (run ? 1.3 : 0.8));
      set('RightLowerLeg', -Math.max(0, s) * (run ? 1.3 : 0.8));
      set('LeftLowerArm', -(run ? 1.1 : 0.2) - Math.max(0, s) * 0.3);
      set('RightLowerArm', -(run ? 1.1 : 0.2) - Math.max(0, -s) * 0.3);
      set('UpperTorso', run ? -0.18 : -0.04, Math.sin(w) * 0.08, 0);
    }
    set('Head', run && r15 ? 0.12 : 0, 0, 0);
    return;
  }

  if (anim === 'jump') {
    const cycle = (t % 1.4) / 1.4; // 0..1
    const lift = Math.sin(Math.min(cycle / 0.8, 1) * Math.PI);
    root.position.y = lift * 2.2;
    const squat = cycle > 0.8 ? Math.sin(((cycle - 0.8) / 0.2) * Math.PI) : 0;
    root.position.y -= squat * 0.25;
    const up = lift;
    set(arm('Left'), 2.5 * up, 0, 0.2 * up);
    set(arm('Right'), 2.5 * up, 0, -0.2 * up);
    set(leg('Left'), 0.5 * up - 0.25 * squat);
    set(leg('Right'), -0.2 * up - 0.25 * squat);
    if (r15) {
      set('LeftLowerLeg', -0.9 * up + 0.5 * squat);
      set('RightLowerLeg', -0.5 * up + 0.5 * squat);
    }
  }
}

export function Avatar() {
  const rig = useEditor((s) => s.rig);
  const selectedPart = useEditor((s) => s.selectedAvatarPart);
  const wireframe = useViewport((s) => s.wireframe);
  const lighting = useViewport((s) => s.lighting);
  const visible = useViewport((s) => s.showAvatar);
  const clothing = useEditor((s) => s.screen === 'clothing');
  const rootRef = useRef<THREE.Group>(null);
  const face = useMemo(() => makeFaceTexture(), []);
  const trees = useMemo(() => buildTree(BONES[rig]), [rig]);
  const rootJoint = useMemo<Vec3>(() => [0, 0, 0], []);

  // capture rest-pose matrices after the rig mounts (all bones unrotated)
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    for (const b of viewportApi.bones.values()) b.rotation.set(0, 0, 0);
    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);
    viewportApi.restInverse.clear();
    for (const [name, b] of viewportApi.bones) viewportApi.restInverse.set(name, b.matrixWorld.clone().invert());
  }, [rig]);

  useEffect(() => () => face?.dispose(), [face]);

  useFrame(({ clock }) => {
    const root = rootRef.current;
    if (!root) return;
    animate(rig, useEditor.getState().animation, clock.getElapsedTime(), viewportApi.bones, root);
  }, -1);

  return (
    <group ref={rootRef} visible={visible} key={rig}>
      {trees.map((n) => (
        <Bone key={n.def.name} node={n} parentJoint={rootJoint} face={face} selectedPart={selectedPart} wireframe={wireframe} lighting={lighting} clothing={clothing} />
      ))}
    </group>
  );
}
