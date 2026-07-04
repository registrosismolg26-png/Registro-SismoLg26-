-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill de datos legados → IDs (match EXACTO por nombre). IDEMPOTENTE.
-- Ejecutar DESPUÉS de: migrate_db_medicamentos_v2.sql + seed_patologias_cie.sql + seed_medicamentos.sql
-- Solo toca filas cuya columna ID-nativa sigue vacía ('[]'). Los nombres NO coincidentes
-- (o medicamentos ambiguos: un nombre → varias presentaciones) NO se enlazan y aparecen en
-- report_unmatched.sql. Las columnas viejas quedan intactas como respaldo.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Registro.patologiaDescripcion (nombres unidos por coma) → patologiaIds (["id", ...])
UPDATE "Registro" r
SET "patologiaIds" = sub.ids
FROM (
  SELECT x.id, jsonb_agg(p."id" ORDER BY x.ord) AS ids
  FROM (
    SELECT r2."id", TRIM(tok) AS nombre, ord
    FROM "Registro" r2,
         LATERAL unnest(string_to_array(r2."patologiaDescripcion", ',')) WITH ORDINALITY AS u(tok, ord)
    WHERE r2."patologiaDescripcion" IS NOT NULL AND btrim(r2."patologiaDescripcion") <> ''
      AND (r2."patologiaIds" IS NULL OR r2."patologiaIds" = '[]'::jsonb)
  ) x
  JOIN "Patologia" p ON p."nombre" = x.nombre
  GROUP BY x.id
) sub
WHERE r."id" = sub.id;

-- 2) Registro.medicamentos ([{nombre,dosis,periodo}]) → medicamentoIds ([{id,dosis,periodo}])
WITH mp_unique AS (
  SELECT "nombre", MIN("id") AS id
  FROM "MedicamentoPredefinido"
  GROUP BY "nombre"
  HAVING COUNT(*) = 1            -- solo principios sin ambigüedad de presentación
)
UPDATE "Registro" r
SET "medicamentoIds" = sub.items
FROM (
  SELECT x.id,
         jsonb_agg(jsonb_build_object('id', mu.id, 'dosis', x.dosis, 'periodo', x.periodo) ORDER BY x.ord) AS items
  FROM (
    SELECT r2."id", TRIM(e->>'nombre') AS nombre,
           COALESCE(e->>'dosis','') AS dosis, COALESCE(e->>'periodo','') AS periodo, ord
    FROM "Registro" r2,
         LATERAL jsonb_array_elements(r2."medicamentos") WITH ORDINALITY AS ae(e, ord)
    WHERE jsonb_typeof(r2."medicamentos") = 'array' AND jsonb_array_length(r2."medicamentos") > 0
      AND (r2."medicamentoIds" IS NULL OR r2."medicamentoIds" = '[]'::jsonb)
  ) x
  JOIN mp_unique mu ON mu."nombre" = x.nombre
  GROUP BY x.id
) sub
WHERE r."id" = sub.id;

-- 3) ConsultaMedica.antecedentesPatologia → antecedentesPatologiaIds
UPDATE "ConsultaMedica" c
SET "antecedentesPatologiaIds" = sub.ids
FROM (
  SELECT x.id, jsonb_agg(p."id" ORDER BY x.ord) AS ids
  FROM (
    SELECT c2."id", TRIM(tok) AS nombre, ord
    FROM "ConsultaMedica" c2,
         LATERAL unnest(string_to_array(c2."antecedentesPatologia", ',')) WITH ORDINALITY AS u(tok, ord)
    WHERE c2."antecedentesPatologia" IS NOT NULL AND btrim(c2."antecedentesPatologia") <> ''
      AND (c2."antecedentesPatologiaIds" IS NULL OR c2."antecedentesPatologiaIds" = '[]'::jsonb)
  ) x
  JOIN "Patologia" p ON p."nombre" = x.nombre
  GROUP BY x.id
) sub
WHERE c."id" = sub.id;

