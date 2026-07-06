-- ============================================================================
-- backfill_embarazo_from_consultas.sql   (IDEMPOTENTE — correr manual en Supabase)
-- ============================================================================
-- Recorre las consultas de morbilidad POR CÉDULA y, según la EVOLUCIÓN de la
-- persona, marca "Registro"."embarazo" = 'SI' en el censo. Reglas:
--   1. Manda la consulta EXPLÍCITA más reciente con embarazo no nulo:
--        · 'SI' → se marca SI en el censo.
--        · 'NO' → NO se marca (post-parto / ya no embarazada). No se desmarca nada.
--   2. Si NUNCA hubo un valor explícito, cualquier consulta con una patología de
--      "embarazo" (en antecedentes O diagnóstico) marca SI (respaldo de datos legados).
--   3. Solo aplica a mujeres (genero = 'FEMENINO').
-- Es idempotente: solo AÑADE 'SI' donde corresponde y omite las filas ya marcadas;
-- re-ejecutarla no cambia nada. NO desmarca a nadie (conservador).
--
-- La cédula se compara por SÓLO DÍGITOS (ignora 'V-', puntos, espacios, etc.).
-- ============================================================================

-- 0) Columnas necesarias (no-op si ya existen; hace el script auto-contenido).
ALTER TABLE "Registro"       ADD COLUMN IF NOT EXISTS "embarazo" TEXT;
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "embarazo" TEXT;
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "antecedentesPatologiaIds" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "ConsultaMedica" ADD COLUMN IF NOT EXISTS "diagnosticoPatologiaIds"  JSONB DEFAULT '[]'::jsonb;

-- 1) Backfill.
WITH emb_pat AS (
  -- IDs de patologías cuyo nombre contiene "embarazo" (control, supervisión, ectópico, etc.).
  SELECT id FROM "Patologia" WHERE nombre ILIKE '%embarazo%'
),
consulta_flags AS (
  SELECT
    regexp_replace(c.cedula, '[^0-9]', '', 'g')                     AS ced_digits,
    c."embarazo"                                                     AS emb_explicit,
    COALESCE(c."fechaConsulta", c."createdAt")                       AS fecha,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
             COALESCE(c."antecedentesPatologiaIds", '[]'::jsonb)
             || COALESCE(c."diagnosticoPatologiaIds",  '[]'::jsonb)
           ) AS elems(pid)
      JOIN emb_pat ep ON ep.id::text = elems.pid
    )                                                                AS emb_by_pat
  FROM "ConsultaMedica" c
  WHERE c.cedula IS NOT NULL
    AND regexp_replace(c.cedula, '[^0-9]', '', 'g') <> ''
),
per_ced AS (
  SELECT
    ced_digits,
    bool_or(emb_by_pat)                                                                       AS has_emb_pat,
    (ARRAY_AGG(emb_explicit ORDER BY fecha DESC) FILTER (WHERE emb_explicit IS NOT NULL))[1]  AS latest_emb
  FROM consulta_flags
  GROUP BY ced_digits
)
UPDATE "Registro" r
SET "embarazo" = 'SI'
FROM per_ced p
WHERE regexp_replace(r.cedula, '[^0-9]', '', 'g') = p.ced_digits
  AND UPPER(COALESCE(r.genero, '')) = 'FEMENINO'
  AND (p.latest_emb = 'SI' OR (p.latest_emb IS NULL AND p.has_emb_pat))
  AND (r."embarazo" IS DISTINCT FROM 'SI');

-- 2) (Opcional) Verificación — cuántas mujeres del censo quedaron marcadas embarazadas:
--    SELECT COUNT(*) FROM "Registro" WHERE "embarazo" = 'SI' AND UPPER(genero) = 'FEMENINO';
