-- ═══════════════════════════════════════════════════════════════════════════
--  Columna  Registro.registrador  — nombre del operador que censó a la persona
--  Idempotente (re-ejecutable). Ejecutar MANUALMENTE en Supabase.
--
--  · Censos NUEVOS: la app rellena la columna al crear (auth.nombre del operador).
--  · Censos YA EXISTENTES (backfill): se deriva del AuditLog — evento 'CREATE' de
--    cada Registro → user_email del operador → se resuelve su nombre en "User".
--    Si el nombre no está en "User", queda el email como respaldo.
--
--  El backfill SOLO toca filas con registrador NULL o vacío, por lo que se puede
--  re-ejecutar sin pisar valores ya asignados.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Columna nueva
ALTER TABLE "Registro" ADD COLUMN IF NOT EXISTS "registrador" TEXT;

-- 2) Backfill desde la auditoría (un CREATE por registro; el más antiguo si hubiera varios)
UPDATE "Registro" r
SET "registrador" = COALESCE(NULLIF(u."nombre", ''), a.user_email)
FROM (
  SELECT DISTINCT ON (entidad_id) entidad_id, user_email
  FROM "AuditLog"
  WHERE entidad = 'Registro'
    AND accion = 'CREATE'
    AND user_email IS NOT NULL
    AND user_email <> ''
  ORDER BY entidad_id, created_at ASC
) a
LEFT JOIN "User" u ON lower(u."email") = lower(a.user_email)
WHERE r.id = a.entidad_id
  AND (r."registrador" IS NULL OR r."registrador" = '');
