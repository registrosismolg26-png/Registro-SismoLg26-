-- Migración para campos de Vivienda Censada vía QR en PlanteamientoSala
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "viviendaTipo" TEXT;
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "viviendaEdificacion" TEXT;
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "viviendaPisoApto" TEXT;
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "viviendaDireccion" TEXT;
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "viviendaZona" TEXT;
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "viviendaCircuitoComunal" TEXT;
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "viviendaGps" TEXT;
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "viviendaQrUrl" TEXT;
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "viviendaQrFamilia" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "viviendaOperador" TEXT;
