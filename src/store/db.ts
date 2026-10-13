import type { ProjectData, ProjectMeta } from '../types';

/**
 * Tiny IndexedDB wrapper. Three object stores:
 *  - `meta`   lightweight records used for the dashboard list
 *  - `data`   the full project payload
 *  - `backup` the previous good version of each project (rolling, see putProject)
 * Falls back to in-memory storage when IndexedDB is unavailable (private mode, tests).
 *
 * Saves are ONE transaction across all three stores, so a crash, a full disk or a closed tab
 * can never leave a project half-written: either the whole save lands or none of it does.
 */
const DB_NAME = 'nexo-ugc-studio';
const DB_VERSION = 2;

type StoreName = 'meta' | 'data' | 'backup';

export interface BackupRecord {
  id: string;
  /** when this copy was taken */
  takenAt: number;
  /** the project's own "updated" time at that moment */
  updatedAt: number;
  name: string;
  data: ProjectData;
}

/** A new backup is only taken when the existing one is at least this old, so it stays a real step back. */
export const BACKUP_INTERVAL_MS = 5 * 60 * 1000;

const memory: Record<StoreName, Map<string, unknown>> = { meta: new Map(), data: new Map(), backup: new Map() };
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
    const p = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
        if (!db.objectStoreNames.contains('backup')) db.createObjectStore('backup', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        // another tab wants to upgrade or delete the database: let go so it is not blocked
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error('Could not open the project database'));
      req.onblocked = () => reject(new Error('The project database is blocked by another tab. Close other Nexo UGC Studio tabs and try again.'));
    });
    // a failed open must not be remembered, or every later save would fail until a reload
    p.catch(() => {
      if (dbPromise === p) dbPromise = null;
    });
    dbPromise = p;
  }
  return dbPromise;
}

/** Runs `run` inside one transaction over `stores` and resolves with its result when the transaction has committed. */
async function transact<T>(stores: StoreName[], mode: IDBTransactionMode, run: (tx: IDBTransaction) => Promise<T> | T): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let result: T;
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, mode);
    } catch (e) {
      // the connection was closed under us (version change): reconnect once
      dbPromise = null;
      reject(e instanceof Error ? e : new Error('Database transaction failed'));
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('Database transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Database transaction aborted'));
    Promise.resolve(run(tx)).then(
      (r) => {
        result = r;
      },
      (e) => {
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
        reject(e);
      },
    );
  });
}

const wrap = <T,>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Database request failed'));
  });

