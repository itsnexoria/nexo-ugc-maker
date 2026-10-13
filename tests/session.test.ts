import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/store/projects', async (orig) => {
  const real = await orig<typeof import('../src/store/projects')>();
  return { ...real, saveProject: vi.fn() };
});

import * as projects from '../src/store/projects';
import { goHome, saveErrorMessage, saveNow } from '../src/store/session';
import { useEditor } from '../src/store/editor';
import { useUI } from '../src/store/ui';

const saveProject = projects.saveProject as unknown as ReturnType<typeof vi.fn>;

function openFakeProject() {
  useEditor.setState({ screen: 'editor', project: { id: 'p1', name: 'Test', createdAt: 1, saveStatus: 'unsaved', lastSavedAt: null } });
  useUI.setState({ confirm: null, toasts: [] });
}

const quota = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });

describe('session: failed saves', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    saveProject.mockReset();
    openFakeProject();
    // a successful save clears the failure counter that earlier tests may have raised
    saveProject.mockResolvedValue({ id: 'p1', name: 'Test', createdAt: 1, updatedAt: 1, objectCount: 0, thumbnail: null });
    await saveNow(false);
    saveProject.mockReset();
    openFakeProject();
  });
  afterEach(() => {
    vi.useRealTimers();
    useEditor.setState({ screen: 'home' });
  });

  it('a full disk becomes a readable message and the error state', async () => {
    saveProject.mockRejectedValue(quota());
    expect(await saveNow(false)).toBe(false);
    expect(useEditor.getState().project.saveStatus).toBe('error');
    expect(saveErrorMessage(quota())).toMatch(/no storage space/);
  });

  it('keeps retrying in the background and recovers when storage works again', async () => {
    saveProject.mockRejectedValueOnce(quota());
    await saveNow(false);
    expect(useEditor.getState().project.saveStatus).toBe('error');
    saveProject.mockResolvedValue({ id: 'p1', name: 'Test', createdAt: 1, updatedAt: 99, objectCount: 0, thumbnail: null });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(saveProject).toHaveBeenCalledTimes(2);
    expect(useEditor.getState().project.saveStatus).toBe('saved');
  });

  it('refuses to silently leave the editor when the save failed', async () => {
    saveProject.mockRejectedValue(quota());
    await goHome();
    expect(useEditor.getState().screen).toBe('editor');
    const ask = useUI.getState().confirm;
    expect(ask?.title).toMatch(/not saved/i);
    ask?.onConfirm();
    expect(useEditor.getState().screen).toBe('home');
  });

  it('leaves straight away when the save works', async () => {
    saveProject.mockResolvedValue({ id: 'p1', name: 'Test', createdAt: 1, updatedAt: 99, objectCount: 0, thumbnail: null });
    await goHome();
    expect(useEditor.getState().screen).toBe('home');
    expect(useUI.getState().confirm).toBeNull();
  });

  it('two overlapping saves run one after the other, never together', async () => {
    let running = 0;
    let peak = 0;
    saveProject.mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 50));
      running--;
      return { id: 'p1', name: 'Test', createdAt: 1, updatedAt: 1, objectCount: 0, thumbnail: null };
    });
    const all = Promise.all([saveNow(), saveNow(), saveNow()]);
    await vi.advanceTimersByTimeAsync(500);
    await all;
    expect(peak).toBe(1);
  });
});
