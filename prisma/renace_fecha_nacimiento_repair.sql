-- ─────────────────────────────────────────────────────────────────────────────
-- VZLA RENACE — Reparar `fechaNacimiento` (Jefes + Miembros) a dd/mm/yyyy.
-- Correr MANUALMENTE en Supabase (SQL Editor). IDEMPOTENTE: re-ejecutable sin romper.
-- Reparación INTELIGENTE: unifica separadores, colapsa dobles barras ("30//11/2000"),
-- separa mes+año pegados ("12/062024" → 12/06/2024) y acepta yyyy-mm-dd. Lo que NO sea
-- fecha válida (cédula "16526638", cadenas ambiguas de 7+ dígitos…) → NULL.
-- La columna sigue siendo TEXT (no cambia el esquema).
-- ─────────────────────────────────────────────────────────────────────────────

-- Función TEMPORAL (schema pg_temp → se borra sola al cerrar la sesión).
CREATE OR REPLACE FUNCTION pg_temp.renace_norm_fecha(v text) RETURNS text AS $$
DECLARE
  s text; parts text[]; n int; d int; mo int; y int; b text; tmp int; ystr text;
BEGIN
  s := trim(coalesce(v, ''));
  IF s = '' THEN RETURN NULL; END IF;
  s := regexp_replace(s, '[.\-]', '/', 'g');  -- separadores → '/'
  s := regexp_replace(s, '/+', '/', 'g');       -- colapsa dobles barras
  s := regexp_replace(s, '^/|/$', '', 'g');     -- quita barras en los extremos
  IF s !~ '^\d+(/\d+)*$' THEN RETURN NULL; END IF;  -- solo dígitos y '/'
  parts := string_to_array(s, '/');
  n := array_length(parts, 1);
  IF n = 3 THEN
    IF length(parts[1]) = 4 THEN                    -- yyyy/m/d
      ystr := parts[1]; mo := parts[2]::int; d := parts[3]::int;
    ELSE                                             -- d/m/yyyy (o d/m/yy)
      d := parts[1]::int; mo := parts[2]::int; ystr := parts[3];
    END IF;
  ELSIF n = 2 AND length(parts[1]) <= 2 AND length(parts[2]) BETWEEN 5 AND 6 THEN
    b := parts[2];                                   -- día / (mes+año pegados)
    d := parts[1]::int; ystr := right(b, 4); mo := left(b, length(b) - 4)::int;
  ELSE
    RETURN NULL;
  END IF;
  -- Año de 2 dígitos → pivote (≤25 → 20xx; si no, 19xx). 4 dígitos → tal cual. Otro → ambiguo.
  IF length(ystr) = 2 THEN
    y := ystr::int; IF y <= 25 THEN y := 2000 + y; ELSE y := 1900 + y; END IF;
  ELSIF length(ystr) = 4 THEN
    y := ystr::int;
  ELSE
    RETURN NULL;
  END IF;
  -- Si el "mes" > 12 pero el "día" ≤ 12, venía en mm/dd → intercambiar.
  IF mo > 12 AND d <= 12 THEN tmp := d; d := mo; mo := tmp; END IF;
  IF d < 1 OR d > 31 OR mo < 1 OR mo > 12 OR y < 1900 OR y > 2100 THEN
    RETURN NULL;
  END IF;
  RETURN lpad(d::text, 2, '0') || '/' || lpad(mo::text, 2, '0') || '/' || y::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Normalizar. `IS DISTINCT FROM` → solo toca filas que cambian (idempotente, null-safe).
UPDATE "RenaceJefe"
SET "fechaNacimiento" = pg_temp.renace_norm_fecha("fechaNacimiento")
WHERE "fechaNacimiento" IS DISTINCT FROM pg_temp.renace_norm_fecha("fechaNacimiento");

UPDATE "RenaceMiembro"
SET "fechaNacimiento" = pg_temp.renace_norm_fecha("fechaNacimiento")
WHERE "fechaNacimiento" IS DISTINCT FROM pg_temp.renace_norm_fecha("fechaNacimiento");

-- (Opcional) Auditar cuántas quedaron NULL por no ser fecha recuperable:
-- SELECT 'jefes' t, COUNT(*) FILTER (WHERE "fechaNacimiento" IS NULL) nulos FROM "RenaceJefe"
-- UNION ALL SELECT 'miembros', COUNT(*) FILTER (WHERE "fechaNacimiento" IS NULL) FROM "RenaceMiembro";
