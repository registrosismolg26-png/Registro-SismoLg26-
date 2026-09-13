"use client";

// ── Modal "Retirar familia" (VZLA RENACE) ───────────────────────────────────
// Se abre desde el Directorio en un núcleo APROBADO. Wizard de 2 pasos (Solución
// ejecutada → Destino y confirmar) con el mismo lenguaje pill del modal Plantear.
// Al confirmar se cruza CADA integrante contra el censo (server-side, atómico): si
// alguno no matchea, REBOTA y aquí se listan los faltantes. Requiere conexión (el
// cruce valida contra el censo).

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { getAllLocalRenacePlanteamientos } from "@/lib/db";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import StyledSelect from "@/components/StyledSelect";
import DatePicker from "@/components/DatePicker";
import Reveal from "@/components/Reveal";
import { PosMoneyInput } from "@/components/PosMoneyInput";
import { VENEZUELA_ESTADOS, VENEZUELA_MUNICIPIOS, PARROQUIAS_POR_ESTADO, RENACE_MOTIVO_RETIRO, MONEDAS } from "@/lib/constants";
import type { RenaceJefe, RenacePlanteamiento } from "@/types";

// El planteamiento MAPEA al retiro (el retiro = el planteamiento ejecutado). El tipo del
// planteamiento se traduce al motivo de retiro (que es una razón del censo).
const TIPO_TO_MOTIVO: Record<string, string> = {
  COMPRA: "Por compra de vivienda",
  ALQUILER: "Por alquiler",
  GMVV_INTERIOR: "Por asignación GMVV",
  PLAN_RENACE: "Vivienda reparada Plan Vzla Renace",
};
function retiroFromPlan(p: Partial<RenacePlanteamiento>): Partial<RetiroForm> {
  const esCA = p.tipo === "COMPRA" || p.tipo === "ALQUILER";
  return {
    motivo: (p.tipo && TIPO_TO_MOTIVO[p.tipo]) || "",
    monto: esCA ? (p.precioOCanon || "") : "",
    moneda: "USD", // el precio/cánon del planteamiento va en $
    destinoEstado: esCA ? (p.estado || "") : (p.tipo === "GMVV_INTERIOR" ? (p.estadoPreferencia || "") : ""),
    destinoMunicipio: esCA ? (p.municipio || "") : "",
    destinoParroquia: esCA ? (p.parroquia || "") : "",
    destinoDireccion: esCA ? (p.direccionEspecifica || "") : "",
    observacion: p.observacion || "",
  };
}

const dmyToYmd = (dmy: string): string => {
  const p = (dmy || "").split("/");
  if (p.length !== 3 || p[2].length !== 4) return "";
  return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
};
const ymdToDmy = (ymd: string): string => {
  if (!ymd) return "";
  const p = ymd.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : "";
};
const todayDmy = (): string => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

type RetiroForm = {
  motivo: string; monto: string; moneda: string; fechaRetiro: string;
  destinoEstado: string; destinoMunicipio: string; destinoParroquia: string; destinoDireccion: string;
  observacion: string;
};
const EMPTY: RetiroForm = {
  motivo: "", monto: "", moneda: "USD", fechaRetiro: "",
  destinoEstado: "", destinoMunicipio: "", destinoParroquia: "", destinoDireccion: "", observacion: "",
};

// ── Sub-controles pill (module-level → no pierden foco al re-render) ──────────
function Txt({ label, value, onChange, error, wide, req }: {
  label: string; value: string; onChange: (v: string) => void; error?: string; wide?: boolean; req?: boolean;
}) {
  return (
    <label className={`carac-field${wide ? " carac-field--wide" : ""}`}>
      <span>{label}{req && <span className="required-star"> *</span>}</span>
      <input className={`morb-control${error ? " has-error" : ""}`} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <div className="error-container">{error && <span className="field-error-message">{error}</span>}</div>
    </label>
  );
}
function Sel({ label, value, onChange, options, error, wide, disabled, req }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
  error?: string; wide?: boolean; disabled?: boolean; req?: boolean;
}) {
  return (
    <label className={`carac-field${wide ? " carac-field--wide" : ""}`}>
      <span>{label}{req && <span className="required-star"> *</span>}</span>
      <StyledSelect value={value} onChange={onChange} options={options} ariaLabel={label} error={!!error} disabled={disabled} />
      <div className="error-container">{error && <span className="field-error-message">{error}</span>}</div>
    </label>
  );
}

