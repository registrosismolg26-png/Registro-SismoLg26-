// Update this string on every production deploy to bust the cache on all clients.
const BUILD_TS = "20260701-5";
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

// ── Web Push Events ───────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  // Intentar parsear el payload. Si falla o viene vacío, usar valores de fallback
  // para que la notificación NUNCA aparezca vacía.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: "Nuevo Afectado Registrado",
      body: event.data ? event.data.text() : "Se ha registrado un afectado en el censo.",
      url: "/"
    };
  }

  const title    = data.title || "Nuevo Afectado Registrado";
  const body     = data.body  || "Se ha registrado un afectado en el censo.";
  const notifUrl = data.url   || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Si la app está abierta y visible, enviar mensaje interno (toast) en lugar
      // de mostrar la notificación del sistema operativo.
      const visibleClient = clientList.find((c) => c.visibilityState === "visible");
      if (visibleClient) {
        const registroId = notifUrl
          ? new URL(notifUrl, self.location.origin).searchParams.get("registroId")
          : null;
        const nombreApellido = body.split(" (")[0];
        visibleClient.postMessage({
          type: "NEW_REGISTRO_NOTIFICATION",
          registroId,
          nombreApellido,
          url: notifUrl
        });
        return;
      }

      // App cerrada o en segundo plano → mostrar notificación nativa del SO
      const options = {
        body,
        icon: "/logo_gob_push.png",
        badge: "/favicon.ico",
        vibrate: [200, 100, 200],
        tag: "nuevo-registro",  // Reemplaza notificaciones anteriores del mismo tipo
        renotify: true,
        data: { url: notifUrl }
      };

      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Construir la URL completa a la que debe navegar (ej: https://app.com/?registroId=abc)
  const urlToOpen = (event.notification.data && event.notification.data.url)
    ? new URL(event.notification.data.url, self.location.origin).href
    : self.location.origin + "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana de la app abierta, navegar en ella y enfocar
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          // client.navigate() cambia la URL de la pestaña existente
          if ("navigate" in client) {
            client.navigate(urlToOpen);
          }
          return client.focus();
        }
      }
      // No hay ventana abierta → abrir una nueva directamente en la URL del registro
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
