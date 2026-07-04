-- ═══════════════════════════════════════════════════════════════════════════
--  Migración idempotente — Lesiones/heridas/curas + fecha-hora manual de consulta
--  Ejecutar manualmente en Supabase (re-ejecutable sin romper).
--
--  1) Catálogo TipoLesion (administrable por AdminMedico, análogo a Patologia).
--  2) ConsultaMedica: `fechaConsulta` (fecha-hora REAL, elegida a mano) y
--     `lesiones` (JSON: [{ tipoId, zona, estado, cura }]).
--  3) Semilla de tipos de lesión comunes (idempotente; el dueño puede editar/agregar
--     más desde Configuración → Catálogos Médicos).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Catálogo de tipos de lesión
CREATE TABLE IF NOT EXISTS "TipoLesion" (
  "id"        TEXT        NOT NULL,
  "nombre"    TEXT        NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TipoLesion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TipoLesion_nombre_key" ON "TipoLesion" ("nombre");

-- 2) Columnas nuevas en ConsultaMedica
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "fechaConsulta" TIMESTAMP(3);
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "lesiones" JSONB DEFAULT '[]';

-- 3) Semilla de tipos de lesión comunes (re-ejecutable)
INSERT INTO "TipoLesion" ("id", "nombre") VALUES
  (gen_random_uuid(), 'Herida cortante'),
  (gen_random_uuid(), 'Herida punzante'),
  (gen_random_uuid(), 'Herida contusa'),
  (gen_random_uuid(), 'Herida por arma de fuego'),
  (gen_random_uuid(), 'Laceración'),
  (gen_random_uuid(), 'Abrasión / raspón'),
  (gen_random_uuid(), 'Contusión / hematoma'),
  (gen_random_uuid(), 'Quemadura de primer grado'),
  (gen_random_uuid(), 'Quemadura de segundo grado'),
  (gen_random_uuid(), 'Quemadura de tercer grado'),
  (gen_random_uuid(), 'Úlcera por presión (escara)'),
  (gen_random_uuid(), 'Úlcera varicosa'),
  (gen_random_uuid(), 'Absceso'),
  (gen_random_uuid(), 'Mordedura'),
  (gen_random_uuid(), 'Picadura'),
  (gen_random_uuid(), 'Esguince'),
  (gen_random_uuid(), 'Luxación'),
  (gen_random_uuid(), 'Fractura expuesta'),
  (gen_random_uuid(), 'Amputación'),
  (gen_random_uuid(), 'Dermatitis / erupción')
ON CONFLICT ("nombre") DO NOTHING;
