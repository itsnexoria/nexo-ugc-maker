import * as THREE from 'three';
import type { ModelAsset, ShapeKind } from '../types';

/**
 * Shared base geometries. Every primitive is built once and reused by all
 * objects; per-object size comes from the object's scale. Segment counts are
 * deliberately modest so a typical accessory stays well under Roblox triangle budgets.
 */
const cache = new Map<string, THREE.BufferGeometry>();
const modelCache = new Map<string, THREE.BufferGeometry>();

function build(kind: ShapeKind): THREE.BufferGeometry {
  switch (kind) {
    case 'cube':
      return new THREE.BoxGeometry(1, 1, 1);
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 16, 10);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
    case 'cone':
      return new THREE.ConeGeometry(0.5, 1, 20);
    case 'torus': {
      // Flat ring in the XZ plane, bounding box 1 x 0.3 x 1
      const g = new THREE.TorusGeometry(0.35, 0.15, 8, 20);
      g.rotateX(Math.PI / 2);
      return g;
    }
    case 'capsule':
      return new THREE.CapsuleGeometry(0.3, 0.4, 3, 10);
    case 'pyramid': {
      const g = new THREE.ConeGeometry(0.5, 1, 4, 1);
      g.rotateY(Math.PI / 4);
      return g;
    }
    case 'icosphere':
      return new THREE.IcosahedronGeometry(0.5, 1);
    case 'torusknot':
      return new THREE.TorusKnotGeometry(0.3, 0.09, 40, 5);
    case 'arch':
      // Half ring standing up in the XY plane (headbands, handles, horns)
      return new THREE.TorusGeometry(0.35, 0.15, 8, 16, Math.PI);
    case 'wedge': {
      const shape = new THREE.Shape();
      shape.moveTo(-0.5, -0.5);
      shape.lineTo(0.5, -0.5);
      shape.lineTo(-0.5, 0.5);
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      return g;
    }
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

export function getPrimitiveGeometry(kind: ShapeKind): THREE.BufferGeometry {
  let g = cache.get(kind);
  if (!g) {
    g = build(kind);
    g.computeBoundingBox();
    cache.set(kind, g);
  }
  return g;
}

export function triangleCount(g: THREE.BufferGeometry): number {
  return Math.round((g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3);
}

// ---------- imported models ----------

function toBase64(buf: ArrayBufferLike): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function geometryToModelAsset(id: string, name: string, g: THREE.BufferGeometry): ModelAsset {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  return {
    id,
    name,
    positions: toBase64(new Float32Array(pos.array).buffer),
    normals: nor ? toBase64(new Float32Array(nor.array).buffer) : null,
    uvs: uv ? toBase64(new Float32Array(uv.array).buffer) : null,
    index: g.index ? toBase64(new Uint32Array(g.index.array).buffer) : null,
    triangles: triangleCount(g),
  };
}

export function getModelGeometry(model: ModelAsset): THREE.BufferGeometry {
  let g = modelCache.get(model.id);
  if (g) return g;
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fromBase64(model.positions)), 3));
  if (model.normals) g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(fromBase64(model.normals)), 3));
  if (model.uvs) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(fromBase64(model.uvs)), 2));
  if (model.index) g.setIndex(new THREE.BufferAttribute(new Uint32Array(fromBase64(model.index)), 1));
  if (!model.normals) g.computeVertexNormals();
  g.computeBoundingBox();
  modelCache.set(model.id, g);
  return g;
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  cube: 'Cube',
  sphere: 'Sphere',
  cylinder: 'Cylinder',
  cone: 'Cone',
  torus: 'Torus',
  capsule: 'Capsule',
  wedge: 'Wedge',
  pyramid: 'Pyramid',
  icosphere: 'Icosphere',
  torusknot: 'Torus knot',
  arch: 'Arch',
  imported: 'Imported mesh',
  group: 'Group',
};
