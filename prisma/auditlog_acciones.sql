-- ═══════════════════════════════════════════════════════════════════════════
--  AuditLog: permitir acciones de usuario (imprimir / exportar)
--  Idempotente (re-ejecutable). Ejecutar manualmente en Supabase.
--
--  La tabla AuditLog (ver audit_setup.sql) tenía un CHECK que solo permitía
--  'CREATE','UPDATE','DELETE' (cambios de datos por trigger). Este script amplía
--  el CHECK para permitir además 'PRINT' y 'EXPORT', que la app inserta desde
--  /api/activity-log cuando alguien imprime un PDF o descarga un Excel.
--    · accion = 'PRINT'  → entidad = 'Impresion'
--    · accion = 'EXPORT' → entidad = 'Exportacion'
--    · metadata (JSONB) = { recurso, formato, refugio, filtros, total, rol }
--    · user_email = operador que ejecutó la acción
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_accion_check";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_accion_check"
  CHECK (accion IN ('CREATE','UPDATE','DELETE','PRINT','EXPORT'));
