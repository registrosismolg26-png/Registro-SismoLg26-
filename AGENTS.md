<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Guía del proyecto (para cualquier agente: Claude Code, Gemini Antigravity, etc.)

Antes de escribir o modificar código, lee **`docs/ARCHITECTURE.md`** — arquitectura, patrones (AppContext híbrido, autorización por refugio con `x-user-id`, cola offline con backoff), modelo de datos, rutas API y esquemas de trabajo del proyecto. Está pensada para entender el repo rápido sin explorarlo entero ni quemar tokens.

Reglas base innegociables:
- `npx tsc --noEmit` debe quedar limpio antes de cada commit.
- **Antes de cada `push`, hacer `git pull --rebase origin main`** para integrar el trabajo de otros devs y no dejar ninguna actualización fuera; resolver conflictos antes de pushear.
- **Antes de iniciar un cambio:** consulta `docs/ARCHITECTURE.md` para partir del estado real del proyecto (no de suposiciones).
- **Al terminar un cambio importante** (nuevo patrón, ruta API, dependencia, decisión de arquitectura o convención): **actualiza `docs/ARCHITECTURE.md`** — y el skill `.claude/skills/registro-sismo/SKILL.md` si aplica — para que la guía refleje el estado nuevo. La consultan Claude y Gemini Antigravity al empezar la próxima tarea; mantenerla viva evita que trabajen con información obsoleta.
- **Cambios en la BD:** todo cambio de esquema (`prisma/schema.prisma`) → actualizar el schema + `npx prisma generate` + **entregar al dueño el SQL de migración idempotente** para ejecutarlo **manualmente en Supabase** (NO se corre `prisma migrate` ni `db push` automático contra producción). Idempotente = re-ejecutable sin romper: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`, `UPDATE ... WHERE`.
