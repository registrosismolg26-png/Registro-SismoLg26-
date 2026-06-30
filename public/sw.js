// Update this string on every production deploy to bust the cache on all clients.
const BUILD_TS = "20260630-1";
const CACHE_NAME = `registro-sismo-v${BUILD_TS}`;

const PRECACHE = [
  "/",
  "/manifest.json",
  "/favicon.ico",
];

// Install: pre-cache shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Activate: delete every cache that isn't the current version
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//   - /api/*            → network-only (never cache API responses)
//   - /_next/static/*   → cache-first (immutable hashed chunks)
//   - everything else   → stale-while-revalidate
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-HTTP and API routes
  if (
    !event.request.url.startsWith("http") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("webpack-hmr") ||
    url.pathname.includes("_next/webpack")
  ) {
    return;
  }

  // Cache-first for immutable hashed Next.js static assets
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((res) => {
            if (res.status === 200) {
              caches.open(CACHE_NAME).then((c) => c.put(event.request, res.clone()));
            }
            return res;
          })
      )
    );
    return;
  }

  // Stale-while-revalidate for everything else
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((res) => {
          if (res.status === 200 && event.request.method === "GET") {
            caches.open(CACHE_NAME).then((c) => c.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(() => cached); // serve stale on network error

      return cached || networkFetch;
    })
  );
});
