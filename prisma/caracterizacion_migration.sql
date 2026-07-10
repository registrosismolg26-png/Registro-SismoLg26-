-- ═══════════════════════════════════════════════════════════════════════════
--  Migración: módulo CARACTERIZACIÓN (encuesta socioeconómica por familia)
--  Idempotente (re-ejecutable sin romper). Ejecutar MANUALMENTE en Supabase.
--
--  Crea 3 tablas (no toca Registro):
--   · CaracterizacionOpcion  — catálogo general de opciones cerradas (modulo/campo/valor)
--   · CaracterizacionHogar    — 1 por familia (anclada al Registro del jefe)
--   · CaracterizacionPersona  — 1 por censado (consultable por persona)
--  + índices por refugio/fecha (listas y ETag) + trigger BEFORE UPDATE que
--    refresca syncedAt (para el validador ETag, igual que Registro/ConsultaMedica).
--
--  Los nombres de tablas/columnas/índices COINCIDEN con los que genera Prisma
--  (schema.prisma) para que no haya drift. Las opciones se cargan aparte con
--  prisma/seed_caracterizacion_opciones.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Catálogo general de opciones ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CaracterizacionOpcion" (
  "id"        TEXT NOT NULL,
  "modulo"    TEXT NOT NULL,
  "campo"     TEXT NOT NULL,
  "valor"     TEXT NOT NULL,
  "orden"     INTEGER NOT NULL DEFAULT 0,
  "activo"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaracterizacionOpcion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CaracterizacionOpcion_modulo_campo_valor_key"
  ON "CaracterizacionOpcion" ("modulo", "campo", "valor");
CREATE INDEX IF NOT EXISTS "CaracterizacionOpcion_modulo_campo_idx"
  ON "CaracterizacionOpcion" ("modulo", "campo");

-- ── 2) Hogar (1 por familia) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CaracterizacionHogar" (
  "id"                  TEXT NOT NULL,
  "jefeRegistroId"      TEXT NOT NULL,
  "familiaCedula"       TEXT NOT NULL,
  "refugio"             TEXT NOT NULL,
  "fechaIngresoRefugio" TIMESTAMP(3),
  "gpsViviendaLat"      DOUBLE PRECISION,
  "gpsViviendaLng"      DOUBLE PRECISION,
  "tenenciaId"          TEXT,
  "misionVivienda"      TEXT,
  "tipoViviendaId"      TEXT,
  "materialId"          TEXT,
  "nivelDanoId"         TEXT,
  "estadoEnseresId"     TEXT,
  "servicioAfectadoIds" JSONB DEFAULT '[]',
  "riesgoEntornoIds"    JSONB DEFAULT '[]',
  "rangoIngresoId"      TEXT,
  "recibeRemesas"       TEXT,
  "recibeClap"          TEXT,
  "accesoPatriaId"      TEXT,
  "recibeBonosPatria"   TEXT,
  "bonoContingenciaId"  TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "syncedAt"            TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaracterizacionHogar_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CaracterizacionHogar_jefeRegistroId_key"
  ON "CaracterizacionHogar" ("jefeRegistroId");
CREATE INDEX IF NOT EXISTS "CaracterizacionHogar_refugio_createdAt_idx"
  ON "CaracterizacionHogar" ("refugio", "createdAt");

-- ── 3) Persona (1 por censado) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CaracterizacionPersona" (
  "id"                     TEXT NOT NULL,
  "registroId"             TEXT NOT NULL,
  "cedula"                 TEXT NOT NULL,
  "familiaCedula"          TEXT NOT NULL,
  "refugio"                TEXT NOT NULL,
  "estadoCivilId"          TEXT,
  "correo"                 TEXT,
  "telefonoAlt"            TEXT,
  "parentescoId"           TEXT,
  "asisteEscuela"          TEXT,
  "vulnerabilidadId"       TEXT,
  "grupoSanguineoId"       TEXT,
  "alergiaIds"             JSONB DEFAULT '[]',
  "discapacidad"           TEXT,
  "discapacidadTipoId"     TEXT,
  "discapacidadDesc"       TEXT,
  "vacunaAntitetanicaId"   TEXT,
  "saludMental"            TEXT,
  "requiereAtencion"       TEXT,
  "detalleAtencion"        TEXT,
  "semanasGestacion"       INTEGER,
  "pesoKg"                 DOUBLE PRECISION,
  "estaturaCm"             DOUBLE PRECISION,
  "tallaCamisaId"          TEXT,
  "tallaPantalonId"        TEXT,
  "tallaCalzadoId"         TEXT,
  "necesidadIds"           JSONB DEFAULT '[]',
  "nivelEducativoId"       TEXT,
  "impactoLaboralId"       TEXT,
  "sectorEconomicoId"      TEXT,
  "oficioId"               TEXT,
  "aniosExperiencia"       INTEGER,
  "rescatoHerramientas"    TEXT,
  "aptitudFisicaLaboralId" TEXT,
  "disponibilidadId"       TEXT,
  "puedeTrabajarInmediato" TEXT,
  "validacionDestreza"     TEXT NOT NULL DEFAULT 'PENDIENTE',
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "syncedAt"               TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaracterizacionPersona_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CaracterizacionPersona_registroId_key"
  ON "CaracterizacionPersona" ("registroId");
CREATE INDEX IF NOT EXISTS "CaracterizacionPersona_refugio_createdAt_idx"
  ON "CaracterizacionPersona" ("refugio", "createdAt");
CREATE INDEX IF NOT EXISTS "CaracterizacionPersona_cedula_idx"
  ON "CaracterizacionPersona" ("cedula");
CREATE INDEX IF NOT EXISTS "CaracterizacionPersona_refugio_familiaCedula_idx"
  ON "CaracterizacionPersona" ("refugio", "familiaCedula");

-- ── 4) Trigger BEFORE UPDATE: refresca syncedAt en cada cambio (ETag) ──────
CREATE OR REPLACE FUNCTION bump_synced_at() RETURNS TRIGGER AS $$
BEGIN
  NEW."syncedAt" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_hogar_synced ON "CaracterizacionHogar";
CREATE TRIGGER trg_bump_hogar_synced
BEFORE UPDATE ON "CaracterizacionHogar"
FOR EACH ROW EXECUTE FUNCTION bump_synced_at();

DROP TRIGGER IF EXISTS trg_bump_persona_synced ON "CaracterizacionPersona";
CREATE TRIGGER trg_bump_persona_synced
BEFORE UPDATE ON "CaracterizacionPersona"
FOR EACH ROW EXECUTE FUNCTION bump_synced_at();
