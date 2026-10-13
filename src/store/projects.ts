import type { ProjectData, ProjectMeta } from '../types';
import { buildProject, type ProjectTemplate } from '../assets/sample';
import { uid } from '../utils/ids';
import * as db from './db';
import { parseProjectFileText, stringifyProjectFile } from '../utils/projectFile';

const SEEDED_KEY = 'nexo-ugc-seeded-v1';

export function metaFrom(id: string, name: string, createdAt: number, data: ProjectData, thumbnail: string | null): ProjectMeta {
  const count = data.clothing
    ? (['shirt', 'pants', 'tshirt'] as const).reduce((n, k) => n + (data.clothing!.designs[k]?.length ?? 0), 0)
    : Object.values(data.objects).filter((o) => o.kind !== 'group').length;
  return { id, kind: data.clothing ? 'clothing' : 'accessory', name, createdAt, updatedAt: Date.now(), objectCount: count, thumbnail };
}

/** Refuses to overwrite a good save with something that is obviously not a project. */
function assertSaveable(data: ProjectData): void {
  if (!data || typeof data !== 'object' || !data.objects || !Array.isArray(data.order) || !Array.isArray(data.layers)) {
    throw new Error('The project data looks incomplete, so the last good save was kept.');
  }
}

export async function listProjects(): Promise<ProjectMeta[]> {
  return db.listMeta();
}

export async function loadProject(id: string): Promise<{ meta: ProjectMeta; data: ProjectData } | null> {
  const [meta, data] = await Promise.all([db.getMeta(id), db.getData(id)]);
  if (!meta || !data) return null;
  return { meta, data };
}

export async function saveProject(
  id: string,
  name: string,
  createdAt: number,
  data: ProjectData,
  thumbnail: string | null,
): Promise<ProjectMeta> {
  // keep the previous thumbnail if a new one could not be captured
  assertSaveable(data);
  const prev = thumbnail ? null : await db.getMeta(id);
  const meta = metaFrom(id, name, createdAt, data, thumbnail ?? prev?.thumbnail ?? null);
  // one transaction: data, dashboard entry and (when due) the rolling backup land together or not at all
  await db.putProject(meta, data);
  return meta;
}

export async function createProject(name: string, template: ProjectTemplate): Promise<{ meta: ProjectMeta; data: ProjectData }> {
  const data = buildProject(template);
  const id = uid('proj');
  const meta = metaFrom(id, name, Date.now(), data, null);
  await db.putProject(meta, data);
  return { meta, data };
}

export async function duplicateProject(id: string): Promise<ProjectMeta | null> {
  const src = await loadProject(id);
  if (!src) return null;
  const nid = uid('proj');
  const data = JSON.parse(JSON.stringify(src.data)) as ProjectData;
  const meta: ProjectMeta = { ...src.meta, id: nid, name: `${src.meta.name} copy`, createdAt: Date.now(), updatedAt: Date.now() };
  await db.putProject(meta, data);
  return meta;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const meta = await db.getMeta(id);
  if (!meta) return;
  await db.putMeta({ ...meta, name: name.trim().slice(0, 60) || meta.name, updatedAt: Date.now() });
}

export async function deleteProject(id: string): Promise<void> {
  await db.removeProject(id);
}

/** First run: add the Cyber Crown sample once so the dashboard is never empty. */
let seeding: Promise<void> | null = null;
export function seedIfFirstRun(): Promise<void> {
  // one run at a time, so React StrictMode's double effect cannot create two sample projects
  if (!seeding) seeding = seedOnce().finally(() => (seeding = null));
  return seeding;
}

async function seedOnce(): Promise<void> {
  let seeded = false;
  try {
    seeded = localStorage.getItem(SEEDED_KEY) === '1';
  } catch {
    /* ignore */
  }
  if (seeded) return;
  const existing = await db.listMeta();
  if (existing.length === 0) await createProject('Cyber Crown', 'cyber-crown');
  try {
    localStorage.setItem(SEEDED_KEY, '1');
  } catch {
    /* ignore */
  }
}

// ---------- project files (backup / sharing) ----------

export function toProjectFile(name: string, data: ProjectData): string {
  return stringifyProjectFile(name, data);
}

export function parseProjectFile(text: string): { name: string; data: ProjectData; warnings: string[] } {
  const { name, data, warnings } = parseProjectFileText(text);
  return { name, data, warnings };
}

export async function importProjectFile(text: string): Promise<ProjectMeta & { warnings: string[] }> {
  const { name, data, warnings } = parseProjectFile(text);
  const id = uid('proj');
  const meta = metaFrom(id, name, Date.now(), data, null);
  await db.putProject(meta, data);
  return { ...meta, warnings };
}

/** Stores a thumbnail without changing the project's "updated" time. */
export async function setThumbnail(id: string, thumbnail: string): Promise<void> {
  const meta = await db.getMeta(id);
  if (meta) await db.putMeta({ ...meta, thumbnail });
}

// ---------- rolling backup ----------

export async function backupInfo(id: string): Promise<{ takenAt: number; updatedAt: number } | null> {
  try {
    return await db.getBackupInfo(id);
  } catch {
    return null;
  }
}

/** Swaps the project with its previous good save. The current version becomes the backup, so this can be reversed. */
export async function restorePreviousSave(id: string): Promise<ProjectMeta | null> {
  return db.restoreBackup(id);
}
