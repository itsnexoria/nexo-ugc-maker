import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useEditor } from '../store/editor';
import { useSettings } from '../store/settings';
import { Avatar } from './Avatar';
import { CameraRig, Floor, QUALITY, Studio } from './Viewport';
import { resetTextures, syncTextures } from '../clothing/composite';
import type { Vec3 } from '../types';

function TextureSync() {
  useFrame(() => syncTextures());
  return null;
}

/** 3D mannequin wearing the current designs. Reuses the accessory editor's lighting and camera rig. */
export function ClothingPreview() {
  const quality = useSettings((s) => s.quality);
  const shadows = useSettings((s) => s.shadows);
  const q = QUALITY[quality];
  const controls = useRef<OrbitControlsImpl>(null);
  const projectId = useEditor((s) => s.project.id);
  const initial: Vec3 = [-6.2, 4.2, -8.4];
  // textures are created per quality level (mipmaps off on Low), so rebuild them when it changes
  useEffect(() => () => resetTextures(), [quality]);

  return (
    <div className="viewport-wrap">
      <Canvas
        key={`${projectId}-${quality}`}
        shadows={shadows}
        dpr={[1, q.dpr]}
        gl={{ antialias: q.antialias, powerPreference: 'high-performance' }}
        camera={{ position: initial, fov: 40, near: 0.1, far: 300 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1;
        }}
      >
        <color attach="background" args={[useSettings.getState().theme === 'daylight' ? '#d9dadf' : '#0c0c0e']} />
        <Studio />
        <Floor />
        <Avatar />
        <TextureSync />
        <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} minDistance={2} maxDistance={40} maxPolarAngle={Math.PI * 0.499} target={[0, 2.9, 0]} />
        <CameraRig controlsRef={controls} />
      </Canvas>
    </div>
  );
}
