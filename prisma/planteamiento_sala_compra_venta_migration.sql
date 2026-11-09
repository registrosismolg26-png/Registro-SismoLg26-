-- Agrega la columna entregoCompraVenta a la tabla PlanteamientoSala para Mercado Secundario
ALTER TABLE "PlanteamientoSala" ADD COLUMN IF NOT EXISTS "entregoCompraVenta" TEXT DEFAULT 'NO';
