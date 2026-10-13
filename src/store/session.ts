import { useEditor } from './editor';
import { useSettings } from './settings';
import { useUI } from './ui';
import { useClothing } from './clothing';
import * as projects from './projects';
import { viewportApi } from '../viewport/api';
import type { ProjectMeta } from '../types';
import type { ProjectTemplate } from '../assets/sample';
import { currentProjectBackup } from '../utils/diagnostics';
import { downloadBlob, safeFilename } from '../utils/download';
import { serializeCurrentProject } from './serialize';
import { clearPaintCaches } from '../utils/paint';
import { clearClothingCaches } from '../clothing/render';
import { estimateProjectBytes, useStorageHealth } from '../utils/storageHealth';

/**
 * Project lifecycle: open / create / save / autosave / leave. Everything that touches
 * persistence goes through here so the editor store stays synchronous and testable.
 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> | null = null;
let needsThumb = false;
let failedSaves = 0;
const RETRY_DELAYS_MS = [8_000, 20_000, 60_000];

/** A readable reason for a failed save (a full disk is by far the most common one). */
export function saveErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : '';
  if (name === 'QuotaExceededError' || /quota|storage is full|disk/i.test(msg)) return 'this browser has no storage space left';
  if (/blocked by another tab/i.test(msg)) return 'another Nexo UGC Studio tab is blocking storage';
  return msg || 'storage error';
}

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

/** After a failed save, keep trying quietly (storage often frees up, or the blocking tab gets closed). */
function scheduleRetry() {
  clearRetry();
  if (!useSettings.getState().autoSave || failedSaves > RETRY_DELAYS_MS.length) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (useEditor.getState().project.saveStatus === 'error') void saveNow(false);
  }, RETRY_DELAYS_MS[Math.min(failedSaves - 1, RETRY_DELAYS_MS.length - 1)]);
}

export async function saveNow(manual = false): Promise<boolean> {
  const ed0 = useEditor.getState();
  if ((ed0.screen !== 'editor' && ed0.screen !== 'clothing') || !ed0.project.id) return false;
  // wait for every save in flight (a loop, so two waiting callers cannot both start at once)
  while (saving) await saving;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  clearRetry();
  useEditor.getState().setSaveStatus('saving');
  const run = (async () => {
    const cur = useEditor.getState();
    const revisionAtSave = cur.revision;
    try {
      const data = serializeCurrentProject();
      const thumb = viewportApi.captureThumbnail();
      const meta = await projects.saveProject(cur.project.id, cur.project.name, cur.project.createdAt, data, thumb);
      const now = useEditor.getState();
      failedSaves = 0;
      // If the user kept editing while we saved, stay "unsaved" so autosave runs again.
      now.setSaveStatus(now.revision === revisionAtSave ? 'saved' : 'unsaved', meta.updatedAt);
      if (manual) useUI.getState().toast('success', 'Project saved');
      const health = useStorageHealth.getState();
      health.setProjectBytes(estimateProjectBytes(data));
      void health.check();
    } catch (err) {
      failedSaves += 1;
      useEditor.getState().setSaveStatus('error');
      useUI.getState().log('error', `Save failed: ${saveErrorMessage(err)}`);
      if (manual) useUI.getState().toast('error', `Save failed: ${saveErrorMessage(err)}. Use Download backup to keep your work.`);
      void useStorageHealth.getState().check(true);
      scheduleRetry();
    }
  })();
  saving = run;
  try {
    await run;
  } finally {
    if (saving === run) saving = null;
  }
  return useEditor.getState().project.saveStatus !== 'error';
}

/** Downloads the project as it is right now (including unsaved changes) as a project file. */
export function downloadCurrentBackup(): boolean {
  const backup = currentProjectBackup();
  if (!backup) {
    useUI.getState().toast('error', 'Nothing to back up right now.');
    return false;
  }
  downloadBlob(new Blob([backup.json], { type: 'application/json' }), `${safeFilename(backup.name)}.nexougc.json`);
  useUI.getState().toast('success', 'Backup downloaded. Import it from Home with Import project file.');
  return true;
}

function scheduleAutosave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveNow(false);
  }, 1500);
}

export function startAutosave(): () => void {
  return useEditor.subscribe((state, prev) => {
    if ((state.screen !== 'editor' && state.screen !== 'clothing') || state.revision === prev.revision) return;
    if (!useSettings.getState().autoSave) return;
    scheduleAutosave();
  });
}

export async function openProject(id: string): Promise<boolean> {
  const ui = useUI.getState();
  ui.setBusy('Opening project…');
  try {
    const found = await projects.loadProject(id);
    if (!found) {
      ui.toast('error', 'That project could not be found. It may have been deleted.');
      return false;
    }
    needsThumb = !found.meta.thumbnail;
    // drop painted-texture rasters and decoded images from the previous project
    clearPaintCaches();
    clearClothingCaches();
    failedSaves = 0;
    clearRetry();
    if (found.data.clothing) useClothing.getState().load(found.data.clothing);
    useEditor.getState().loadProject(
      { id: found.meta.id, name: found.meta.name, createdAt: found.meta.createdAt, updatedAt: found.meta.updatedAt },
      found.data,
    );
    ui.log('success', `Opened "${found.meta.name}"`);
    return true;
  } catch (err) {
    ui.toast('error', `Could not open project: ${err instanceof Error ? err.message : 'unknown error'}`);
    return false;
  } finally {
    useUI.getState().setBusy(null);
  }
}

export async function createAndOpen(name: string, template: ProjectTemplate): Promise<void> {
  const ui = useUI.getState();
  ui.setBusy('Creating project…');
  try {
    const { meta } = await projects.createProject(name.trim() || 'Untitled project', template);
    await openProject(meta.id);
  } catch (err) {
    ui.toast('error', `Could not create project: ${err instanceof Error ? err.message : 'unknown error'}`);
  } finally {
    useUI.getState().setBusy(null);
  }
}

export async function goHome(): Promise<void> {
  const sc = useEditor.getState().screen;
  if ((sc === 'editor' || sc === 'clothing') && useEditor.getState().project.saveStatus !== 'saved') {
    const ok = await saveNow(false);
    if (!ok) {
      // never walk away from work that could not be saved without saying so
      useUI.getState().askConfirm({
        title: 'Your latest changes are not saved',
        body: 'This project could not be saved to the browser. If you leave now the changes since the last successful save are lost. Stay and use Download backup, or leave anyway.',
        confirmLabel: 'Leave anyway',
        danger: true,
        onConfirm: () => useEditor.getState().setScreen('home'),
      });
      return;
    }
  }
  useEditor.getState().setScreen('home');
}

export async function duplicateCurrent(): Promise<void> {
  await saveNow(false);
  const id = useEditor.getState().project.id;
  const meta = await projects.duplicateProject(id);
  if (meta) {
    useUI.getState().toast('success', `Duplicated as "${meta.name}"`, {
      label: 'Open copy',
      onClick: () => void openProject(meta.id),
    });
  }
}

export async function listAll(): Promise<ProjectMeta[]> {
  return projects.listProjects();
}

/** First open of a project without a preview image: capture one once the scene has rendered. */
export async function captureMissingThumbnail(): Promise<void> {
  if (!needsThumb) return;
  const thumb = viewportApi.captureThumbnail();
  if (!thumb) return;
  needsThumb = false;
  try {
    await projects.setThumbnail(useEditor.getState().project.id, thumb);
  } catch {
    /* thumbnails are optional */
  }
}
