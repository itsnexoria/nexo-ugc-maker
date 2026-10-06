import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLayeredStarter, buildSkeleton, exportLayeredGlb, LAYERED_SEGMENTS, ROOT_BONE } from '../src/clothing/layered';
import { R15_BONES } from '../src/assets/avatar';

const readBuf = (b: Blob) =>
  new Promise<ArrayBuffer>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(b);
  });

describe('layered clothing starter', () => {
  it('builds an R15 skeleton rooted at HumanoidRootPart with every body bone', () => {
    const { bones, list } = buildSkeleton();
    expect(list[0].name).toBe(ROOT_BONE);
    for (const b of R15_BONES) expect(bones.has(b.name), b.name).toBe(true);
    expect(bones.get('RightLowerArm')!.parent!.name).toBe('RightUpperArm');
    expect(bones.get('LowerTorso')!.parent!.name).toBe(ROOT_BONE);
  });

  it('names the cages after the mesh and keeps their topology identical', () => {
    const b = buildLayeredStarter('shirt', 'Jacket', 0.12);
    expect(b.names).toEqual({ mesh: 'Jacket', inner: 'Jacket_InnerCage', outer: 'Jacket_OuterCage' });
    const meshes = b.group.children.filter((c): c is THREE.SkinnedMesh => (c as THREE.SkinnedMesh).isSkinnedMesh);
    expect(meshes.map((m) => m.name)).toEqual(['Jacket', 'Jacket_InnerCage', 'Jacket_OuterCage']);
    const counts = meshes.map((m) => m.geometry.attributes.position.count);
    expect(new Set(counts).size).toBe(1);
    // outer cage must be bigger than the garment, garment bigger than the inner cage
    const size = (m: THREE.SkinnedMesh) => {
      m.geometry.computeBoundingBox();
      return m.geometry.boundingBox!.getSize(new THREE.Vector3()).x;
    };
    expect(size(meshes[2])).toBeGreaterThan(size(meshes[0]));
    expect(size(meshes[0])).toBeGreaterThan(size(meshes[1]));
  });

  it('skins every vertex with weights that sum to 1 and at most 2 influences', () => {
    for (const kind of ['shirt', 'pants'] as const) {
      const b = buildLayeredStarter(kind, 'X', 0.1);
      const mesh = b.group.children.find((c) => (c as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh;
      const w = mesh.geometry.attributes.skinWeight;
      const idx = mesh.geometry.attributes.skinIndex;
      for (let i = 0; i < w.count; i++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += w.getComponent(i, k);
        expect(sum).toBeCloseTo(1, 5);
        expect(idx.getComponent(i, 0)).toBeLessThan(b.stats.bones);
      }
      expect(b.stats.maxInfluences).toBeLessThanOrEqual(2);
      expect(b.stats.segments).toBe(LAYERED_SEGMENTS[kind].length);
    }
  });

  it('drops the hidden joint caps and stays inside a sane triangle budget', () => {
    const b = buildLayeredStarter('shirt', 'J', 0.1, 4);
    expect(b.stats.triangles).toBeGreaterThan(300);
    expect(b.stats.triangles).toBeLessThan(4000);
    // with caps removed the garment has fewer triangles than six full boxes
    expect(b.stats.triangles).toBeLessThan(6 * 6 * 16 * 2);
  });

  it('exports a GLB containing the skin, joints and named meshes', async () => {
    const r = await exportLayeredGlb('shirt', 'Jacket', 0.12);
    const buf = await readBuf(r.blob);
    expect(new TextDecoder().decode(new Uint8Array(buf).slice(0, 4))).toBe('glTF');
    const jlen = new DataView(buf).getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf).slice(20, 20 + jlen)));
    // the exporter writes one skin per skinned mesh (mesh + two cages); all share the same joints
    expect(json.skins).toHaveLength(3);
    for (const sk of json.skins) expect(sk.joints.length).toBe(r.stats.bones);
    const nodeNames = json.nodes.map((n: { name?: string }) => n.name);
    for (const n of ['Jacket', 'Jacket_InnerCage', 'Jacket_OuterCage', 'HumanoidRootPart', 'UpperTorso']) expect(nodeNames).toContain(n);
    const attrs = json.meshes[0].primitives[0].attributes;
    expect(attrs.JOINTS_0).toBeDefined();
    expect(attrs.WEIGHTS_0).toBeDefined();
  });

  it('refuses T-shirts', async () => {
    await expect(exportLayeredGlb('tshirt', 'X', 0.1)).rejects.toThrow(/Shirt or Pants/);
  });
});
