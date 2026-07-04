<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Guía del proyecto (para cualquier agente: Claude Code, Gemini Antigravity, etc.)

Antes de escribir o modificar código, lee **`docs/ARCHITECTURE.md`** — arquitectura, patrones (AppContext híbrido, autorización por refugio con `x-user-id`, cola offline con backoff), modelo de datos, rutas API y esquemas de trabajo del proyecto. Está pensada para entender el repo rápido sin explorarlo entero ni quemar tokens.

Reglas base innegociables:
- **Estas instrucciones (AGENTS + `SKILL.md` + `ARCHITECTURE.md`) son INNEGOCIABLES.** Léelas al empezar CADA tarea y cúmplelas. Lo que el dueño indique como regla se acata siempre, aunque no esté escrito aún. **Si surge una convención NUEVA (de estilo, UX, arquitectura, etc.), PREGÚNTALE al dueño antes de incluirla** en el skill/AGENTS; una vez confirmada, codifícala aquí para que toda IA (Claude, Gemini Antigravity, etc.) la cumpla.
- **Sistema de UI "todo pill" (reformat innegociable).** En cualquier formulario/modal, TODOS los controles comparten UNA sola altura y radio pill vía las clases `.censo-form` (registro) o `.pill-form` (reutilizable: envuelve la sección con `pill-form`). Usa SIEMPRE los componentes reformateados —`StyledSelect`, `DatePicker`, `SearchableSelect`, `SearchableSingleSelect`— y **NUNCA** `<select>` ni `<input type="date">` nativos. **Ningún control ni botón puede quedar con altura distinta** (inputs, selects, date, y botones `btn-submit`/`btn-secondary`/`btn-back` van todos al mismo alto `--ctl-h`). Búsquedas insensibles a acentos con `normalizeText`. **Verifica visualmente** (mismo alto, esquinas pill, sin saltos de tamaño de letra) antes de dar por hecho un cambio de UI.
- `npx tsc --noEmit` debe quedar limpio antes de cada commit.
- **Nada de hardcode.** No incrustes valores fijos en el código (refugios, nombres, capacidades, listas, credenciales, cualquier cosa que deba venir de la BD / config / estado / `.env`). Si te topas con hardcode existente, **adviértelo y propón la solución** (parametrizarlo, moverlo a BD/config/entorno) en vez de dejarlo pasar.
- **Antes de cada `push`, hacer `git pull --rebase origin main`** para integrar el trabajo de otros devs y no dejar ninguna actualización fuera; resolver conflictos antes de pushear.
- **Antes de iniciar un cambio:** consulta `docs/ARCHITECTURE.md` para partir del estado real del proyecto (no de suposiciones).
- **Al terminar un cambio importante** (nuevo patrón, ruta API, dependencia, decisión de arquitectura o convención): **actualiza `docs/ARCHITECTURE.md`** — y el skill `.claude/skills/registro-sismo/SKILL.md` si aplica — para que la guía refleje el estado nuevo. La consultan Claude y Gemini Antigravity al empezar la próxima tarea; mantenerla viva evita que trabajen con información obsoleta.
- **Cambios en la BD:** todo cambio de esquema (`prisma/schema.prisma`) → actualizar el schema + `npx prisma generate` + **entregar al dueño el SQL de migración idempotente** para ejecutarlo **manualmente en Supabase** (NO se corre `prisma migrate` ni `db push` automático contra producción). Idempotente = re-ejecutable sin romper: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`, `UPDATE ... WHERE`.
- **PROHIBIDO auto-sembrar (auto-seed) datos de catálogo.** Nunca escribas código que detecte una tabla vacía y la llene automáticamente (ej.: `if (count === 0) { createMany(...) }`). Los catálogos (`Patologia`, `MedicamentoPredefinido`, etc.) se cargan **una sola vez** mediante SQL manual entregado al dueño, o desde la interfaz de configuración de la app. Si el dueño no lo ha autorizado explícitamente, **no lo hagas**.
