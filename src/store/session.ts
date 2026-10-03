import { useEditor } from './editor';
import { useSettings } from './settings';
import { useUI } from './ui';
import { useClothing } from './clothing';
import * as projects from './projects';
import { viewportApi } from '../viewport/api';
import type { ProjectMeta } from '../types';
import type { ProjectTemplate } from '../assets/sample';

/**
 * Project lifecycle: open / create / save / autosave / leave. Everything that touches
 * persistence goes through here so the editor store stays synchronous and testable.
 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> | null = null;
let needsThumb = false;

export async function saveNow(manual = false): Promise<boolean> {
  const ed = useEditor.getState();
  if ((ed.screen !== 'editor' && ed.screen !== 'clothing') || !ed.project.id) return false;
  if (saving) await saving;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  ed.setSaveStatus('saving');
  const run = (async () => {
    const cur = useEditor.getState();
    const revisionAtSave = cur.revision;
    try {
      const data = cur.screen === 'clothing' ? { ...cur.serialize(), clothing: useClothing.getState().serialize() } : cur.serialize();
      const thumb = viewportApi.captureThumbnail();
      const meta = await projects.saveProject(cur.project.id, cur.project.name, cur.project.createdAt, data, thumb);
      const now = useEditor.getState();
      // If the user kept editing while we saved, stay "unsaved" so autosave runs again.
      now.setSaveStatus(now.revision === revisionAtSave ? 'saved' : 'unsaved', meta.updatedAt);
      if (manual) useUI.getState().toast('success', 'Project saved');
    } catch (err) {
      useEditor.getState().setSaveStatus('error');
      useUI.getState().toast('error', `Save failed: ${err instanceof Error ? err.message : 'storage error'}. Export a project file to keep a backup.`);
    }
  })();
  saving = run;
  await run;
  saving = null;
  return useEditor.getState().project.saveStatus !== 'error';
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
    await saveNow(false);
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
