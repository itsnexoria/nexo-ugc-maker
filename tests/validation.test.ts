import { describe, expect, it } from 'vitest';
import { useEditor } from '../src/store/editor';
import { buildProject } from '../src/assets/sample';
import { validateProject } from '../src/utils/validation';

function report() {
  const s = useEditor.getState();
  return validateProject({ objects: s.objects, order: s.order, layers: s.layers, textures: s.textures, models: s.models });
}
const ids = (r: ReturnType<typeof report>) => Object.fromEntries(r.results.map((x) => [x.id, x.severity]));

describe('validation', () => {
  it('flags an empty scene', () => {
    useEditor.getState().loadProject({ id: 'v', name: 'v', createdAt: 0 }, buildProject('blank'));
    const r = report();
    expect(r.errors).toBe(1);
    expect(ids(r).empty).toBe('error');
  });

  it('passes the Cyber Crown sample with no errors', () => {
    useEditor.getState().loadProject({ id: 'v', name: 'v', createdAt: 0 }, buildProject('cyber-crown'));
    const r = report();
    expect(r.errors).toBe(0);
    expect(r.triangles).toBeGreaterThan(100);
    expect(r.triangles).toBeLessThan(4000);
    expect(r.size).not.toBeNull();
  });

  it('reports invalid scale', () => {
    useEditor.getState().loadProject({ id: 'v', name: 'v', createdAt: 0 }, buildProject('hat'));
    const s = useEditor.getState();
    const part = Object.values(s.objects).find((o) => o.kind === 'cylinder')!;
    s.setTransform(part.id, { scale: [0, 1, 1] });
    expect(ids(report()).scale).toBe('error');
  });

  it('reports a missing texture and high polygon count', () => {
    useEditor.getState().loadProject({ id: 'v', name: 'v', createdAt: 0 }, buildProject('hat'));
    const s = useEditor.getState();
    const part = Object.values(s.objects).find((o) => o.kind === 'cylinder')!;
    s.setMaterial(part.id, { textureId: 'nope' });
    expect(ids(report())['tex-missing']).toBe('error');
    for (let i = 0; i < 12; i++) useEditor.getState().addPrimitive('sphere');
    expect(['warn', 'error']).toContain(ids(report()).tris);
  });
});
