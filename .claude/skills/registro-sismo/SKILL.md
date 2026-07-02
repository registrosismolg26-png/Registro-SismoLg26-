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

- **Offline:** `src/lib/db.ts` (IndexedDB + cola con backoff y error permanente vs temporal), `triggerSync` en page.tsx. **Usa `apiFetch`, nunca `fetch` directo** para `/api/`.

## Reglas de trabajo

- Deja `npx tsc --noEmit` **limpio antes de cada commit**.
- **Antes de cada `push`:** `git pull --rebase origin main` para integrar el trabajo de otros devs y no dejar nada fuera.
- Next 16 tiene `params`/`headers()` **async** — lee `node_modules/next/dist/docs/` antes de escribir rutas o páginas.
- No migres a Tailwind (el sistema CSS con variables ya es maduro y offline-friendly).
- Si un cambio no se refleja en el preview, es el cache de chunks de dev del service worker → borra `.next` y reinicia.

Para el detalle (modelo de datos completo, todas las rutas API, deploy en Vercel serverless, gotchas), ve a **`docs/ARCHITECTURE.md`**.
