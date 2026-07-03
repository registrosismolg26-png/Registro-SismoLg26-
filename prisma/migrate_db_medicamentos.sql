-- Migración de Base de Datos para registrar Medicamentos Predefinidos (Catálogo)
-- Este archivo es IDEMPOTENTE y puede ejecutarse manualmente en Supabase.

CREATE TABLE IF NOT EXISTS "MedicamentoPredefinido" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "dosis" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicamentoPredefinido_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MedicamentoPredefinido_nombre_key" ON "MedicamentoPredefinido"("nombre");
