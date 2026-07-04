---
name: registro-sismo
description: Guía de arquitectura, patrones y esquemas de trabajo del proyecto Registro-SismoLg26 (PWA offline-first de censo sísmico con Next.js 16, Prisma/Supabase, permisos multi-refugio). Consúltala al empezar CUALQUIER tarea en este repo — antes de escribir o modificar código, rutas API, tabs, el sistema de roles/refugios, la cola offline o el AppContext. Úsala siempre que trabajes en este proyecto para no reinventar patrones ni romper convenciones ya establecidas.
---

# Registro-SismoLg26

Antes de tocar código en este proyecto, lee la guía completa: **`docs/ARCHITECTURE.md`**. Es la fuente única de verdad sobre arquitectura, patrones y convenciones; te evita explorar el repo desde cero y quemar tokens. Esta página es el resumen para orientarte rápido.

## Lo imprescindible

- **Arquitectura híbrida:** `src/app/page.tsx` (`Home`) es el orquestador — tiene el estado GLOBAL y los effects, y monta `<AppContext.Provider>`. El estado global se distribuye por `src/context/AppContext.tsx` (`useAppContext()`); cada pestaña tiene su estado LOCAL en `src/tabs/`. `LoginForm` recibe **props** (se renderiza fuera del Provider).

- **Autorización (crítico):** el backend **nunca** confía en el cliente. Cliente → `apiFetch` (`src/lib/apiFetch.ts`, añade `x-user-id`); servidor → `getAuthUser(req)` en `src/lib/auth.ts` deriva rol/refugio de la BD. `src/lib/permissions.ts` es el espejo cliente (solo UX). Todo scoped por refugio (`refugioScope`).

- **Roles:** MASTER (global, se gestiona por SQL, no asignable en la UI), ADMIN (su refugio), REGISTRADOR (censa su refugio), VISUALIZADOR (solo ve). **Solo Master asigna Admin; nadie asigna Master.**

- **Refugio obligatorio:** sin refugio asignado no se puede censar (`/api/register` → 403) ni crear/editar usuarios (`/api/auth/users` → 400). Guarda `hasRefugio` (backend en `auth.ts` + espejo en `permissions.ts` para la UX).

- **Offline:** `src/lib/db.ts` (IndexedDB + cola con backoff y error permanente vs temporal), `triggerSync` en page.tsx. **Usa `apiFetch`, nunca `fetch` directo** para `/api/`.

## Reglas de trabajo

- **Estas guías son INNEGOCIABLES.** Léelas al empezar cada tarea y cúmplelas. Si el dueño pide una convención **nueva**, **pregúntale antes** de codificarla en AGENTS/SKILL; ya confirmada, escríbela para que toda IA la cumpla.
- **UI "todo pill" (innegociable).** En formularios/modales, todos los controles comparten UNA altura y radio pill vía `.censo-form` o `.pill-form` (envuelve la sección con `pill-form`). Usa SIEMPRE `StyledSelect`/`DatePicker`/`SearchableSelect`/`SearchableSingleSelect`, nunca `<select>`/`<input type=date>` nativos. **Ningún control ni botón** (`btn-submit`/`btn-secondary`/`btn-back`) puede quedar con altura distinta. Búsquedas sin acentos con `normalizeText`. **Verifica visualmente** (mismo alto, esquinas pill, sin saltos de tamaño de letra).
- Deja `npx tsc --noEmit` **limpio antes de cada commit**.
- **Nada de hardcode:** no incrustes valores fijos (refugios, nombres, capacidades, credenciales, lo que deba venir de BD/config/estado/`.env`). Si ves hardcode existente, **adviértelo y propón solución**.
- **Antes de cada `push`:** `git pull --rebase origin main` para integrar el trabajo de otros devs y no dejar nada fuera.
- **Después de CADA `push` exitoso, envía un correo-resumen al dueño** con `node scripts/send-push-email.mjs "<asunto>" <cuerpo.html>` (Resend; API key en `.claude/resend.key`, **gitignored, NUNCA commitear**; destino `yender.umc@gmail.com`). Resume rama + hash(es), qué cambió y qué queda pendiente o requiere acción del dueño (SQL en Supabase, aceptar la actualización de la PWA, etc.). Así se entera aunque no esté presente.
- **Guía viva:** consulta `docs/ARCHITECTURE.md` al iniciar la tarea; al terminar un cambio importante, actualízala (y este skill si aplica) para Claude y Gemini Antigravity.
- **Migraciones de BD:** cambio de `prisma/schema.prisma` → `npx prisma generate` + entregar SQL **idempotente** (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`…) para ejecutar **manualmente en Supabase**. Nunca `prisma migrate`/`db push` automático contra producción.
- **PROHIBIDO auto-sembrar (auto-seed) catálogos.** Nunca escribas código que detecte una tabla vacía y la llene automáticamente (ej.: `if (count === 0) { createMany(...) }`). Los catálogos (`Patologia`, `MedicamentoPredefinido`, etc.) se cargan **una sola vez** por SQL manual entregado al dueño, o desde la config de la app (AdminMedico). Si el dueño no lo autorizó explícitamente, **no lo hagas**.
- **Catálogos médicos por-ID:** patologías y medicamentos se guardan por **ID del catálogo** (no por nombre) en `Registro`/`ConsultaMedica` (columnas JSON `patologiaIds`/`medicamentoIds` + equivalentes en consulta). El nombre se **interpola** al mostrar/exportar con `patologiaNombre`/`medLabel` (`src/lib/helpers.ts`). En censo, consulta y edición **solo se elige del catálogo** (nada de texto libre). `MedicamentoPredefinido` es único por `(nombre, concentracion, presentacion)`. Gestión de catálogos = `canManageCatalogosMedicos` (MASTER + AdminMedico) en Config → "Catálogos Médicos".
- Next 16 tiene `params`/`headers()` **async** — lee `node_modules/next/dist/docs/` antes de escribir rutas o páginas.
- **Tailwind v4 está instalado sin Preflight** para migración progresiva. Config en CSS (no hay `tailwind.config.js`): en `globals.css` se importan solo las capas theme+utilities (se omite `preflight.css`) + `@theme inline`; plugin `@tailwindcss/postcss` en `postcss.config.mjs`. El CSS con variables sigue siendo el sistema base; usa Tailwind para código nuevo o migra de a poco (colores mapeados: `bg-primary`, `text-danger`…). No actives Preflight (rompería el diseño). v4 requiere navegadores ~2023+.
- Si un cambio no se refleja en el preview, es el cache de chunks de dev del service worker → borra `.next` y reinicia. (El `BUILD_TS` del SW se autogenera en cada build con el commit SHA vía el script `prebuild` — no editarlo a mano.)

Para el detalle (modelo de datos completo, todas las rutas API, deploy en Vercel serverless, gotchas), ve a **`docs/ARCHITECTURE.md`**.
