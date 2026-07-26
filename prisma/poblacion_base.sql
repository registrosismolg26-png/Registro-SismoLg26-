-- Población base / total de referencia por campamento (opcional).
-- Cuando Refugio.poblacionBase > 0, las CIFRAS DE RESUMEN (card de Estadísticas,
-- link público y reportes) muestran RETIRADOS = max(0, poblacionBase − presentes)
-- y TOTAL = poblacionBase. NULL/0 → se cuenta como hoy (retirados reales).
--
-- Idempotente: re-ejecutable sin romper. Correr manualmente en Supabase.

ALTER TABLE "Refugio" ADD COLUMN IF NOT EXISTS "poblacionBase" INTEGER;

-- (Opcional) Fijar el total de referencia de un campamento concreto. Ajusta el
-- nombre y el número si lo necesitas; NO deja hardcode en el código, solo dato.
-- UPDATE "Refugio" SET "poblacionBase" = 2199 WHERE "nombre" = 'MARE ABAJO 2';
