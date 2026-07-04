-- ═══════════════════════════════════════════════════════════════════════════
--  Migración idempotente — Estados explícitos: Estado físico + Embarazo
--  Ejecutar manualmente en Supabase (re-ejecutable sin romper).
--
--  Estados de primera clase (auto-sugeridos por lesiones/patologías pero decididos
--  por el médico), ligados al Registro (censo) y a la ConsultaMedica:
--    · Registro.embarazo         "SI" / "NO"  (default "NO")
--    · ConsultaMedica.estadoFisico "ILESO" / "LESIONADO"
--    · ConsultaMedica.embarazo     "SI" / "NO"
--  (Registro.estadoFisico ya existía.)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "Registro"       ADD COLUMN IF NOT EXISTS "embarazo"     TEXT NOT NULL DEFAULT 'NO';
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "estadoFisico" TEXT;
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "embarazo"     TEXT;
