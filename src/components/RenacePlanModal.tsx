"use client";

// ── Modal "Planear" (wizard por núcleo) ─────────────────────────────────────
// Se abre desde el Directorio de VZLA RENACE al pulsar "Planear" en un jefe.
// Wizard de 3 pasos (Núcleo → Solución → Observación/guardar) con animación de
// modal + transición de pasos, controles pill/POS del registro y validación
// propia (mensajes rojos + scroll suave dentro del cuerpo scrolleable).

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useAppContext } from "@/context/AppContext";
import { saveLocalRenacePlanteamiento, getAllLocalRenacePlanteamientos } from "@/lib/db";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import StyledSelect from "@/components/StyledSelect";
import Reveal from "@/components/Reveal";
import { PosMoneyInput } from "@/components/PosMoneyInput";
import { VENEZUELA_ESTADOS, VENEZUELA_MUNICIPIOS, PARROQUIAS_POR_ESTADO, RENACE_PLANTEAMIENTO_TIPOS, RENACE_MODALIDAD_PLAN, TELEFONO_CODIGOS } from "@/lib/constants";
import type { RenaceJefe, RenaceMiembro, RenacePlanteamiento, RenaceTipo } from "@/types";

// Los contactos se guardan como un string único "0412-1234567" (igual que el censo);
// en el form van partidos en código + número y se recombinan al guardar.
function parsePhone(s: string | null | undefined): { cod: string; num: string } {
  const digits = String(s ?? "").replace(/\D/g, "");
  if (digits.length >= 4) {
    const cod = digits.slice(0, 4);
    if (TELEFONO_CODIGOS.includes(cod)) return { cod, num: digits.slice(4, 11) };
  }
  return { cod: TELEFONO_CODIGOS[0], num: digits.slice(0, 7) };
}
const combinePhone = (cod: string, num: string) => (num ? `${cod}-${num}` : "");

// Convierte un monto en formato venezolano ("52.000.055,55") a número (52000055.55).
// Quita los puntos de miles y cambia la coma decimal por punto.
const parseMoneyVE = (s: string): number => {
  const clean = String(s ?? "").replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : NaN;
};

type PlanForm = {
  tipo: RenaceTipo | "";
  modalidadPlan: string; precioOCanon: string;
  nombreContraparte: string; cedulaContraparte: string;
  contactoCod: string; contactoNum: string; contacto2Cod: string; contacto2Num: string;
  estado: string; municipio: string; parroquia: string; direccionEspecifica: string;
  estadoPreferencia: string; observacion: string;
};
const EMPTY_PLAN: PlanForm = {
  tipo: "", modalidadPlan: "", precioOCanon: "", nombreContraparte: "", cedulaContraparte: "",
  contactoCod: TELEFONO_CODIGOS[0], contactoNum: "", contacto2Cod: TELEFONO_CODIGOS[0], contacto2Num: "",
  estado: "", municipio: "", parroquia: "", direccionEspecifica: "", estadoPreferencia: "", observacion: "",
};
function planFromRecord(p: RenacePlanteamiento): PlanForm {
  const c1 = parsePhone(p.contacto);
  const c2 = parsePhone(p.contactoSecundario);
  return {
    tipo: (p.tipo as RenaceTipo) || "",
    modalidadPlan: p.modalidadPlan || "", precioOCanon: p.precioOCanon || "",
    nombreContraparte: p.nombreContraparte || "", cedulaContraparte: p.cedulaContraparte || "",
    contactoCod: c1.cod, contactoNum: c1.num, contacto2Cod: c2.cod, contacto2Num: c2.num,
    estado: p.estado || "", municipio: p.municipio || "", parroquia: p.parroquia || "",
    direccionEspecifica: p.direccionEspecifica || "", estadoPreferencia: p.estadoPreferencia || "",
    observacion: p.observacion || "",
  };
}

