-- ═══════════════════════════════════════════════════════════════════════════
--  Solución habitacional MÚLTIPLE (refugios ITINERANTE/MIXTO): la persona elige una o
--  varias de 6 opciones (mín. 1):
--    MERCADO SECUNDARIO (SUBSIDIO) | CRÉDITO HIPOTECARIO | ALQUILER |
--    ADJUDICACIÓN EN LA GUAIRA | ADJUDICACIÓN DE CARACAS | CIUDAD CARIBIA
--
--  · Columna NUEVA "solucionesHabitacionales" (JSONB, lista). La anterior
--    "solucionHabitacional" (texto único) queda como LEGADO: no se borra.
--  · Backfill: convierte el valor único existente a lista de 1 elemento con este mapa:
--        ALQUILER                  → ALQUILER
--        CRÉDITO HIPOTECARIO       → CRÉDITO HIPOTECARIO
--        MERCADO SECUNDARIO        → MERCADO SECUNDARIO (SUBSIDIO)
--        SUBSIDIO                  → MERCADO SECUNDARIO (SUBSIDIO)   (confirmado: son la misma opción)
--        CAMPAMENTO CIUDAD CARIBIA → CIUDAD CARIBIA
--    Cualquier otro valor NO se convierte (queda la lista vacía y el legado intacto).
--  · Nota: el UPDATE dispara el trigger de auditoría (una fila de AuditLog por registro
--    convertido, sin usuario) — es esperado en un backfill.
--  Idempotente (re-ejecutable). Ejecutar en Supabase ANTES de desplegar.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "Registro" ADD COLUMN IF NOT EXISTS "solucionesHabitacionales" JSONB DEFAULT '[]'::jsonb;

UPDATE "Registro"
   SET "solucionesHabitacionales" = jsonb_build_array(
         CASE upper(btrim("solucionHabitacional"))
           WHEN 'ALQUILER'                  THEN 'ALQUILER'
           WHEN 'CRÉDITO HIPOTECARIO'       THEN 'CRÉDITO HIPOTECARIO'
           WHEN 'MERCADO SECUNDARIO'        THEN 'MERCADO SECUNDARIO (SUBSIDIO)'
           WHEN 'SUBSIDIO'                  THEN 'MERCADO SECUNDARIO (SUBSIDIO)'
           WHEN 'CAMPAMENTO CIUDAD CARIBIA' THEN 'CIUDAD CARIBIA'
         END)
 WHERE "solucionHabitacional" IS NOT NULL
   AND upper(btrim("solucionHabitacional")) IN
       ('ALQUILER','CRÉDITO HIPOTECARIO','MERCADO SECUNDARIO','SUBSIDIO','CAMPAMENTO CIUDAD CARIBIA')
   AND ("solucionesHabitacionales" IS NULL OR "solucionesHabitacionales" = '[]'::jsonb);

-- ── Verificación ─────────────────────────────────────────────────────────────
--    SELECT "solucionesHabitacionales", count(*) FROM "Registro"
--     WHERE "solucionesHabitacionales" <> '[]'::jsonb GROUP BY 1 ORDER BY 2 DESC;
--    -- Valores del legado que NO se convirtieron (debe ser 0 filas):
--    SELECT DISTINCT "solucionHabitacional" FROM "Registro"
--     WHERE "solucionHabitacional" IS NOT NULL AND "solucionesHabitacionales" = '[]'::jsonb;
