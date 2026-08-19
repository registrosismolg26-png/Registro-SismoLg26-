-- ConsultaMedica: agregar "motivoConsulta" (para el informe médico). Idempotente.
-- Correr MANUALMENTE en Supabase (SQL Editor).
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "motivoConsulta" TEXT;
