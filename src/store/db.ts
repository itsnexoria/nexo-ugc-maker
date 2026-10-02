import type { ProjectData, ProjectMeta } from '../types';

/**
 * Tiny IndexedDB wrapper. Two object stores: `meta` (lightweight, used for the
 * dashboard list) and `data` (full project payload). Falls back to in-memory
 * storage when IndexedDB is unavailable (private mode, tests).
 */
const DB_NAME = 'nexo-ugc-studio';
const DB_VERSION = 1;

type StoreName = 'meta' | 'data';

const memory: Record<StoreName, Map<string, unknown>> = { meta: new Map(), data: new Map() };
let dbPromise: Promise<IDBDatabase> | null = null;

function hasIDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Could not open the project database'));
      req.onblocked = () => reject(new Error('The project database is blocked by another tab'));
    });
  }
  return dbPromise;
}

async function request<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = run(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? new Error('Database transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Database transaction aborted'));
  });
}

export async function putMeta(meta: ProjectMeta): Promise<void> {
  if (!hasIDB()) {
    memory.meta.set(meta.id, meta);
    return;
  }
  await request('meta', 'readwrite', (s) => s.put(meta));
}

export async function putData(id: string, data: ProjectData): Promise<void> {
  if (!hasIDB()) {
    memory.data.set(id, structuredCloneSafe(data));
    return;
  }
  await request('data', 'readwrite', (s) => s.put(data, id));
}

export async function getData(id: string): Promise<ProjectData | undefined> {
  if (!hasIDB()) return memory.data.get(id) as ProjectData | undefined;
  return request<ProjectData | undefined>('data', 'readonly', (s) => s.get(id));
}

export async function getMeta(id: string): Promise<ProjectMeta | undefined> {
  if (!hasIDB()) return memory.meta.get(id) as ProjectMeta | undefined;
  return request<ProjectMeta | undefined>('meta', 'readonly', (s) => s.get(id));
}

export async function listMeta(): Promise<ProjectMeta[]> {
  const all = hasIDB()
    ? await request<ProjectMeta[]>('meta', 'readonly', (s) => s.getAll())
    : (Array.from(memory.meta.values()) as ProjectMeta[]);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function removeProject(id: string): Promise<void> {
  if (!hasIDB()) {
    memory.meta.delete(id);
    memory.data.delete(id);
    return;
  }
  await request('meta', 'readwrite', (s) => s.delete(id));
  await request('data', 'readwrite', (s) => s.delete(id));
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
