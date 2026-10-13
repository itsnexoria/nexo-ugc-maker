import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

type Handler = (event: Record<string, unknown>) => void;

/** Runs public/sw.js against a tiny fake service-worker scope. */
function boot(buildId: string, existing: string[] = []) {
  const handlers = new Map<string, Handler>();
  const store = new Map<string, Map<string, unknown>>(existing.map((n) => [n, new Map()]));
  const cacheApi = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const c = store.get(name)!;
      return { put: async (k: unknown, v: unknown) => void c.set(typeof k === 'string' ? k : (k as { url: string }).url, v), addAll: async () => undefined };
    },
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
    match: async (k: unknown) => {
      const key = typeof k === 'string' ? k : (k as { url: string }).url;
      for (const c of store.values()) if (c.has(key)) return c.get(key);
      return undefined;
    },
  };
  let fetchImpl: (req: unknown) => Promise<unknown> = async () => ({ ok: true, type: 'basic', clone() { return this; } });
  const self = { location: { origin: 'https://x.test' }, addEventListener: (t: string, h: Handler) => handlers.set(t, h), skipWaiting: async () => undefined, clients: { claim: async () => undefined } };
  const code = readFileSync('public/sw.js', 'utf8').replaceAll('__BUILD_ID__', buildId);
  new Function('self', 'caches', 'fetch', code)(self, cacheApi, (r: unknown) => fetchImpl(r));
  const run = async (type: string, extra: Record<string, unknown> = {}) => {
    let waited: Promise<unknown> = Promise.resolve();
    let responded: Promise<unknown> | undefined;
    handlers.get(type)!({ waitUntil: (p: Promise<unknown>) => (waited = p), respondWith: (p: Promise<unknown>) => (responded = p), ...extra });
    await waited;
    return responded ? await responded : undefined;
  };
  return { store, run, setFetch: (f: typeof fetchImpl) => (fetchImpl = f) };
}

const nav = { request: { method: 'GET', url: 'https://x.test/', mode: 'navigate' } };

describe('service worker', () => {
  let sw: ReturnType<typeof boot>;
  beforeEach(() => {
    sw = boot('0400', ['nexo-ugc-0100', 'nexo-ugc-0200', 'nexo-ugc-0300', 'unrelated-cache']);
  });

  it('on activate keeps the current and previous build, prunes older ones and ignores other caches', async () => {
    await sw.run('install');
    await sw.run('activate');
    expect([...sw.store.keys()].sort()).toEqual(['nexo-ugc-0300', 'nexo-ugc-0400', 'unrelated-cache']);
  });

  it('caches a good page for offline use', async () => {
    await sw.run('install');
    const good = { ok: true, status: 200, clone() { return this; } };
    sw.setFetch(async () => good);
    await sw.run('fetch', nav);
    await new Promise((r) => setTimeout(r, 0));
    expect(sw.store.get('nexo-ugc-0400')?.get('./index.html')).toBe(good);
  });

  it('does not let an error page replace the cached app', async () => {
    await sw.run('install');
    const good = { ok: true, status: 200, clone() { return this; } };
    sw.setFetch(async () => good);
    await sw.run('fetch', nav);
    await new Promise((r) => setTimeout(r, 0));
    const broken = { ok: false, status: 500, clone() { return this; } };
    sw.setFetch(async () => broken);
    await sw.run('fetch', nav);
    await new Promise((r) => setTimeout(r, 0));
    expect(sw.store.get('nexo-ugc-0400')?.get('./index.html')).toBe(good);
  });

  it('falls back to the cached app when offline', async () => {
    await sw.run('install');
    const good = { ok: true, status: 200, clone() { return this; } };
    sw.setFetch(async () => good);
    await sw.run('fetch', nav);
    await new Promise((r) => setTimeout(r, 0));
    sw.setFetch(async () => {
      throw new Error('offline');
    });
    expect(await sw.run('fetch', nav)).toBe(good);
  });

  it('never caches cross-origin or non-basic responses', async () => {
    await sw.run('install');
    const opaque = { ok: true, type: 'opaque', clone() { return this; } };
    sw.setFetch(async () => opaque);
    await sw.run('fetch', { request: { method: 'GET', url: 'https://x.test/assets/a.js', mode: 'cors' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(sw.store.get('nexo-ugc-0400')?.has('https://x.test/assets/a.js')).toBeFalsy();
    let touched = false;
    sw.setFetch(async () => {
      touched = true;
      return opaque;
    });
    const handled = await sw.run('fetch', { request: { method: 'GET', url: 'https://other.test/a.js', mode: 'cors' } });
    expect(handled).toBeUndefined();
    expect(touched).toBe(false);
  });
});
