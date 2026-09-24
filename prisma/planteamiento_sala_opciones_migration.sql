-- ═══════════════════════════════════════════════════════════════════════════
--  PLANTEAMIENTO SALA — Modalidades: Mercado Secundario, Alquiler y Plan Venezuela Renace
--  Idempotente (re-ejecutable sin romper). EJECUTAR EN SUPABASE SQL EDITOR.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "PlanteamientoSala"
  ADD COLUMN IF NOT EXISTS "tipoOpcion"                 TEXT NOT NULL DEFAULT 'MERCADO_SECUNDARIO',
  ADD COLUMN IF NOT EXISTS "cartaCompromiso"            TEXT NOT NULL DEFAULT 'NO',
  ADD COLUMN IF NOT EXISTS "fotosAlquiler"              TEXT NOT NULL DEFAULT 'NO',
  ADD COLUMN IF NOT EXISTS "cantidadFotosAlquiler"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "referenciaBancariaAlquiler" TEXT NOT NULL DEFAULT 'NO',
  ADD COLUMN IF NOT EXISTS "cedulaArrendador"           TEXT NOT NULL DEFAULT 'NO',
  ADD COLUMN IF NOT EXISTS "cedulaArrendatario"         TEXT NOT NULL DEFAULT 'NO',
  ADD COLUMN IF NOT EXISTS "rifArrendador"              TEXT NOT NULL DEFAULT 'NO',
  ADD COLUMN IF NOT EXISTS "rifArrendatario"            TEXT NOT NULL DEFAULT 'NO',
  ADD COLUMN IF NOT EXISTS "rifViviendaDanos"           TEXT NOT NULL DEFAULT 'NO',
  ADD COLUMN IF NOT EXISTS "fotosViviendaRenace"        TEXT NOT NULL DEFAULT 'NO',
  ADD COLUMN IF NOT EXISTS "cantidadFotosRenace"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sacosCemento"               INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "metrosArena"                DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bloques"                    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cabillas"                   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pego"                       INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "PlanteamientoSala_tipoOpcion_idx"
  ON "PlanteamientoSala" ("tipoOpcion");
