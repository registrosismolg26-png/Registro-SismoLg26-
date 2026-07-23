-- ═══════════════════════════════════════════════════════════════════════════
--  MIGRA el scope de comunidades de `refugio` (NOMBRE, ya ejecutado antes) a
--  `refugioId` (ID del Refugio, estable). Idempotente. Ejecutar en Supabase.
--
--  Parte del estado dejado por el SQL anterior:
--    · existe la columna "Comunidad.refugio" (texto con el nombre del campamento)
--    · las comunidades existentes tienen refugio='Mare Abajo 2'
--    · las 9 de MONTESANO tienen refugio='MONTESANO VICTORIOSO'
--  Resultado: cada comunidad queda ligada por refugioId = "Refugio".id.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Nueva columna por ID
ALTER TABLE "Comunidad" ADD COLUMN IF NOT EXISTS "refugioId" TEXT;

-- 2) Backfill: resolver el id del Refugio a partir del NOMBRE guardado en `refugio`
--    (tolerante a mayúsculas/espacios). Re-ejecutable: solo toca las que aún no tienen id.
UPDATE "Comunidad" c
   SET "refugioId" = r."id"
  FROM "Refugio" r
 WHERE c."refugioId" IS NULL
   AND c."refugio" IS NOT NULL
   AND upper(trim(r."nombre")) = upper(trim(c."refugio"));

-- 3) Índices nuevos por refugioId; quitar el unique viejo por `refugio`.
CREATE UNIQUE INDEX IF NOT EXISTS "Comunidad_nombre_parroquia_refugioId_key"
  ON "Comunidad" ("nombre", "parroquia", "refugioId");
CREATE INDEX IF NOT EXISTS "Comunidad_refugioId_parroquia_idx"
  ON "Comunidad" ("refugioId", "parroquia");
DROP INDEX IF EXISTS "Comunidad_nombre_parroquia_refugio_key";

-- 4) La columna vieja "refugio" (nombre) se DEJA como respaldo legible. Es inofensiva
--    (el código ya usa refugioId). Cuando confirmes que no queda nada en NULL, puedes
--    borrarla a mano:  ALTER TABLE "Comunidad" DROP COLUMN IF EXISTS "refugio";

-- ── Verificación ─────────────────────────────────────────────────────────────
--  Cuántas comunidades por campamento (ya por id):
--    SELECT r.nombre AS campamento, count(*) FROM "Comunidad" c
--      JOIN "Refugio" r ON r.id = c."refugioId" GROUP BY r.nombre ORDER BY r.nombre;
--
--  ⚠️ Si esto devuelve > 0, hay comunidades cuyo campamento NO existe aún en "Refugio"
--    (típico: MONTESANO VICTORIOSO sin crear). Crea el campamento (app: Master →
--    Configuración → nuevo, tipo Itinerante) y RE-EJECUTA el paso 2:
--    SELECT c.refugio, count(*) FROM "Comunidad" c WHERE c."refugioId" IS NULL GROUP BY c.refugio;
