-- ═══════════════════════════════════════════════════════════════════════════
--  VZLA RENACE (Venezuela Renace) — esquema de las 3 tablas del módulo.
--  Idempotente (re-ejecutable sin romper). EJECUTAR MANUALMENTE en Supabase.
--  Los nombres COINCIDEN con los que genera Prisma para evitar "drift".
--  Los DATOS (jefes/miembros) entran por la carga de Excel en la app, no aquí.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Jefes de familia (1 por núcleo; `nro` = número del Excel, enlace) ────────
CREATE TABLE IF NOT EXISTS "RenaceJefe" (
  "id"                      TEXT NOT NULL,
  "nro"                     INTEGER NOT NULL,
  "cantMiembros"            INTEGER,
  "nombres"                 TEXT NOT NULL,
  "cedula"                  TEXT NOT NULL,
  "fechaNacimiento"         TEXT,
  "sexo"                    TEXT,
  "edad"                    INTEGER,
  "telefono"                TEXT,
  "profesion"               TEXT,
  "estadoProcedencia"       TEXT,
  "parroquiaProcedencia"    TEXT,
  "tipoAfectacion"          TEXT,
  "condicionVivienda"       TEXT,
  "incidencias"             TEXT,
  "numeroCertificado"       TEXT,
  "planteamientoAfectacion" TEXT,
  "observaciones"           TEXT,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RenaceJefe_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RenaceJefe_nro_key" ON "RenaceJefe" ("nro");
CREATE INDEX IF NOT EXISTS "RenaceJefe_cedula_idx" ON "RenaceJefe" ("cedula");

-- ── Miembros del grupo familiar (`jefeNro` enlaza con RenaceJefe.nro) ────────
CREATE TABLE IF NOT EXISTS "RenaceMiembro" (
  "id"                   TEXT NOT NULL,
  "jefeNro"              INTEGER NOT NULL,
  "nombres"              TEXT NOT NULL,
  "cedula"               TEXT NOT NULL,
  "fechaNacimiento"      TEXT,
  "sexo"                 TEXT,
  "edad"                 INTEGER,
  "parentesco"           TEXT,
  "telefono"             TEXT,
  "profesion"            TEXT,
  "estadoProcedencia"    TEXT,
  "parroquiaProcedencia" TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RenaceMiembro_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RenaceMiembro_jefeNro_idx" ON "RenaceMiembro" ("jefeNro");
CREATE INDEX IF NOT EXISTS "RenaceMiembro_cedula_idx" ON "RenaceMiembro" ("cedula");

-- ── Planteamiento por núcleo (1 por jefe; upsert por `jefeNro`) ──────────────
CREATE TABLE IF NOT EXISTS "RenacePlanteamiento" (
  "id"                  TEXT NOT NULL,
  "jefeNro"             INTEGER NOT NULL,
  "tipo"                TEXT NOT NULL,
  "modalidadPlan"       TEXT,
  "precioOCanon"        TEXT,
  "nombreContraparte"   TEXT,
  "cedulaContraparte"   TEXT,
  "contacto"            TEXT,
  "contactoSecundario"  TEXT,
  "estado"              TEXT,
  "municipio"           TEXT,
  "parroquia"           TEXT,
  "direccionEspecifica" TEXT,
  "estadoPreferencia"   TEXT,
  "observacion"         TEXT,
  "createdBy"           TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RenacePlanteamiento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RenacePlanteamiento_jefeNro_key" ON "RenacePlanteamiento" ("jefeNro");