// ── Sub-controles pill (module-level → no pierden foco al re-render) ──────────
function Txt({ label, value, onChange, error, placeholder, wide, inputMode, numeric, req }: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; placeholder?: string; wide?: boolean; inputMode?: "text" | "numeric" | "decimal" | "tel";
  numeric?: boolean; req?: boolean; // numeric = solo 0-9; req = muestra asterisco
}) {
  return (
    <label className={`carac-field${wide ? " carac-field--wide" : ""}`}>
      <span>{label}{req && <span className="required-star"> *</span>}</span>
      <input className={`morb-control${error ? " has-error" : ""}`} value={value} placeholder={placeholder}
        inputMode={numeric ? "numeric" : inputMode}
        onChange={(e) => onChange(numeric ? e.target.value.replace(/\D/g, "") : e.target.value.toUpperCase())} />
      <div className="error-container">{error && <span className="field-error-message">{error}</span>}</div>
    </label>
  );
}
function Sel({ label, value, onChange, options, error, wide, disabled, req }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; error?: string; wide?: boolean; disabled?: boolean; req?: boolean;
}) {
  return (
    <label className={`carac-field${wide ? " carac-field--wide" : ""}`}>
      <span>{label}{req && <span className="required-star"> *</span>}</span>
      <StyledSelect value={value} onChange={onChange} options={options} ariaLabel={label} error={!!error} disabled={disabled} />
      <div className="error-container">{error && <span className="field-error-message">{error}</span>}</div>
    </label>
  );
}
function Money({ label, value, onChange, error, req }: {
  label: string; value: string; onChange: (v: string) => void; error?: string; req?: boolean;
}) {
  return (
    <label className="carac-field">
      <span>{label}{req && <span className="required-star"> *</span>}</span>
      <PosMoneyInput value={value} onChange={onChange} className={`morb-control${error ? " has-error" : ""}`} ariaLabel={label} placeholder="0,00" />
      <div className="error-container">{error && <span className="field-error-message">{error}</span>}</div>
    </label>
  );
}
// Teléfono estilo registro: código de área (StyledSelect) + número de 7 dígitos (solo 0-9).
function Phone({ label, cod, num, onCod, onNum, error, req }: {
  label: string; cod: string; num: string; onCod: (v: string) => void; onNum: (v: string) => void;
  error?: string; req?: boolean;
}) {
  return (
    <label className="carac-field">
      <span>{label}{req && <span className="required-star"> *</span>}</span>
      <div className="field-row-phone">
        <StyledSelect value={cod} onChange={onCod} ariaLabel={`${label} — código de área`}
          options={TELEFONO_CODIGOS.map((c) => ({ value: c, label: c }))} />
        <input type="text" className={`morb-control${error ? " has-error" : ""}`} inputMode="numeric" placeholder="7 dígitos" value={num}
          onChange={(e) => onNum(e.target.value.replace(/\D/g, "").slice(0, 7))} />
      </div>
      <div className="error-container">{error && <span className="field-error-message">{error}</span>}</div>
    </label>
  );
}

const chev = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const tipoLabel = (t: string) => RENACE_PLANTEAMIENTO_TIPOS.find((x) => x.value === t)?.label || t;
const modalidadLabel = (m: string) => RENACE_MODALIDAD_PLAN.find((x) => x.value === m)?.label || m;

