"use client";

// ── Sub-formulario de un INTEGRANTE de la carga familiar (Paso 5 del censo) ──
// Replica EXACTAMENTE los campos por-persona del jefe (identidad Paso 3 + salud
// Paso 4) sobre un `IntegranteDraft`. La ubicación/geo/carpa se heredan del jefe
// al encolar (no viven aquí). Cada integrante se registra como un Registro
// INDEPENDIENTE → el objeto final se arma con el MISMO buildRegistroData del jefe,
// garantizando que un integrante quede idéntico a uno cargado individual.

import { useState, useRef } from "react";
import type { IntegranteDraft, Patologia, MedicamentoPredefinido, ToastType } from "@/types";
import StyledSelect from "@/components/StyledSelect";
import DatePicker from "@/components/DatePicker";
import SearchableSelect from "@/components/SearchableSelect";
import { TELEFONO_CODIGOS, PERIODO_OPTIONS, DEPENDENT_NUMBER_OPTIONS } from "@/lib/constants";
import { patologiaNombre, medLabel, findRepresentante } from "@/lib/helpers";
import { buscarCedulaEnCliente } from "@/lib/db";
import { fetchCedulaExterna } from "@/lib/cedulaApi";

// Conversores de fecha (DatePicker usa yyyy-mm-dd; el borrador guarda dd/mm/aaaa).
const dmyToYmd = (dmy: string): string => {
  const p = (dmy || "").split("/");
  if (p.length !== 3 || p[2].length !== 4) return "";
  return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
};
const ymdToDmy = (ymd: string): string => {
  if (!ymd) return "";
  const p = ymd.split("-");
  if (p.length !== 3) return "";
  return `${p[2]}/${p[1]}/${p[0]}`;
};
const calcEdad = (ymd: string): string => {
  if (!ymd) return "";
  const b = new Date(ymd);
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const md = t.getMonth() - b.getMonth();
  if (md < 0 || (md === 0 && t.getDate() < b.getDate())) a--;
  return a >= 0 ? String(a) : "0";
};

interface Props {
  value: IntegranteDraft;
  index: number;
  open: boolean;
  showErrors: boolean;
  jefeCedulaDigits: string;
  jefeNombre: string;
  registros: any[];
  patologias: Patologia[];
  predefinedMedicamentos: MedicamentoPredefinido[];
  showToast: (message: string, type: ToastType) => void;
  onToggle: () => void;
  onChange: (patch: Partial<IntegranteDraft>) => void;
  onRemove: () => void;
}

