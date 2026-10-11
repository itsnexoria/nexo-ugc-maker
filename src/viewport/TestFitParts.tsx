import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TEMPLATES } from '../clothing/templates';
import { bodyMapFor, buildClothingGeometry, kindCovers } from '../clothing/mapping';
import { useEditor } from '../store/editor';
import { useTestFit, type Headwear, type Outfit } from '../store/testfit';
import type { ClothingKind, Vec3 } from '../types';

/** Plain stand-in outfits so an accessory can be judged next to typical clothing. */
interface OutfitDef {
  shirt: { color: string; sleeve: number };
  pants: { color: string };
}
const OUTFITS: Record<Exclude<Outfit, 'none'>, OutfitDef> = {
  'tee-jeans': { shirt: { color: '#3b6fb0', sleeve: 0.42 }, pants: { color: '#2f4b7c' } },
  'hoodie-track': { shirt: { color: '#4b4e57', sleeve: 1 }, pants: { color: '#17181c' } },
  'jacket-cargo': { shirt: { color: '#2c2f36', sleeve: 1 }, pants: { color: '#6d6c4f' } },
  formal: { shirt: { color: '#f2f2f4', sleeve: 1 }, pants: { color: '#1b1c20' } },
};

const textures = new Map<string, THREE.CanvasTexture>();

function outfitTexture(kind: 'shirt' | 'pants', color: string, sleeve: number): THREE.CanvasTexture | null {
  const key = `${kind}|${color}|${sleeve}`;
  const hit = textures.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const spec = TEMPLATES[kind];
  const c = document.createElement('canvas');
  c.width = spec.width;
  c.height = spec.height;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = color;
  for (const p of spec.panels) {
    const isLimb = p.part !== 'torso';
    if (kind === 'shirt' && isLimb) g.fillRect(p.x, p.y, p.w, p.face === 'top' || p.face === 'bottom' ? p.h : p.h * sleeve);
    else if (kind === 'pants' && p.part === 'torso') g.fillRect(p.x, p.y + p.h * 0.7, p.w, p.h * 0.3);
    else g.fillRect(p.x, p.y, p.w, p.h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, t);
  return t;
}

function OutfitPiece({ kind, bone, size, outfit }: { kind: ClothingKind & ('shirt' | 'pants'); bone: string; size: Vec3; outfit: OutfitDef }) {
  const rig = useEditor((s) => s.rig);
  const map = useMemo(() => bodyMapFor(rig, bone), [rig, bone]);
  const sizeKey = size.join(',');
  const stable = useMemo(() => size, [sizeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => (map && kindCovers(kind, map.part) ? buildClothingGeometry(kind, map, stable, kind === 'shirt' ? 0.045 : 0.02) : null), [kind, map, stable]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  const tex = outfitTexture(kind, kind === 'shirt' ? outfit.shirt.color : outfit.pants.color, kind === 'shirt' ? outfit.shirt.sleeve : 1);
  if (!geometry || !tex) return null;
  return (
    <mesh geometry={geometry} renderOrder={kind === 'shirt' ? 2 : 1} raycast={() => null}>
      <meshStandardMaterial map={tex} transparent roughness={0.9} depthWrite={false} alphaTest={0.01} />
    </mesh>
  );
}

export function TestOutfit({ bone, size }: { bone: string; size: Vec3 }) {
  const outfit = useTestFit((s) => s.outfit);
  if (outfit === 'none') return null;
  const def = OUTFITS[outfit];
  return (
    <>
      <OutfitPiece kind="pants" bone={bone} size={size} outfit={def} />
      <OutfitPiece kind="shirt" bone={bone} size={size} outfit={def} />
    </>
  );
}

const HAIR = '#2b2118';

/** Simple stand-ins for hair and hats, sized to the mannequin's 1.2 stud head. */
export function TestHeadwear({ type }: { type: Headwear }) {
  if (type === 'none') return null;
  const mat = <meshStandardMaterial color={type === 'beanie' ? '#c0392b' : HAIR} roughness={0.85} />;
  return (
    <group>
      {type === 'short-hair' && (
        <>
          <mesh position={[0, 0.5, 0]} raycast={() => null}>
            <boxGeometry args={[1.3, 0.34, 1.3]} />
            {mat}
          </mesh>
          <mesh position={[0, 0.2, 0.62]} raycast={() => null}>
            <boxGeometry args={[1.3, 0.6, 0.12]} />
            {mat}
          </mesh>
        </>
      )}
      {type === 'long-hair' && (
        <>
          <mesh position={[0, 0.5, 0]} raycast={() => null}>
            <boxGeometry args={[1.34, 0.36, 1.34]} />
            {mat}
          </mesh>
          <mesh position={[0, -0.45, 0.66]} raycast={() => null}>
            <boxGeometry args={[1.34, 1.8, 0.16]} />
            {mat}
          </mesh>
          <mesh position={[-0.66, -0.2, 0.1]} raycast={() => null}>
            <boxGeometry args={[0.14, 1.2, 1.1]} />
            {mat}
          </mesh>
          <mesh position={[0.66, -0.2, 0.1]} raycast={() => null}>
            <boxGeometry args={[0.14, 1.2, 1.1]} />
            {mat}
          </mesh>
        </>
      )}
      {type === 'beanie' && (
        <mesh position={[0, 0.35, 0]} raycast={() => null}>
          <sphereGeometry args={[0.82, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
          {mat}
        </mesh>
      )}
    </group>
  );
}
