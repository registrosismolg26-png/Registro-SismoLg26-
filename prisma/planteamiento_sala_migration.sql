-- ═══════════════════════════════════════════════════════════════════════════
--  PLANTEAMIENTO SALA — Master Script (Creación / Actualización Idempotente)
--  Soporta las 3 opciones: Mercado Secundario, Alquiler y Plan Venezuela Renace.
--  EJECUTAR MANUALMENTE EN SUPABASE SQL EDITOR.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "PlanteamientoSala" (
  "id"                         TEXT NOT NULL,
  "refugioId"                  TEXT,
  "refugio"                    TEXT NOT NULL,
  "cedula"                     TEXT NOT NULL,
  "nombreApellido"             TEXT NOT NULL,
  "telefono"                   TEXT,
  "registroId"                 TEXT,

  -- Modalidad / Opción
  "tipoOpcion"                 TEXT NOT NULL DEFAULT 'MERCADO_SECUNDARIO',

  -- 1. Mercado Secundario (9 requisitos)
  "planillaCaracterizacion"    TEXT NOT NULL DEFAULT 'NO',
  "cedulaCatastral"            TEXT NOT NULL DEFAULT 'NO',
  "tituloCasa"                 TEXT NOT NULL DEFAULT 'NINGUNO',
  "referenciaBancariaVendedor" TEXT NOT NULL DEFAULT 'NO',
  "qrHabitatVivienda"          TEXT NOT NULL DEFAULT 'NO',
  "cedulaVendedor"             TEXT NOT NULL DEFAULT 'NO',
  "cedulaComprador"            TEXT NOT NULL DEFAULT 'NO',
  "fotosVivienda"              TEXT NOT NULL DEFAULT 'NO',
  "cantidadFotos"              INTEGER NOT NULL DEFAULT 0,
  "vendedorPoseePatria"        TEXT NOT NULL DEFAULT 'NO',

  -- 2. Alquiler (7 requisitos)
  "cartaCompromiso"            TEXT NOT NULL DEFAULT 'NO',
  "fotosAlquiler"              TEXT NOT NULL DEFAULT 'NO',
  "cantidadFotosAlquiler"      INTEGER NOT NULL DEFAULT 0,
  "referenciaBancariaAlquiler" TEXT NOT NULL DEFAULT 'NO',
  "cedulaArrendador"           TEXT NOT NULL DEFAULT 'NO',
  "cedulaArrendatario"         TEXT NOT NULL DEFAULT 'NO',
  "rifArrendador"              TEXT NOT NULL DEFAULT 'NO',
  "rifArrendatario"            TEXT NOT NULL DEFAULT 'NO',

  -- 3. Plan Venezuela Renace (Requisitos y Materiales)
  "rifViviendaDanos"           TEXT NOT NULL DEFAULT 'NO',
  "fotosViviendaRenace"        TEXT NOT NULL DEFAULT 'NO',
  "cantidadFotosRenace"        INTEGER NOT NULL DEFAULT 0,
  "sacosCemento"               INTEGER NOT NULL DEFAULT 0,
  "metrosArena"                DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bloques"                    INTEGER NOT NULL DEFAULT 0,
  "cabillas"                   INTEGER NOT NULL DEFAULT 0,
  "pego"                       INTEGER NOT NULL DEFAULT 0,

  -- Progreso y Estatus
  "porcentajeProgreso"         INTEGER NOT NULL DEFAULT 0,
  "estatus"                    TEXT NOT NULL DEFAULT 'EN PROCESO',
  "observacion"                TEXT,
  "createdBy"                  TEXT,
  "createdAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanteamientoSala_pkey" PRIMARY KEY ("id")
);

-- Si la tabla ya existía, añadir las columnas nuevas si no existen
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

CREATE UNIQUE INDEX IF NOT EXISTS "PlanteamientoSala_cedula_refugio_key"
  ON "PlanteamientoSala" ("cedula", "refugio");

CREATE INDEX IF NOT EXISTS "PlanteamientoSala_refugio_idx" ON "PlanteamientoSala" ("refugio");
CREATE INDEX IF NOT EXISTS "PlanteamientoSala_cedula_idx" ON "PlanteamientoSala" ("cedula");
CREATE INDEX IF NOT EXISTS "PlanteamientoSala_estatus_idx" ON "PlanteamientoSala" ("estatus");
CREATE INDEX IF NOT EXISTS "PlanteamientoSala_tipoOpcion_idx" ON "PlanteamientoSala" ("tipoOpcion");
