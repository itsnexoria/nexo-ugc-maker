import { useClothing } from '../store/clothing';
import { useEditor } from '../store/editor';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { viewportApi } from '../viewport/api';

/**
 * Plain-text report a user can paste into a bug report. Nothing is sent anywhere:
 * the app has no analytics or telemetry, so this is how problems reach you.
 * It contains no project content, only counts and recent log lines.
 */
export function buildDiagnostics(extra?: string): string {
  const ed = useEditor.getState();
  const cl = useClothing.getState();
  const settings = useSettings.getState();
  const logs = useUI.getState().logs.slice(-40);
  let gl = 'unavailable';
  try {
    const ctx = viewportApi.gl?.getContext();
    const dbg = ctx?.getExtension('WEBGL_debug_renderer_info');
    if (ctx && dbg) gl = String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
    else if (viewportApi.gl) gl = 'WebGL (renderer hidden)';
  } catch {
    /* ignore */
  }
  const lines = [
    `Nexo UGC Studio ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'}`,
    `Time: ${new Date().toISOString()}`,
    `Browser: ${navigator.userAgent}`,
    `Screen: ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
    `GPU: ${gl}`,
    `Mode: ${ed.screen}`,
    `Project: ${ed.project.id || '-'} (${ed.screen === 'clothing' ? `${Object.values(cl.designs).reduce((n, l) => n + l.length, 0)} layers` : `${Object.keys(ed.objects).length} objects`}), save status: ${ed.project.saveStatus}`,
    `Settings: quality=${settings.quality} theme=${settings.theme} autosave=${settings.autoSave}`,
    extra ? `\nError:\n${extra}` : '',
    '\nRecent log:',
    ...logs.map((l) => `${new Date(l.time).toISOString().slice(11, 19)} [${l.level}] ${l.message}`),
  ];
  return lines.filter((l) => l !== '').join('\n');
}

export async function copyDiagnostics(extra?: string): Promise<boolean> {
  const text = buildDiagnostics(extra);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard blocked: fall back to a hidden textarea
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Current project as a downloadable backup, for the crash screen. */
export function currentProjectBackup(): { name: string; json: string } | null {
  const ed = useEditor.getState();
  if (ed.screen !== 'editor' && ed.screen !== 'clothing') return null;
  try {
    const data = ed.screen === 'clothing' ? { ...ed.serialize(), clothing: useClothing.getState().serialize() } : ed.serialize();
    return { name: ed.project.name, json: JSON.stringify({ app: 'nexo-ugc-studio', version: 1, name: ed.project.name, data }) };
  } catch {
    return null;
  }
}
