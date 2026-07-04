-- ─────────────────────────────────────────────────────────────────────────────
-- Migración v2: modelo de catálogos médicos POR-ID (offline-first, columnas JSON).
-- IDEMPOTENTE: re-ejecutable en Supabase. Ejecutar ANTES de los seeds y el backfill.
-- Estrategia expand→migrate→contract: se AÑADEN columnas ID-nativas y se CONGELAN
-- las viejas (patologiaDescripcion / medicamentos / antecedentes* / diagnostico*),
-- que se dropearán en una migración posterior tras validar el backfill.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) MedicamentoPredefinido: concentración/presentación NOT NULL + clave única compuesta.
ALTER TABLE "MedicamentoPredefinido" ADD COLUMN IF NOT EXISTS "concentracion" TEXT;
ALTER TABLE "MedicamentoPredefinido" ADD COLUMN IF NOT EXISTS "presentacion"  TEXT;
UPDATE "MedicamentoPredefinido" SET "concentracion" = '' WHERE "concentracion" IS NULL;
UPDATE "MedicamentoPredefinido" SET "presentacion"  = '' WHERE "presentacion"  IS NULL;
ALTER TABLE "MedicamentoPredefinido" ALTER COLUMN "concentracion" SET DEFAULT '';
ALTER TABLE "MedicamentoPredefinido" ALTER COLUMN "presentacion"  SET DEFAULT '';
ALTER TABLE "MedicamentoPredefinido" ALTER COLUMN "concentracion" SET NOT NULL;
ALTER TABLE "MedicamentoPredefinido" ALTER COLUMN "presentacion"  SET NOT NULL;
-- El nombre ya NO es único por sí solo (se repite con distinta presentación).
DROP INDEX IF EXISTS "MedicamentoPredefinido_nombre_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MedicamentoPredefinido_nombre_concentracion_presentacion_key"
  ON "MedicamentoPredefinido" ("nombre", "concentracion", "presentacion");

-- 2) ConsultaMedica: vínculo por UID al censo + columnas ID-nativas.
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "registroId" TEXT;
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "antecedentesPatologiaIds"   JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "diagnosticoPatologiaIds"    JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "antecedentesMedicamentoIds" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "diagnosticoMedicamentoIds"  JSONB DEFAULT '[]'::jsonb;

-- 3) Registro: columnas ID-nativas (patologías y medicamentos).
ALTER TABLE "Registro" ADD COLUMN IF NOT EXISTS "patologiaIds"   JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Registro" ADD COLUMN IF NOT EXISTS "medicamentoIds" JSONB DEFAULT '[]'::jsonb;
