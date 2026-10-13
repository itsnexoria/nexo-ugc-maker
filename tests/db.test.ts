import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectData, ProjectMeta } from '../src/types';

const project = (marker: string): ProjectData =>
  ({ version: 1, objects: {}, order: [marker], layers: [], textures: [], models: {}, rig: 'R6', camera: { position: [0, 0, 0], target: [0, 0, 0] } }) as unknown as ProjectData;
const meta = (id: string, updatedAt: number, name = 'P'): ProjectMeta => ({ id, name, createdAt: 1, updatedAt, objectCount: 0, thumbnail: null });
const marker = (d: ProjectData | undefined) => d?.order[0];

async function freshDb() {
  vi.resetModules();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  return import('../src/store/db');
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('db: atomic saves', () => {
  it('stores and reads a project', async () => {
    const db = await freshDb();
    await db.putProject(meta('a', 10), project('v1'));
    expect(marker(await db.getData('a'))).toBe('v1');
    expect((await db.getMeta('a'))?.updatedAt).toBe(10);
    expect((await db.listMeta()).map((m) => m.id)).toEqual(['a']);
  });

  it('a failed save leaves the previous project, its meta and its backup untouched', async () => {
    const db = await freshDb();
    await db.putProject(meta('a', 10), project('v1'));
    const bad = { ...project('v2'), objects: { x: () => 1 } } as unknown as ProjectData; // functions cannot be stored
    await expect(db.putProject(meta('a', 20), bad, { backupEveryMs: 0 })).rejects.toBeTruthy();
    expect(marker(await db.getData('a'))).toBe('v1');
    expect((await db.getMeta('a'))?.updatedAt).toBe(10);
    expect(await db.getBackup('a')).toBeUndefined(); // the backup written inside the failed transaction was rolled back too
  });

  it('removes data, meta and backup together', async () => {
    const db = await freshDb();
    await db.putProject(meta('a', 10), project('v1'));
    await db.putProject(meta('a', 20), project('v2'), { now: 1000 });
    expect(await db.getBackup('a')).toBeDefined();
    await db.removeProject('a');
    expect(await db.getData('a')).toBeUndefined();
    expect(await db.getMeta('a')).toBeUndefined();
    expect(await db.getBackup('a')).toBeUndefined();
  });
});

describe('db: rolling backup', () => {
  it('keeps the first previous version, then only rolls once it is old enough', async () => {
    const db = await freshDb();
    const gap = db.BACKUP_INTERVAL_MS;
    await db.putProject(meta('a', 1), project('v1'), { now: 0 });
    expect(await db.getBackup('a')).toBeUndefined(); // nothing earlier to back up
    expect(await db.putProject(meta('a', 2), project('v2'), { now: 1_000 })).toBe(true);
    expect(marker((await db.getBackup('a'))?.data)).toBe('v1');
    // autosaves seconds later must not overwrite the backup with a near-identical copy
    expect(await db.putProject(meta('a', 3), project('v3'), { now: 2_000 })).toBe(false);
    expect(marker((await db.getBackup('a'))?.data)).toBe('v1');
    expect(await db.putProject(meta('a', 4), project('v4'), { now: 1_000 + gap })).toBe(true);
    expect(marker((await db.getBackup('a'))?.data)).toBe('v3');
    expect(marker(await db.getData('a'))).toBe('v4');
  });

  it('restoring swaps the project with its backup, so it can be reversed', async () => {
    const db = await freshDb();
    await db.putProject(meta('a', 1), project('old'), { now: 0 });
    await db.putProject(meta('a', 2), project('new'), { now: 1_000 });
    expect(marker(await db.getData('a'))).toBe('new');
    await db.restoreBackup('a', 5_000);
    expect(marker(await db.getData('a'))).toBe('old');
    expect(marker((await db.getBackup('a'))?.data)).toBe('new');
    await db.restoreBackup('a', 6_000);
    expect(marker(await db.getData('a'))).toBe('new');
  });

  it('restoring a project without a backup does nothing', async () => {
    const db = await freshDb();
    await db.putProject(meta('a', 1), project('only'));
    expect(await db.restoreBackup('a')).toBeNull();
    expect(marker(await db.getData('a'))).toBe('only');
  });
});

describe('db: connection handling', () => {
  it('recovers after a failed open instead of failing forever', async () => {
    const db = await freshDb();
    const real = indexedDB.open.bind(indexedDB);
    let calls = 0;
    vi.spyOn(indexedDB, 'open').mockImplementation(((...args: Parameters<typeof real>) => {
      if (calls++ === 0) {
        const req: Record<string, unknown> = {};
        setTimeout(() => (req.onerror as (() => void) | undefined)?.(), 0);
        return req as unknown as IDBOpenDBRequest;
      }
      return real(...args);
    }) as typeof indexedDB.open);
    await expect(db.putProject(meta('a', 1), project('v1'))).rejects.toThrow();
    await expect(db.putProject(meta('a', 1), project('v1'))).resolves.toBeDefined();
    expect(marker(await db.getData('a'))).toBe('v1');
  });

  it('upgrades a version 1 database without losing projects', async () => {
    vi.resetModules();
    const factory = new IDBFactory();
    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = factory;
    await new Promise<void>((resolve, reject) => {
      const req = factory.open('nexo-ugc-studio', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('meta', { keyPath: 'id' }).put(meta('old', 5));
        req.result.createObjectStore('data').put(project('legacy'), 'old');
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    const db = await import('../src/store/db');
    expect(marker(await db.getData('old'))).toBe('legacy');
    await db.putProject(meta('old', 9), project('edited'), { now: 100 });
    expect(marker((await db.getBackup('old'))?.data)).toBe('legacy');
  });
});
