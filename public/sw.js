// AUTOGENERADO: `scripts/update-sw-version.mjs` (script `prebuild`) reemplaza este
// valor con el commit SHA en cada build, para invalidar el cache de todos los
// clientes en cada deploy. NO editar a mano; el valor de abajo es solo placeholder.
const BUILD_TS = "dev-mstkck0k";
const CACHE_NAME = `registro-sismo-v${BUILD_TS}`;

const PRECACHE = [
  "/",
  "/manifest.json",
  "/favicon.ico",
];

// Install: pre-cache shell assets. NO se llama skipWaiting: el worker nuevo queda
// EN ESPERA hasta que el usuario acepte el banner de actualización (postMessage
// SKIP_WAITING desde el cliente). Así NUNCA se actualiza/recarga solo; el usuario
// decide cuándo (o sigue trabajando). El controllerchange → reload del cliente solo
// dispara tras aceptar el banner.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Cachear cada recurso POR SEPARADO con allSettled: si UNO falla (p. ej. un 404),
      // la instalación NO se aborta. Antes se usaba cache.addAll(), que rechaza en bloque
      // si cualquier recurso falla; cuando /manifest.json quedó en 404, el install del SW
      // fallaba y el worker nunca llegaba a "installed" → el banner de actualización dejó
      // de aparecer. Con allSettled el SW siempre instala aunque falte algún recurso.
      Promise.allSettled(PRECACHE.map((u) => cache.add(u)))
    )
  );
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

  // Navegaciones (documento HTML): NETWORK-FIRST cuando hay señal. Así el usuario
  // SIEMPRE recibe el HTML más reciente y, con él, los chunks JS/CSS del último
  // deploy — evita quedar "pegado" a una versión vieja del bundle por el cache.
  // Sin conexión cae al HTML cacheado (o al shell "/").
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.status === 200) {
            const toCache = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, toCache));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match("/")))
    );
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
              // Clonar SINCRÓNICAMENTE (antes de devolver res): si se clona dentro
              // del then async de caches.open, el body de res ya se consumió al
              // responder → "Response body is already used".
              const toCache = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(event.request, toCache));
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
            // Clonar SINCRÓNICAMENTE antes de devolver res (evita "body already used").
            const toCache = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, toCache));
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

  const title     = data.title  || "Nuevo Afectado Registrado";
  const body      = data.body   || "Se ha registrado un afectado en el censo.";
  const notifUrl  = data.url    || "/";
  const refugio   = data.refugio || null;
  // tag ÚNICO por registro (lo genera el servidor, prefijado por campamento). Al ser
  // único, las notificaciones se APILAN en lugar de reemplazarse. Fallback: si por lo
  // que sea no llega, usar la URL (lleva el registroId) para no colapsar todas en una.
  const notifTag  = data.tag || `nuevo-registro-${notifUrl}`;
  // Tipo de push: "aviso" (composer) vs registro nuevo (default). Define cómo se
  // muestra cuando la app está ABIERTA (visible).
  const tipo      = data.type || "registro";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Si la app está abierta y visible, enviar mensaje interno (toast) en lugar
      // de mostrar la notificación del sistema operativo.
      const visibleClient = clientList.find((c) => c.visibilityState === "visible");
      if (visibleClient) {
        // App abierta: en vez de la notificación del SO, se avisa al cliente para que
        // muestre la notificación INTERNA (con sonido). Mensaje distinto según el tipo.
        if (tipo === "aviso") {
          visibleClient.postMessage({
            type: "NEW_AVISO_NOTIFICATION",
            titulo: title,
            cuerpo: body,
            url: notifUrl
          });
        } else {
          const registroId = notifUrl
            ? new URL(notifUrl, self.location.origin).searchParams.get("registroId")
            : null;
          const nombreApellido = body.split(" (")[0];
          visibleClient.postMessage({
            type: "NEW_REGISTRO_NOTIFICATION",
            registroId,
            nombreApellido,
            refugio,
            url: notifUrl
          });
        }
        return;
      }

      // App cerrada o en segundo plano → mostrar notificación nativa del SO
      const options = {
        body,
        icon: "/logo_gob_push.png",
        badge: "/badge-mono.png",
        vibrate: [200, 100, 200],
        // tag ÚNICO por registro → las notificaciones se APILAN (no se reemplazan entre sí),
        // agrupadas por campamento. renotify:false porque cada tag es nuevo (no hay reemplazo).
        tag: notifTag,
        renotify: false,
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

// Escuchar mensaje del cliente para omitir espera y activar el nuevo worker (Prueba de actualización)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
