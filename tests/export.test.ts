import { describe, expect, it } from 'vitest';
import { useEditor } from '../src/store/editor';
import { buildProject } from '../src/assets/sample';
import { runExport, type ExportInput } from '../src/utils/exporter';
import JSZip from 'jszip';

// jsdom's Blob (older versions) has no arrayBuffer()/text(), so read through FileReader
const readBuf = (b: Blob) =>
  new Promise<ArrayBuffer>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(b);
  });
const readText = async (b: Blob) => new TextDecoder().decode(await readBuf(b));

function input(): ExportInput {
  const s = useEditor.getState();
  return { objects: s.objects, order: s.order, layers: s.layers, textures: s.textures, models: s.models, rig: s.rig };
}
const base = { units: 'studs' as const, includeAvatar: false, includeHidden: false, filename: 'Cyber Crown' };

describe('export', () => {
  it('writes a valid OBJ zip with one face per triangle', async () => {
    useEditor.getState().loadProject({ id: 'e', name: 'e', createdAt: 0 }, buildProject('cyber-crown'));
    const r = await runExport(input(), { ...base, format: 'obj' });
    expect(r.filename).toBe('Cyber_Crown-obj.zip');
    const zip = await JSZip.loadAsync(await readBuf(r.blob));
    const obj = await zip.file('Cyber_Crown.obj')!.async('string');
    const mtl = await zip.file('Cyber_Crown.mtl')!.async('string');
    expect((obj.match(/^f /gm) ?? []).length).toBe(r.triangles);
    expect((obj.match(/^o /gm) ?? []).length).toBe(r.parts);
    expect(mtl).toContain('newmtl');
    expect(obj).toContain('mtllib Cyber_Crown.mtl');
    // no NaN anywhere
    expect(obj).not.toMatch(/NaN/);
  });

  it('writes a GLB with the glTF magic header', async () => {
    useEditor.getState().loadProject({ id: 'e', name: 'e', createdAt: 0 }, buildProject('hat'));
    const r = await runExport(input(), { ...base, format: 'glb' });
    const head = new Uint8Array(await readBuf(r.blob)).slice(0, 4);
    expect(String.fromCharCode(...head)).toBe('glTF');
    expect(r.parts).toBe(3);
  });

  it('writes glTF JSON and scales units', async () => {
    useEditor.getState().loadProject({ id: 'e', name: 'e', createdAt: 0 }, buildProject('hat'));
    const r = await runExport(input(), { ...base, format: 'gltf', units: 'meters' });
    const json = JSON.parse(await readText(r.blob));
    expect(json.asset.version).toBe('2.0');
    const root = json.nodes.find((n: { name: string }) => n.name === 'Cyber_Crown');
    expect(Math.abs(root.matrix[0] - 0.28)).toBeLessThan(1e-6);
    const names = json.nodes.map((n: { name: string }) => n.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('refuses to export an empty or fully hidden scene', async () => {
    useEditor.getState().loadProject({ id: 'e', name: 'e', createdAt: 0 }, buildProject('blank'));
    await expect(runExport(input(), { ...base, format: 'obj' })).rejects.toThrow(/nothing visible/);
  });

  it('skips hidden parts unless asked', async () => {
    useEditor.getState().loadProject({ id: 'e', name: 'e', createdAt: 0 }, buildProject('hat'));
    const s = useEditor.getState();
    const part = Object.values(s.objects).find((o) => o.kind === 'cylinder')!;
    s.toggleVisible(part.id);
    const a = await runExport(input(), { ...base, format: 'obj' });
    const b = await runExport(input(), { ...base, format: 'obj', includeHidden: true });
    expect(a.parts).toBe(b.parts - 1);
  });
});
