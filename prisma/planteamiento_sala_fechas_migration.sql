-- Migración para fechas clave de avance en PlanteamientoSala:
-- fechaEntregaCarpeta (fecha de carga/entrega de la carpeta)
-- fechaEntregaSubsidio (fecha de entrega del crédito/subsidio cuando estatus = CREDITO ENTREGADO)

ALTER TABLE "PlanteamientoSala"
  ADD COLUMN IF NOT EXISTS "fechaEntregaCarpeta" TEXT,
  ADD COLUMN IF NOT EXISTS "fechaEntregaSubsidio" TEXT;

-- Backfill fechaEntregaCarpeta con la fecha en que se cargó el registro para filas existentes
UPDATE "PlanteamientoSala"
SET "fechaEntregaCarpeta" = TO_CHAR("createdAt", 'YYYY-MM-DD')
WHERE "fechaEntregaCarpeta" IS NULL;

-- Backfill fechaEntregaSubsidio para los que ya tienen estatus CREDITO ENTREGADO
UPDATE "PlanteamientoSala"
SET "fechaEntregaSubsidio" = TO_CHAR("updatedAt", 'YYYY-MM-DD')
WHERE "estatus" = 'CREDITO ENTREGADO' AND "fechaEntregaSubsidio" IS NULL;
