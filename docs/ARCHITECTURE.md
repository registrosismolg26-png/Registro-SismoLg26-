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
- `src/tabs/` — una pestaña por archivo: `CensoTab` (wizard 4 pasos; controles 100% no-nativos —`StyledSelect`/`DatePicker`/`SearchableSelect`—; **validación con gating por `touched`**: un error solo se muestra tras tocar el campo o pulsar "Continuar"/"Enviar", así llegar a un paso no lo marca en rojo; radios validados por paso; **duplicado de cédula en vivo** al escribir vía `useMemo` sobre `registros`+locales, encadenado con el lookup del padrón y la precarga del jefe sin pisarse), `DashboardTab` (stats + reporte WhatsApp), `AsignacionesTab` (tabla + filtros + detail/edición + modal de asignar habitación; la **tabla de registrados es responsive**: a ≥1024px se muestra como tabla completa y por debajo se transforma en **tarjetas apiladas** —cada fila una tarjeta, cada celda un `data-label` que rotula el valor— para que nunca aparezca un scroll horizontal interno; la lista fluye con la página), `UsuariosTab` (CRUD operadores), `ConfigTab` (perfil, padrón, cola sync, cuartos, refugios), `MorbilidadTab` (registro clínico de consultas médicas offline-first).
- `src/components/` — `AppHeader` (header+nav), `LoginForm` (por props, fuera del Provider), `ToastIcon`, `CustomSelect`. **Controles con reformat** (sistema visual moderno "todo pill", altura única sincronizada): `SearchableSelect` (combobox buscable estilo "agregar"), `SearchableSingleSelect` (selector ÚNICO buscable: muestra el elegido dentro del control, no como píldora — se usa para el **cuarto**), `StyledSelect` (select sin buscador), `DatePicker` (calendario único). **Adaptación integral a táctil:** en escritorio el desplegable se renderiza en un PORTAL anclado (`useAnchoredRect` → `fixed` desde el rect, con volteo y `visualViewport`, sin que lo recorte ningún `overflow`); en **teléfono/tablet** (`useIsMobile`, `max-width: 820px`) se abre como **MODAL nativo-like** (`MobileSheet`: hoja inferior con overlay, grip, título, cierre, scroll-lock y Esc; los buscables usan variante a pantalla con el campo de búsqueda pegado arriba). Aceptan prop `error`. **Regla:** en formularios nuevos usa estos, no `<select>`/`<input type=date>` nativos. **Sistema pill:** las clases `.censo-form` (registro) y `.pill-form` (reutilizable, p. ej. filtros y modal de edición de Registrados) comparten los tokens de altura/radio y estilan inputs/selects/botones/textarea como **pill** de altura única (`--ctl-h`); envuelve una sección con `.pill-form` para heredar todo el reformat. Búsquedas insensibles a acentos con `normalizeText`.
- `src/lib/` — `auth.ts` (guardas backend), `permissions.ts` (espejo cliente), `apiFetch.ts`, `db.ts` (IndexedDB + cola), `constants.ts`, `formReducer.ts`, `helpers.ts`, `prisma.ts`, `push.ts`.
- `src/types/index.ts` — tipos compartidos. `src/app/api/**/route.ts` — route handlers. `prisma/schema.prisma` — modelos.

## Patrón: estado y AppContext (híbrido)

El estado GLOBAL (`currentUser`, `isOnline`, `theme`, `registros`, `localRecords`, `customCuartos`, `stats`, `coords`, cola de sync…) y TODAS las funciones globales (`triggerSync`, `showToast`, `fetchRegistros`, `downloadFullPadron`…) viven en `page.tsx` (`Home`) con sus closures intactas, y se distribuyen por `AppContext`. Cada tab tiene su estado LOCAL en su propio componente. Cero prop-drilling.

**Excepción:** `LoginForm` se renderiza ANTES del Provider (return temprano cuando `!currentUser`) → recibe **props**, no context.

## Patrón: autorización (CRÍTICO)

**Regla de oro: el backend NUNCA confía en el rol/refugio que envía el cliente.**

- **Cliente:** `apiFetch` (`src/lib/apiFetch.ts`) añade el header `x-user-id` (del `localStorage`) + timeout con `AbortController`. **Úsalo SIEMPRE para llamar a `/api/`** — nunca `fetch` directo (excepto `/api/auth/login`, que es pre-sesión).
- **Servidor:** `getAuthUser(req)` (`src/lib/auth.ts`) lee `x-user-id` → busca el usuario REAL en la BD → deriva rol y refugio. Todas las guardas parten de ahí. Helpers: `isMaster`, `canRegister`, `canDeleteRegistro`, `canManageUsers`, `canManageRooms`, `canManagePadron`, `canManageTargetUser`, `canActOnRefugio`, `refugioScope`, `hasRefugio`. Cache de sesión en memoria (TTL 30s) + `invalidateSession` al editar/borrar.
- `src/lib/permissions.ts` es el **espejo cliente** (mismas reglas por `role` string) — SOLO para UX (mostrar/ocultar botones). El backend es la verdad.

