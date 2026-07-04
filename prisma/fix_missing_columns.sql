-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: garantiza que existan TODAS las columnas nuevas que el código escribe.
-- Correr esto si el sync de censos o consultas da ERROR 500 ("column ... does
-- not exist"). Solo `ADD COLUMN IF NOT EXISTS` con DEFAULT → NO puede abortar por
-- datos existentes (a diferencia del índice único / NOT NULL). IDEMPOTENTE.
--
-- Por qué pasó: si migrate_db_medicamentos_v2.sql se detuvo en el paso del índice
-- único de MedicamentoPredefinido, las columnas de Registro/ConsultaMedica de más
-- abajo nunca se crearon, y cada POST que las escribe devuelve 500.
-- ─────────────────────────────────────────────────────────────────────────────

-- Censo (Registro)
ALTER TABLE "Registro"       ADD COLUMN IF NOT EXISTS "patologiaIds"   JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Registro"       ADD COLUMN IF NOT EXISTS "medicamentoIds" JSONB DEFAULT '[]'::jsonb;

-- Consultas (ConsultaMedica)
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "registroId" TEXT;
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "antecedentesPatologiaIds"   JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "diagnosticoPatologiaIds"    JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "antecedentesMedicamentoIds" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "diagnosticoMedicamentoIds"  JSONB DEFAULT '[]'::jsonb;

-- Catálogo (MedicamentoPredefinido) — con DEFAULT '' para no dejar NULLs
-- (Prisma las lee como String no-nulo; un NULL rompería el GET del catálogo).
ALTER TABLE "MedicamentoPredefinido" ADD COLUMN IF NOT EXISTS "concentracion" TEXT DEFAULT '';
ALTER TABLE "MedicamentoPredefinido" ADD COLUMN IF NOT EXISTS "presentacion"  TEXT DEFAULT '';
UPDATE "MedicamentoPredefinido" SET "concentracion" = '' WHERE "concentracion" IS NULL;
UPDATE "MedicamentoPredefinido" SET "presentacion"  = '' WHERE "presentacion"  IS NULL;

-- Verificación (deben aparecer las columnas):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'Registro' AND column_name IN ('patologiaIds','medicamentoIds');
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'ConsultaMedica'
--     AND column_name LIKE '%Ids' OR column_name = 'registroId';