async function read<T>(store: StoreName, get: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return transact([store], 'readonly', (tx) => wrap(get(tx.objectStore(store))));
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export async function putMeta(meta: ProjectMeta): Promise<void> {
  if (!hasIDB()) {
    memory.meta.set(meta.id, meta);
    return;
  }
  await transact(['meta'], 'readwrite', (tx) => void tx.objectStore('meta').put(meta));
}

export async function getData(id: string): Promise<ProjectData | undefined> {
  if (!hasIDB()) return memory.data.get(id) as ProjectData | undefined;
  return read<ProjectData | undefined>('data', (s) => s.get(id));
}

export async function getMeta(id: string): Promise<ProjectMeta | undefined> {
  if (!hasIDB()) return memory.meta.get(id) as ProjectMeta | undefined;
  return read<ProjectMeta | undefined>('meta', (s) => s.get(id));
}

export async function listMeta(): Promise<ProjectMeta[]> {
  const all = hasIDB() ? await read<ProjectMeta[]>('meta', (s) => s.getAll()) : (Array.from(memory.meta.values()) as ProjectMeta[]);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Saves a project (data + meta) atomically. If a previous version exists and the stored backup is
 * missing or older than BACKUP_INTERVAL_MS, that previous version becomes the new backup in the same
 * transaction. Returns true when a backup was taken.
 */
export async function putProject(meta: ProjectMeta, data: ProjectData, opts: { now?: number; backupEveryMs?: number } = {}): Promise<boolean> {
  const now = opts.now ?? Date.now();
  const every = opts.backupEveryMs ?? BACKUP_INTERVAL_MS;
  const dueFor = (b: BackupRecord | undefined) => !b || now - b.takenAt >= every;

  if (!hasIDB()) {
    const prevData = memory.data.get(meta.id) as ProjectData | undefined;
    const prevMeta = memory.meta.get(meta.id) as ProjectMeta | undefined;
    let took = false;
    if (prevData && prevMeta && dueFor(memory.backup.get(meta.id) as BackupRecord | undefined)) {
      memory.backup.set(meta.id, { id: meta.id, takenAt: now, updatedAt: prevMeta.updatedAt, name: prevMeta.name, data: prevData } satisfies BackupRecord);
      took = true;
    }
    memory.data.set(meta.id, structuredCloneSafe(data));
    memory.meta.set(meta.id, meta);
    return took;
  }

  return transact(['meta', 'data', 'backup'], 'readwrite', async (tx) => {
    const dataStore = tx.objectStore('data');
    const metaStore = tx.objectStore('meta');
    const backupStore = tx.objectStore('backup');
    const [prevData, prevMeta, prevBackup] = await Promise.all([
      wrap(dataStore.get(meta.id) as IDBRequest<ProjectData | undefined>),
      wrap(metaStore.get(meta.id) as IDBRequest<ProjectMeta | undefined>),
      wrap(backupStore.get(meta.id) as IDBRequest<BackupRecord | undefined>),
    ]);
    let took = false;
    if (prevData && prevMeta && dueFor(prevBackup)) {
      backupStore.put({ id: meta.id, takenAt: now, updatedAt: prevMeta.updatedAt, name: prevMeta.name, data: prevData } satisfies BackupRecord);
      took = true;
    }
    dataStore.put(data, meta.id);
    metaStore.put(meta);
    return took;
  });
}

export async function getBackup(id: string): Promise<BackupRecord | undefined> {
  if (!hasIDB()) return memory.backup.get(id) as BackupRecord | undefined;
  return read<BackupRecord | undefined>('backup', (s) => s.get(id));
}

/** Small summary (no payload) for showing "previous save from 12 min ago". */
export async function getBackupInfo(id: string): Promise<{ takenAt: number; updatedAt: number } | null> {
  const b = await getBackup(id);
  return b ? { takenAt: b.takenAt, updatedAt: b.updatedAt } : null;
}

/**
 * Swaps the project with its backup in one transaction: the backup becomes the project and the
 * current version becomes the backup, so restoring can itself be undone by restoring again.
 */
export async function restoreBackup(id: string, now = Date.now()): Promise<ProjectMeta | null> {
  if (!hasIDB()) {
    const b = memory.backup.get(id) as BackupRecord | undefined;
    const curData = memory.data.get(id) as ProjectData | undefined;
    const curMeta = memory.meta.get(id) as ProjectMeta | undefined;
    if (!b || !curData || !curMeta) return null;
    memory.backup.set(id, { id, takenAt: now, updatedAt: curMeta.updatedAt, name: curMeta.name, data: curData } satisfies BackupRecord);
    const next: ProjectMeta = { ...curMeta, updatedAt: now };
    memory.data.set(id, b.data);
    memory.meta.set(id, next);
    return next;
  }
  return transact(['meta', 'data', 'backup'], 'readwrite', async (tx) => {
    const dataStore = tx.objectStore('data');
    const metaStore = tx.objectStore('meta');
    const backupStore = tx.objectStore('backup');
    const [b, curData, curMeta] = await Promise.all([
      wrap(backupStore.get(id) as IDBRequest<BackupRecord | undefined>),
      wrap(dataStore.get(id) as IDBRequest<ProjectData | undefined>),
      wrap(metaStore.get(id) as IDBRequest<ProjectMeta | undefined>),
    ]);
    if (!b || !curData || !curMeta) return null;
    backupStore.put({ id, takenAt: now, updatedAt: curMeta.updatedAt, name: curMeta.name, data: curData } satisfies BackupRecord);
    const next: ProjectMeta = { ...curMeta, updatedAt: now };
    dataStore.put(b.data, id);
    metaStore.put(next);
    return next;
  });
}

/** Removes a project, its backup and its dashboard entry in one transaction. */
export async function removeProject(id: string): Promise<void> {
  if (!hasIDB()) {
    memory.meta.delete(id);
    memory.data.delete(id);
    memory.backup.delete(id);
    return;
  }
  await transact(['meta', 'data', 'backup'], 'readwrite', (tx) => {
    tx.objectStore('meta').delete(id);
    tx.objectStore('data').delete(id);
    tx.objectStore('backup').delete(id);
  });
}

/** Closes the connection so the database can be deleted. */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  try {
    (await dbPromise).close();
  } catch {
    /* already closed or never opened */
  }
  dbPromise = null;
}

export function deleteDatabase(): Promise<void> {
  memory.meta.clear();
  memory.data.clear();
  memory.backup.clear();
  if (!hasIDB()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Could not delete the project database'));
    req.onblocked = () => resolve(); // another tab still has it open; it is removed when that tab closes
  });
}
