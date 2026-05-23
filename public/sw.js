// Build-time precache service worker.
//
// vite-plugin-sw.ts substitutes two tokens during `closeBundle`:
//   - the SW_VERSION string literal below (currently "__" + "SW_VERSION__")
//     becomes a 12-char content hash of the precache list.
//   - the single-element PRECACHE array literal becomes the real array of URLs.
// The version hash is derived from the list contents, so any change to
// shipped assets produces a new SW byte stream — which is what tells the
// browser an update is available.
//
// Strategy:
//   install   - precache the full app shell (HTML, JS chunks, CSS, icons, manifest)
//               so cold-boot offline works for any route on first launch.
//   activate  - claim clients, purge any old caches we own (versioned app cache
//               plus any older font caches).
//   fetch     - GET only.
//                 Same-origin navigations: NetworkFirst with cache fallback to the
//                   precached URL or `/`.
//                 Same-origin assets:      CacheFirst (precached on install;
//                   runtime additions populate misses).
//                 Google Fonts:            StaleWhileRevalidate against a separate
//                   long-lived cache that survives deploys.
//                 Other cross-origin:      pass through — we don't cache things
//                   the page author didn't opt in to.

const VERSION = "__SW_VERSION__";
const CACHE = `workout-pwa-${VERSION}`;
const FONTS_CACHE = "workout-fonts-v1";
const APP_SHELL = "/";
const PRECACHE = ["__PRECACHE__"];

// Origins we apply StaleWhileRevalidate to. Anything not on this list keeps
// passing through the SW untouched, so adding a third-party script later
// doesn't accidentally start silently caching it.
const FONT_ORIGINS = new Set(["https://fonts.googleapis.com", "https://fonts.gstatic.com"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Reload mode bypasses HTTP cache so we get the freshly deployed bytes.
      const requests = PRECACHE.map((url) => new Request(url, { cache: "reload" }));
      // addAll is all-or-nothing; fall back to individual adds so a single 404
      // (e.g. a renamed asset between deploy and SW install) doesn't abort install.
      try {
        await cache.addAll(requests);
      } catch {
        await Promise.all(
          requests.map((req) =>
            cache.add(req).catch(() => {
              // Skip individual failures; runtime cache-on-fetch will recover.
            }),
          ),
        );
      }
    })(),
  );
});

// Page → SW handshake: the in-app "Reload to update" banner posts SKIP_WAITING
// when the user opts in to the new version. self.skipWaiting() promotes the
// installed-but-waiting SW to active, which fires controllerchange in every
// open tab. The page-side hook reloads on that signal.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => {
            // Purge older versioned app caches (workout-pwa-<hash>) and any
            // older fonts caches (workout-fonts-v<N>) that aren't current.
            if (k.startsWith("workout-pwa-")) return k !== CACHE;
            if (k.startsWith("workout-fonts-")) return k !== FONTS_CACHE;
            return false;
          })
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

  if (url.origin === self.location.origin) {
    if (request.mode === "navigate") {
      event.respondWith(networkFirst(request));
      return;
    }
    event.respondWith(cacheFirst(request));
    return;
  }

  // Cross-origin: only Google Fonts gets SWR. Everything else passes through.
  if (FONT_ORIGINS.has(url.origin)) {
    event.respondWith(staleWhileRevalidate(event));
  }
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

// StaleWhileRevalidate — return the cached response immediately if we have one,
// always kick off a background refresh to update the cache for next time. Used
// for Google Fonts: the CSS at fonts.googleapis.com and the woff2 binaries at
// fonts.gstatic.com. Lives in its own cache so it survives app-version bumps.
async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(FONTS_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      // Cache 2xx responses, plus opaque ones from no-cors stylesheet requests
      // (we can't inspect them but the browser can still use them).
      if (response.ok || response.type === "opaque") {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  // Keep the SW alive past respondWith() so the background refresh actually
  // lands in the cache even when we return the stale copy immediately.
  event.waitUntil(fetchPromise.catch(() => {}));

  if (cached) return cached;
  const fresh = await fetchPromise;
  return fresh ?? Response.error();
}
