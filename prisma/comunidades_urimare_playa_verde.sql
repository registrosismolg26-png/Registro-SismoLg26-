-- ═══════════════════════════════════════════════════════════════════════════
--  Carga de COMUNIDADES de la parroquia URIMARE al campamento "Playa Verde".
--  Idempotente (re-ejecutable): ON CONFLICT sobre el unique
--  ("nombre","parroquia","refugioId") → no duplica. Ejecutar en Supabase.
--
--  El campamento se resuelve por NOMBRE (no se hardcodea el id). Si "Playa Verde"
--  no existiera, el JOIN no devuelve filas y NO se inserta nada.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO "Comunidad" ("id", "nombre", "parroquia", "refugioId")
SELECT gen_random_uuid()::text, v."nombre", 'URIMARE', r."id"
  FROM (VALUES
         ('PUERTO VIEJO'),
         ('BRISAS DE CANDILEJA'),
         ('NUEVO HORIZONTE'),
         ('PLAYA VERDE ESTE'),
         ('PLAYA VERDE OESTE')
       ) AS v("nombre")
  JOIN "Refugio" r ON upper(trim(r."nombre")) = 'PLAYA VERDE'
ON CONFLICT ("nombre", "parroquia", "refugioId") DO NOTHING;

-- ── Verificación ─────────────────────────────────────────────────────────────
--    SELECT c.nombre, c.parroquia, r.nombre AS campamento
--      FROM "Comunidad" c JOIN "Refugio" r ON r.id = c."refugioId"
--     WHERE c.parroquia = 'URIMARE' ORDER BY c.nombre;
