-- Migración para agregar datos de la persona en PlanteamientoSala:
-- genero, fechaNacimiento, edad

ALTER TABLE "PlanteamientoSala"
  ADD COLUMN IF NOT EXISTS "genero" TEXT,
  ADD COLUMN IF NOT EXISTS "fechaNacimiento" TEXT,
  ADD COLUMN IF NOT EXISTS "edad" INTEGER;
