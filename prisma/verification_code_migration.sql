-- ═══════════════════════════════════════════════════════════════════════════
--  Migración: VerificationCode (OTP por correo)
--  Idempotente (re-ejecutable). Ejecutar MANUALMENTE en Supabase.
--
--  Código de validación por correo para acciones sensibles (crear/editar usuarios,
--  cambiar contraseña). Se guarda el HASH del código, nunca el código en claro.
--  Coincide con el modelo VerificationCode de prisma/schema.prisma.
--
--  Limpieza opcional (los códigos consumidos/expirados pueden purgarse):
--    DELETE FROM "VerificationCode" WHERE "expiresAt" < now() - interval '1 day';
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "VerificationCode" (
  "id"         TEXT NOT NULL,
  "email"      TEXT NOT NULL,
  "codeHash"   TEXT NOT NULL,
  "purpose"    TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VerificationCode_email_purpose_idx" ON "VerificationCode" ("email", "purpose");
CREATE INDEX IF NOT EXISTS "VerificationCode_createdAt_idx" ON "VerificationCode" ("createdAt");
