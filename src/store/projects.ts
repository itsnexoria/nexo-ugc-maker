import type { ProjectData, ProjectMeta } from '../types';
import { buildProject, type ProjectTemplate } from '../assets/sample';
import { uid } from '../utils/ids';
import * as db from './db';

const SEEDED_KEY = 'nexo-ugc-seeded-v1';

export function metaFrom(id: string, name: string, createdAt: number, data: ProjectData, thumbnail: string | null): ProjectMeta {
  const count = Object.values(data.objects).filter((o) => o.kind !== 'group').length;
  return { id, name, createdAt, updatedAt: Date.now(), objectCount: count, thumbnail };
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
  const prev = thumbnail ? null : await db.getMeta(id);
  const meta = metaFrom(id, name, createdAt, data, thumbnail ?? prev?.thumbnail ?? null);
  await db.putData(id, data);
  await db.putMeta(meta);
  return meta;
}

export async function createProject(name: string, template: ProjectTemplate): Promise<{ meta: ProjectMeta; data: ProjectData }> {
  const data = buildProject(template);
  const id = uid('proj');
  const meta = metaFrom(id, name, Date.now(), data, null);
  await db.putData(id, data);
  await db.putMeta(meta);
  return { meta, data };
}

export async function duplicateProject(id: string): Promise<ProjectMeta | null> {
  const src = await loadProject(id);
  if (!src) return null;
  const nid = uid('proj');
  const data = JSON.parse(JSON.stringify(src.data)) as ProjectData;
  const meta: ProjectMeta = { ...src.meta, id: nid, name: `${src.meta.name} copy`, createdAt: Date.now(), updatedAt: Date.now() };
  await db.putData(nid, data);
  await db.putMeta(meta);
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
export async function seedIfFirstRun(): Promise<void> {
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

export interface ProjectFile {
  app: 'nexo-ugc-studio';
  version: 1;
  name: string;
  data: ProjectData;
}

export function toProjectFile(name: string, data: ProjectData): string {
  const file: ProjectFile = { app: 'nexo-ugc-studio', version: 1, name, data };
  return JSON.stringify(file);
}

export function parseProjectFile(text: string): { name: string; data: ProjectData } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const f = parsed as Partial<ProjectFile>;
  if (f?.app !== 'nexo-ugc-studio' || !f.data || typeof f.data !== 'object') {
    throw new Error('This is not a Nexo UGC Studio project file.');
  }
  const d = f.data as ProjectData;
  if (!d.objects || !Array.isArray(d.order) || !Array.isArray(d.layers)) {
    throw new Error('The project file is missing scene data.');
  }
  return {
    name: String(f.name ?? 'Imported project').slice(0, 60),
    data: { ...d, textures: d.textures ?? [], models: d.models ?? {}, rig: d.rig === 'R15' ? 'R15' : 'R6' },
  };
}

export async function importProjectFile(text: string): Promise<ProjectMeta> {
  const { name, data } = parseProjectFile(text);
  const id = uid('proj');
  const meta = metaFrom(id, name, Date.now(), data, null);
  await db.putData(id, data);
  await db.putMeta(meta);
  return meta;
}

/** Stores a thumbnail without changing the project's "updated" time. */
export async function setThumbnail(id: string, thumbnail: string): Promise<void> {
  const meta = await db.getMeta(id);
  if (meta) await db.putMeta({ ...meta, thumbnail });
}
