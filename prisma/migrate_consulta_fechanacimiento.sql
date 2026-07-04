-- ═══════════════════════════════════════════════════════════════════════════
--  Migración idempotente — ConsultaMedica.fechaNacimiento
--  Ejecutar manualmente en Supabase (re-ejecutable sin romper).
--
--  Motivo: en Morbilidad la EDAD nunca se ajusta a mano; se deriva de la fecha
--  de nacimiento. Se persiste la fecha (yyyy-mm-dd) en la consulta para poder
--  editarla después y recalcular la edad.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "fechaNacimiento" TEXT;
