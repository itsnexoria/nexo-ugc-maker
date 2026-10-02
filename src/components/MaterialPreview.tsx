import { useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import type { SceneObject } from '../types';
import { useObjectMaterial } from '../viewport/SceneObjects';

function Ball({ obj }: { obj: SceneObject }) {
  const material = useObjectMaterial(obj);
  const geo = useMemo(() => new THREE.SphereGeometry(0.9, 48, 32), []);
  return <mesh geometry={geo} material={material} />;
}

/** Small second viewport showing the selected part's material on a sphere. */
export function MaterialPreview({ obj }: { obj: SceneObject }) {
  return (
    <div className="mat-preview">
      <Canvas dpr={1} camera={{ position: [0, 0, 3.1], fov: 38 }} gl={{ antialias: true }} onCreated={({ gl }) => { gl.toneMapping = THREE.NeutralToneMapping; }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 3]} intensity={2.2} />
        <Environment resolution={64} frames={1}>
          <Lightformer form="rect" intensity={3} position={[0, 4, 4]} scale={[8, 3, 1]} />
          <Lightformer form="rect" intensity={1.4} position={[-5, 0, 2]} scale={[3, 6, 1]} />
          <Lightformer form="rect" intensity={1.8} color="#ff4a52" position={[5, 1, -2]} scale={[2, 6, 1]} />
        </Environment>
        <Ball obj={obj} />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={1.6} />
      </Canvas>
    </div>
  );
}
