-- ═══════════════════════════════════════════════════════════════════════════
--  PLANTEAMIENTO SALA (Solo Master) — expedientes y checklist de requisitos.
--  Idempotente (re-ejecutable sin romper). EJECUTAR MANUALMENTE en Supabase.
--  1 fila por persona por campamento; ancla = (cedula, refugio).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "PlanteamientoSala" (
  "id"                         TEXT NOT NULL,
  "refugioId"                  TEXT,
  "refugio"                    TEXT NOT NULL,
  "cedula"                     TEXT NOT NULL,
  "nombreApellido"             TEXT NOT NULL,
  "telefono"                   TEXT,
  "registroId"                 TEXT,
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
  "porcentajeProgreso"         INTEGER NOT NULL DEFAULT 0,
  "estatus"                    TEXT NOT NULL DEFAULT 'EN PROCESO',
  "observacion"                TEXT,
  "createdBy"                  TEXT,
  "createdAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanteamientoSala_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlanteamientoSala_cedula_refugio_key"
  ON "PlanteamientoSala" ("cedula", "refugio");

CREATE INDEX IF NOT EXISTS "PlanteamientoSala_refugio_idx"
  ON "PlanteamientoSala" ("refugio");

CREATE INDEX IF NOT EXISTS "PlanteamientoSala_cedula_idx"
  ON "PlanteamientoSala" ("cedula");

CREATE INDEX IF NOT EXISTS "PlanteamientoSala_estatus_idx"
  ON "PlanteamientoSala" ("estatus");
