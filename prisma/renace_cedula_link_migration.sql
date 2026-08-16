-- ─────────────────────────────────────────────────────────────────────────────
-- VZLA RENACE — "la CÉDULA del jefe MANDA" + cédulas SOLO DÍGITOS (Miembros + Planteamiento)
-- Correr MANUALMENTE en Supabase (SQL Editor). Es IDEMPOTENTE: re-ejecutable sin romper.
-- El `jefeNro` se conserva como referencia; el vínculo real es la cédula del jefe.
-- IMPORTANTE: correr ESTO antes de desplegar el código nuevo (o el módulo no verá el vínculo).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Columnas nuevas (nullable; no rompe datos existentes).
ALTER TABLE "RenaceMiembro"       ADD COLUMN IF NOT EXISTS "jefeCedula" TEXT;
ALTER TABLE "RenacePlanteamiento" ADD COLUMN IF NOT EXISTS "jefeCedula" TEXT;

-- 2) NORMALIZAR todas las cédulas a SOLO DÍGITOS (quita espacios, guiones, puntos y letras
--    como V/E). `~ '\D'` = solo toca filas que tengan algún carácter no-dígito (idempotente).
UPDATE "RenaceJefe"          SET "cedula"           = regexp_replace("cedula", '\D', '', 'g')           WHERE "cedula" ~ '\D';
UPDATE "RenaceMiembro"       SET "cedula"           = regexp_replace("cedula", '\D', '', 'g')           WHERE "cedula" ~ '\D';
UPDATE "RenacePlanteamiento" SET "cedulaContraparte" = regexp_replace("cedulaContraparte", '\D', '', 'g') WHERE "cedulaContraparte" ~ '\D';

-- 3) BACKFILL: `jefeCedula` = la cédula (YA normalizada) del jefe (match por nro + refugio).
UPDATE "RenaceMiembro" m
SET "jefeCedula" = j."cedula"
FROM "RenaceJefe" j
WHERE j."nro" = m."jefeNro"
  AND j."refugioId" = m."refugioId"
  AND m."jefeCedula" IS DISTINCT FROM j."cedula";

UPDATE "RenacePlanteamiento" p
SET "jefeCedula" = j."cedula"
FROM "RenaceJefe" j
WHERE j."nro" = p."jefeNro"
  AND j."refugioId" = p."refugioId"
  AND p."jefeCedula" IS DISTINCT FROM j."cedula";

-- 3b) Por si un backfill PREVIO dejó `jefeCedula` con formato, normalizarlo también.
UPDATE "RenaceMiembro"       SET "jefeCedula" = regexp_replace("jefeCedula", '\D', '', 'g') WHERE "jefeCedula" ~ '\D';
UPDATE "RenacePlanteamiento" SET "jefeCedula" = regexp_replace("jefeCedula", '\D', '', 'g') WHERE "jefeCedula" ~ '\D';

-- 4) Índice para lecturas por cédula del jefe (nombre = el que espera Prisma).
CREATE INDEX IF NOT EXISTS "RenaceMiembro_refugioId_jefeCedula_idx"
  ON "RenaceMiembro" ("refugioId", "jefeCedula");

-- 5) Nuevo ANCLA ÚNICO del planteamiento por (jefeCedula, refugioId). Se MANTIENE el
--    unique viejo por (jefeNro, refugioId) durante la transición (sin ventana rota).
--    Las filas con jefeCedula NULL no chocan (Postgres trata NULL como distinto).
--    NOTA: si falla con "could not create unique index", hay planteamientos con la MISMA
--    cédula de jefe en un mismo refugio (dato a revisar). Detectarlos con:
--      SELECT "refugioId","jefeCedula",COUNT(*) FROM "RenacePlanteamiento"
--      WHERE "jefeCedula" IS NOT NULL GROUP BY 1,2 HAVING COUNT(*)>1;
CREATE UNIQUE INDEX IF NOT EXISTS "RenacePlanteamiento_jefeCedula_refugioId_key"
  ON "RenacePlanteamiento" ("jefeCedula", "refugioId");
