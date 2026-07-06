-- ============================================================================
-- migrate_cedula_por_refugio.sql   (IDEMPOTENTE — correr manual en Supabase)
-- ============================================================================
-- Cambia la unicidad de la cédula: de GLOBAL a POR CAMPAMENTO (cedula, refugio).
-- Habilita el "traslado": una persona puede figurar RETIRADA en su campamento de
-- origen y ACTIVA (nueva fila) en el destino. Antes, la cédula única global lo
-- impedía (una sola fila por persona en toda la BD).
--
-- Prerrequisito: como HOY la cédula es única global, no existen dos filas con la
-- misma cédula, así que el índice compuesto se crea sin conflicto.
-- ============================================================================

-- 1) Quitar la unicidad GLOBAL de cedula (el índice/constraint que Prisma crea
--    para @unique). Se cubren ambos casos (índice o constraint) con IF EXISTS.
ALTER TABLE "Registro" DROP CONSTRAINT IF EXISTS "Registro_cedula_key";
DROP INDEX IF EXISTS "Registro_cedula_key";

-- 2) Unicidad COMPUESTA (cedula, refugio) — una fila por persona por campamento.
--    Nombre que espera Prisma para @@unique([cedula, refugio]).
CREATE UNIQUE INDEX IF NOT EXISTS "Registro_cedula_refugio_key" ON "Registro" (cedula, refugio);

-- 3) Índice de apoyo para localizar por cédula entre campamentos (traslados).
CREATE INDEX IF NOT EXISTS "Registro_cedula_idx" ON "Registro" (cedula);

-- Verificación (opcional): no debería haber cédulas ACTIVAS duplicadas entre campamentos.
--   SELECT cedula, COUNT(*) FROM "Registro" WHERE retirado <> 'SI'
--   GROUP BY cedula HAVING COUNT(*) > 1;
