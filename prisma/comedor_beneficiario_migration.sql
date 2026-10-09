-- Crear tabla ComedorBeneficiario para carnet/beneficiarios creados exclusivamente en el módulo Comedor
-- sin alterar ni inyectar datos en la tabla principal Registro.

CREATE TABLE IF NOT EXISTS "ComedorBeneficiario" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cedula" TEXT NOT NULL,
  "nombreApellido" TEXT NOT NULL,
  "telefono" TEXT,
  "refugio" TEXT NOT NULL,
  "tipoBeneficiario" TEXT NOT NULL DEFAULT 'JEFE',
  "raciones" INTEGER NOT NULL DEFAULT 1,
  "integrantes" TEXT,
  "observacion" TEXT,
  "creadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ComedorBeneficiario_cedula_refugio_key" ON "ComedorBeneficiario"("cedula", "refugio");
CREATE INDEX IF NOT EXISTS "ComedorBeneficiario_refugio_idx" ON "ComedorBeneficiario"("refugio");
CREATE INDEX IF NOT EXISTS "ComedorBeneficiario_cedula_idx" ON "ComedorBeneficiario"("cedula");