## Roles y refugios

- **Refugio = campamento.** `User.campamentoTransitorio` = refugio del operador; `Registro.refugio` = refugio del registro; tabla `Refugio` = lista canónica (CRUD solo Master); `CustomRoom.refugio` = cuartos por refugio.
- **MASTER:** todo, todos los refugios. Se gestionan **por SQL** (nadie los crea/edita/borra desde la app; MASTER no es rol asignable en la UI).
- **ADMIN:** administra SU refugio (usuarios Reg/Vis de su refugio, registros, cuartos, stats de su refugio). No toca otros Admin ni Master. **Solo Master asigna Admin.**
- **REGISTRADOR:** censa + edita registros de su refugio; usa el padrón para autocompletar.
- **VISUALIZADOR:** solo ve y exporta su refugio.
- **Roles MÉDICOS** (`isMedico` = AdminMedico | OperadorMedico | AsistenteMedico): **solo ven la pestaña Morbilidad** (no censo, dashboard, Registrados ni Configuración general). Gating en `AppHeader` + `page.tsx` (render) + efecto que redirige a Morbilidad si caen en otra pestaña.
  - **AdminMedico:** además ve **Usuarios** pero FILTRADO a solo médicos (Operador/Asistente) de su refugio; crea/edita SOLO OperadorMedico y AsistenteMedico (crear AdminMedico es exclusivo de Master). Elimina catálogos.
  - **OperadorMedico:** crea/edita consultas (no elimina) y **crea/edita catálogos** (patologías/medicamentos, sin eliminar).
  - **AsistenteMedico:** solo crea/edita consultas; NO toca catálogos ni elimina nada.
- **Catálogos médicos** (patologías/medicamentos): la gestión se hace desde **Morbilidad** (componente `src/components/CatalogosMedicos.tsx`: 2 botones + modales, full pill). Permisos: `canEditCatalogosMedicos` (Master/AdminMedico/OperadorMedico → crear + editar-renombrar vía PUT conservando el ID) y `canManageCatalogosMedicos` (Master/AdminMedico → eliminar). Espejados en `permissions.ts` (cliente) y `auth.ts` (backend, fuente de verdad). Ya **no** están en Configuración.
- **Gestión de usuarios:** `canManageUsers` = Master/Admin/AdminMedico. `assignableRoles(actor)` y `canManageTargetUser(actor, target)` (en `auth.ts` + espejo en `permissions.ts`) definen quién asigna/gestiona qué rol; el selector de rol de `UsuariosTab` se puebla desde `assignableRoles` (no roles hardcodeados). El listado GET se filtra por actor (`usersListWhere`).
- **Consultas médicas:** son **inmutables** por diseño (POST idempotente: reenviar una consulta ya creada no la modifica). "Editar" en Morbilidad aplica a los **antecedentes** del paciente (que se propagan al censo), no a consultas ya guardadas.
- **Scoping:** `refugioScope(user)` → Master `{}` (todo), resto `{ refugio }`. Aplicado en registros, stats, cuartos, usuarios.

## Patrón: offline (señal casi nula)

- `src/lib/db.ts`: IndexedDB. Cola `LocalRegistro` (`status` pending/synced/error, `type` new/update, `attempts`, `nextAttemptAt`, `refugio`, `userId`).
- Al censar/editar/asignar: `saveLocal` (encola) → sincroniza cuando hay señal. Se **sella `refugio`+`userId`** en el registro offline.
- `triggerSync` (page.tsx): cada 15s + evento `online` + mount. Lotes de 2. **Prioriza censos NUEVOS** sobre ediciones. `401/403/400` → `markPermanentError` (no reintenta, avisa); red/`5xx` → `incrementAttempt` con **backoff exponencial** (15s→5min); `getPending` respeta el backoff. `apiFetch` con timeout.
- **Padrón electoral:** se descarga a IndexedDB (streaming NDJSON) para lookup offline de cédulas. **Reanuda** en cada arranque comparando el conteo local vs `/api/padron/count`. Lo descarga cualquiera que cense (`canRegister`); subir el CNE es solo Master/Admin.
- **Cache local** (registros/stats en `localStorage`) sellado por dueño (`cached_owner`) → no filtra datos entre refugios en dispositivo compartido; se limpia en logout.

## Modelo de datos (`prisma/schema.prisma`)

