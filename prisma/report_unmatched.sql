-- ─────────────────────────────────────────────────────────────────────────────
-- Reporte de nombres legados NO enlazados por el backfill (para revisión manual).
-- Ejecutar DESPUÉS de migrate_ids_backfill.sql. Solo lee (SELECT), no modifica nada.
-- Resuélvelos agregándolos al catálogo (Config → Catálogos Médicos) y re-corriendo el backfill,
-- o corrigiendo el nombre. Los medicamentos "ambiguos" (un nombre → varias presentaciones) no
-- pueden auto-enlazarse porque el dato legado no dice la presentación.
-- ─────────────────────────────────────────────────────────────────────────────

-- A) PATOLOGÍAS legadas sin coincidencia exacta en el catálogo "Patologia".
SELECT 'PATOLOGIA' AS tipo, nombre, COUNT(*) AS apariciones
FROM (
  SELECT TRIM(tok) AS nombre
  FROM "Registro", LATERAL unnest(string_to_array("patologiaDescripcion", ',')) AS u(tok)
  WHERE "patologiaDescripcion" IS NOT NULL AND btrim("patologiaDescripcion") <> ''
  UNION ALL
  SELECT TRIM(tok)
  FROM "ConsultaMedica", LATERAL unnest(string_to_array("antecedentesPatologia", ',')) AS u(tok)
  WHERE "antecedentesPatologia" IS NOT NULL AND btrim("antecedentesPatologia") <> ''
  UNION ALL
  SELECT TRIM(tok)
  FROM "ConsultaMedica", LATERAL unnest(string_to_array("diagnosticoPatologia", ',')) AS u(tok)
  WHERE "diagnosticoPatologia" IS NOT NULL AND btrim("diagnosticoPatologia") <> ''
) t
WHERE nombre <> '' AND NOT EXISTS (SELECT 1 FROM "Patologia" p WHERE p."nombre" = t.nombre)
GROUP BY nombre
ORDER BY apariciones DESC, nombre;

-- B) MEDICAMENTOS legados sin match único (0 = no existe; >1 = ambiguo por presentación).
SELECT 'MEDICAMENTO' AS tipo, nombre,
       (SELECT COUNT(*) FROM "MedicamentoPredefinido" mp WHERE mp."nombre" = t.nombre) AS matches_catalogo,
       COUNT(*) AS apariciones
FROM (
  SELECT TRIM(e->>'nombre') AS nombre
  FROM "Registro", LATERAL jsonb_array_elements("medicamentos") AS ae(e)
  WHERE jsonb_typeof("medicamentos") = 'array'
  UNION ALL
  SELECT TRIM(e->>'nombre')
  FROM "ConsultaMedica", LATERAL jsonb_array_elements("antecedentesMedicamentos") AS ae(e)
  WHERE jsonb_typeof("antecedentesMedicamentos") = 'array'
  UNION ALL
  SELECT TRIM(e->>'nombre')
  FROM "ConsultaMedica", LATERAL jsonb_array_elements("diagnosticoMedicamentos") AS ae(e)
  WHERE jsonb_typeof("diagnosticoMedicamentos") = 'array'
) t
WHERE nombre IS NOT NULL AND nombre <> ''
  AND (SELECT COUNT(*) FROM "MedicamentoPredefinido" mp WHERE mp."nombre" = t.nombre) <> 1
GROUP BY nombre
ORDER BY apariciones DESC, nombre;
