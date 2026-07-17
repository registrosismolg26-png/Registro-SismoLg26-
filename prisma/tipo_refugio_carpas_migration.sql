-- ============================================================================
-- Tipos de refugio (Transitorio/Itinerante/Mixto) + catálogos Comunidad y TipoCarpa.
-- IDEMPOTENTE: re-ejecutable sin romper. Correr MANUALMENTE en Supabase (SQL editor).
-- No se corre prisma migrate/db push automático contra producción.
-- ============================================================================

-- 1) Tipo de campamento en Refugio. Todos los existentes quedan 'TRANSITORIO'.
ALTER TABLE "Refugio" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'TRANSITORIO';

-- 2) Catálogo de COMUNIDADES (por parroquia). Refugios Itinerante/Mixto.
CREATE TABLE IF NOT EXISTS "Comunidad" (
  "id"        TEXT NOT NULL,
  "nombre"    TEXT NOT NULL,
  "parroquia" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Comunidad_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Comunidad_nombre_parroquia_key" ON "Comunidad"("nombre", "parroquia");
CREATE INDEX IF NOT EXISTS "Comunidad_parroquia_idx" ON "Comunidad"("parroquia");

-- 3) Catálogo de TIPOS DE CARPA.
CREATE TABLE IF NOT EXISTS "TipoCarpa" (
  "id"        TEXT NOT NULL,
  "nombre"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TipoCarpa_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TipoCarpa_nombre_key" ON "TipoCarpa"("nombre");

-- 4) Carga inicial (idempotente). Las comunidades → parroquia 'CARLOS SOUBLETTE'
--    (debe coincidir EXACTO con la lista PARROQUIAS del censo para que el filtro cuadre).
--    Se pueden agregar más luego desde Config (Master).
INSERT INTO "Comunidad" ("id", "nombre", "parroquia") VALUES
  (gen_random_uuid(), 'Mare I',        'CARLOS SOUBLETTE'),
  (gen_random_uuid(), 'Mare Abajo II', 'CARLOS SOUBLETTE'),
  (gen_random_uuid(), 'Algarín',       'CARLOS SOUBLETTE'),
  (gen_random_uuid(), 'Cabo Blanco',   'CARLOS SOUBLETTE'),
  (gen_random_uuid(), 'Ana Merlo',     'CARLOS SOUBLETTE'),
  (gen_random_uuid(), 'Nueva Luz',     'CARLOS SOUBLETTE'),
  (gen_random_uuid(), 'Villamar',      'CARLOS SOUBLETTE')
ON CONFLICT ("nombre", "parroquia") DO NOTHING;

INSERT INTO "TipoCarpa" ("id", "nombre") VALUES
  (gen_random_uuid(), 'Carpa Central 1'),
  (gen_random_uuid(), 'Carpa Familiar'),
  (gen_random_uuid(), 'Carpa ONU 1')
ON CONFLICT ("nombre") DO NOTHING;
