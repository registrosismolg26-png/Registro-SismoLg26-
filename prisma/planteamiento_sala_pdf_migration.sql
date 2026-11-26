-- Migración para soporte de Documento PDF en Planteamiento Sala

ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "tieneDocumentoPdf" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "documentoPdfNombre" TEXT;
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "documentoPdfFecha" TIMESTAMP(3);
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "documentoPdfSize" INTEGER;

CREATE TABLE IF NOT EXISTS "PlanteamientoSalaDocumento" (
  "id" TEXT NOT NULL,
  "planteamientoId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  "size" INTEGER NOT NULL DEFAULT 0,
  "base64" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlanteamientoSalaDocumento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanteamientoSalaDocumento_planteamientoId_key" UNIQUE ("planteamientoId"),
  CONSTRAINT "PlanteamientoSalaDocumento_planteamientoId_fkey" FOREIGN KEY ("planteamientoId") REFERENCES "PlanteamientoSala"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PlanteamientoSalaDocumento_planteamientoId_idx" ON "PlanteamientoSalaDocumento"("planteamientoId");
