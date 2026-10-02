import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useEditor } from '../store/editor';
import { useSettings, type Quality } from '../store/settings';
import { useViewport } from '../store/viewport';
import type { Vec3 } from '../types';
import { Avatar } from './Avatar';
import { Gizmo, SelectionBox } from './Gizmo';
import { SceneObjects } from './SceneObjects';
import { viewportApi } from './api';
import { handleDroppedFiles } from '../editor/importers';

const QUALITY: Record<Quality, { dpr: number; shadow: number; antialias: boolean }> = {
  low: { dpr: 1, shadow: 512, antialias: false },
  medium: { dpr: 1.5, shadow: 1024, antialias: true },
  high: { dpr: 2, shadow: 2048, antialias: true },
};

function Studio() {
  const lighting = useViewport((s) => s.lighting);
  const ambient = useSettings((s) => s.ambient);
  const shadows = useSettings((s) => s.shadows);
  const env = useSettings((s) => s.environment);
  const envIntensity = useSettings((s) => s.envIntensity);
  const quality = useSettings((s) => s.quality);
  const scene = useThree((s) => s.scene);
  const q = QUALITY[quality];

  useEffect(() => {
    scene.environmentIntensity = envIntensity;
  }, [scene, envIntensity]);

  if (!lighting) return <ambientLight intensity={Math.PI} />;

  return (
    <>
      <ambientLight intensity={ambient * Math.PI * 0.6} />
      <directionalLight
        position={[-6, 12, -8]}
        intensity={2.4}
        castShadow={shadows}
        shadow-mapSize={[q.shadow, q.shadow]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={9}
        shadow-camera-bottom={-5}
        shadow-camera-near={1}
        shadow-camera-far={34}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <directionalLight position={[8, 4, 9]} intensity={0.9} color="#ff5a60" />
      {env && (
        <Environment resolution={128} frames={1}>
          {/* dim studio dome so metals reflect something other than black */}
          <mesh scale={60}>
            <sphereGeometry args={[1, 24, 16]} />
            <meshBasicMaterial color="#30323a" side={THREE.BackSide} toneMapped={false} />
          </mesh>
          <Lightformer form="rect" intensity={7} position={[0, 6, -6]} scale={[12, 5, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={4} position={[-8, 2, 2]} scale={[6, 8, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={4} color="#ff4a52" position={[8, 3, 6]} scale={[4, 8, 1]} target={[0, 0, 0]} />
          <Lightformer form="ring" intensity={2.5} position={[0, 10, 0]} scale={9} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={2.5} position={[0, 1, 9]} scale={[10, 3, 1]} target={[0, 0, 0]} />
        </Environment>
      )}
      {shadows && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <shadowMaterial transparent opacity={0.4} />
        </mesh>
      )}
    </>
  );
}

function Floor() {
  const showGrid = useSettings((s) => s.showGrid);
  const gridSize = useSettings((s) => s.gridSize);
  const theme = useSettings((s) => s.theme);
  const preview = useViewport((s) => s.previewMode);
  if (!showGrid || preview) return null;
  const light = theme === 'daylight';
  return (
    <Grid
      position={[0, 0.003, 0]}
      args={[60, 60]}
      cellSize={Math.max(0.1, gridSize)}
      sectionSize={Math.max(1, gridSize * 4)}
      cellThickness={0.6}
      sectionThickness={1.1}
      cellColor={light ? '#b9b9c2' : '#2c2c33'}
      sectionColor={light ? '#8d8d99' : '#4a2428'}
      fadeDistance={34}
      fadeStrength={1.4}
      infiniteGrid
    />
  );
}

/** Registers renderer handles, applies sensitivity, eases camera moves, and stores the last camera. */
function CameraRig({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl> }) {
  const { gl, scene, camera } = useThree();
  const request = useViewport((s) => s.cameraRequest);
  const sensitivity = useSettings((s) => s.cameraSensitivity);
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    viewportApi.gl = gl;
    viewportApi.scene = scene;
    viewportApi.camera = camera as THREE.PerspectiveCamera;
    return () => {
      viewportApi.gl = null;
      viewportApi.scene = null;
      viewportApi.camera = null;
      viewportApi.controls = null;
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    viewportApi.controls = c;
    c.rotateSpeed = 0.9 * sensitivity;
    c.panSpeed = 0.9 * sensitivity;
    c.zoomSpeed = 0.9 * sensitivity;
  }, [controlsRef, sensitivity]);

  // initial camera from the project
  useEffect(() => {
    const cam = useEditor.getState().camera;
    camera.position.set(...cam.position);
    const c = controlsRef.current;
    if (c) {
      c.target.set(...cam.target);
      c.update();
    }
  }, [camera, controlsRef]);

  useEffect(() => {
    if (!request) return;
    goal.current = { pos: new THREE.Vector3(...request.position), target: new THREE.Vector3(...request.target) };
  }, [request]);

  useFrame((_, dt) => {
    const g = goal.current;
    const c = controlsRef.current;
    if (!g || !c) return;
    const k = 1 - Math.exp(-dt * 9);
    camera.position.lerp(g.pos, k);
    c.target.lerp(g.target, k);
    c.update();
    if (camera.position.distanceTo(g.pos) < 0.01 && c.target.distanceTo(g.target) < 0.01) goal.current = null;
  });

  return null;
}

export function Viewport() {
  const quality = useSettings((s) => s.quality);
  const q = QUALITY[quality];
  const controls = useRef<OrbitControlsImpl>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const projectId = useEditor((s) => s.project.id);
  const shadows = useSettings((s) => s.shadows);
  const initial = useMemo(() => useEditor.getState().camera.position as Vec3, [projectId]);

  return (
    <div
      className="viewport-wrap"
      ref={wrap}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        void handleDroppedFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <Canvas
        key={`${projectId}-${quality}`}
        shadows={shadows}
        dpr={[1, q.dpr]}
        gl={{ antialias: q.antialias, powerPreference: 'high-performance' }}
        camera={{ position: initial, fov: 40, near: 0.1, far: 300 }}
        onPointerMissed={() => useEditor.setState({ selectedId: null, selectedAvatarPart: null })}
        onCreated={({ gl }) => {
          // Neutral keeps saturated reds red; ACES shifts bright emissive colours towards pink
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1;
        }}
      >
        <color attach="background" args={[useSettings.getState().theme === 'daylight' ? '#d9dadf' : '#0c0c0e']} />
        <Studio />
        <Floor />
        <Avatar />
        <SceneObjects />
        <SelectionBox />
        <Gizmo />
        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping
          dampingFactor={0.12}
          minDistance={1.5}
          maxDistance={60}
          maxPolarAngle={Math.PI * 0.499}
          target={[0, 2.9, 0]}
          onEnd={() => {
            const c = controls.current;
            if (!c) return;
            const p = c.object.position;
            useEditor.setState({ camera: { position: [p.x, p.y, p.z], target: [c.target.x, c.target.y, c.target.z] } });
          }}
        />
        <CameraRig controlsRef={controls} />
      </Canvas>
    </div>
  );
}
