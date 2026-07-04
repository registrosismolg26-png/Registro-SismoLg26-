-- ═══════════════════════════════════════════════════════════════════════════
--  Migración idempotente — ConsultaMedica: tipo de atención + nota de apoyo
--  Ejecutar manualmente en Supabase (re-ejecutable sin romper).
--
--  tipoPaciente: REFUGIADO (censado, por defecto) | APOYO_INSTITUCIONAL |
--                APOYO_COMUNITARIO | EMERGENCIA
--  tipoNota:     nota opcional para las atenciones de apoyo (institución, contexto…)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "tipoPaciente" TEXT DEFAULT 'REFUGIADO';
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "tipoNota"     TEXT;

-- Las consultas existentes se consideran del refugio (censadas):
UPDATE "ConsultaMedica" SET "tipoPaciente" = 'REFUGIADO' WHERE "tipoPaciente" IS NULL;
