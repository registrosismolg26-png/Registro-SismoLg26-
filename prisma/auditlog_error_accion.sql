-- ═══════════════════════════════════════════════════════════════════════════
--  AuditLog: permitir la acción 'ERROR' (errores del cliente en campo)
--  Idempotente (re-ejecutable). Ejecutar manualmente en Supabase.
--
--  Amplía el CHECK de `accion` para permitir además 'ERROR', que la app inserta
--  desde /api/activity-log cuando el navegador captura un error no manejado
--  (window.onerror / unhandledrejection). Así te enteras de fallos en campo sin
--  depender de que el operador reporte.
--    · accion = 'ERROR' → entidad = 'ErrorCliente'
--    · metadata (JSONB) = { mensaje, stack, ruta, origen, ua, refugio, rol }  (SIN PII)
--    · user_email = operador en cuya sesión ocurrió el error
--
--  Si NO se ejecuta, la inserción del error falla en silencio (best-effort) y el
--  resto de la app sigue igual; PRINT/EXPORT y el trigger no se ven afectados.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_accion_check";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_accion_check"
  CHECK (accion IN ('CREATE','UPDATE','DELETE','PRINT','EXPORT','ERROR'));
