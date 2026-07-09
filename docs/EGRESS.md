# Optimización de egress de Supabase — análisis, plan y bitácora

> Documento vivo. Estudio del consumo de **egress** (datos que SALEN de la base de datos)
> y plan de reducción, con lo ya aplicado y lo pendiente. Pensado para retomarlo en el
> futuro sin rehacer el análisis. Complementa [`ARCHITECTURE.md`](./ARCHITECTURE.md).
>
> **Última actualización:** 2026-07 · **Estado:** P3, P4, P7 (paginación) y P8 (Cache-Control
> catálogos + índices) aplicadas; queda P2/P6.

---

## 0. Resumen ejecutivo (TL;DR)

- **Cómo se cobra el egress aquí:** la app usa Prisma desde Vercel (serverless), **no** el
  cliente directo a Supabase. El egress de Supabase = **los bytes que cada consulta saca de
  Postgres hacia las funciones**. La palanca es **filas × columnas × frecuencia**.
- **Tamaños reales (jul-2026):** `Padron` **237.000** filas (= todo el estado La Guaira; el
  CNE nacional son ~21 M), `Registro` (censo) **1.800**, `ConsultaMedica` **500**.
- **Los dos costos que importan hoy:**
  1. **Modo Presentación/TV** refrescando stats cada 5s trayendo filas → podía ser cientos
     de MB/hora. **→ resuelto por P3.**
  2. **Re-descarga COMPLETA** de `/api/registros` y `/api/consultas` en cada login / cambio
     de tab / cambio de campamento. **→ resuelto por P4** (ETag/304: si nada cambió, la
     re-visita a un tab/campamento baja de ~1,2 MB a **0 bytes de filas**). Queda P2 (columnas
     ligeras) como recorte adicional del primer fetch.
- **El padrón** (237k, ~18-19 MB) es el transfer más grande pero **una vez por dispositivo**
  (reanudable/incremental) y ya regional → no es prioridad.

---

## 1. Dónde se va el egress (ranking, con file:line)

| # | Fuente | Dónde | Por qué es caro |
|---|--------|-------|-----------------|
| 1 | `GET /api/registros` | [`registros/route.ts:15`](../src/app/api/registros/route.ts) | `findMany` **sin `select` ni límite** → TODAS las columnas (incl. JSON `medicamentos`, `patologiaIds`, `medicamentoIds`) de TODAS las filas del campamento. Se re-baja **completo** en login, tab "Registrados", y cambio de campamento. |
| 2 | `GET /api/consultas` | [`consultas/route.ts:14`](../src/app/api/consultas/route.ts) | Igual: todas las columnas (JSON `lesiones`, `antecedentes*`, `diagnostico*`, `notasDoctor`) de todas las consultas. |
| 3 | Descarga del padrón | [`padron/download/route.ts:31`](../src/app/api/padron/download/route.ts) | Descarga la tabla `Padron` entera (NDJSON, lotes de 500) a IndexedDB. ~18-19 MB, pero **una vez/dispositivo**, reanudable. La búsqueda de cédula es local (0 egress). |
| 4 | Stats en modo TV | [`stats.ts`](../src/lib/stats.ts) + [`DashboardTab.tsx:176`](../src/tabs/DashboardTab.tsx) | El grueso de `stats` era SQL agregado (OK), **pero** hacía un `findMany` de todos los activos para núcleos/patologías, y el modo TV lo refrescaba **cada 5s**. |
| 5 | Catálogos / refugios / cuartos | [`refugios/route.ts:13`](../src/app/api/refugios/route.ts), [`cuartos/route.ts:33`](../src/app/api/cuartos/route.ts), patologias, medicamentos | Chicos, pero se re-piden en cada login/tab **sin caché HTTP** (siempre pegan a la BD). `refugios`/`cuartos` traen todas las columnas. |

**Lo que ya estaba bien (no tocar):** el sync cada 15s **retorna temprano si no hay nada
pendiente** ([`page.tsx:809`](../src/app/page.tsx)) → en reposo NO consume; el TTL de 30s en
stats normal ([`page.tsx:1112`](../src/app/page.tsx)); el padrón reanudable/delta
([`page.tsx:591`](../src/app/page.tsx)); `getAuthUser` con caché de sesión de 30s
([`auth.ts:44`](../src/lib/auth.ts)).

---

