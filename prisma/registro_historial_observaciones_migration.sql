-- Agrega columna para el histórico de observaciones en Registro
ALTER TABLE "Registro" ADD COLUMN IF NOT EXISTS "historialObservaciones" JSONB DEFAULT '[]'::jsonb;