export default function RenaceRetiroModal({ jefe, familia, onClose, onSaved, showToast }: {
  jefe: RenaceJefe;
  familia: { nombres: string; cedula: string; rol: string }[]; // jefe + miembros (para el resumen)
  onClose: () => void;
  onSaved?: () => void;
  showToast: (message: string, type: "success" | "error" | "warning" | "info") => void;
}) {
  const miembros = familia.length;
  const monedaSimbolo = (m: string) => (m === "USD" ? "$" : "Bs");
  const [show, setShow] = useState(true);
  const modal = useAnimatedModal(show);
  const close = () => setShow(false);
  useEffect(() => { if (!modal.mounted) onClose(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [modal.mounted]);

  const [step, setStep] = useState<1 | 2>(1);
  const [f, setF] = useState<RetiroForm>({ ...EMPTY, fechaRetiro: todayDmy() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [faltantes, setFaltantes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefilled, setPrefilled] = useState(false);

  // Precarga: el retiro = el planteamiento EJECUTADO → se prellena con sus datos
  // (motivo/monto/dirección destino), editables. Prioriza el pendiente LOCAL, si no el
  // del servidor. La fecha de retiro arranca HOY por defecto (editable).
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const locals = await getAllLocalRenacePlanteamientos();
        const localRec = locals.find((l) => l.id === `${jefe.refugioId}::${jefe.cedula}` && l.status !== "error");
        let plan: Partial<RenacePlanteamiento> | null = localRec ? (localRec.data as RenacePlanteamiento) : null;
        if (!plan) {
          const r = await apiFetch(`/api/vzlarenace/planteamiento?jefeNro=${jefe.nro}&jefeCedula=${encodeURIComponent(jefe.cedula || "")}&refugioId=${encodeURIComponent(jefe.refugioId)}`);
          if (r.ok) { const data = await r.json(); plan = data?.planteamiento || null; }
        }
        if (!cancel && plan) { setF((prev) => ({ ...prev, ...retiroFromPlan(plan!) })); setPrefilled(true); }
      } catch { /* arranca vacío */ }
      finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [jefe.nro, jefe.refugioId]);

  const set = (k: keyof RetiroForm, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };
  const setEstado = (v: string) => {
    setF((p) => ({ ...p, destinoEstado: v, destinoMunicipio: "", destinoParroquia: "" }));
  };

  const validate1 = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!f.motivo) e.motivo = "Selecciona el motivo del retiro.";
    if (!f.fechaRetiro) e.fechaRetiro = "Indica la fecha de retiro.";
    return e;
  };

  const goNext = () => {
    const errs = validate1();
    setErrors(errs);
    if (Object.keys(errs).length) { showToast("Revisa los campos marcados.", "warning"); return; }
    setStep(2);
  };

  const save = async () => {
    const errs = validate1();
    setErrors(errs);
    if (Object.keys(errs).length) { setStep(1); showToast("Revisa los campos marcados.", "warning"); return; }
    if (!navigator.onLine) { showToast("Necesitas conexión para retirar (se valida contra el censo).", "warning"); return; }
    setSaving(true);
    setFaltantes([]);
    try {
      const res = await apiFetch("/api/vzlarenace/estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "retirar", jefeNro: jefe.nro, jefeCedula: jefe.cedula, refugioId: jefe.refugioId,
          motivo: f.motivo, monto: f.monto, moneda: f.moneda, fechaRetiro: f.fechaRetiro,
          destinoEstado: f.destinoEstado, destinoMunicipio: f.destinoMunicipio,
          destinoParroquia: f.destinoParroquia, destinoDireccion: f.destinoDireccion,
          observacion: f.observacion,
        }),
        timeoutMs: 30000,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        const nb = Number(data.backfills || 0);
        const extra = nb > 0 ? ` ${nb} cédula${nb === 1 ? "" : "s"} completada${nb === 1 ? "" : "s"} desde el censo.` : "";
        showToast(`Familia retirada. ${data.marcados} ${data.marcados === 1 ? "persona marcada" : "personas marcadas"} en el censo.${extra}`, "success");
        onSaved?.();
        close();
        return;
      }
      if (res.status === 422 && Array.isArray(data?.faltantes)) {
        setFaltantes(data.faltantes);
        setStep(2);
        showToast("No se pudo retirar: hay integrantes sin ficha en el censo.", "error");
        return;
      }
      showToast(data?.error || "No se pudo retirar la familia.", "error");
    } catch (e) {
      console.error(e);
      showToast("Error de conexión al retirar la familia.", "error");
    } finally { setSaving(false); }
  };

  if (!modal.mounted) return null;

  return (
    <div className={`modal-overlay${modal.closing ? " modal-overlay--closing" : ""}`} onClick={close}>
      <div className={`modal-content pill-form renace-modal${modal.closing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="renace-modal__head">
          <div>
            <h3>Retirar familia — {jefe.nombres}</h3>
            <p className="renace-modal__sub">NÚCLEO #{jefe.nro} · C.I. {jefe.cedula || "—"} · {miembros} {miembros === 1 ? "persona" : "personas"}</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Cerrar">×</button>
        </div>

        <div className="wizard-progress renace-modal__progress">
          {[1, 2].map((s) => (
            <div key={s} className="wizard-step-wrapper">
              <div className={`wizard-step-dot ${step === s ? "active" : step > s ? "done" : ""}`}>{step > s ? "✓" : s}</div>
              {s < 2 && <div className={`wizard-step-line ${step > s ? "done" : ""}`} />}
            </div>
          ))}
        </div>
        <div className="wizard-step-label">
          {step === 1 ? "Paso 1 — Solución ejecutada" : "Paso 2 — Destino y confirmar"}
        </div>

        <div className="renace-modal__body">
          {step === 1 && (
            <div className="form-step-content" key="rt-1">
              {loading ? (
                <p className="renace-retiro-hint">Cargando datos del planteamiento…</p>
              ) : prefilled ? (
                <p className="renace-retiro-hint">Precargado con el planteamiento aprobado. Puedes editar cualquier dato.</p>
              ) : null}
              <div className="carac-grid">
                <Sel label="Motivo (solución ejecutada)" value={f.motivo} onChange={(v) => set("motivo", v)} error={errors.motivo} req wide
                  options={[{ value: "", label: "— Seleccionar —" }, ...RENACE_MOTIVO_RETIRO.map((m) => ({ value: m, label: m }))]} />

                <label className="carac-field">
                  <span>Monto ejecutado</span>
                  <div className="field-row-phone">
                    <StyledSelect value={f.moneda} onChange={(v) => set("moneda", v)} ariaLabel="Moneda"
                      options={MONEDAS.map((m) => ({ value: m.value, label: m.label }))} />
                    <PosMoneyInput value={f.monto} onChange={(v) => set("monto", v)} className="morb-control" ariaLabel="Monto ejecutado" placeholder="0,00" />
                  </div>
                  <div className="error-container" />
                </label>

                <label className="carac-field">
                  <span>Fecha de retiro<span className="required-star"> *</span></span>
                  <DatePicker value={dmyToYmd(f.fechaRetiro)} onChange={(ymd) => set("fechaRetiro", ymdToDmy(ymd))} defaultToday placeholder="Seleccione la fecha…" error={!!errors.fechaRetiro} />
                  <div className="error-container">{errors.fechaRetiro && <span className="field-error-message">{errors.fechaRetiro}</span>}</div>
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="form-step-content" key="rt-2">
              <div className="renace-modal__note">
                Se marcará como <strong>retirada</strong> a <strong>toda la familia</strong> y se encadenará con el censo. Si algún integrante no tiene ficha en el censo de este campamento, la operación <strong>se rebota completa</strong> y no se cambia nada.
              </div>

              {/* Resumen REAL de lo que hará: personas + razón/monto/fecha. */}
              <div className="renace-resumen renace-retiro-resumen">
                <p className="renace-retiro-resumen__linea">
                  Se retirará a <strong>{familia.length}</strong> {familia.length === 1 ? "persona" : "personas"} con la razón <strong>{f.motivo || "—"}{f.monto ? ` por ${monedaSimbolo(f.moneda)} ${f.monto}` : ""}</strong>{f.fechaRetiro ? <> · fecha <strong>{f.fechaRetiro}</strong></> : null}.
                </p>
                <div className="registro-table-wrapper">
                  <table className="registro-table">
                    <thead><tr><th>Nombre</th><th>Cédula</th><th>Rol</th></tr></thead>
                    <tbody>
                      {familia.map((p, i) => (
                        <tr key={i}><td>{p.nombres}</td><td>{p.cedula || "—"}</td><td>{p.rol}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {faltantes.length > 0 && (
                <div className="renace-modal__error-list">
                  <strong>No se pudo retirar. Faltan en el censo:</strong>
                  <ul>{faltantes.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}

              <div className="carac-grid">
                <Sel label="Estado (destino)" value={f.destinoEstado} onChange={setEstado}
                  options={[{ value: "", label: "— Seleccionar —" }, ...VENEZUELA_ESTADOS.map((s) => ({ value: s, label: s }))]} />
                <Sel label="Municipio (destino)" value={f.destinoMunicipio} onChange={(v) => set("destinoMunicipio", v)} disabled={!f.destinoEstado}
                  options={[{ value: "", label: f.destinoEstado ? "— Seleccionar —" : "Elige un estado primero" }, ...(VENEZUELA_MUNICIPIOS[f.destinoEstado] || []).map((m) => ({ value: m, label: m }))]} />
                {PARROQUIAS_POR_ESTADO[f.destinoEstado] ? (
                  <Sel label="Parroquia (destino)" value={f.destinoParroquia} onChange={(v) => set("destinoParroquia", v)}
                    options={[{ value: "", label: "— Seleccionar —" }, ...PARROQUIAS_POR_ESTADO[f.destinoEstado].map((p) => ({ value: p, label: p }))]} />
                ) : (
                  <Txt label="Parroquia (destino)" value={f.destinoParroquia} onChange={(v) => set("destinoParroquia", v)} />
                )}
                <Txt label="Dirección (destino)" wide value={f.destinoDireccion} onChange={(v) => set("destinoDireccion", v)} />
                <label className="carac-field carac-field--wide">
                  <span>Observación</span>
                  <textarea className="morb-control" rows={3} value={f.observacion} onChange={(e) => set("observacion", e.target.value.toUpperCase())} />
                  <div className="error-container" />
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="wizard-nav renace-modal__nav">
          {step > 1 && (
            <button type="button" className="btn-back" onClick={() => setStep(1)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              Atrás
            </button>
          )}
          {step === 1 ? (
            <button type="button" className="btn-submit" onClick={goNext} disabled={loading}>
              {loading ? "Cargando…" : "Continuar"}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          ) : (
            <button type="button" className="btn-submit btn-submit--danger" onClick={save} disabled={saving}>
              {saving ? "Retirando…" : "Retirar familia"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
