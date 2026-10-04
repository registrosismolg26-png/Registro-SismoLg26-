-- Migración: Crear tabla ComedorRegistro para el módulo de Comedor
CREATE TABLE IF NOT EXISTS "ComedorRegistro" (
    "id" TEXT NOT NULL,
    "registroId" TEXT,
    "cedula" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "refugio" TEXT NOT NULL,
    "tipoBeneficiario" TEXT NOT NULL DEFAULT 'JEFE',
    "fecha" TEXT NOT NULL,
    "servicio" TEXT NOT NULL,
    "raciones" INTEGER NOT NULL DEFAULT 1,
    "hora" TEXT NOT NULL,
    "registradoPor" TEXT,
    "observacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComedorRegistro_pkey" PRIMARY KEY ("id")
);

-- Evitar que una misma persona registre más de una entrega para el mismo servicio en la misma fecha y refugio
CREATE UNIQUE INDEX IF NOT EXISTS "ComedorRegistro_cedula_fecha_servicio_refugio_key" 
ON "ComedorRegistro"("cedula", "fecha", "servicio", "refugio");

CREATE INDEX IF NOT EXISTS "ComedorRegistro_refugio_fecha_idx" 
ON "ComedorRegistro"("refugio", "fecha");

CREATE INDEX IF NOT EXISTS "ComedorRegistro_fecha_servicio_idx" 
ON "ComedorRegistro"("fecha", "servicio");

CREATE INDEX IF NOT EXISTS "ComedorRegistro_cedula_idx" 
ON "ComedorRegistro"("cedula");
