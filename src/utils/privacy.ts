import JSZip from 'jszip';
import { closeDb, deleteDatabase } from '../store/db';
import { listProjects, loadProject, toProjectFile } from '../store/projects';
import { safeFilename } from './download';

export interface StorageInfo {
  usedBytes: number | null;
  quotaBytes: number | null;
  persisted: boolean | null;
}

export async function storageInfo(): Promise<StorageInfo> {
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = (await navigator.storage?.persisted?.()) ?? null;
    return { usedBytes: est?.usage ?? null, quotaBytes: est?.quota ?? null, persisted };
  } catch {
    return { usedBytes: null, quotaBytes: null, persisted: null };
  }
}

/** Asks the browser not to evict this site's data when disk space runs low. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function formatBytes(n: number | null): string {
  if (n === null) return 'unknown';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** Every saved project as a ZIP of project files, so a user can keep a full backup. */
export async function backupAllProjects(): Promise<{ blob: Blob; count: number } | null> {
  const metas = await listProjects();
  if (!metas.length) return null;
  const zip = new JSZip();
  const used = new Set<string>();
  let count = 0;
  for (const m of metas) {
    const full = await loadProject(m.id);
    if (!full) continue;
    let base = safeFilename(m.name);
    let i = 2;
    while (used.has(base)) base = `${safeFilename(m.name)}-${i++}`;
    used.add(base);
    zip.file(`${base}.nexougc.json`, toProjectFile(m.name, full.data));
    count++;
  }
  zip.file('README.txt', 'Backup from Nexo UGC Studio by Nexoria.\nOpen the app and use Import project file (Home or Open project) to restore any of these.\n');
  return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), count };
}

/** Removes projects, settings, tour flags, saved assets, the offline cache and the service worker. */
export async function deleteAllLocalData(): Promise<void> {
  await closeDb();
  await deleteDatabase();
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('nexo-')) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('nexo-ugc-')).map((k) => caches.delete(k)));
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
  } catch {
    /* ignore */
  }
}
