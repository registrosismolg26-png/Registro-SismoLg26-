-- 1. Agregar columnas "refugio" y "campamentoTransitorio" si no existen
ALTER TABLE "Registro" ADD COLUMN IF NOT EXISTS "refugio" TEXT NOT NULL DEFAULT 'Complejo Educativo República de Panamá';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "campamentoTransitorio" TEXT NOT NULL DEFAULT 'Complejo Educativo República de Panamá';

-- 2. Normalizar cédulas en la tabla "Registro" que no comiencen con 'V-' o 'E-'
UPDATE "Registro"
SET "cedula" = 'V-' || "cedula"
WHERE "cedula" NOT LIKE 'V-%' AND "cedula" NOT LIKE 'E-%';

-- 3. Añadir columnas para residentes intermitentes
ALTER TABLE "Registro" ADD COLUMN IF NOT EXISTS "intermitente" TEXT NOT NULL DEFAULT 'NO'; -- "SI" o "NO"
ALTER TABLE "Registro" ADD COLUMN IF NOT EXISTS "motivoIntermitente" TEXT; -- Obligatorio si intermitente = 'SI'