- **Registro:** datos del afectado + `refugio` + `cuarto` + `retirado` + `intermitente` + `cedulaJefeFamilia`. **Salud por-ID:** `patologiaIds` (Json, ids de `Patologia`) + `medicamentoIds` (Json, `[{id,dosis,periodo}]` que referencian `MedicamentoPredefinido`). Las columnas viejas `patologiaDescripcion` (texto) y `medicamentos` (`[{nombre,…}]`) quedan **congeladas** como respaldo (se dropean tras validar el backfill).
- **User:** `email`, `nombre`, `password` (scrypt), `role` ("MASTER" | "ADMIN" | "REGISTRADOR" | "VISUALIZADOR" | "AdminMedico" | "OperadorMedico" | "AsistenteMedico"), `campamentoTransitorio` (= refugio).
- **Refugio:** `id`, `nombre` @unique, `ubicacion` (URL de Maps, opcional; editable en Config y usada en el reporte de WhatsApp del refugio activo). **CustomRoom:** `name`, `refugio`, `capacidad` (camas, `Int @default(18)`), `@@unique([name, refugio])`.
- **Padron:** cédulas del CNE (lookup offline). **PushSubscription:** web push (admin).
- **Patologia:** catálogo canónico de patologías (`id`, `nombre` @unique). Se referencia por **id** desde censo/consultas.
- **ConsultaMedica:** consulta de morbilidad (datos básicos + `registroId` = **UID** del censo vinculado + antecedentes/diagnóstico **por-ID** en columnas JSON `*PatologiaIds`/`*MedicamentoIds` + notas). Las columnas de texto viejas quedan congeladas como respaldo.
- **MedicamentoPredefinido:** catálogo de medicamentos. Único por **`(nombre, concentracion, presentacion)`** (un principio activo se repite con distinta presentación); `dosis`/`periodo` son sugerencias opcionales.

## Rutas API (`src/app/api`)

`auth/login` (pre-sesión), `auth/users` (GET/POST/PUT/DELETE con guardas por rol+refugio), `registros` (GET scoped), `registros/[id]` (PATCH/DELETE), `register` (crea/actualiza censo, fuerza el refugio del operador; **guard de cédula duplicada**: al CREAR rechaza con `409 DUPLICATED` si ya existe un registro ACTIVO —no retirado— con esa cédula, además del índice `@unique` como backstop; el sync trata 409 como "duplicado"), `stats` (scoped), `cuartos` (GET/POST/PATCH/DELETE scoped por refugio; PATCH edita la `capacidad` de camas; GET ordena por `createdAt asc` + desempate estable por `id` → los primeros creados arriba y sin reordenarse al hacer UPDATE), `refugios` (CRUD Master, renombra en cascada), `padron/download|count|upload-cne`, `public-search` (pública; busca en `cedula` **y** `cedulaJefeFamilia`), `external-search` (pública; fuentes externas, ver abajo), `lookup`, `push/subscribe`. `public-search`, `external-search` y la página `/buscar` son públicas.
- `patologias` (GET devuelve `{id,nombre}[]`; POST/DELETE gestionan el catálogo con guarda `canManageCatalogosMedicos`). **Sin auto-seed.**
- `medicamentos` (GET catálogo con `id`; POST/DELETE con guarda `canManageCatalogosMedicos`). **Sin auto-seed.**
- `consultas` (GET scoped; POST con guarda `canManageMorbilidad`; guarda antecedentes/diagnóstico **por-ID** + `registroId`).

## Esquemas de trabajo (cómo trabajar aquí)

