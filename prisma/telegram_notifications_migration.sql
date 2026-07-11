-- ─────────────────────────────────────────────────────────────────────────────
--  Telegram (canal de respaldo) + Centro de avisos in-app.
--  Idempotente (re-ejecutable). Correr MANUALMENTE en Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Columnas de Telegram en User (vinculación del bot).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramChatId"      TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramLinkToken"   TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramLinkExpires" TIMESTAMP(3);

-- 2) Avisos in-app (1 fila por destinatario).
CREATE TABLE IF NOT EXISTS "Notification" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "tipo"      TEXT NOT NULL,
  "titulo"    TEXT NOT NULL,
  "cuerpo"    TEXT NOT NULL,
  "readAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification" ("userId", "createdAt");

-- Limpieza opcional de avisos viejos (re-ejecutable):
-- DELETE FROM "Notification" WHERE "createdAt" < now() - interval '90 days';
