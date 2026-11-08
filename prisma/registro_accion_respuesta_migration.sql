-- Agrega la columna de ACCION de RESPUESTA en Registro para jefes de familia y personas solas
ALTER TABLE "Registro" ADD COLUMN IF NOT EXISTS "accionRespuesta" TEXT;