- **Antes de cada commit:** `npx tsc --noEmit` limpio. `tsc` valida tipos, NO comportamiento — para runtime, correr la app.
- **Nada de hardcode:** no incrustes valores fijos (refugios, nombres, capacidades, listas, credenciales, lo que deba venir de BD/config/estado/`.env`). Si encuentras hardcode existente, **adviértelo y propón solución** en vez de dejarlo pasar. Ej. resueltos: el refugio "Complejo Educativo…" salió del censo, login, reporte de WhatsApp, búsqueda y de los `@default` del schema; el auto-seed de salones se eliminó.
- **PROHIBIDO auto-seed de catálogos:** nunca detectes una tabla vacía y la llenes por código (`if (count === 0) createMany(...)`). Los catálogos (`Patologia`, `MedicamentoPredefinido`) se cargan por **SQL manual idempotente** entregado al dueño, o desde Config (AdminMedico). Los seeds viven en `prisma/seed_patologias_cie.sql` y `prisma/seed_medicamentos.sql`; el backfill de datos legados nombre→id en `prisma/migrate_ids_backfill.sql` (match exacto; no coincidentes → `prisma/report_unmatched.sql`).
- **Catálogos médicos por-ID (patrón):** censo/consulta/edición **solo eligen del catálogo** (nada de texto libre). Se guarda el **id** (`patologiaIds`, `medicamentoIds` con `{id,dosis,periodo}`); para mostrar/exportar se interpola el nombre con `patologiaNombre`/`patologiaNombres`/`medLabel`/`medItemsText` (`src/lib/helpers.ts`). La consulta se vincula al censo por **UID** (`ConsultaMedica.registroId`). Al cambiar el shape se **subió la versión** de los caches (`sismo_cached_patologias_v2`, `cached_consultas_v2`). **Despliegue:** vaciar la cola offline pendiente antes del corte (registros encolados con el shape viejo no traen ids).
- **Next 16:** `params`/`headers()` async; leer `node_modules/next/dist/docs/` antes de rutas/páginas.
- **Commits por fase**, descriptivos. Se trabaja en `main` (preferencia del dueño), con cuidado y verificación por fase.
- **Antes de cada `push`:** `git pull --rebase origin main` para integrar el trabajo de otros devs y no sobrescribir ni omitir sus cambios; resolver conflictos antes de pushear.
- **Mantén esta guía viva:** consúltala al **iniciar** cualquier tarea (partir del estado real), y **actualízala al terminar un cambio importante** (nuevo patrón, ruta, dependencia, convención o decisión de arquitectura). La usan Claude y Gemini Antigravity — si aplica, actualiza también el skill de Claude (`.claude/skills/registro-sismo/SKILL.md`). No la dejes desactualizada.
- **Migraciones de BD (manual + idempotente):** todo cambio de `prisma/schema.prisma` → actualizar el schema + `npx prisma generate`, y **entregar al dueño el SQL de migración** para ejecutarlo **manualmente en Supabase**. NO se corre `prisma migrate`/`db push` automático contra producción. El SQL debe ser **idempotente** (re-ejecutable sin romper si ya se aplicó): `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`, `UPDATE ... WHERE`.
- **Auditoría (Registro y User):** un trigger de BD (`prisma/audit_setup.sql`) registra cada CREATE/UPDATE/DELETE en la tabla `AuditLog` (CREATE/DELETE = fila completa **sin** `password`; UPDATE = solo el diff, ignora `syncedAt`). Toda escritura de `Registro`/`User` en la API va **envuelta en `withAuditUser(auth.email, tx => tx.…)`** (`src/lib/audit.ts`) — setea `app.user_email` local a la transacción para que el trigger registre el correo del operador; sin eso cae al rol de BD (`db_role`). El SQL se ejecuta **manual en Supabase**.
- **Preview / service worker:** `public/sw.js` cachea agresivo; se registra **solo en producción** (`layout.tsx`). Su `BUILD_TS` se **autogenera** con el commit SHA en cada build (`scripts/update-sw-version.mjs`, vía el script `prebuild` de `package.json`), así cada deploy invalida el cache de los clientes sin editarlo a mano. El navegador headless del preview puede servir chunks viejos → si el cambio no se refleja, borrar `.next` y reiniciar.
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
- **Salones/capacidad:** los `CustomRoom` se distribuyen al cliente como `customCuartos` (string[] de nombres, para no romper `allCuartos`) **+** `roomCapacities` (mapa nombre→camas, default 18), ambos en `page.tsx` y por el context. El cache local se **sella por refugio** (`cuartos_owner`) y el fetch pide `?refugio` del usuario para que Master no vea los salones de todos los refugios. La capacidad se lee en el select de asignación y en la distribución por habitación (color proporcional vía `roomFillLevel` en `helpers.ts`, no un 18 fijo). El nombre canónico es `"<CONTENEDOR> SALON <n>"`: el contenedor es `EDIFICIO n`/`PISO n` (se elige el tipo Edificio/Piso/Otro al crear en Config) o texto libre; Config agrupa los salones por contenedor. El censo (paso 4) tiene un select de habitación **opcional** con el mismo semáforo. **Refugio de vista (Master):** Master cambia el refugio activo desde el **selector del header** (`viewRefugio` en `page.tsx` → `effectiveRefugio`, con `effectiveRefugioRef` para evitar stale closures); afecta TODO — dashboard, registrados, salones y censo. El resto de usuarios ve siempre su refugio. Las lecturas mandan `?refugio=effectiveRefugio`; el backend usa `refugioScopeFor(auth, requested)` (`/api/registros` y `/api/stats` lo aceptan para Master, retrocompatible: sin el parámetro Master ve todos). Config y el censo consumen `effectiveRefugio` del context; los usuarios (`/api/auth/users`) NO se filtran por la vista (Master los gestiona globalmente).
- **Refugio obligatorio:** un usuario sin refugio (`campamentoTransitorio` vacío/nulo) NO puede censar (`/api/register` → 403) NI puede crearse/editarse como usuario (`/api/auth/users` POST/PUT → 400). Guarda `hasRefugio` en `auth.ts` (backend, fuente de verdad) + espejo en `permissions.ts` (UX: banner en el censo y validación en el form de usuarios). Master registra en su propio refugio si no especifica otro (ya no cae a un default hardcodeado).