export default function IntegranteForm({
  value,
  index,
  open,
  showErrors,
  jefeCedulaDigits,
  jefeNombre,
  registros,
  patologias,
  predefinedMedicamentos,
  showToast,
  onToggle,
  onChange,
  onRemove,
}: Props) {
  const [lookupStatus, setLookupStatus] = useState<"idle" | "searching" | "found" | "not-found">("idle");
  const lookupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Aplica un cambio y limpia el error de los campos tocados (feedback en vivo).
  const patch = (p: Partial<IntegranteDraft>) => {
    const errors = { ...value.errors };
    Object.keys(p).forEach((k) => {
      delete errors[k];
    });
    onChange({ ...p, errors });
  };
  const showErr = (field: string): string =>
    showErrors ? value.errors[field] || "" : "";

  const addPatologia = (id: string) => {
    if (!id || (value.patologiaIds || []).includes(id)) return;
    patch({ patologiaIds: [...(value.patologiaIds || []), id] });
  };
  const removePatologia = (id: string) =>
    patch({ patologiaIds: (value.patologiaIds || []).filter((x) => x !== id) });

  const addMed = (medId: string) => {
    const match = predefinedMedicamentos.find((m) => m.id === medId);
    if (match && !value.medicamentos.some((x) => x.id === medId)) {
      patch({
        medicamentos: [
          ...value.medicamentos,
          { id: match.id, dosis: match.concentracion || "", periodo: "" },
        ],
      });
    }
  };
  const updateMed = (i: number, field: "dosis" | "periodo", val: string) =>
    patch({
      medicamentos: value.medicamentos.map((m, idx) =>
        idx === i ? { ...m, [field]: val } : m,
      ),
    });
  const removeMed = (i: number) =>
    patch({ medicamentos: value.medicamentos.filter((_, idx) => idx !== i) });

  // Autocompletar por cédula (censo ya cargado → padrón local → API externa), IGUAL
  // que el registro normal. Solo para NO-menores: en un menor la cédula es la del
  // REPRESENTANTE (devolvería al representante, no al niño), así que no se autocompleta.
  const triggerIntgLookup = (cedulaVal: string) => {
    const clean = cedulaVal.replace(/\D/g, "");
    if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
    if (clean.length >= 5) {
      const enCenso = registros.find((r: any) => (r.cedula || "").replace(/\D/g, "") === clean);
      if (enCenso) {
        const ymd = String(enCenso.fechaNacimiento || "").slice(0, 10);
        onChange({
          nombreApellido: enCenso.nombreApellido || value.nombreApellido,
          genero: enCenso.genero || value.genero,
          ...(ymd ? { fechaNacimiento: ymdToDmy(ymd), edad: calcEdad(ymd) } : {}),
        });
        setLookupStatus("found");
        return;
      }
    }
    if (clean.length < 7) { setLookupStatus("idle"); return; }
    setLookupStatus("searching");
    lookupTimeoutRef.current = setTimeout(async () => {
      try {
        const citizen = await buscarCedulaEnCliente(clean);
        if (citizen) {
          let g = "";
          if (citizen.sexo === "F" || citizen.sexo === "FEMENINO") g = "FEMENINO";
          else if (citizen.sexo === "M" || citizen.sexo === "MASCULINO") g = "MASCULINO";
          const p = String(citizen.fechaNacimiento || "").split("-");
          const fdmy = p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : "";
          onChange({
            nombreApellido: citizen.nombreCompleto,
            genero: g,
            ...(fdmy ? { fechaNacimiento: fdmy, edad: calcEdad(String(citizen.fechaNacimiento || "").slice(0, 10)) } : {}),
          });
          setLookupStatus("found");
          showToast("Identidad verificada en padrón local.", "info");
        } else {
          const ext = await fetchCedulaExterna(value.nacionalidad, clean);
          if (ext) {
            const pe = String(ext.fechaNacimiento || "").split("-");
            const efdmy = pe.length === 3 ? `${pe[2]}/${pe[1]}/${pe[0]}` : "";
            onChange({
              ...(ext.nombreApellido ? { nombreApellido: ext.nombreApellido } : {}),
              ...(ext.genero ? { genero: ext.genero } : {}),
              ...(efdmy ? { fechaNacimiento: efdmy, edad: calcEdad(String(ext.fechaNacimiento).slice(0, 10)) } : {}),
            });
            setLookupStatus("found");
            showToast("Identidad verificada en línea (api.cedula.com.ve).", "info");
          } else {
            setLookupStatus("not-found");
          }
        }
      } catch { setLookupStatus("not-found"); }
    }, 250);
  };

  // Nombre del representante (menor): si su cédula es la del jefe → el nombre del jefe
  // (que se está registrando ahora); si no (nieto/abuelo con otro representante) → se
  // busca en el censo. La cédula del representante es EDITABLE.
  const repDigits = value.cedula.replace(/\D/g, "");
  const repNombre = value.menorSinCedula && repDigits.length >= 6
    ? (repDigits === jefeCedulaDigits && jefeNombre.trim()
        ? jefeNombre.trim()
        : findRepresentante(value.cedula, registros) || "")
    : "";

  const cedulaPreview = value.menorSinCedula
    ? value.cedula
      ? `${value.nacionalidad}-${value.cedula}-${value.dependentNumber}`
      : "—"
    : value.cedula
      ? `${value.nacionalidad}-${value.cedula}`
      : "";

  return (
    <section className="intg-acc" data-open={open}>
      <div className="intg-acc__head">
        <button
          type="button"
          className="intg-acc__toggle"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span className="intg-acc__num">{index + 1}</span>
          <span className="intg-acc__titles">
            <span className="intg-acc__name">
              {value.nombreApellido?.trim() || `Integrante ${index + 1}`}
            </span>
            <span className="intg-acc__meta">
              {cedulaPreview || "Sin cédula"}
              {value.genero ? ` · ${value.genero === "FEMENINO" ? "F" : "M"}` : ""}
              {value.edad ? ` · ${value.edad} años` : ""}
            </span>
          </span>
          <svg
            className="intg-acc__chev"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <button
          type="button"
          className="intg-acc__remove"
          onClick={onRemove}
          aria-label="Quitar integrante"
          data-tip="Quitar"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      <div className="intg-acc__panel">
        <div className="intg-acc__inner">
          <div className="intg-acc__body pill-form">
            {/* Menor sin cédula */}
            <div className="form-group" style={{ marginBottom: "0.85rem" }}>
              <button
                type="button"
                className={`pill-check pill-check--wrap${value.menorSinCedula ? " is-on" : ""}`}
                aria-pressed={value.menorSinCedula}
                onClick={() =>
                  patch(
                    !value.menorSinCedula
                      ? { menorSinCedula: true, nacionalidad: "V", cedula: jefeCedulaDigits }
                      : { menorSinCedula: false, cedula: "" },
                  )
                }
              >
                <span className="pill-check__box" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span className="pill-check__label">Menor de edad sin cédula (asociar a un representante)</span>
              </button>
            </div>

            {/* Cédula propia, o del REPRESENTANTE (editable; no siempre es el jefe:
                nietos, abuelos, etc.). En no-menores autocompleta como el flujo normal. */}
            <div className="form-group">
              <label>
                {value.menorSinCedula ? "Cédula del Representante" : "Cédula de Identidad"}
                <span className="required-star">*</span>
              </label>
              <div className="field-row-cedula">
                <div className="nat-toggle">
                  <button
                    type="button"
                    className={`nat-btn ${value.nacionalidad === "V" ? "active" : ""}`}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => patch({ nacionalidad: "V" })}
                  >V</button>
                  <button
                    type="button"
                    className={`nat-btn ${value.nacionalidad === "E" ? "active" : ""}`}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => patch({ nacionalidad: "E" })}
                  >E</button>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={value.menorSinCedula ? "Cédula del representante" : "Solo números (ej: 12345678)"}
                  value={value.cedula}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    patch({ cedula: digits });
                    if (!value.menorSinCedula) triggerIntgLookup(digits);
                  }}
                  className={showErr("cedula") ? "has-error" : ""}
                />
              </div>

              {/* Menor: nombre del representante (buscado en el censo) */}
              {value.menorSinCedula && repDigits.length >= 6 && (
                repNombre ? (
                  <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--color-success)", fontSize: "0.75rem", fontWeight: 700, marginTop: "0.4rem" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    Representante: {repNombre}
                  </span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--color-warning)", fontSize: "0.75rem", fontWeight: 700, marginTop: "0.4rem" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Representante no está registrado en el censo
                  </span>
                )
              )}

              {/* Menor: correlativo + cédula compuesta */}
              {value.menorSinCedula && (
                <div className="form-group" style={{ marginTop: "0.75rem", marginBottom: "0.25rem" }}>
                  <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Número correlativo de hijo/dependiente</label>
                  <StyledSelect
                    value={value.dependentNumber}
                    onChange={(v) => patch({ dependentNumber: v })}
                    options={DEPENDENT_NUMBER_OPTIONS}
                    ariaLabel="Número correlativo de hijo/dependiente"
                  />
                  <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    Cédula asignada: <strong>{cedulaPreview}</strong>
                  </p>
                </div>
              )}

              {/* No-menor: estado del lookup (padrón/API), igual que el registro normal */}
              {!value.menorSinCedula && lookupStatus !== "idle" && (
                <div className="helper-box">
                  <span className={`helper-text active ${lookupStatus}`}>
                    {lookupStatus === "searching" && "Buscando cédula en padrón local..."}
                    {lookupStatus === "found" && "Ciudadano verificado. Datos autocompletados."}
                    {lookupStatus === "not-found" && "Cédula no registrada localmente. Ingrese manual."}
                  </span>
                </div>
              )}

              <div className="error-container">
                {showErr("cedula") && <span className="field-error-message">{showErr("cedula")}</span>}
              </div>
            </div>

            {/* Nombre */}
            <div className="form-group">
              <label>Nombre y Apellido<span className="required-star">*</span></label>
              <input
                type="text"
                placeholder="Nombre completo"
                value={value.nombreApellido}
                onChange={(e) => patch({ nombreApellido: e.target.value })}
                className={showErr("nombreApellido") ? "has-error" : ""}
              />
              <div className="error-container">
                {showErr("nombreApellido") && <span className="field-error-message">{showErr("nombreApellido")}</span>}
              </div>
            </div>

            {/* Género */}
            <div className="form-group">
              <label>Género<span className="required-star">*</span></label>
              <div className="radio-group">
                <label className={`radio-card ${value.genero === "MASCULINO" ? "selected" : ""} ${showErr("genero") ? "has-error" : ""}`} onPointerDown={(e) => e.preventDefault()}>
                  <input type="radio" name={`genero-${value.key}`} value="MASCULINO" checked={value.genero === "MASCULINO"} onChange={() => patch({ genero: "MASCULINO" })} />
                  MASCULINO
                </label>
                <label className={`radio-card ${value.genero === "FEMENINO" ? "selected" : ""} ${showErr("genero") ? "has-error" : ""}`} onPointerDown={(e) => e.preventDefault()}>
                  <input type="radio" name={`genero-${value.key}`} value="FEMENINO" checked={value.genero === "FEMENINO"} onChange={() => patch({ genero: "FEMENINO" })} />
                  FEMENINO
                </label>
              </div>
              <div className="error-container">
                {showErr("genero") && <span className="field-error-message">{showErr("genero")}</span>}
              </div>
            </div>

            {/* Fecha de nacimiento + edad */}
            <div className="form-group">
              <label>Fecha de Nacimiento<span className="required-star">*</span></label>
              <DatePicker
                value={dmyToYmd(value.fechaNacimiento)}
                onChange={(ymd) => patch({ fechaNacimiento: ymdToDmy(ymd), edad: ymd ? calcEdad(ymd) : "" })}
                placeholder="Seleccione la fecha de nacimiento…"
                error={!!showErr("fechaNacimiento")}
              />
              <div className="error-container">
                {showErr("fechaNacimiento") && <span className="field-error-message">{showErr("fechaNacimiento")}</span>}
              </div>
            </div>
            <div className="form-group">
              <label>Edad (calculada automáticamente)</label>
              <input type="number" placeholder="—" value={value.edad} readOnly disabled className="input-disabled" />
              <div className="error-container"></div>
            </div>

            {/* Teléfono (opcional) */}
            <div className="form-group">
              <label>Teléfono de Contacto <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></label>
              <div className="field-row-phone">
                <StyledSelect
                  value={value.telefonoCod}
                  onChange={(v) => patch({ telefonoCod: v })}
                  options={TELEFONO_CODIGOS.map((c) => ({ value: c, label: c }))}
                  ariaLabel="Código de área"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="7 dígitos"
                  value={value.telefonoNum}
                  onChange={(e) => patch({ telefonoNum: e.target.value.replace(/\D/g, "").slice(0, 7) })}
                />
              </div>
            </div>

            {/* Estado físico */}
            <div className="form-group">
              <label>Estado Físico Actual<span className="required-star">*</span></label>
              <div className="radio-group">
                <label className={`radio-card ${value.estadoFisico === "ILESO" ? "selected" : ""} ${showErr("estadoFisico") ? "has-error" : ""}`} onPointerDown={(e) => e.preventDefault()}>
                  <input type="radio" name={`estadoFisico-${value.key}`} value="ILESO" checked={value.estadoFisico === "ILESO"} onChange={() => patch({ estadoFisico: "ILESO" })} />
                  ILESO
                </label>
                <label className={`radio-card ${value.estadoFisico === "LESIONADO" ? "selected" : ""} ${showErr("estadoFisico") ? "has-error" : ""}`} onPointerDown={(e) => e.preventDefault()}>
                  <input type="radio" name={`estadoFisico-${value.key}`} value="LESIONADO" checked={value.estadoFisico === "LESIONADO"} onChange={() => patch({ estadoFisico: "LESIONADO" })} />
                  LESIONADO
                </label>
              </div>
              <div className="error-container">
                {showErr("estadoFisico") && <span className="field-error-message">{showErr("estadoFisico")}</span>}
              </div>
            </div>

            {/* Embarazo (solo femenino) */}
            {value.genero === "FEMENINO" && (
              <div className="form-group">
                <label>¿Está embarazada?</label>
                <div className="radio-group">
                  <label className={`radio-card ${value.embarazo === "NO" ? "selected" : ""}`} onPointerDown={(e) => e.preventDefault()}>
                    <input type="radio" name={`embarazo-${value.key}`} value="NO" checked={value.embarazo === "NO"} onChange={() => patch({ embarazo: "NO" })} />
                    NO
                  </label>
                  <label className={`radio-card ${value.embarazo === "SI" ? "selected" : ""}`} onPointerDown={(e) => e.preventDefault()}>
                    <input type="radio" name={`embarazo-${value.key}`} value="SI" checked={value.embarazo === "SI"} onChange={() => patch({ embarazo: "SI" })} />
                    SI
                  </label>
                </div>
              </div>
            )}

            {/* Patología */}
            <div className="form-group">
              <label>¿Posee alguna patología crónica?<span className="required-star">*</span></label>
              <div className="radio-group">
                <label className={`radio-card ${value.patologia === "SI" ? "selected" : ""} ${showErr("patologia") ? "has-error" : ""}`} onPointerDown={(e) => e.preventDefault()}>
                  <input type="radio" name={`patologia-${value.key}`} value="SI" checked={value.patologia === "SI"} onChange={() => patch({ patologia: "SI" })} />
                  SI
                </label>
                <label className={`radio-card ${value.patologia === "NO" ? "selected" : ""} ${showErr("patologia") ? "has-error" : ""}`} onPointerDown={(e) => e.preventDefault()}>
                  <input type="radio" name={`patologia-${value.key}`} value="NO" checked={value.patologia === "NO"} onChange={() => patch({ patologia: "NO" })} />
                  NO
                </label>
              </div>
              <div className="error-container">
                {showErr("patologia") && <span className="field-error-message">{showErr("patologia")}</span>}
              </div>
            </div>

            <div className={`conditional-wrapper ${value.patologia === "SI" ? "open" : ""}`}>
              <div className="conditional-inner">
                <label style={{ marginBottom: "0.5rem", display: "block" }}>Seleccione patologías<span className="required-star">*</span></label>
                <div style={{ marginTop: "0.5rem" }}>
                  <SearchableSelect
                    placeholder="Buscar y agregar patología…"
                    inputClassName="morb-control"
                    options={patologias
                      .filter((p) => !(value.patologiaIds || []).includes(p.id))
                      .map((p) => ({ value: p.id, label: p.nombre }))}
                    onSelect={addPatologia}
                    error={!!showErr("patologiaIds")}
                  />
                </div>
                <div className="pathology-pills-grid">
                  {(value.patologiaIds || []).length === 0 ? (
                    <span className="pills-empty">(Ninguna seleccionada)</span>
                  ) : (
                    (value.patologiaIds || []).map((id) => (
                      <span key={id} className="chip-pill">
                        {patologiaNombre(id, patologias)}
                        <button type="button" onClick={() => removePatologia(id)} aria-label="Quitar" className="chip-pill__x">×</button>
                      </span>
                    ))
                  )}
                </div>
                <div className="error-container">
                  {showErr("patologiaIds") && <span className="field-error-message">{showErr("patologiaIds")}</span>}
                </div>
              </div>
            </div>

            {/* Medicamentos */}
            <div className={`conditional-wrapper ${value.patologia === "SI" || value.estadoFisico === "LESIONADO" ? "open" : ""}`}>
              <div className="conditional-inner">
                <div className="med-section">
                  <div className="med-section-header" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <span className="med-section-title">Medicamentos</span>
                    <SearchableSelect
                      placeholder="Buscar y agregar medicamento…"
                      inputClassName="morb-control"
                      options={predefinedMedicamentos
                        .filter((m) => !value.medicamentos.some((x) => x.id === m.id))
                        .map((m) => ({ value: m.id, label: [m.nombre, m.concentracion, m.presentacion].filter(Boolean).join(" · ") }))}
                      onSelect={addMed}
                    />
                  </div>
                  {value.medicamentos.length === 0 ? (
                    <p className="med-empty">Sin medicamentos. Elige uno del catálogo arriba.</p>
                  ) : (
                    <div className="med-items">
                      {value.medicamentos.map((m, i) => (
                        <div key={i} className="med-item">
                          <div className="med-item__head">
                            <span className="med-item__name">{medLabel(m.id, predefinedMedicamentos)}</span>
                            <button type="button" className="btn-remove-med" onClick={() => removeMed(i)} aria-label="Quitar medicamento">×</button>
                          </div>
                          <div className="med-item__fields">
                            <div className="med-item__field med-item__field--dose">
                              <span className="med-item__label">Dosis</span>
                              <span className="med-item__dose">{m.dosis || "—"}</span>
                            </div>
                            <div className="med-item__field med-item__field--periodo">
                              <span className="med-item__label">Período</span>
                              <StyledSelect
                                dense
                                value={m.periodo}
                                onChange={(v) => updateMed(i, "periodo", v)}
                                options={PERIODO_OPTIONS.map((op) => ({ value: op, label: op }))}
                                placeholder="Elegir período…"
                                ariaLabel="Período"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Intermitente */}
            <div className="form-group">
              <label>¿Es un residente intermitente?<span className="required-star">*</span></label>
              <div className="radio-group">
                <label className={`radio-card ${value.intermitente === "NO" ? "selected" : ""}`} onPointerDown={(e) => e.preventDefault()}>
                  <input type="radio" name={`intermitente-${value.key}`} value="NO" checked={value.intermitente === "NO"} onChange={() => patch({ intermitente: "NO", motivoIntermitente: "" })} />
                  NO
                </label>
                <label className={`radio-card ${value.intermitente === "SI" ? "selected" : ""}`} onPointerDown={(e) => e.preventDefault()}>
                  <input type="radio" name={`intermitente-${value.key}`} value="SI" checked={value.intermitente === "SI"} onChange={() => patch({ intermitente: "SI" })} />
                  SI
                </label>
              </div>
            </div>

            <div className={`conditional-wrapper ${value.intermitente === "SI" ? "open" : ""}`}>
              <div className="conditional-inner">
                <label>Motivo del intermitente<span className="required-star">*</span></label>
                <textarea
                  placeholder="Ej: Sale a trabajar de lunes a viernes, regresa los fines de semana."
                  value={value.motivoIntermitente}
                  onChange={(e) => patch({ motivoIntermitente: e.target.value })}
                  className={showErr("motivoIntermitente") ? "has-error" : ""}
                />
                <div className="error-container">
                  {showErr("motivoIntermitente") && <span className="field-error-message">{showErr("motivoIntermitente")}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
