-- ═══════════════════════════════════════════════════════════════════════════
--  Auditoría de cambios — tablas Registro y User
--  Idempotente (re-ejecutable). Ejecutar manualmente en Supabase.
--
--  Guarda en AuditLog cada CREATE/UPDATE/DELETE:
--    · CREATE → metadata = fila completa
--    · UPDATE → metadata = SOLO los campos que cambiaron (ignora 'syncedAt')
--    · DELETE → metadata = fila completa antes de borrar
--  Quién: user_email lo pone la app (variable de sesión app.user_email); si no
--  viene (SQL directo, otro cliente), queda el rol de BD en db_role (respaldo).
--  Nunca guarda 'password' (se excluye del metadata).
-- ═══════════════════════════════════════════════════════════════════════════

-- La RegistroAudit específica (si se creó antes) se reemplaza por la genérica.
DROP TABLE IF EXISTS "RegistroAudit";

CREATE TABLE IF NOT EXISTS "AuditLog" (
  id          BIGSERIAL PRIMARY KEY,
  entidad     TEXT NOT NULL,                          -- 'Registro' | 'User'
  entidad_id  TEXT NOT NULL,                          -- id de la fila afectada
  accion      TEXT NOT NULL CHECK (accion IN ('CREATE','UPDATE','DELETE')),
  metadata    JSONB NOT NULL,                         -- diff / fila (sin password)
  user_email  TEXT,                                   -- operador (de la app)
  db_role     TEXT NOT NULL DEFAULT current_user,     -- respaldo: rol de BD
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auditlog_entidad ON "AuditLog"(entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_auditlog_fecha   ON "AuditLog"(created_at DESC);

CREATE OR REPLACE FUNCTION audit_row() RETURNS TRIGGER AS $$
DECLARE
  actor TEXT := current_setting('app.user_email', true);  -- NULL si la app no lo setea
  diff  JSONB;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO "AuditLog"(entidad, entidad_id, accion, metadata, user_email)
    VALUES (TG_TABLE_NAME, NEW.id, 'CREATE', to_jsonb(NEW) - 'password', actor);
    RETURN NEW;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- solo columnas que cambiaron; ignora ruido de sincronización y el password
    SELECT jsonb_object_agg(n.key, n.value) INTO diff
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o ON n.key = o.key
    WHERE n.value IS DISTINCT FROM o.value
      AND n.key NOT IN ('syncedAt', 'password');
    IF diff IS NOT NULL THEN
      INSERT INTO "AuditLog"(entidad, entidad_id, accion, metadata, user_email)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', diff, actor);
    END IF;
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO "AuditLog"(entidad, entidad_id, accion, metadata, user_email)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD) - 'password', actor);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_registro ON "Registro";
CREATE TRIGGER trg_audit_registro
AFTER INSERT OR UPDATE OR DELETE ON "Registro"
FOR EACH ROW EXECUTE FUNCTION audit_row();

DROP TRIGGER IF EXISTS trg_audit_user ON "User";
CREATE TRIGGER trg_audit_user
AFTER INSERT OR UPDATE OR DELETE ON "User"
FOR EACH ROW EXECUTE FUNCTION audit_row();

-- Auditoría de consultas de morbilidad (CREATE = fila completa con uuid + registroId
-- vinculado + ids de patologías/medicamentos; UPDATE = diff; DELETE = fila completa).
DROP TRIGGER IF EXISTS trg_audit_consulta ON "ConsultaMedica";
CREATE TRIGGER trg_audit_consulta
AFTER INSERT OR UPDATE OR DELETE ON "ConsultaMedica"
FOR EACH ROW EXECUTE FUNCTION audit_row();
