-- ═══════════════════════════════════════════════════════════════════════════
--  VZLA RENACE (Venezuela Renace) — esquema de las 3 tablas + SCOPE por refugio.
--  Idempotente (re-ejecutable sin romper). EJECUTAR MANUALMENTE en Supabase.
--  Sirve para BD nueva (crea todo) y para la existente (agrega `refugioId`,
--  backfillea lo ya importado y cambia los índices únicos a compuestos por refugio).
--  Los DATOS (jefes/miembros) entran por la carga de Excel en la app, no aquí.
--  SCOPE: cada fila pertenece a un Refugio (`refugioId`, por ID — estable, no por
--  nombre). El NRO del Excel es único POR refugio (no global).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Jefes de familia (1 por núcleo; `nro` = número del Excel, único por refugio) ─
CREATE TABLE IF NOT EXISTS "RenaceJefe" (
  "id"                      TEXT NOT NULL,
  "refugioId"               TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS "RenaceMiembro" (
  "id"                   TEXT NOT NULL,
  "refugioId"            TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS "RenacePlanteamiento" (
  "id"                  TEXT NOT NULL,
  "refugioId"           TEXT NOT NULL,
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

-- ── Migración de BD EXISTENTE (creada antes del scope por refugio) ──────────
-- 1) Agrega refugioId si falta (nullable para poder backfillear).
ALTER TABLE "RenaceJefe"          ADD COLUMN IF NOT EXISTS "refugioId" TEXT;
ALTER TABLE "RenaceMiembro"       ADD COLUMN IF NOT EXISTS "refugioId" TEXT;
ALTER TABLE "RenacePlanteamiento" ADD COLUMN IF NOT EXISTS "refugioId" TEXT;

-- 2) Backfill de lo YA importado → "Complejo Educativo República de Panamá"
--    (por nombre → id, sin hardcodear el uuid). Ajusta el nombre si tu campamento difiere.
UPDATE "RenaceJefe" j
  SET "refugioId" = r."id"
  FROM "Refugio" r
  WHERE r."nombre" = 'Complejo Educativo República de Panamá' AND j."refugioId" IS NULL;
UPDATE "RenaceMiembro" m
  SET "refugioId" = r."id"
  FROM "Refugio" r
  WHERE r."nombre" = 'Complejo Educativo República de Panamá' AND m."refugioId" IS NULL;
UPDATE "RenacePlanteamiento" p
  SET "refugioId" = r."id"
  FROM "Refugio" r
  WHERE r."nombre" = 'Complejo Educativo República de Panamá' AND p."refugioId" IS NULL;

-- 3) Ya sin filas sin refugio → fija NOT NULL (no-op si ya lo es).
ALTER TABLE "RenaceJefe"          ALTER COLUMN "refugioId" SET NOT NULL;
ALTER TABLE "RenaceMiembro"       ALTER COLUMN "refugioId" SET NOT NULL;
ALTER TABLE "RenacePlanteamiento" ALTER COLUMN "refugioId" SET NOT NULL;

-- ── Índices (nombres iguales a los que genera Prisma) ───────────────────────
-- Únicos AHORA compuestos: NRO/JEFE son únicos POR refugio, no globales.
DROP INDEX IF EXISTS "RenaceJefe_nro_key";
CREATE UNIQUE INDEX IF NOT EXISTS "RenaceJefe_nro_refugioId_key" ON "RenaceJefe" ("nro", "refugioId");
DROP INDEX IF EXISTS "RenacePlanteamiento_jefeNro_key";
CREATE UNIQUE INDEX IF NOT EXISTS "RenacePlanteamiento_jefeNro_refugioId_key" ON "RenacePlanteamiento" ("jefeNro", "refugioId");

-- Índices de scope / búsqueda.
CREATE INDEX IF NOT EXISTS "RenaceJefe_refugioId_idx" ON "RenaceJefe" ("refugioId");
CREATE INDEX IF NOT EXISTS "RenaceJefe_cedula_idx" ON "RenaceJefe" ("cedula");
DROP INDEX IF EXISTS "RenaceMiembro_jefeNro_idx";
CREATE INDEX IF NOT EXISTS "RenaceMiembro_refugioId_jefeNro_idx" ON "RenaceMiembro" ("refugioId", "jefeNro");
CREATE INDEX IF NOT EXISTS "RenaceMiembro_cedula_idx" ON "RenaceMiembro" ("cedula");
