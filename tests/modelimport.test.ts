import * as THREE from 'three';
import { File as NodeFile } from 'node:buffer';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectParts, loadModelFiles, materialProps, normaliseParts, sliceGeometry } from '../src/editor/modelImport';

describe('materialProps', () => {
  it('reads glTF-style PBR materials', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#ff8800', metalness: 0.9, roughness: 0.2, emissive: '#00ff00', emissiveIntensity: 2, transparent: true, opacity: 0.5 });
    const { material } = materialProps(m);
    expect(material).toMatchObject({ color: '#ff8800', metalness: 0.9, roughness: 0.2, emissive: '#00ff00', emissiveIntensity: 2, opacity: 0.5 });
  });

  it('turns Phong shininess (from MTL files) into a roughness', () => {
    const { material } = materialProps(new THREE.MeshPhongMaterial({ color: '#336699', shininess: 90 }));
    expect(material.metalness).toBe(0);
    expect(material.roughness).toBeCloseTo(0.2);
    expect(material.opacity).toBe(1);
  });

  it('keeps the texture transform', () => {
    const map = new THREE.Texture();
    map.repeat.set(2, 3);
    map.offset.set(0.25, 0.5);
    map.rotation = Math.PI / 2;
    const out = materialProps(new THREE.MeshStandardMaterial({ map }));
    expect(out.map).toBe(map);
    expect(out.material.texRepeat).toEqual([2, 3]);
    expect(out.material.texOffset).toEqual([0.25, 0.5]);
    expect(out.material.texRotation).toBeCloseTo(90);
  });

  it('falls back to defaults without a material', () => {
    expect(materialProps(undefined).map).toBeNull();
  });
});

describe('collectParts', () => {
  const red = new THREE.MeshStandardMaterial({ color: '#ff0000', name: 'Red' });
  const blue = new THREE.MeshStandardMaterial({ color: '#0000ff', name: 'Blue' });

  it('splits one mesh with two materials into two parts', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1); // 6 faces, 2 triangles each, one group per face
    geo.clearGroups();
    geo.addGroup(0, 18, 0); // first 3 faces (indices)
    geo.addGroup(18, 18, 1);
    const root = new THREE.Group().add(new THREE.Mesh(geo, [red, blue]));
    const parts = collectParts(root, { flipV: false });
    expect(parts.map((p) => p.name).sort()).toEqual(['Blue', 'Red']);
    expect(parts.map((p) => p.material.color).sort()).toEqual(['#0000ff', '#ff0000']);
    const tris = parts.reduce((n, p) => n + p.geometry.attributes.position.count / 3, 0);
    expect(tris).toBe(12);
  });

  it('merges separate meshes that share a material', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), blue));
    const parts = collectParts(root, { flipV: false });
    expect(parts).toHaveLength(2);
    expect(parts.find((p) => p.name === 'Red')!.geometry.attributes.position.count).toBe(72);
  });

  it('applies node transforms', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red);
    mesh.position.set(10, 0, 0);
    const [part] = collectParts(new THREE.Group().add(mesh), { flipV: false });
    part.geometry.computeBoundingBox();
    expect(part.geometry.boundingBox!.min.x).toBeCloseTo(9.5);
  });

  it('flips V for glTF so images are not upside down, and leaves OBJ alone', () => {
    const make = () => new THREE.Group().add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), red));
    const v = (flip: boolean) => Array.from(collectParts(make(), { flipV: flip })[0].geometry.attributes.uv.array).filter((_, i) => i % 2 === 1);
    const plain = v(false);
    const flipped = v(true);
    plain.forEach((x, i) => expect(flipped[i]).toBeCloseTo(1 - x));
  });

  it('throws when the file has no meshes', () => {
    expect(() => collectParts(new THREE.Group(), { flipV: false })).toThrow(/No meshes/);
  });
});

