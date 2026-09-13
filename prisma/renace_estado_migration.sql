-- ═══════════════════════════════════════════════════════════════════════════
--  VZLA RENACE — tabla de ESTADO/ciclo de vida del núcleo (APROBADO/RETIRADO).
--  Idempotente (re-ejecutable sin romper). EJECUTAR MANUALMENTE en Supabase.
--  1 fila por núcleo DENTRO del refugio; ancla = cédula del jefe (solo dígitos).
--  Al RETIRAR se encadena con el censo por cédula (ver /api/vzlarenace/estado);
--  `censoAfectados` guarda la foto de las fichas del censo tocadas (para revertir).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "RenaceEstado" (
  "id"               TEXT NOT NULL,
  "refugioId"        TEXT NOT NULL,
  "jefeNro"          INTEGER NOT NULL,
  "jefeCedula"       TEXT NOT NULL,
  "estado"           TEXT NOT NULL,
  "aprobadoPor"      TEXT,
  "aprobadoAt"       TIMESTAMP(3),
  "retiradoPor"      TEXT,
  "retiradoAt"       TIMESTAMP(3),
  "fechaRetiro"      TEXT,
  "motivo"           TEXT,
  "monto"            TEXT,
  "moneda"           TEXT,
  "destinoEstado"    TEXT,
  "destinoMunicipio" TEXT,
  "destinoParroquia" TEXT,
  "destinoDireccion" TEXT,
  "observacion"      TEXT,
  "censoAfectados"   JSONB,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RenaceEstado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RenaceEstado_jefeCedula_refugioId_key"
  ON "RenaceEstado" ("jefeCedula", "refugioId");
CREATE INDEX IF NOT EXISTS "RenaceEstado_refugioId_idx"
  ON "RenaceEstado" ("refugioId");
