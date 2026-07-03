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

-- 5. Quitar el refugio por defecto hardcodeado (regla: nada de hardcode). Las
--    guardas ya obligan a especificar refugio al crear registros/usuarios/salones,
--    así que el default ya no se usa. DROP DEFAULT es idempotente.
ALTER TABLE "Registro" ALTER COLUMN "refugio" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "campamentoTransitorio" DROP DEFAULT;
ALTER TABLE "CustomRoom" ALTER COLUMN "refugio" DROP DEFAULT;

-- 6. Ubicación (URL de Google Maps) por refugio, para el reporte de WhatsApp.
--    Se puede editar desde la app (Config > Refugios). El UPDATE siembra el
--    link de la Escuela 10 de Marzo si el nombre coincide y aún no tiene uno.
ALTER TABLE "Refugio" ADD COLUMN IF NOT EXISTS "ubicacion" TEXT;
UPDATE "Refugio" SET "ubicacion" = 'https://maps.app.goo.gl/ptpahFB5VMGHDdhz6'
WHERE "ubicacion" IS NULL AND "nombre" ILIKE '%10 de marzo%';