export default function RenacePlanModal({ jefe, miembros, onClose, onSaved, showToast }: {
  jefe: RenaceJefe; // trae su refugioId → el planteamiento se scopea a ESE campamento
  miembros: RenaceMiembro[];
  onClose: () => void;
  onSaved?: () => void; // señal para que el tab refresque (semáforo/KPI) — guardado optimista
  showToast: (message: string, type: "success" | "error" | "warning" | "info") => void;
}) {
  const { triggerSync } = useAppContext();
  const localId = `${jefe.refugioId}::${jefe.nro}`;
  const [show, setShow] = useState(true);
  const modal = useAnimatedModal(show);
  const close = () => setShow(false);
  useEffect(() => { if (!modal.mounted) onClose(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [modal.mounted]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [plan, setPlan] = useState<PlanForm>({ ...EMPTY_PLAN });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Precarga: primero el pendiente LOCAL (aún sin sincronizar → tiene prioridad), si no
  // el del servidor.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const locals = await getAllLocalRenacePlanteamientos();
        const localRec = locals.find((l) => l.id === localId && l.status !== "error");
        if (localRec) {
          if (!cancel) { setPlan(planFromRecord(localRec.data as RenacePlanteamiento)); setExisting(true); setLoading(false); }
          return;
        }
        const r = await apiFetch(`/api/vzlarenace/planteamiento?jefeNro=${jefe.nro}&refugioId=${encodeURIComponent(jefe.refugioId)}`);
        if (!cancel && r.ok) {
          const data = await r.json();
          if (data?.planteamiento) { setPlan(planFromRecord(data.planteamiento)); setExisting(true); }
        }
      } catch { /* offline / error → arranca vacío */ }
      finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [jefe.nro, jefe.refugioId]);

  const setField = (k: keyof PlanForm, v: string) => {
    setPlan((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };
  // Cambiar de estado limpia municipio y parroquia (dependientes).
  const setEstado = (v: string) => {
    setPlan((p) => ({ ...p, estado: v, municipio: "", parroquia: "" }));
    setErrors((e) => ({ ...e, estado: "", municipio: "", parroquia: "" }));
  };

  const esCompraAlquiler = plan.tipo === "COMPRA" || plan.tipo === "ALQUILER";

  const validateSolucion = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!plan.tipo) { e.tipo = "Selecciona un planteamiento."; return e; }
    if (esCompraAlquiler) {
      if (!plan.precioOCanon.trim()) e.precioOCanon = plan.tipo === "ALQUILER" ? "Indica el cánon." : "Indica el precio.";
      else if (plan.tipo === "ALQUILER") {
        const monto = parseMoneyVE(plan.precioOCanon);
        if (Number.isFinite(monto) && monto > 500) e.precioOCanon = "El cánon no puede exceder 500 $.";
      }
      if (!plan.nombreContraparte.trim()) e.nombreContraparte = plan.tipo === "ALQUILER" ? "Indica el arrendatario." : "Indica el vendedor.";
      if (!plan.contactoNum.trim()) e.contactoNum = "Indica el número de contacto.";
      // Dirección: TODOS los campos obligatorios en compra/alquiler.
      if (!plan.estado) e.estado = "Selecciona el estado.";
      if (!plan.municipio) e.municipio = "Selecciona el municipio.";
      if (!plan.parroquia.trim()) e.parroquia = "Indica la parroquia.";
      if (!plan.direccionEspecifica.trim()) e.direccionEspecifica = "Indica la dirección específica.";
    }
    if (plan.tipo === "GMVV_INTERIOR" && !plan.estadoPreferencia) e.estadoPreferencia = "Selecciona el estado de preferencia.";
    if (plan.tipo === "PLAN_RENACE" && !plan.modalidadPlan) e.modalidadPlan = "Selecciona la modalidad.";
    return e;
  };

  const scrollToError = () => setTimeout(() => {
    const el = document.querySelector(".renace-modal .field-error-message, .renace-modal .has-error");
    const target = (el?.closest(".carac-field") as HTMLElement) || (el as HTMLElement | null);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 60);

  const goNext = () => {
    if (step === 2) {
      const errs = validateSolucion();
      setErrors(errs);
      if (Object.keys(errs).length) { showToast("Revisa los campos marcados.", "warning"); scrollToError(); return; }
    }
    setStep((s) => (Math.min(3, s + 1) as 1 | 2 | 3));
  };

  const save = async () => {
    const errs = validateSolucion();
    setErrors(errs);
    if (Object.keys(errs).length) { setStep(2); showToast("Revisa los campos marcados.", "warning"); scrollToError(); return; }
    setSaving(true);
    try {
      // Guardado OFFLINE-first: a la cola de IndexedDB (optimista) + disparo de sync.
      // El semáforo/KPI se ponen verde al instante; la cola reintenta con backoff.
      const data = {
        tipo: plan.tipo,
        modalidadPlan: plan.modalidadPlan,
        precioOCanon: plan.precioOCanon,
        nombreContraparte: plan.nombreContraparte,
        cedulaContraparte: plan.cedulaContraparte,
        contacto: combinePhone(plan.contactoCod, plan.contactoNum),
        contactoSecundario: combinePhone(plan.contacto2Cod, plan.contacto2Num),
        estado: plan.estado,
        municipio: plan.municipio,
        parroquia: plan.parroquia,
        direccionEspecifica: plan.direccionEspecifica,
        estadoPreferencia: plan.estadoPreferencia,
        observacion: plan.observacion,
      };
      await saveLocalRenacePlanteamiento({ id: localId, jefeNro: jefe.nro, refugioId: jefe.refugioId, data });
      triggerSync();
      showToast("Planteamiento guardado. Se sincroniza automáticamente.", "success");
      onSaved?.();
      close();
    } catch (e) {
      console.error(e);
      showToast("No se pudo guardar el planteamiento localmente.", "error");
    } finally { setSaving(false); }
  };

  if (!modal.mounted) return null;

  return (
    <div className={`modal-overlay${modal.closing ? " modal-overlay--closing" : ""}`} onClick={close}>
      <div className={`modal-content pill-form renace-modal${modal.closing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="renace-modal__head">
          <div>
            <h3>Planear solución — {jefe.nombres}</h3>
            <p className="renace-modal__sub">NÚCLEO #{jefe.nro} · C.I. {jefe.cedula || "—"} · {miembros.length} {miembros.length === 1 ? "persona" : "personas"}</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Cerrar">×</button>
        </div>

        {/* Progreso del wizard */}
        <div className="wizard-progress renace-modal__progress">
          {[1, 2, 3].map((s) => (
            <div key={s} className="wizard-step-wrapper">
              <div className={`wizard-step-dot ${step === s ? "active" : step > s ? "done" : ""}`}>
                {step > s ? chev : s}
              </div>
              {s < 3 && <div className={`wizard-step-line ${step > s ? "done" : ""}`} />}
            </div>
          ))}
        </div>
        <div className="wizard-step-label">
          {step === 1 && "Paso 1 — Núcleo familiar"}
          {step === 2 && "Paso 2 — Solución habitacional"}
          {step === 3 && "Paso 3 — Observación y guardar"}
        </div>

        <div className="renace-modal__body">
          {loading ? (
            <div className="carac-grid renace-modal__skeleton">
              {Array.from({ length: 6 }).map((_, i) => (
                <label key={i} className={`carac-field${i === 5 ? " carac-field--wide" : ""}`}>
                  <span className="skeleton-cell" style={{ width: "42%", height: 9 }} />
                  <span className="skeleton-cell" style={{ width: "100%", height: 42, borderRadius: 999 }} />
                  <div className="error-container" />
                </label>
              ))}
            </div>
          ) : (
            <>
              {/* PASO 1 — Núcleo (solo lectura) */}
              {step === 1 && (
                <div className="form-step-content" key="rstep-1">
                  <dl className="renace-jefe-grid">
                    <div><dt>Cédula</dt><dd>{jefe.cedula || "—"}</dd></div>
                    <div><dt>Sexo</dt><dd>{jefe.sexo || "—"}</dd></div>
                    <div><dt>Edad</dt><dd>{jefe.edad ?? "—"}</dd></div>
                    <div><dt>Teléfono</dt><dd>{jefe.telefono || "—"}</dd></div>
                    <div><dt>Profesión</dt><dd>{jefe.profesion || "—"}</dd></div>
                    <div><dt>Procedencia</dt><dd>{[jefe.estadoProcedencia, jefe.parroquiaProcedencia].filter(Boolean).join(" / ") || "—"}</dd></div>
                    <div><dt>Tipo de afectación</dt><dd>{jefe.tipoAfectacion || "—"}</dd></div>
                    <div><dt>Condición de la vivienda</dt><dd>{jefe.condicionVivienda || "—"}</dd></div>
                    <div><dt>N° de certificado</dt><dd>{jefe.numeroCertificado || "—"}</dd></div>
                    <div className="renace-jefe-grid__wide"><dt>Planteamiento según afectación (RUV)</dt><dd>{jefe.planteamientoAfectacion || "—"}</dd></div>
                  </dl>

                  <div className="renace-block">
                    <h4 className="renace-block__title">Grupo familiar ({miembros.length})</h4>
                    <div className="registro-table-wrapper">
                      <table className="registro-table">
                        <thead><tr><th>Nombre</th><th>Cédula</th><th>Parentesco</th><th>Sexo</th><th>Edad</th></tr></thead>
                        <tbody>
                          {miembros.length === 0 ? (
                            <tr><td colSpan={5} className="renace-td-empty">Sin miembros registrados.</td></tr>
                          ) : miembros.map((m) => (
                            <tr key={m.id}>
                              <td>{m.nombres}</td><td>{m.cedula || "—"}</td><td>{m.parentesco || "—"}</td><td>{m.sexo || "—"}</td><td>{m.edad ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 2 — Solución (condicional) */}
              {step === 2 && (
                <div className="form-step-content" key="rstep-2">
                  {existing && <div className="renace-modal__note">Este núcleo ya tiene un planteamiento; al guardar se actualizará.</div>}
                  <div className="carac-grid">
                    <Sel label="Planteamiento" value={plan.tipo} error={errors.tipo} wide
                      onChange={(v) => setField("tipo", v)}
                      options={[{ value: "", label: "— Seleccionar —" }, ...RENACE_PLANTEAMIENTO_TIPOS.map((t) => ({ value: t.value, label: t.label }))]} />

                    <Reveal open={esCompraAlquiler}>
                      <div className="carac-grid renace-sub">
                        <Money label={plan.tipo === "ALQUILER" ? "Cánon mensual ($) — máx. 500" : "Precio ($)"} req
                          value={plan.precioOCanon} onChange={(v) => setField("precioOCanon", v)} error={errors.precioOCanon} />
                        <Txt label={plan.tipo === "ALQUILER" ? "Nombre del arrendatario" : "Nombre del vendedor"} req
                          value={plan.nombreContraparte} onChange={(v) => setField("nombreContraparte", v)} error={errors.nombreContraparte} />
                        <Txt label="Cédula de la contraparte" value={plan.cedulaContraparte} onChange={(v) => setField("cedulaContraparte", v)} numeric />
                        <Phone label="Contacto" req cod={plan.contactoCod} num={plan.contactoNum} onCod={(v) => setField("contactoCod", v)} onNum={(v) => setField("contactoNum", v)} error={errors.contactoNum} />
                        <Phone label="Contacto secundario" cod={plan.contacto2Cod} num={plan.contacto2Num} onCod={(v) => setField("contacto2Cod", v)} onNum={(v) => setField("contacto2Num", v)} />
                        <Sel label="Estado" value={plan.estado} onChange={setEstado} error={errors.estado} req
                          options={[{ value: "", label: "— Seleccionar —" }, ...VENEZUELA_ESTADOS.map((s) => ({ value: s, label: s }))]} />
                        <Sel label="Municipio" value={plan.municipio} onChange={(v) => setField("municipio", v)} disabled={!plan.estado} error={errors.municipio} req
                          options={[{ value: "", label: plan.estado ? "— Seleccionar —" : "Elige un estado primero" }, ...(VENEZUELA_MUNICIPIOS[plan.estado] || []).map((m) => ({ value: m, label: m }))]} />
                        {PARROQUIAS_POR_ESTADO[plan.estado] ? (
                          <Sel label="Parroquia" value={plan.parroquia} onChange={(v) => setField("parroquia", v)} error={errors.parroquia} req
                            options={[{ value: "", label: "— Seleccionar —" }, ...PARROQUIAS_POR_ESTADO[plan.estado].map((p) => ({ value: p, label: p }))]} />
                        ) : (
                          <Txt label="Parroquia" value={plan.parroquia} onChange={(v) => setField("parroquia", v)} error={errors.parroquia} req />
                        )}
                        <Txt label="Dirección específica" wide req value={plan.direccionEspecifica} onChange={(v) => setField("direccionEspecifica", v)} error={errors.direccionEspecifica} />
                      </div>
                    </Reveal>

                    <Reveal open={plan.tipo === "GMVV_INTERIOR"}>
                      <div className="carac-grid renace-sub">
                        {/* Interior del país → sin La Guaira en la lista. */}
                        <Sel label="Estado de preferencia" value={plan.estadoPreferencia} error={errors.estadoPreferencia} req
                          onChange={(v) => setField("estadoPreferencia", v)}
                          options={[{ value: "", label: "— Seleccionar —" }, ...VENEZUELA_ESTADOS.filter((s) => s !== "LA GUAIRA").map((s) => ({ value: s, label: s }))]} />
                      </div>
                    </Reveal>

                    <Reveal open={plan.tipo === "PLAN_RENACE"}>
                      <div className="carac-grid renace-sub">
                        <Sel label="Modalidad" value={plan.modalidadPlan} error={errors.modalidadPlan} req
                          onChange={(v) => setField("modalidadPlan", v)}
                          options={[{ value: "", label: "— Seleccionar —" }, ...RENACE_MODALIDAD_PLAN.map((m) => ({ value: m.value, label: m.label }))]} />
                      </div>
                    </Reveal>
                  </div>
                </div>
              )}

              {/* PASO 3 — Observación + resumen */}
              {step === 3 && (
                <div className="form-step-content" key="rstep-3">
                  <div className="carac-grid">
                    <label className="carac-field carac-field--wide">
                      <span>Observación</span>
                      <textarea className="morb-control" rows={3} value={plan.observacion} onChange={(e) => setField("observacion", e.target.value.toUpperCase())} />
                      <div className="error-container" />
                    </label>
                  </div>

                  <div className="renace-resumen">
                    <h4 className="renace-block__title">Resumen</h4>
                    <dl className="renace-jefe-grid">
                      <div><dt>Planteamiento</dt><dd>{tipoLabel(plan.tipo)}</dd></div>
                      {esCompraAlquiler && <>
                        <div><dt>{plan.tipo === "ALQUILER" ? "Cánon" : "Precio"}</dt><dd>{plan.precioOCanon ? `$ ${plan.precioOCanon}` : "—"}</dd></div>
                        <div><dt>{plan.tipo === "ALQUILER" ? "Arrendatario" : "Vendedor"}</dt><dd>{plan.nombreContraparte || "—"}</dd></div>
                        <div><dt>Contacto</dt><dd>{combinePhone(plan.contactoCod, plan.contactoNum) || "—"}</dd></div>
                        <div className="renace-jefe-grid__wide"><dt>Dirección</dt><dd>{[plan.estado, plan.municipio, plan.parroquia, plan.direccionEspecifica].filter(Boolean).join(", ") || "—"}</dd></div>
                      </>}
                      {plan.tipo === "GMVV_INTERIOR" && <div><dt>Estado de preferencia</dt><dd>{plan.estadoPreferencia || "—"}</dd></div>}
                      {plan.tipo === "PLAN_RENACE" && <div><dt>Modalidad</dt><dd>{modalidadLabel(plan.modalidadPlan)}</dd></div>}
                      <div className="renace-jefe-grid__wide"><dt>Observación</dt><dd>{plan.observacion || "—"}</dd></div>
                    </dl>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="wizard-nav renace-modal__nav">
          {step > 1 && (
            <button type="button" className="btn-back" onClick={() => setStep((s) => (Math.max(1, s - 1) as 1 | 2 | 3))}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              Atrás
            </button>
          )}
          {step < 3 && (
            <button type="button" className="btn-submit" onClick={goNext} disabled={loading}>
              Continuar
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          )}
          {step === 3 && (
            <button type="button" className="btn-submit" onClick={save} disabled={saving || loading}>
              {saving ? "Guardando…" : existing ? "Actualizar planteamiento" : "Guardar planteamiento"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
