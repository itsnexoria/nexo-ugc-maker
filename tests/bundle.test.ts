import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { accessoryReadme, buildAccessoryBundle, clothingReadme, formatBytes, validationReportText } from '../src/utils/bundle';

const base = { name: 'Cyber Crown', format: 'obj', units: 'studs', merged: true, atlasSize: 1024, attachment: 'HatAttachment', centredOnAttachment: true, parts: 18, triangles: 1428, maxTriangles: 4000, files: ['model/crown.obj'], appVersion: '1.5.0', date: '2026-10-13' };

describe('accessory README', () => {
  it('says all checks passed and ticks everything when nothing is wrong', () => {
    const md = accessoryReadme({ ...base, checks: [{ severity: 'ok', title: 'Triangle count' }] });
    expect(md).toContain('**Status:** All checks passed.');
    expect(md).toContain('- [x] Triangle count');
    expect(md).toContain('1,428 / 4,000 triangles');
    expect(md).toContain('**HatAttachment**');
  });

  it('leaves errors and warnings unticked and says what to do', () => {
    const md = accessoryReadme({ ...base, checks: [{ severity: 'error', title: 'Too many triangles', detail: 'Over 4000' }, { severity: 'warn', title: 'Large part' }] });
    expect(md).toContain('NOT ready');
    expect(md).toContain('- [ ] **Fix first:** Too many triangles. Over 4000');
    expect(md).toContain('- [ ] **Check:** Large part');
  });

  it('describes separate parts when not merged and omits the attachment line when unknown', () => {
    const md = accessoryReadme({ ...base, merged: false, attachment: undefined, checks: [] });
    expect(md).toContain('18 separate parts');
    expect(md).not.toContain('Suggested attachment');
  });
});

describe('clothing README', () => {
  it('lists each file with its size and weight', () => {
    const md = clothingReadme({ name: 'Hoodie', appVersion: '1.5.0', date: 'today', items: [{ kind: 'shirt', file: 'hoodie-shirt.png', width: 585, height: 559, bytes: 142_000, coverage: 0.62, checks: [{ severity: 'ok', title: 'Size is exact' }] }] });
    expect(md).toContain('| `hoodie-shirt.png` | Classic Shirt | 585 x 559 px | 139 KB | 62% of the template |');
    expect(md).toContain('## Shirt checklist');
  });
});

describe('helpers', () => {
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
  it('writes a plain-text report', () => {
    const t = validationReportText('X', [{ severity: 'warn', title: 'Big', detail: 'really' }]);
    expect(t).toContain('WARN  Big. really');
  });
});

describe('accessory bundle', () => {
  const common = { readme: '# hi', report: 'ok', projectJson: '{}', projectName: 'crown', preview: null };

  it('copies the entries of an OBJ zip into model/ and adds the extras', async () => {
    const inner = new JSZip();
    inner.file('crown.obj', 'o x');
    inner.file('textures/atlas.png', 'png');
    const blob = await buildAccessoryBundle({ ...common, model: { blob: await inner.generateAsync({ type: 'blob' }), filename: 'crown-obj.zip' } });
    const out = await JSZip.loadAsync(blob);
    expect(Object.keys(out.files).sort()).toEqual(['README.md', 'backup/', 'backup/crown.nexougc.json', 'model/', 'model/crown.obj', 'model/textures/', 'model/textures/atlas.png', 'validation-report.txt'].sort());
    expect(await out.file('model/crown.obj')!.async('string')).toBe('o x');
  });

  it('puts a single GLB under model/ and includes the preview when there is one', async () => {
    const jpg = 'data:image/jpeg;base64,/9j/4AAQ';
    const blob = await buildAccessoryBundle({ ...common, preview: jpg, model: { blob: new Blob(['glb']), filename: 'crown.glb' } });
    const out = await JSZip.loadAsync(blob);
    expect(out.file('model/crown.glb')).toBeTruthy();
    expect(out.file('preview.jpg')).toBeTruthy();
  });
});
