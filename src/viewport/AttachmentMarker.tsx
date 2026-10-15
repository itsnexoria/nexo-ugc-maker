import { Html } from '@react-three/drei';
import { robloxAttachmentFor, SLOT_ANCHORS } from '../assets/avatar';
import { useEditor } from '../store/editor';
import { useViewport } from '../store/viewport';
import { rootOf } from '../utils/scene';

/**
 * A small marker on the avatar where the selected accessory attaches, named the way Roblox names that attachment.
 * It moves when you switch between R6 and R15, so you can see how the fit changes.
 */
export function AttachmentMarker() {
  const on = useViewport((s) => s.showAttachment && !s.previewMode);
  const rig = useEditor((s) => s.rig);
  const root = useEditor((s) => (s.selectedId ? rootOf(s.objects, s.selectedId) : undefined));
  if (!on || !root?.slot) return null;
  const at = SLOT_ANCHORS[rig][root.slot];
  const attachment = robloxAttachmentFor(root.slot, root.position[0]);
  return (
    <group position={at} renderOrder={10}>
      <mesh>
        <octahedronGeometry args={[0.16, 0]} />
        <meshBasicMaterial color="#35e0a1" depthTest={false} transparent opacity={0.9} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.3, 0.018, 8, 40]} />
        <meshBasicMaterial color="#35e0a1" depthTest={false} transparent opacity={0.6} />
      </mesh>
      <Html center distanceFactor={9} position={[0, 0.5, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{ background: 'rgba(12,12,14,0.85)', color: '#35e0a1', padding: '2px 6px', fontSize: 11, whiteSpace: 'nowrap', border: '1px solid #35e0a1', borderRadius: 3 }}>
          {attachment} · {rig}
        </div>
      </Html>
    </group>
  );
}
