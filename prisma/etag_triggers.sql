-- ═══════════════════════════════════════════════════════════════════════════
--  Migración ETag / ahorro de egress — sellos de "última modificación"
--  Idempotente (re-ejecutable sin romper). Ejecutar MANUALMENTE en Supabase.
--
--  Objetivo: que GET /api/registros y GET /api/consultas puedan responder 304
--  (sin re-descargar toda la lista) cuando nada cambió en el servidor. El "sello"
--  que compara el backend es el par  (COUNT(*), MAX(fecha_de_modificación)):
--    · Registro        → usa la columna YA EXISTENTE "syncedAt".
--    · ConsultaMedica  → necesita una columna "updatedAt" (aún no existe) → se crea aquí.
--
--  Para que el sello NUNCA quede obsoleto sin importar QUÉ ruta hizo el cambio
--  (traslados, renombrar refugio/salón, evolución clínica, edición de consulta…),
--  se instalan triggers BEFORE UPDATE que refrescan esa fecha en CADA update.
--
--  SEGURIDAD DE DESPLIEGUE: el código del backend consulta "updatedAt" por SQL crudo
--  con try/catch — si esta migración AÚN NO se corrió, /api/consultas responde 200
--  normal (sin ETag), sin romperse. Es decir: se puede desplegar el código antes de
--  correr este SQL; la optimización de consultas se ACTIVA al correrlo.
--
--  NOTA de auditoría: el trigger de auditoría (prisma/audit_setup.sql) ya IGNORA
--  "syncedAt" en el diff de Registro. En ConsultaMedica, "updatedAt" SÍ aparecerá en
--  el diff de las ediciones — es inofensivo e incluso informativo (indica cuándo se
--  editó la consulta).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) ConsultaMedica: columna "updatedAt" (marca de última modificación) ──────
--     Se agrega nullable, se rellena desde createdAt (filas previas) y recién ahí se
--     le pone DEFAULT + NOT NULL. IMPORTANTE: el backfill va ANTES de crear el trigger
--     (más abajo), para que copie createdAt y no lo pise con now().
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz;
UPDATE "ConsultaMedica" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "ConsultaMedica" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "ConsultaMedica" ALTER COLUMN "updatedAt" SET NOT NULL;

-- ── 2) Funciones de trigger: refrescan la fecha de modificación en cada UPDATE ─
CREATE OR REPLACE FUNCTION bump_registro_synced() RETURNS TRIGGER AS $$
BEGIN
  NEW."syncedAt" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bump_consulta_updated() RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3) Triggers BEFORE UPDATE (corren ANTES del trigger AFTER de auditoría) ─────
--     Registro: el código de la app ya bumpea "syncedAt" en cada ruta conocida; este
--     trigger es el respaldo SÓLIDO que cubre además cualquier ruta futura sin que
--     nadie tenga que acordarse de hacerlo a mano.
DROP TRIGGER IF EXISTS trg_bump_registro_synced ON "Registro";
CREATE TRIGGER trg_bump_registro_synced
BEFORE UPDATE ON "Registro"
FOR EACH ROW EXECUTE FUNCTION bump_registro_synced();

DROP TRIGGER IF EXISTS trg_bump_consulta_updated ON "ConsultaMedica";
CREATE TRIGGER trg_bump_consulta_updated
BEFORE UPDATE ON "ConsultaMedica"
FOR EACH ROW EXECUTE FUNCTION bump_consulta_updated();

-- ── Verificación rápida (opcional) ─────────────────────────────────────────────
-- SELECT COUNT(*) AS consultas, MAX("updatedAt") AS ult_mod FROM "ConsultaMedica";
-- SELECT COUNT(*) AS registros, MAX("syncedAt")  AS ult_mod FROM "Registro";
