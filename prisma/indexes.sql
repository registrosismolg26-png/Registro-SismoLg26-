-- ═══════════════════════════════════════════════════════════════════════════
--  Índices de rendimiento — lecturas scoped por refugio ordenadas por fecha
--  Idempotente (re-ejecutable). Ejecutar MANUALMENTE en Supabase.
--
--  Acompañan a los @@index([refugio, createdAt]) agregados en prisma/schema.prisma.
--  Los nombres coinciden EXACTO con los que genera Prisma, para que no haya drift
--  (si algún día se corriera `prisma migrate diff`, no querría recrearlos).
--
--  Qué mejoran: GET /api/registros y GET /api/consultas filtran por "refugio" y
--  ordenan por "createdAt"; y el validador ETag hace COUNT/MAX sobre ese mismo
--  ámbito. Con el índice compuesto se evita el seq-scan de toda la tabla.
--
--  Nota: las tablas son chicas (Registro ~1.800, ConsultaMedica ~500), así que
--  crear el índice es prácticamente instantáneo y el lock es despreciable (por eso
--  no hace falta CREATE INDEX CONCURRENTLY).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS "Registro_refugio_createdAt_idx"
  ON "Registro" ("refugio", "createdAt");

CREATE INDEX IF NOT EXISTS "ConsultaMedica_refugio_createdAt_idx"
  ON "ConsultaMedica" ("refugio", "createdAt");

-- Verificación (opcional):
-- SELECT indexname FROM pg_indexes
--  WHERE tablename IN ('Registro','ConsultaMedica') ORDER BY indexname;
