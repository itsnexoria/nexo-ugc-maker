import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useViewport } from '../store/viewport';
import type { Vec3 } from '../types';

/**
 * Imperative bridge between React UI and the Three.js scene. Components outside
 * the Canvas (panels, shortcuts, thumbnails) use this instead of React state so the
 * render loop never has to re-render for camera or registry changes.
 */
class ViewportApi {
  /** SceneObject id -> its Three.js group */
  registry = new Map<string, THREE.Object3D>();
  /** Avatar bone name -> its group (animated) */
  bones = new Map<string, THREE.Object3D>();
  /** Inverse rest-pose world matrix per bone, captured when the rig mounts */
  restInverse = new Map<string, THREE.Matrix4>();
  gl: THREE.WebGLRenderer | null = null;
  scene: THREE.Scene | null = null;
  camera: THREE.PerspectiveCamera | null = null;
  controls: OrbitControlsImpl | null = null;
  /** True while the user drags a gizmo handle */
  dragging = false;

  captureThumbnail(width = 320, height = 200): string | null {
    const { gl, scene, camera } = this;
    if (!gl || !scene || !camera) return null;
    try {
      gl.render(scene, camera);
      const src = gl.domElement;
      const out = document.createElement('canvas');
      out.width = width;
      out.height = height;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      const srcAspect = src.width / src.height;
      const dstAspect = width / height;
      let sw = src.width;
      let sh = src.height;
      let sx = 0;
      let sy = 0;
      if (srcAspect > dstAspect) {
        sw = src.height * dstAspect;
        sx = (src.width - sw) / 2;
      } else {
        sh = src.width / dstAspect;
        sy = (src.height - sh) / 2;
      }
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, width, height);
      return out.toDataURL('image/jpeg', 0.82);
    } catch {
      return null;
    }
  }

  worldBox(id: string): THREE.Box3 | null {
    const obj = this.registry.get(id);
    if (!obj) return null;
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(obj);
    return box.isEmpty() ? null : box;
  }

  /** Frame an object (or the whole accessory set when id is null) keeping the current view direction. */
  focus(id: string | null, fallbackIds: string[] = []): boolean {
    const box = new THREE.Box3();
    if (id) {
      const b = this.worldBox(id);
      if (b) box.union(b);
    } else {
      for (const rid of fallbackIds) {
        const b = this.worldBox(rid);
        if (b) box.union(b);
      }
    }
    if (box.isEmpty() || !this.camera || !this.controls) return false;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.6) * 0.5;
    const fov = (this.camera.fov * Math.PI) / 180;
    const dist = Math.max(2.2, (radius / Math.sin(fov / 2)) * 1.25);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const pos = center.clone().add(dir.multiplyScalar(dist));
    useViewport.getState().requestCamera(pos.toArray() as Vec3, center.toArray() as Vec3);
    return true;
  }
}

export const viewportApi = new ViewportApi();
