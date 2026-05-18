// Cache-on-fetch service worker (V2 of offline support).
// V3 will add a build-time precache manifest. V4 will add the update banner.
//
// Strategy:
//   install   - pre-warm the app shell (/) so cold-boot offline has something to render
//   activate  - claim clients, purge any old caches we own
//   fetch     - GET only. Same-origin navigations: NetworkFirst with cache fallback.
//               Same-origin assets (hashed by Vite): CacheFirst, populated on first hit.
//               Cross-origin (fonts, etc.): pass through; V5 will add SWR for Google Fonts.

const VERSION = "v1";
const CACHE = `workout-pwa-${VERSION}`;
const APP_SHELL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(APP_SHELL, { cache: "reload" })))
      .catch(() => {
        // Network can flake during install; the cache-on-fetch path will recover.
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("workout-pwa-") && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    const cached = (await cache.match(request)) ?? (await cache.match(APP_SHELL));
    return cached ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    return Response.error();
  }
}
