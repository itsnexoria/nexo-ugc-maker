import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { buildDiagnostics, currentProjectBackup } from '../src/utils/diagnostics';
import { useEditor } from '../src/store/editor';
import { buildProject } from '../src/assets/sample';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Boom(): never {
  throw new Error('kaboom');
}

describe('housekeeping', () => {
  it('shows a recovery screen instead of a blank page when rendering crashes', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(ErrorBoundary, null, createElement(Boom)));
    });
    expect(host.textContent).toContain('Something went wrong');
    expect(host.textContent).toContain('kaboom');
    expect(host.textContent).toContain('Reload the editor');
    expect(host.textContent).toContain('Copy diagnostics');
    await act(async () => root.unmount());
    host.remove();
    spy.mockRestore();
  });

  it('children render normally when nothing throws', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(ErrorBoundary, null, createElement('p', null, 'all good')));
    });
    expect(host.textContent).toBe('all good');
    await act(async () => root.unmount());
    host.remove();
  });

  it('builds diagnostics without project content and offers a backup of the open project', () => {
    useEditor.getState().loadProject({ id: 'p', name: 'Secret Project Name', createdAt: 0 }, buildProject('hat'));
    const text = buildDiagnostics('boom');
    expect(text).toContain('Nexo UGC Studio');
    expect(text).toContain('Mode: editor');
    expect(text).toContain('boom');
    expect(text).not.toContain('Secret Project Name');
    const backup = currentProjectBackup()!;
    expect(JSON.parse(backup.json).app).toBe('nexo-ugc-studio');
    expect(backup.name).toBe('Secret Project Name');
  });
});
