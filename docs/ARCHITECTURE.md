# Registro-SismoLg26 — Guía para agentes

Guía de arquitectura, patrones y convenciones para trabajar en este repo sin explorarlo entero. Pensada para agentes de IA (Claude Code, Gemini Antigravity) y humanos nuevos. **Léela antes de escribir o modificar código.**

## Qué es

PWA **offline-first** de censo de afectados por sismo, para la **Gobernación del Estado La Guaira**. Operadores registran personas en **refugios**, con o sin señal (zona de desastre). Multi-refugio con permisos por rol.

## Stack

- **Next.js 16.2.9** App Router (`"use client"` en el árbol principal). ⚠️ Esta versión tiene breaking changes respecto a lo que "sabes": `params` es async (`await ctx.params`), `headers()` es async, route handlers no se cachean por defecto. **Lee `node_modules/next/dist/docs/` antes de escribir rutas o páginas.**
- **React 19**, **Prisma v7.8** + adaptador `pg` + **Supabase/PostgreSQL**.
- **IndexedDB** para offline (`src/lib/db.ts`).
- **Deploy: Vercel (serverless)** — el estado en memoria del servidor es efímero por-instancia (importa para el cache de sesión de auth).
- **CSS:** `src/app/globals.css` con variables (`--color-*`, `--element-height`) + clases semánticas (`.btn-submit`, `.user-role-badge`, `.dashboard-section`). Es el **sistema base**. Además hay **Tailwind v4 sin Preflight** para migración progresiva — ver sección "Tailwind" abajo.

## Estructura

- `src/app/page.tsx` — **ORQUESTADOR** (`Home`): todo el estado GLOBAL, los effects globales, monta `<AppContext.Provider>` y compone header + tabs + modales globales. ~800 líneas.
- `src/context/AppContext.tsx` — context híbrido (`AppContextValue`, `useAppContext()`).
- `src/tabs/` — una pestaña por archivo: `CensoTab` (wizard 4 pasos), `DashboardTab` (stats + reporte WhatsApp), `AsignacionesTab` (tabla + filtros + detail modal), `UsuariosTab` (CRUD operadores), `ConfigTab` (perfil, padrón, cola sync, cuartos, refugios).
- `src/components/` — `AppHeader` (header+nav), `LoginForm` (por props, fuera del Provider), `ToastIcon`, `CustomSelect`.
- `src/lib/` — `auth.ts` (guardas backend), `permissions.ts` (espejo cliente), `apiFetch.ts`, `db.ts` (IndexedDB + cola), `constants.ts`, `formReducer.ts`, `helpers.ts`, `prisma.ts`, `push.ts`.
- `src/types/index.ts` — tipos compartidos. `src/app/api/**/route.ts` — route handlers. `prisma/schema.prisma` — modelos.

## Patrón: estado y AppContext (híbrido)

El estado GLOBAL (`currentUser`, `isOnline`, `theme`, `registros`, `localRecords`, `customCuartos`, `stats`, `coords`, cola de sync…) y TODAS las funciones globales (`triggerSync`, `showToast`, `fetchRegistros`, `downloadFullPadron`…) viven en `page.tsx` (`Home`) con sus closures intactas, y se distribuyen por `AppContext`. Cada tab tiene su estado LOCAL en su propio componente. Cero prop-drilling.

**Excepción:** `LoginForm` se renderiza ANTES del Provider (return temprano cuando `!currentUser`) → recibe **props**, no context.

## Patrón: autorización (CRÍTICO)

**Regla de oro: el backend NUNCA confía en el rol/refugio que envía el cliente.**

- **Cliente:** `apiFetch` (`src/lib/apiFetch.ts`) añade el header `x-user-id` (del `localStorage`) + timeout con `AbortController`. **Úsalo SIEMPRE para llamar a `/api/`** — nunca `fetch` directo (excepto `/api/auth/login`, que es pre-sesión).
- **Servidor:** `getAuthUser(req)` (`src/lib/auth.ts`) lee `x-user-id` → busca el usuario REAL en la BD → deriva rol y refugio. Todas las guardas parten de ahí. Helpers: `isMaster`, `canRegister`, `canDeleteRegistro`, `canManageUsers`, `canManageRooms`, `canManagePadron`, `canManageTargetUser`, `canActOnRefugio`, `refugioScope`. Cache de sesión en memoria (TTL 30s) + `invalidateSession` al editar/borrar.
- `src/lib/permissions.ts` es el **espejo cliente** (mismas reglas por `role` string) — SOLO para UX (mostrar/ocultar botones). El backend es la verdad.

## Roles y refugios

- **Refugio = campamento.** `User.campamentoTransitorio` = refugio del operador; `Registro.refugio` = refugio del registro; tabla `Refugio` = lista canónica (CRUD solo Master); `CustomRoom.refugio` = cuartos por refugio.
- **MASTER:** todo, todos los refugios. Se gestionan **por SQL** (nadie los crea/edita/borra desde la app; MASTER no es rol asignable en la UI).
- **ADMIN:** administra SU refugio (usuarios Reg/Vis de su refugio, registros, cuartos, stats de su refugio). No toca otros Admin ni Master. **Solo Master asigna Admin.**
- **REGISTRADOR:** censa + edita registros de su refugio; usa el padrón para autocompletar.
- **VISUALIZADOR:** solo ve y exporta su refugio.
- **Scoping:** `refugioScope(user)` → Master `{}` (todo), resto `{ refugio }`. Aplicado en registros, stats, cuartos, usuarios.

## Patrón: offline (señal casi nula)

