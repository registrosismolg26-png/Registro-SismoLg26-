-- Solución habitacional (refugios ITINERANTE/MIXTO): ALQUILER | MERCADO SECUNDARIO |
-- CRÉDITO HIPOTECARIO | SUBSIDIO | CAMPAMENTO CIUDAD CARIBIA. Nullable (los registros
-- existentes quedan en NULL). Idempotente. Ejecutar en Supabase.
ALTER TABLE "Registro" ADD COLUMN IF NOT EXISTS "solucionHabitacional" TEXT;
