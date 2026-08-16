-- ─────────────────────────────────────────────────────────────────────────────
-- VZLA RENACE — Poner TODO el texto en MAYÚSCULAS (Jefes + Miembros + Planteamientos).
-- Correr MANUALMENTE en Supabase (SQL Editor). IDEMPOTENTE: re-ejecutable sin romper
-- (el WHERE solo toca filas que aún tengan minúsculas). `UPPER(NULL)` = NULL (seguro).
-- EXCLUIDO: `RenacePlanteamiento.createdBy` (es un EMAIL → no se pone en mayúsculas).
-- Cédulas/fechas/montos/teléfonos no tienen letras → no cambian.
-- ─────────────────────────────────────────────────────────────────────────────

-- Jefes
UPDATE "RenaceJefe" SET
  nombres                  = UPPER(nombres),
  sexo                     = UPPER(sexo),
  profesion                = UPPER(profesion),
  "estadoProcedencia"      = UPPER("estadoProcedencia"),
  "parroquiaProcedencia"   = UPPER("parroquiaProcedencia"),
  "tipoAfectacion"         = UPPER("tipoAfectacion"),
  "condicionVivienda"      = UPPER("condicionVivienda"),
  incidencias              = UPPER(incidencias),
  "numeroCertificado"      = UPPER("numeroCertificado"),
  "planteamientoAfectacion" = UPPER("planteamientoAfectacion"),
  observaciones            = UPPER(observaciones)
WHERE nombres IS DISTINCT FROM UPPER(nombres)
   OR sexo IS DISTINCT FROM UPPER(sexo)
   OR profesion IS DISTINCT FROM UPPER(profesion)
   OR "estadoProcedencia" IS DISTINCT FROM UPPER("estadoProcedencia")
   OR "parroquiaProcedencia" IS DISTINCT FROM UPPER("parroquiaProcedencia")
   OR "tipoAfectacion" IS DISTINCT FROM UPPER("tipoAfectacion")
   OR "condicionVivienda" IS DISTINCT FROM UPPER("condicionVivienda")
   OR incidencias IS DISTINCT FROM UPPER(incidencias)
   OR "numeroCertificado" IS DISTINCT FROM UPPER("numeroCertificado")
   OR "planteamientoAfectacion" IS DISTINCT FROM UPPER("planteamientoAfectacion")
   OR observaciones IS DISTINCT FROM UPPER(observaciones);

-- Miembros
UPDATE "RenaceMiembro" SET
  nombres                = UPPER(nombres),
  sexo                   = UPPER(sexo),
  parentesco             = UPPER(parentesco),
  profesion              = UPPER(profesion),
  "estadoProcedencia"    = UPPER("estadoProcedencia"),
  "parroquiaProcedencia" = UPPER("parroquiaProcedencia")
WHERE nombres IS DISTINCT FROM UPPER(nombres)
   OR sexo IS DISTINCT FROM UPPER(sexo)
   OR parentesco IS DISTINCT FROM UPPER(parentesco)
   OR profesion IS DISTINCT FROM UPPER(profesion)
   OR "estadoProcedencia" IS DISTINCT FROM UPPER("estadoProcedencia")
   OR "parroquiaProcedencia" IS DISTINCT FROM UPPER("parroquiaProcedencia");

-- Planteamientos (NO createdBy = email)
UPDATE "RenacePlanteamiento" SET
  tipo                 = UPPER(tipo),
  "modalidadPlan"      = UPPER("modalidadPlan"),
  "nombreContraparte"  = UPPER("nombreContraparte"),
  estado               = UPPER(estado),
  municipio            = UPPER(municipio),
  parroquia            = UPPER(parroquia),
  "direccionEspecifica" = UPPER("direccionEspecifica"),
  "estadoPreferencia"  = UPPER("estadoPreferencia"),
  observacion          = UPPER(observacion)
WHERE tipo IS DISTINCT FROM UPPER(tipo)
   OR "modalidadPlan" IS DISTINCT FROM UPPER("modalidadPlan")
   OR "nombreContraparte" IS DISTINCT FROM UPPER("nombreContraparte")
   OR estado IS DISTINCT FROM UPPER(estado)
   OR municipio IS DISTINCT FROM UPPER(municipio)
   OR parroquia IS DISTINCT FROM UPPER(parroquia)
   OR "direccionEspecifica" IS DISTINCT FROM UPPER("direccionEspecifica")
   OR "estadoPreferencia" IS DISTINCT FROM UPPER("estadoPreferencia")
   OR observacion IS DISTINCT FROM UPPER(observacion);
