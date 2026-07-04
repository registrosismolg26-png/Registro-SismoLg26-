-- ─────────────────────────────────────────────────────────────────────────────
-- LIMPIEZA de catálogos: elimina duplicados Título/MAYÚSCULAS y deja TODO en
-- MAYÚSCULAS. IDEMPOTENTE y re-ejecutable.
--
-- Causa: en la BD quedaron filas de un AUTO-SEED viejo (nombres en Título/acentos:
-- 10 medicamentos y las 129 patologías generales); los seeds nuevos insertaron el
-- catálogo en MAYÚSCULAS y, como `ON CONFLICT` solo salta coincidencias EXACTAS, no
-- borran lo viejo → quedaron duplicados que difieren solo en mayúsculas/acentos.
--
-- Esta limpieza PRESERVA los ids de las filas que se conservan, por lo que NO rompe
-- las vinculaciones por id (Registro.patologiaIds / medicamentoIds, ConsultaMedica).
-- Recomendado: hacer un respaldo (Supabase PITR) antes de correrlo.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) MEDICAMENTOS: borra el viejo auto-seed. El catálogo del xlsx es todo MAYÚSCULAS
--    sin acentos; cualquier fila con minúsculas/acentos es del auto-seed obsoleto.
--    (Si algún AdminMedico agregó medicamentos en minúsculas, re-agrégalos luego.)
DELETE FROM "MedicamentoPredefinido" WHERE "nombre" <> UPPER("nombre");

-- 2) PATOLOGÍAS
-- 2a) Quita comas de los nombres (no deben separar por coma).
UPDATE "Patologia" SET "nombre" = TRIM(REGEXP_REPLACE("nombre", '\s*,\s*', ' ', 'g')) WHERE "nombre" LIKE '%,%';

-- 2b) Cuando un nombre existe en MAYÚSCULAS (nuevo, CIE) y también en versión mixta
--     (histórico, referenciado por el backfill de censos), borra el de MAYÚSCULAS y
--     conserva el histórico (mantiene su id y sus referencias).
DELETE FROM "Patologia" a USING "Patologia" b
WHERE a.id <> b.id
  AND UPPER(a."nombre") = UPPER(b."nombre")
  AND a."nombre" = UPPER(a."nombre")     -- a: MAYÚSCULAS (duplicado nuevo)
  AND b."nombre" <> UPPER(b."nombre");   -- b: mixto (histórico) → se conserva

-- 2c) Normaliza el resto a MAYÚSCULAS in-place (ya sin colisiones). Los ids no cambian,
--     así que las referencias por id siguen válidas.
UPDATE "Patologia" SET "nombre" = UPPER("nombre") WHERE "nombre" <> UPPER("nombre");

-- Verificación opcional (deberían dar 0 filas):
--   SELECT UPPER("nombre") n, COUNT(*) FROM "Patologia" GROUP BY 1 HAVING COUNT(*) > 1;
--   SELECT "nombre" FROM "MedicamentoPredefinido" WHERE "nombre" <> UPPER("nombre");