-- 4) ConsultaMedica.diagnosticoPatologia → diagnosticoPatologiaIds
UPDATE "ConsultaMedica" c
SET "diagnosticoPatologiaIds" = sub.ids
FROM (
  SELECT x.id, jsonb_agg(p."id" ORDER BY x.ord) AS ids
  FROM (
    SELECT c2."id", TRIM(tok) AS nombre, ord
    FROM "ConsultaMedica" c2,
         LATERAL unnest(string_to_array(c2."diagnosticoPatologia", ',')) WITH ORDINALITY AS u(tok, ord)
    WHERE c2."diagnosticoPatologia" IS NOT NULL AND btrim(c2."diagnosticoPatologia") <> ''
      AND (c2."diagnosticoPatologiaIds" IS NULL OR c2."diagnosticoPatologiaIds" = '[]'::jsonb)
  ) x
  JOIN "Patologia" p ON p."nombre" = x.nombre
  GROUP BY x.id
) sub
WHERE c."id" = sub.id;

-- 5) ConsultaMedica.antecedentesMedicamentos → antecedentesMedicamentoIds
WITH mp_unique AS (
  SELECT "nombre", MIN("id") AS id FROM "MedicamentoPredefinido" GROUP BY "nombre" HAVING COUNT(*) = 1
)
UPDATE "ConsultaMedica" c
SET "antecedentesMedicamentoIds" = sub.items
FROM (
  SELECT x.id, jsonb_agg(jsonb_build_object('id', mu.id, 'dosis', x.dosis, 'periodo', x.periodo) ORDER BY x.ord) AS items
  FROM (
    SELECT c2."id", TRIM(e->>'nombre') AS nombre,
           COALESCE(e->>'dosis','') AS dosis, COALESCE(e->>'periodo','') AS periodo, ord
    FROM "ConsultaMedica" c2,
         LATERAL jsonb_array_elements(c2."antecedentesMedicamentos") WITH ORDINALITY AS ae(e, ord)
    WHERE jsonb_typeof(c2."antecedentesMedicamentos") = 'array' AND jsonb_array_length(c2."antecedentesMedicamentos") > 0
      AND (c2."antecedentesMedicamentoIds" IS NULL OR c2."antecedentesMedicamentoIds" = '[]'::jsonb)
  ) x
  JOIN mp_unique mu ON mu."nombre" = x.nombre
  GROUP BY x.id
) sub
WHERE c."id" = sub.id;

-- 6) ConsultaMedica.diagnosticoMedicamentos → diagnosticoMedicamentoIds
WITH mp_unique AS (
  SELECT "nombre", MIN("id") AS id FROM "MedicamentoPredefinido" GROUP BY "nombre" HAVING COUNT(*) = 1
)
UPDATE "ConsultaMedica" c
SET "diagnosticoMedicamentoIds" = sub.items
FROM (
  SELECT x.id, jsonb_agg(jsonb_build_object('id', mu.id, 'dosis', x.dosis, 'periodo', x.periodo) ORDER BY x.ord) AS items
  FROM (
    SELECT c2."id", TRIM(e->>'nombre') AS nombre,
           COALESCE(e->>'dosis','') AS dosis, COALESCE(e->>'periodo','') AS periodo, ord
    FROM "ConsultaMedica" c2,
         LATERAL jsonb_array_elements(c2."diagnosticoMedicamentos") WITH ORDINALITY AS ae(e, ord)
    WHERE jsonb_typeof(c2."diagnosticoMedicamentos") = 'array' AND jsonb_array_length(c2."diagnosticoMedicamentos") > 0
      AND (c2."diagnosticoMedicamentoIds" IS NULL OR c2."diagnosticoMedicamentoIds" = '[]'::jsonb)
  ) x
  JOIN mp_unique mu ON mu."nombre" = x.nombre
  GROUP BY x.id
) sub
WHERE c."id" = sub.id;
