-- ═══════════════════════════════════════════════════════════════════════════
--  Registro.retirado: normalizar nulos/vacíos a 'NO' y que la BD lo garantice.
--  Idempotente. Ejecutar MANUALMENTE en Supabase.
--
--  Por qué: las estadísticas del servidor cuentan `retirado = 'NO'` EXACTO, así que
--  una fila con retirado nulo/vacío no se cuenta ni como presente ni como retirada
--  (desaparece de los totales y descuadra el cuadro por comunidad). El schema de
--  Prisma ya declara @default("NO"); esto alinea la BD con el schema.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Normalizar las filas existentes (toca syncedAt para que los clientes refresquen)
UPDATE "Registro"
   SET "retirado" = 'NO',
       "syncedAt" = now()
 WHERE "retirado" IS NULL OR trim("retirado") = '';

-- 2) Garantizarlo a futuro en la propia BD
ALTER TABLE "Registro" ALTER COLUMN "retirado" SET DEFAULT 'NO';
ALTER TABLE "Registro" ALTER COLUMN "retirado" SET NOT NULL;

-- Verificación (no debe quedar '(nulo)' ni vacío):
--   SELECT COALESCE(NULLIF(trim("retirado"), ''), '(nulo)') AS retirado, count(*)
--     FROM "Registro" GROUP BY 1 ORDER BY 2 DESC;
