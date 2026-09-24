-- Migración para añadir el requisito 10: QR de Colapso de Vivienda a PlanteamientoSala
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "qrColapsoVivienda" TEXT DEFAULT 'NO';
