-- ═══════════════════════════════════════════════════════════════════════════
--  QR habitable + QR de colapso + Visita de la Comisión Presidencial,
--  vinculados al REGISTRO DEL JEFE de familia (censo ITINERANTE/MIXTO, Paso 5).
--
--  Tabla aparte (1:1 con "Registro") para no engordar GET /api/registros con blobs
--  JSON. Todo es opcional. Se borra en cascada con el registro del jefe.
--  Idempotente (re-ejecutable). Ejecutar en Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "RegistroVivienda" (
  "id"               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "registroId"       TEXT NOT NULL,
  "refugio"          TEXT NOT NULL,
  "habitableUrl"     TEXT,
  "habitableData"    JSONB,
  "colapsoUrl"       TEXT,
  "colapsoData"      JSONB,
  "comisionEtiqueta" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "RegistroVivienda_registroId_key" ON "RegistroVivienda" ("registroId");
CREATE INDEX IF NOT EXISTS "RegistroVivienda_refugio_idx" ON "RegistroVivienda" ("refugio");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RegistroVivienda_registroId_fkey'
  ) THEN
    ALTER TABLE "RegistroVivienda"
      ADD CONSTRAINT "RegistroVivienda_registroId_fkey"
      FOREIGN KEY ("registroId") REFERENCES "Registro"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RegistroVivienda_comisionEtiqueta_check'
  ) THEN
    ALTER TABLE "RegistroVivienda"
      ADD CONSTRAINT "RegistroVivienda_comisionEtiqueta_check"
      CHECK ("comisionEtiqueta" IS NULL OR "comisionEtiqueta" IN ('VERDE','AMARILLA','ROJA','NEGRA'));
  END IF;
END $$;

-- ── Verificación ─────────────────────────────────────────────────────────────
--    SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name = 'RegistroVivienda' ORDER BY ordinal_position;