describe('normaliseParts', () => {
  it('centres and scales all parts with the same transform', () => {
    const a = new THREE.BoxGeometry(1, 1, 1);
    a.translate(100, 0, 0);
    const b = new THREE.BoxGeometry(1, 1, 1);
    b.translate(-100, 0, 0);
    const mk = (geometry: THREE.BufferGeometry) => ({ name: 'p', geometry, material: materialProps(undefined).material, map: null });
    const parts = [mk(a), mk(b)];
    const { scaled, factor } = normaliseParts(parts);
    expect(scaled).toBe(true);
    expect(factor).toBeCloseTo(2 / 201);
    // still on opposite sides of the centre: the shared transform kept their relative position
    expect(parts[0].geometry.boundingBox!.min.x).toBeGreaterThan(0);
    expect(parts[1].geometry.boundingBox!.max.x).toBeLessThan(0);
  });
});

describe('sliceGeometry', () => {
  it('extracts a range of triangles', () => {
    const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const s = sliceGeometry(g, 6, 12);
    expect(s.attributes.position.count).toBe(12);
    expect(s.attributes.uv.count).toBe(12);
  });
});

// jsdom's File has no text()/arrayBuffer() and no object URLs; browsers do. Use Node's File and stub the URLs.
const File = NodeFile as unknown as typeof globalThis.File;
beforeAll(() => {
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => undefined;
});

/** A glTF with one quad per material, buffers inlined, so no other files are needed. */
function twoMaterialGltf(): string {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 3, 1, 0, 2, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const buf = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
  return JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Quads' }],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0 }, indices: 1, material: 0 },
          { attributes: { POSITION: 0 }, indices: 2, material: 1 },
        ],
      },
    ],
    materials: [
      { name: 'Gold', pbrMetallicRoughness: { baseColorFactor: [1, 0.8, 0, 1], metallicFactor: 1, roughnessFactor: 0.3 } },
      { name: 'Glass', alphaMode: 'BLEND', pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 1, 0.4], metallicFactor: 0, roughnessFactor: 0.1 } },
    ],
    buffers: [{ byteLength: buf.length, uri: `data:application/octet-stream;base64,${buf.toString('base64')}` }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: 12, target: 34963 },
      { buffer: 0, byteOffset: positions.byteLength + 12, byteLength: 12, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [0, 0, 0], max: [3, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
      { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
  });
}

describe('loadModelFiles (glTF)', () => {
  it('keeps each material as its own part with its own look', async () => {
    const file = new File([twoMaterialGltf()], 'quads.gltf', { type: 'model/gltf+json' });
    const loaded = await loadModelFiles([file]);
    expect(loaded.name).toBe('quads');
    expect(loaded.parts).toHaveLength(2);
    const gold = loaded.parts.find((p) => p.name === 'Gold')!;
    const glass = loaded.parts.find((p) => p.name === 'Glass')!;
    expect(gold.material.metalness).toBe(1);
    expect(gold.material.roughness).toBeCloseTo(0.3);
    expect(glass.material.opacity).toBeCloseTo(0.4);
    expect(gold.geometry.attributes.position.count).toBe(6);
  });

  it('refuses when no model is among the files', async () => {
    await expect(loadModelFiles([new File(['x'], 'pic.png')])).rejects.toThrow(/\.obj, \.glb or \.gltf/);
  });
});

describe('loadModelFiles (OBJ + MTL)', () => {
  it('applies the colours from the .mtl file', async () => {
    const obj = 'mtllib m.mtl\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nusemtl Red\nf 1 2 3\nusemtl Blue\nf 1 3 4\n';
    const mtl = 'newmtl Red\nKd 1 0 0\nnewmtl Blue\nKd 0 0 1\nNs 10\n';
    const loaded = await loadModelFiles([new File([obj], 'thing.obj'), new File([mtl], 'm.mtl')]);
    expect(loaded.parts.map((p) => p.material.color).sort()).toEqual(['#0000ff', '#ff0000']);
  });

  it('still imports an OBJ with no .mtl as one default part', async () => {
    const loaded = await loadModelFiles([new File(['v 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n'], 'tri.obj')]);
    expect(loaded.parts).toHaveLength(1);
  });
});
