/* Nexo UGC Studio service worker: makes the app work offline after the first visit.
   No tracking, no remote calls: it only caches this site's own files. */
// The build replaces __BUILD_ID__ with a timestamp, so every deploy gets its own cache and old ones are pruned.
// (Cache names sort by time, which is how "the previous build" is found below.)
const VERSION = 'nexo-ugc-__BUILD_ID__';
const KEEP_PREVIOUS = 1; // a tab still running the old build can keep loading its own files
const SHELL = ['./', './index.html', './manifest.webmanifest', './brand/icon-192.png', './brand/icon-512.png', './brand/nexo-mark-128.png', './brand/nexo-mark-64.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const old = keys.filter((k) => k.startsWith('nexo-ugc-') && k !== VERSION).sort().reverse();
        return Promise.all(old.slice(KEEP_PREVIOUS).map((k) => caches.delete(k)));
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch other sites

  // Pages: try the network first so updates arrive, fall back to the cached app when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // only a good page may replace the cached app: an error page cached here would break offline use
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  // Everything else (hashed JS/CSS/fonts/images): cache first, refresh in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
