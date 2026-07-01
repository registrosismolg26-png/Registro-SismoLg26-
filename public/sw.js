// Update this string on every production deploy to bust the cache on all clients.
const BUILD_TS = "20260701-3";
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

// Web Push Events
self.addEventListener("push", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      let data = {};
      try {
        data = event.data ? event.data.json() : {};
      } catch (e) {
        data = { title: "Nuevo Afectado Registrado", body: event.data ? event.data.text() : "" };
      }

      // Check if the app is open and visible
      const isAppOpen = clientList.some((client) => client.visibilityState === "visible");
      if (isAppOpen) {
        // App is open and active; send a postMessage to open clients to display an internal notification
        clientList.forEach((client) => {
          if (client.visibilityState === "visible") {
            const registroId = data.url ? new URL(data.url, self.location.origin).searchParams.get("registroId") : null;
            const name = data.body ? data.body.split(" (")[0] : "un nuevo afectado";
            client.postMessage({
              type: "NEW_REGISTRO_NOTIFICATION",
              registroId,
              nombreApellido: name
            });
          }
        });
        return;
      }

      const title = data.title || "Nuevo Afectado";
      const options = {
        body: data.body || "Se ha registrado un afectado en el censo.",
        icon: "/logo_gob.webp",
        badge: "/favicon.ico",
        vibrate: [200, 100, 200],
        data: {
          url: data.url || "/"
        }
      };

      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and redirect
      for (const client of clientList) {
        const clientPath = new URL(client.url).pathname;
        const targetPath = new URL(urlToOpen, self.location.origin).pathname;
        if (clientPath === targetPath && "focus" in client) {
          client.postMessage({ type: "NAVIGATE_TO_REGISTRO", url: urlToOpen });
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