- `src/lib/db.ts`: IndexedDB. Cola `LocalRegistro` (`status` pending/synced/error, `type` new/update, `attempts`, `nextAttemptAt`, `refugio`, `userId`).
- Al censar/editar/asignar: `saveLocal` (encola) → sincroniza cuando hay señal. Se **sella `refugio`+`userId`** en el registro offline.
- `triggerSync` (page.tsx): cada 15s + evento `online` + mount. Lotes de 2. **Prioriza censos NUEVOS** sobre ediciones. `401/403/400` → `markPermanentError` (no reintenta, avisa); red/`5xx` → `incrementAttempt` con **backoff exponencial** (15s→5min); `getPending` respeta el backoff. `apiFetch` con timeout.
- **Padrón electoral:** se descarga a IndexedDB (streaming NDJSON) para lookup offline de cédulas. **Reanuda** en cada arranque comparando el conteo local vs `/api/padron/count`. Lo descarga cualquiera que cense (`canRegister`); subir el CNE es solo Master/Admin.
- **Cache local** (registros/stats en `localStorage`) sellado por dueño (`cached_owner`) → no filtra datos entre refugios en dispositivo compartido; se limpia en logout.

## Modelo de datos (`prisma/schema.prisma`)

- **Registro:** datos del afectado + `refugio` + `cuarto` + `medicamentos` (Json) + `retirado` + `intermitente` + `cedulaJefeFamilia`.
- **User:** `email`, `nombre`, `password` (scrypt), `role`, `campamentoTransitorio` (= refugio).
- **Refugio:** `id`, `nombre` @unique. **CustomRoom:** `name`, `refugio`, `@@unique([name, refugio])`.
- **Padron:** cédulas del CNE (lookup offline). **PushSubscription:** web push (admin).

## Rutas API (`src/app/api`)

`auth/login` (pre-sesión), `auth/users` (GET/POST/PUT/DELETE con guardas por rol+refugio), `registros` (GET scoped), `registros/[id]` (PATCH/DELETE), `register` (crea/actualiza censo, fuerza el refugio del operador), `stats` (scoped), `cuartos` (scoped), `refugios` (CRUD Master, renombra en cascada), `padron/download|count|upload-cne`, `public-search` (pública; busca en `cedula` **y** `cedulaJefeFamilia`), `lookup`, `push/subscribe`. `public-search` y la página `/buscar` son públicas.

## Esquemas de trabajo (cómo trabajar aquí)

- **Antes de cada commit:** `npx tsc --noEmit` limpio. `tsc` valida tipos, NO comportamiento — para runtime, correr la app.
- **Next 16:** `params`/`headers()` async; leer `node_modules/next/dist/docs/` antes de rutas/páginas.
- **Commits por fase**, descriptivos. Se trabaja en `main` (preferencia del dueño), con cuidado y verificación por fase.
- **Antes de cada `push`:** `git pull --rebase origin main` para integrar el trabajo de otros devs y no sobrescribir ni omitir sus cambios; resolver conflictos antes de pushear.
- **Mantén esta guía viva:** consúltala al **iniciar** cualquier tarea (partir del estado real), y **actualízala al terminar un cambio importante** (nuevo patrón, ruta, dependencia, convención o decisión de arquitectura). La usan Claude y Gemini Antigravity — si aplica, actualiza también el skill de Claude (`.claude/skills/registro-sismo/SKILL.md`). No la dejes desactualizada.
- **Preview / service worker:** `public/sw.js` cachea agresivo; se registra **solo en producción** (`layout.tsx`). El navegador headless del preview puede servir chunks viejos → si el cambio no se refleja, borrar `.next` y reiniciar.
- **Vercel serverless:** no confiar en estado en memoria entre requests; el cache de sesión de auth es por-instancia (ver [[project-deployment-vercel]] en la memoria).

## Tailwind (migración progresiva)

**Tailwind v4** está instalado **sin Preflight** (decisión del equipo). ⚠️ v4 requiere navegadores ~2023+ (Safari 16.4, Chrome 111, Firefox 128) porque usa `@property`/`color-mix()`/cascade layers; si aparecen dispositivos muy viejos que no rendericen bien, evaluar volver a v3. Con Preflight omitido, Tailwind **no resetea nada** — convive con `globals.css` sin alterar el diseño; las utilidades solo se generan al usarlas.

- **El sistema base sigue siendo el CSS con variables** (`globals.css`). Tailwind es para código **nuevo** o para migrar componentes **de a poco**. NO hacer una migración masiva de golpe.
- **Colores mapeados** (bloque `@theme inline` en `globals.css`): `bg-primary`, `text-danger`, `border-success`, `bg-gold`, etc. resuelven a las variables del sistema y respetan claro/oscuro. Úsalos en vez de valores hardcodeados.
- **Config (estilo v4, en CSS — no hay `tailwind.config.js`):** al inicio de `src/app/globals.css` se importan **solo** las capas `theme` y `utilities` (se **omite `preflight.css`** para no resetear) y sigue el bloque `@theme inline`. El plugin es `@tailwindcss/postcss` en `postcss.config.mjs`.
- **Al migrar un componente:** reemplaza sus clases custom por utilidades Tailwind y borra del `globals.css` el CSS que quedó sin uso (evita duplicación). `npx tsc --noEmit` no valida CSS — comprueba el resultado con `next build` y visualmente.

## Gotchas / lecciones aprendidas

- `FormData` choca con el tipo global del DOM → importar de `@/types`.
- `saveLocal` debe preservar TODOS los campos (`type`, `refugio`, `userId`) o se pierden.
- Badges/gating nuevos: **incluir MASTER** (varios ternarios asumían solo 3 roles).
- El padrón NO debe restringirse a Master/Admin en `download` (el Registrador lo necesita para lookup).
