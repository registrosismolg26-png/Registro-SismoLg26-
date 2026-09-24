-- Migración para agregar columna cargaFamiliar a PlanteamientoSala
ALTER TABLE "PlanteamientoSala"
  ADD COLUMN IF NOT EXISTS "cargaFamiliar" JSONB DEFAULT '[]'::jsonb;
