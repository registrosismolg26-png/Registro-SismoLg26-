-- ═══════════════════════════════════════════════════════════════════════════
--  Migración idempotente — Reporte público compartido por link + auditoría
--  Ejecutar manualmente en Supabase (re-ejecutable sin romper).
--
--  ReporteCompartido: un link público (/reporte/<id>) que muestra SOLO
--    estadísticas AGREGADAS del refugio (sin datos personales). refugio NULL =
--    consolidado de todos (solo lo crea Master).
--  ReporteAcceso: auditoría de CADA apertura (con o sin ubicación). Sin
--    ubicación el reporte no se muestra, pero el intento queda registrado.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "ReporteCompartido" (
  "id"              TEXT        NOT NULL,
  "refugio"         TEXT,
  "creadoPor"       TEXT        NOT NULL,
  "creadoPorNombre" TEXT        NOT NULL,
  "activo"          BOOLEAN     NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReporteCompartido_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ReporteCompartido_creadoPor_idx" ON "ReporteCompartido" ("creadoPor");

CREATE TABLE IF NOT EXISTS "ReporteAcceso" (
  "id"                 TEXT        NOT NULL,
  "reporteId"          TEXT        NOT NULL,
  "ip"                 TEXT,
  "userAgent"          TEXT,
  "lat"                DOUBLE PRECISION,
  "lng"                DOUBLE PRECISION,
  "precision"          DOUBLE PRECISION,
  "ubicacionConcedida" BOOLEAN     NOT NULL DEFAULT false,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReporteAcceso_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ReporteAcceso_reporteId_idx" ON "ReporteAcceso" ("reporteId");

-- FK con borrado en cascada (si se elimina el link, se borran sus accesos).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ReporteAcceso_reporteId_fkey'
  ) THEN
    ALTER TABLE "ReporteAcceso"
      ADD CONSTRAINT "ReporteAcceso_reporteId_fkey"
      FOREIGN KEY ("reporteId") REFERENCES "ReporteCompartido"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
