-- Migración de Base de Datos para registrar Patología y Consulta Médica (Morbilidad)
-- Este archivo es IDEMPOTENTE y puede ejecutarse manualmente en Supabase sin causar conflictos.

-- 1. Tabla de Patologías Predefinidas
CREATE TABLE IF NOT EXISTS "Patologia" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Patologia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Patologia_nombre_key" ON "Patologia"("nombre");

-- 2. Tabla de Consultas Médicas (Morbilidad)
CREATE TABLE IF NOT EXISTS "ConsultaMedica" (
    "id" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "nombreApellido" TEXT NOT NULL,
    "genero" TEXT,
    "edad" INTEGER,
    "refugio" TEXT NOT NULL,
    "antecedentesPatologia" TEXT,
    "antecedentesMedicamentos" JSONB DEFAULT '[]'::jsonb,
    "diagnosticoPatologia" TEXT,
    "diagnosticoMedicamentos" JSONB DEFAULT '[]'::jsonb,
    "notasDoctor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ConsultaMedica_pkey" PRIMARY KEY ("id")
);