## 2. Propuestas (estado y detalle)

Leyenda de estado: ✅ aplicada · ⏳ pendiente · ❌ descartada.

### ✅ P3 — Stats 100% en SQL (sin traer filas) + intervalo TV 5s → 30s  *(APLICADA)*

**Commit:** `9b8653f` · **Archivos:** [`src/lib/stats.ts`](../src/lib/stats.ts),
[`src/tabs/DashboardTab.tsx`](../src/tabs/DashboardTab.tsx) · **Migración BD:** ninguna.

**Problema:** `computeAggregateStats` ya usaba SQL agregado para casi todo, pero traía un
`findMany` de **todas** las filas activas del refugio (`select` de 4 columnas) para calcular
en JS: (a) núcleos familiares / individuos solos, y (b) el top-8 de patologías. Ese `findMany`
crecía con el censo, y el modo Presentación lo forzaba cada 5s.

**Qué se hizo (cómo):**

1. **Núcleos familiares e individuos solos → SQL** (`GROUP BY` por jefe de familia):
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE cnt >= 2)::int AS nucleos,
     COUNT(*) FILTER (WHERE cnt =  1)::int AS individuos
   FROM (
     SELECT
       CASE WHEN "jefeFamilia" = 'SI' THEN cedula
            ELSE COALESCE(NULLIF("cedulaJefeFamilia", ''), cedula) END AS family_id,
       COUNT(*) AS cnt
     FROM "Registro"
     WHERE retirado = 'NO' [AND refugio = $1]
     GROUP BY 1
   ) g
   ```
   `COALESCE(NULLIF("cedulaJefeFamilia", ''), cedula)` replica **exacto** el
   `r.cedulaJefeFamilia || r.cedula` del JS (trata la cadena vacía como ausente). Un grupo de
   2+ es un núcleo; de 1 es un individuo solo.

2. **Top-8 patologías del censo → SQL** (desanida el JSON `patologiaIds` y cuenta):
   ```sql
   SELECT elem AS pat_id, COUNT(*)::int AS cnt
   FROM "Registro" r
   CROSS JOIN LATERAL jsonb_array_elements_text(
     CASE WHEN jsonb_typeof(r."patologiaIds"::jsonb) = 'array'
          THEN r."patologiaIds"::jsonb ELSE '[]'::jsonb END
   ) AS t(elem)
   WHERE r.retirado = 'NO' [AND r.refugio = $1] AND elem <> ''
   GROUP BY elem
   ORDER BY cnt DESC, elem ASC
   LIMIT 8
   ```
   La guarda `jsonb_typeof = 'array'` replica el `Array.isArray(...) ? ... : []` de JS; y
   `elem <> ''` replica el `typeof id === 'string' && id`. Luego se resuelven los nombres con
   un `findMany` chico a `Patologia` (igual que antes).

3. **Intervalo del modo Presentación (TV): 5s → 30s** ([`DashboardTab.tsx:176`](../src/tabs/DashboardTab.tsx)).

**Resultado:** `/api/stats` pasa de egress **proporcional al censo** (~150 KB/llamada y
subiendo) a **unos KB CONSTANTES**, sin importar cuánto crezca el censo. El modo TV deja de
ser un problema.

**Equivalencia visual:** misma lógica campo por campo → los números en pantalla no cambian.
Única diferencia posible: en un **empate de conteo** en el top-8, el orden entre patologías
con el MISMO número podría variar (mismos números; ahora el orden es determinista por
`cnt DESC, elem ASC`, antes era arbitrario según el orden de escaneo).

**Validación:** se validó por **mapeo lógico campo a campo** (documentado en los comentarios
del código). **No** se pudo correr la comparación viejo-vs-nuevo contra los datos reales
porque el entorno de desarrollo del asistente no alcanza el pooler de Supabase (`:5432`
bloqueado). Cómo validarlo tú mismo: ver §4.

---

### ✅ P4 — Caché HTTP condicional (ETag/304) en las listas  *(APLICADA)*

**Archivos:** [`src/lib/etag.ts`](../src/lib/etag.ts) (helper),
[`registros/route.ts`](../src/app/api/registros/route.ts),
[`consultas/route.ts`](../src/app/api/consultas/route.ts),
[`page.tsx`](../src/app/page.tsx) (cliente) · **Migración BD:**
[`prisma/etag_triggers.sql`](../prisma/etag_triggers.sql) (solo necesaria para consultas).

**Qué se hizo (cómo):**

1. **Sello barato por ámbito** = `(COUNT(*), MAX(fecha_de_modificación))` calculado con un
   `COUNT` + `MAX` (un par de escalares, **no trae filas**):
   - Registro → `MAX("syncedAt")` vía `prisma.registro.aggregate` (la columna ya existía).
   - ConsultaMedica → `MAX("updatedAt")` vía **SQL crudo** (la columna no está en el modelo
     Prisma) envuelto en try/catch: si aún no se corrió la migración, devuelve `null` → la
     ruta responde **200 normal** (sin romperse).
2. **304 en el backend:** cada `GET` compara el sello con el header `If-None-Match`; si coincide
   responde **304 sin cuerpo** (`Cache-Control: no-store`). Si no, devuelve las filas con el
   header `ETag`.
3. **Cliente:** `fetchRegistros`/`fetchConsultas` guardan el último ETag **por ámbito** en un
   `useRef` (en memoria) y lo reenvían en `If-None-Match`; ante un 304 conservan el cache/estado
   ya cargado. El caso frecuente que ataca: **cambiar de pestaña** re-dispara el fetch de la
   lista completa (`page.tsx` tab asignaciones/morbilidad) — con el ETag, si nada cambió, es un
   304 de ~0 bytes.
4. **Correctitud del sello (clave):** `syncedAt`/`updatedAt` se refrescan en **cada** mutación.
   - En código: se agregó `syncedAt: new Date()` a las rutas del censo que no lo hacían
     (traslado en `register`, renombrar refugio en `refugios`, renombrar salón en `cuartos`,
     evolución clínica en `consultas`) → el ETag del censo funciona **sin depender del SQL**.
   - En BD (respaldo sólido y futuro-a-prueba): triggers `BEFORE UPDATE` en
     `prisma/etag_triggers.sql` que bumpean `syncedAt`/`updatedAt` en cualquier ruta, presente
     o futura. Para **consultas** el trigger + la columna `updatedAt` son **obligatorios** para
     que se active la optimización (antes de correrlos, consultas responde 200 normal).

**Impacto:** las re-visitas a un tab/campamento sin cambios pasan de ~1,2 MB a **0 bytes de
filas**. **Offline intacto:** el cache local (localStorage/IndexedDB) sigue igual; un 304 solo
significa "conserva lo que ya tienes". El ETag es **en memoria** (no localStorage) y el servidor
recalcula el sello por ámbito, así que un ETag ajeno nunca produce un 304 incorrecto.

**Pendiente del dueño:** correr [`prisma/etag_triggers.sql`](../prisma/etag_triggers.sql) en
Supabase (idempotente) para activar el 304 de **consultas**. El de **registros** ya funciona.

### ✅ P8 — `Cache-Control` en catálogos + índices por refugio  *(APLICADA)*

**Archivos:** [`patologias`](../src/app/api/patologias/route.ts),
[`medicamentos`](../src/app/api/medicamentos/route.ts),
[`tipos-lesion`](../src/app/api/tipos-lesion/route.ts),
[`refugios`](../src/app/api/refugios/route.ts) (header), [`page.tsx`](../src/app/page.tsx) +
[`CatalogosMedicos.tsx`](../src/components/CatalogosMedicos.tsx) +
[`ConfigTab.tsx`](../src/tabs/ConfigTab.tsx) (refetch forzado),
[`schema.prisma`](../prisma/schema.prisma) + [`prisma/indexes.sql`](../prisma/indexes.sql) (índices).

**Cache-Control en catálogos:** los 4 GET de catálogo son **globales** (misma data para todos,
sin scope por refugio) y no-PII → se marcan `Cache-Control: private, max-age=120`. Las
re-peticiones del **mismo navegador** dentro de 120 s se sirven sin pegar a la BD (reloads,
re-login, remontar UsuariosTab/ConfigTab que re-piden `refugios`, etc.).

- **`private` a propósito (no `s-maxage`/CDN):** un CDN **compartido** cachearía un endpoint
  auth-gated y lo serviría a otros usuarios / sin auth. `private` = solo el navegador del propio
  usuario → cero fuga cross-user y la auth sigue intacta.
- **Correctitud tras editar el catálogo:** como `CatalogosMedicos`/`ConfigTab` **re-hacen el GET**
  tras crear/editar/borrar, ese refetch usa `cache: "reload"` (los fetchers aceptan `force`) para
  saltarse el cache y ver el cambio al instante. Los fetches normales (login/montaje) sí usan el
  cache.
- **Nota:** se descartó el CDN (`s-maxage`) justamente por el auth-gating; el cache de navegador
  da el ahorro sin ese riesgo.

**Índices** `Registro(refugio, createdAt)` y `ConsultaMedica(refugio, createdAt)`: añadidos como
`@@index` en el schema + SQL idempotente [`prisma/indexes.sql`](../prisma/indexes.sql) (nombres
iguales a los de Prisma). Evitan seq-scan al filtrar por refugio + ordenar por `createdAt` (los
`findMany` de las listas y el `COUNT`/`MAX` del ETag).

**Pendiente del dueño:** correr [`prisma/indexes.sql`](../prisma/indexes.sql) en Supabase
(idempotente). El resto (cache) ya funciona en el deploy.

### ⏳ P2 — Columnas ligeras: lista vs. detalle  *(pendiente)*

- **Qué:** poner `select` en `/api/registros` y `/api/consultas` con **solo las columnas de la
  lista** (nombre, cédula, edad, género, estado, cuarto, refugio…), sin los JSON grandes. El
  **detalle completo** (medicamentos, diagnósticos, lesiones) se pide por fila al abrir el
  detalle/editar (`GET /api/registros/[id]`).
- **Impacto:** recorta cada lista ~40-60% (los JSON suelen ser el grueso). Apila con P4.
- **Esfuerzo:** medio · **Riesgo:** bajo.
- **⚠️ Trade-off a decidir:** hoy la lista completa queda offline. Si se adelgaza, ver el
  detalle de una fila que solo existe en el servidor requeriría estar online (o un sync full a
  IndexedDB aparte). Opciones: (a) detalle-al-abrir con señal; (b) seguir guardando full en
  IndexedDB pero adelgazar solo el fetch del servidor. Los **Excel** deben seguir generándose
  con datos completos (traer full solo al exportar, o exportar del lado servidor).

### ⏳ P6 — Menos disparos de fetch en el cliente  *(pendiente)*

- **Qué:** no re-pedir registros/consultas en **cada cambio de tab** si están frescos (TTL
  corto como el de stats, o apoyarse en P4 que las hace 304). Triggers hoy en
  [`page.tsx`](../src/app/page.tsx): login (544/548), tab asignaciones (574), tabs médicos
  (577), cambio de campamento (1186), tras sync de consultas (948).
- **Impacto:** menos llamadas; con P4 las repetidas ya serían 304. · **Esfuerzo:** bajo.

### ✅ P7 — Paginación de listas (10/20/50/100) del lado cliente  *(APLICADA)*

**Archivos:** [`src/components/Pagination.tsx`](../src/components/Pagination.tsx) (nuevo),
`globals.css` (bloque `.pager`), [`AsignacionesTab.tsx`](../src/tabs/AsignacionesTab.tsx)
(Registrados), [`MorbilidadTab.tsx`](../src/tabs/MorbilidadTab.tsx) (Historial).

- **Qué:** las tablas de Registrados e Historial ahora paginan la lista **ya cargada y
  filtrada** (no piden "páginas" al servidor). Selector 10/20/50/100 (todo pill) + navegación
  anterior/siguiente. Al cambiar filtros/búsqueda se vuelve a la página 1.
- **Por qué del lado cliente (no servidor):** mantener búsqueda + filtros + paginación 100%
  **offline** sobre todo el censo. Paginar en el servidor rompería el offline (solo tendrías la
  página vista). El egress lo ataca P4 (304); la paginación es **UX + render** (menos filas en
  el DOM), no una palanca de egress por sí sola.

### ⏳ Habilitadores

- **Columna de "última modificación"** — ✅ **resuelto por P4** pero **sin `@updatedAt` de
  Prisma**: `Registro` ya tenía `syncedAt`; a `ConsultaMedica` se le agregó `updatedAt` a
  **nivel BD** (columna + trigger en [`prisma/etag_triggers.sql`](../prisma/etag_triggers.sql)),
  **fuera del modelo Prisma** a propósito, para no romper las lecturas si la migración aún no se
  corrió (Prisma solo selecciona columnas que conoce). Si algún día se hace el delta (P1), se
  reutiliza esta misma marca.
- **Índices** `Registro(refugio, createdAt)` y `ConsultaMedica(refugio, createdAt)` — ✅
  **aplicado (P8)**: `@@index` en el schema + [`prisma/indexes.sql`](../prisma/indexes.sql).
  Antes solo existía `@@index([cedula])` + `@@unique([cedula, refugio])`.

### ❌ P1 — Sincronización incremental (delta)  *(descartada por ahora)*

- **Por qué:** a 1.800 filas la carga inicial completa es ~1,2 MB; montar `updatedAt` + feed de
  borrados + fusión en el cliente para ahorrar sobre eso es **sobre-ingeniería**. **P4 (ETag)
  consigue ~80% del beneficio con ~10% del trabajo.**
- **Revisar si:** el censo crece 10-50× (decenas de miles de filas).

### ❌ P5 — Regionalizar el padrón  *(ya está)*

- **Por qué:** 237k filas = básicamente **todo el estado La Guaira** (el CNE nacional son
  ~21 M). No hay filtrado adicional seguro: un registrador puede censar a alguien de cualquier
  parroquia del estado. La descarga ya es reanudable/incremental.
- **Único ajuste menor posible:** un `padron_version` para ni hacer el `count` en cada login
  si no cambió (ahorro marginal).

---

## 3. Orden recomendado

1. ✅ **Hecho:** P3 (stats SQL) → P4 (ETag/304) → P7 (paginación) → P8 (Cache-Control catálogos +
   índices).
2. **Fase 1 restante (bajo/medio riesgo, sin tocar operatividad offline):** P2 (columnas
   ligeras) → P6 (menos refetch; con P4 las repetidas ya son 304).
3. **Fase 2 (si el censo crece mucho):** reconsiderar P1 (delta), reutilizando la marca de
   última modificación de P4.

---

## 4. Cómo validar P3 tú mismo (opcional, recomendado)

Un script de **solo lectura** que corre el cálculo viejo (findMany+JS) y el nuevo (SQL) y
compara los números. Requiere `DATABASE_URL` en `.env` y correrse **desde una máquina con
acceso a la BD** (Vercel/tu PC; el entorno del asistente no alcanza `:5432`).

Pasos: crear `_validate-stats.mjs` con la lógica de ambos cálculos (núcleos/individuos +
top-patologías) para `scope = null` y para cada refugio, e imprimir **solo los conteos** (nunca
filas). Ejecutar con `node --env-file=.env _validate-stats.mjs`. Debe imprimir `OK` en todas
las filas. *(El asistente tiene la plantilla del script si se necesita regenerar.)*

**Validación mínima sin script:** abrir el Panel y confirmar que **Núcleos Familiares**,
**Individuos Solos** y el **gráfico de patologías** se ven igual que antes.

---

## 5. Bitácora

| Fecha | Commit | Cambio |
|-------|--------|--------|
| 2026-07 | `9b8653f` | **P3** aplicada: `stats.ts` 100% SQL (núcleos/individuos por `GROUP BY`, top-patologías por `jsonb_array_elements_text`) + intervalo TV 5s→30s. Sin migración de BD. |
| 2026-07 | *(este)* | **P4** (ETag/304) + **P7** (paginación 10/20/50/100). ETag `(count, max(syncedAt/updatedAt))` en `/api/registros` y `/api/consultas`, 304 sin cuerpo; cliente reenvía `If-None-Match` por ámbito (en memoria). `syncedAt` bumpeado en las 4 rutas del censo que faltaban + triggers `BEFORE UPDATE` de respaldo. Consultas requiere correr `prisma/etag_triggers.sql` (añade `updatedAt` + trigger); registros ya funciona. Paginación cliente en Registrados e Historial (preserva offline). |
| 2026-07 | *(este)* | **P8** — `Cache-Control: private, max-age=120` en los 4 catálogos globales (patologias/medicamentos/tipos-lesion/refugios) + refetch forzado (`cache:"reload"`) tras editar catálogo (CatalogosMedicos/ConfigTab) para no leer versión vieja. Índices `@@index([refugio, createdAt])` en Registro y ConsultaMedica (`prisma/indexes.sql`, correr en Supabase). |
