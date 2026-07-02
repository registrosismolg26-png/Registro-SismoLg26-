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

-- 4. Capacidad de camas por salón (CustomRoom). El DEFAULT 18 aplica a todas las
--    filas existentes al crear la columna, y a los inserts que no la especifiquen.
ALTER TABLE "CustomRoom" ADD COLUMN IF NOT EXISTS "capacidad" INTEGER NOT NULL DEFAULT 18;
