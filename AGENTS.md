<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Guía del proyecto (para cualquier agente: Claude Code, Gemini Antigravity, etc.)

Antes de escribir o modificar código, lee **`docs/ARCHITECTURE.md`** — arquitectura, patrones (AppContext híbrido, autorización por refugio con `x-user-id`, cola offline con backoff), modelo de datos, rutas API y esquemas de trabajo del proyecto. Está pensada para entender el repo rápido sin explorarlo entero ni quemar tokens.

Regla base innegociable: `npx tsc --noEmit` debe quedar limpio antes de cada commit.
