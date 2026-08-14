"use client";

// ── Pestaña: Historial Clínico (roles médicos + Master) ─────────────────────
// Ficha clínica evolutiva del paciente al estilo de los mejores EHR/SaaS clínicos:
//  1) Banner del paciente (demografía + flags).
//  2) Resumen: lista de problemas (diagnósticos), antecedentes y medicación.
//  3) Línea de tiempo de ATENCIONES (evolución): cada consulta como una nota
//     cronológica con diagnóstico, recetas y notas del médico.
// Se arma 100% en el cliente desde las consultas (locales + remotas) del refugio,
// cruzando con el censo (registros) cuando falta demografía. 100% pill/responsive.

import { useMemo, useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAppContext } from "@/context/AppContext";
import { patologiaNombre, medLabel, tipoLesionNombre, formatCedulaDisplay, initialsOf } from "@/lib/helpers";
import { ESTADO_LESION_LABELS } from "@/lib/constants";
import SearchableSingleSelect from "@/components/SearchableSingleSelect";
import { HistoriaClinicaExtendida, tieneHistoriaExtendida } from "@/components/HistoriaClinicaExtendida";
import { WizardNav } from "@/components/WizardNav";
import { useBodyScrollLock } from "@/components/useBodyScrollLock";
import type { Medicamento, Lesion } from "@/types";

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

const edadFromISO = (iso?: string): number | null => {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
};

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "long", year: "numeric" });
const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });

const TIPO_LABEL: Record<string, string> = {
  REFUGIADO: "Refugiado", APOYO_INSTITUCIONAL: "Apoyo Institucional",
  APOYO_COMUNITARIO: "Apoyo Comunitario", EMERGENCIA: "Emergencia",
};

const initials = (name: string) =>
  (name || "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

interface PacienteEntry {
  cedula: string; cedulaDigits: string; nombre: string;
  genero: string; edad: number | null; tipo: string; refugio: string;
  estadoFisico: string; embarazo: string; // estado explícito más reciente (consulta o censo)
  consultas: any[]; // ordenadas desc
  ultima: string; // ISO
}

export default function HistorialClinicoTab() {
  const { consultas, localConsultas, registros, patologias, tiposLesion, predefinedMedicamentos, effectiveRefugio, pendingHistorialCedula, setPendingHistorialCedula } = useAppContext();
  const [sel, setSel] = useState(""); // cédula (dígitos) del paciente elegido

  // Ver detalle de una consulta en modal de solo lectura
  const [viewConsulta, setViewConsulta] = useState<any | null>(null);
  const [hcStep, setHcStep] = useState(1); // paso del wizard en el detalle (1=básicos, 2-4=extendida)
  const [viewClosing, setViewClosing] = useState(false);
  useBodyScrollLock(!!viewConsulta);

  const closeView = () => {
    if (viewClosing || !viewConsulta) return;
    setViewClosing(true);
    setTimeout(() => { setViewConsulta(null); setViewClosing(false); }, 220);
  };

  // Navegación desde Morbilidad ("Ver historial"): abre directamente ese paciente.
  useEffect(() => {
    if (pendingHistorialCedula) {
      setSel(onlyDigits(pendingHistorialCedula));
      setPendingHistorialCedula(null);
    }
  }, [pendingHistorialCedula, setPendingHistorialCedula]);

  // Censo por cédula (para completar demografía y antecedentes del censo).
  const regByCedula = useMemo(() => {
    const m = new Map<string, any>();
    registros.forEach((r: any) => m.set(onlyDigits(r.cedula), r));
    return m;
  }, [registros]);

  // Pacientes = agrupación de TODAS las consultas (locales + remotas) por cédula.
  const pacientes = useMemo<PacienteEntry[]>(() => {
    // Las remotas ya vienen scoped por el backend; las locales (IndexedDB) se
    // filtran por el refugio de vista para que Master, al cambiar de refugio, no
    // vea pacientes/consultas de otros campamentos (consolidado → todas).
    const scopedLocal = effectiveRefugio
      ? localConsultas.filter((c: any) => (c.data?.refugio || "") === effectiveRefugio)
      : localConsultas;
    const localIds = new Set(scopedLocal.map((c: any) => c.id));
    const all: any[] = [
      ...scopedLocal.map((c: any) => ({ ...c.data, createdAt: c.createdAt })),
      ...consultas.filter((c: any) => !localIds.has(c.id)),
    ];
    const byCed = new Map<string, PacienteEntry>();
    for (const c of all) {
      const ced = onlyDigits(c.cedula);
      if (!ced) continue;
      if (!byCed.has(ced)) {
        byCed.set(ced, { cedula: c.cedula, cedulaDigits: ced, nombre: c.nombreApellido || "", genero: "", edad: null, tipo: "REFUGIADO", refugio: c.refugio || "", estadoFisico: "ILESO", embarazo: "NO", consultas: [], ultima: c.fechaConsulta || c.createdAt });
      }
      const p = byCed.get(ced)!;
      p.consultas.push(c);
      if (!p.nombre && c.nombreApellido) p.nombre = c.nombreApellido;
    }
    return [...byCed.values()].map((p) => {
      p.consultas.sort((a, b) => new Date(b.fechaConsulta || b.createdAt || 0).getTime() - new Date(a.fechaConsulta || a.createdAt || 0).getTime());
      const latest = p.consultas[0] || {};
      const reg = regByCedula.get(p.cedulaDigits);
      p.nombre = p.nombre || reg?.nombreApellido || "(sin nombre)";
      p.genero = (latest.genero || reg?.genero || "").toUpperCase();
      p.edad = latest.edad ?? edadFromISO(latest.fechaNacimiento) ?? (reg ? (reg.edad ?? edadFromISO(reg.fechaNacimiento)) : null);
      p.tipo = latest.tipoPaciente || "REFUGIADO";
      p.refugio = latest.refugio || reg?.refugio || "";
      p.estadoFisico = latest.estadoFisico || reg?.estadoFisico || "ILESO";
      p.embarazo = latest.embarazo || reg?.embarazo || "NO";
      p.ultima = latest.fechaConsulta || latest.createdAt || p.ultima;
      return p;
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [consultas, localConsultas, regByCedula, effectiveRefugio]);

  const opciones = useMemo(
    () => pacientes.map((p) => ({ value: p.cedulaDigits, label: `${p.nombre} — C.I. ${p.cedula} · ${p.consultas.length} atención${p.consultas.length === 1 ? "" : "es"}` })),
    [pacientes]
  );

  const paciente = useMemo(() => pacientes.find((p) => p.cedulaDigits === sel) || null, [pacientes, sel]);

  // Resumen agregado del paciente seleccionado.
  const resumen = useMemo(() => {
    if (!paciente) return null;
    const antPat = new Set<string>();
    const diagPat = new Set<string>();
    const meds = new Map<string, Medicamento>(); // por id, se queda la posología más reciente
    const reg = regByCedula.get(paciente.cedulaDigits);
    (Array.isArray(reg?.patologiaIds) ? reg.patologiaIds : []).forEach((id: string) => antPat.add(id));
    // consultas ya están desc → recorrer de más antigua a más nueva para que meds guarde la última
    [...paciente.consultas].reverse().forEach((c) => {
      (Array.isArray(c.antecedentesPatologiaIds) ? c.antecedentesPatologiaIds : []).forEach((id: string) => antPat.add(id));
      (Array.isArray(c.diagnosticoPatologiaIds) ? c.diagnosticoPatologiaIds : []).forEach((id: string) => diagPat.add(id));
      const ms: any[] = [
        ...(Array.isArray(c.antecedentesMedicamentoIds) ? c.antecedentesMedicamentoIds : []),
        ...(Array.isArray(c.diagnosticoMedicamentoIds) ? c.diagnosticoMedicamentoIds : []),
      ];
      ms.forEach((m) => { if (m && m.id) meds.set(m.id, m); });
    });
    return {
      antecedentes: [...antPat],
      diagnosticos: [...diagPat],
      medicamentos: [...meds.values()],
    };
  }, [paciente, regByCedula]);

  const medFull = (m: Medicamento) => {
    const base = medLabel(m.id, predefinedMedicamentos);
    const extra = [m.dosis, m.periodo].filter(Boolean).join(" · ");
    return extra ? `${base} — ${extra}` : base;
  };

  return (
    <div className="tab-view historial-view tab-enter">
      {/* Hero */}
      <div className="bal-hero">
        <span className="bal-hero__icon">{IC.file}</span>
        <div className="bal-hero__text">
          <h2>Historial Clínico</h2>
          <p>Ficha y evolución del paciente{effectiveRefugio ? <> · <span className="bal-hero__chip">{effectiveRefugio}</span></> : ""}</p>
        </div>
      </div>

      {/* Selector de paciente */}
      <div className="hc-search pill-form">
        <label className="form-label" style={{ display: "block", marginBottom: "0.4rem" }}>Paciente</label>
        <SearchableSingleSelect
          value={sel}
          onChange={setSel}
          options={opciones}
          placeholder={opciones.length ? "Busca por nombre o cédula…" : "No hay pacientes con consultas todavía"}
        />
      </div>

      {!paciente ? (
        <div className="bal-panel bal-empty">
          <span className="bal-empty__ico">{IC.file}</span>
          <p>Selecciona un paciente para ver su historial clínico evolutivo.</p>
        </div>
      ) : (
        <>
          {/* Banner del paciente */}
          <div className="hc-banner">
            <span className="hc-banner__avatar" aria-hidden>{initials(paciente.nombre)}</span>
            <div className="hc-banner__id">
              <h3 className="hc-banner__name">{paciente.nombre}</h3>
              <div className="hc-banner__meta">
                <span className="hc-chip">C.I. {paciente.cedula}</span>
                {paciente.edad != null && <span className="hc-chip">{paciente.edad} años</span>}
                {paciente.genero && <span className="hc-chip">{paciente.genero === "FEMENINO" ? "Femenino" : paciente.genero === "MASCULINO" ? "Masculino" : paciente.genero}</span>}
                <span className={`hc-chip hc-chip--estado ${paciente.estadoFisico === "LESIONADO" ? "hc-chip--lesionado" : "hc-chip--ileso"}`}>{paciente.estadoFisico === "LESIONADO" ? "Lesionado" : "Ileso"}</span>
                {paciente.embarazo === "SI" && <span className="hc-chip hc-chip--embarazo">Embarazada</span>}
                {paciente.tipo && paciente.tipo !== "REFUGIADO" && <span className={`hc-chip hc-chip--tipo hc-chip--${paciente.tipo.toLowerCase()}`}>{TIPO_LABEL[paciente.tipo] || paciente.tipo}</span>}
                {paciente.refugio && <span className="hc-chip hc-chip--muted">{paciente.refugio}</span>}
              </div>
            </div>
            <div className="hc-banner__stats">
              <div className="hc-stat"><span className="hc-stat__num">{paciente.consultas.length}</span><span className="hc-stat__lbl">Atenciones</span></div>
              <div className="hc-stat"><span className="hc-stat__num hc-stat__num--sm">{fmtFecha(paciente.ultima)}</span><span className="hc-stat__lbl">Última atención</span></div>
            </div>
          </div>

          {/* Resumen: problemas · antecedentes · medicación */}
          <div className="hc-summary">
            <HcSummaryCard icon={IC.pulse} accent="#e11d48" title="Lista de problemas (diagnósticos)"
              empty="Sin diagnósticos registrados."
              items={resumen!.diagnosticos.map((id) => patologiaNombre(id, patologias))} />
            <HcSummaryCard icon={IC.history} accent="#7c3aed" title="Antecedentes"
              empty="Sin antecedentes registrados."
              items={resumen!.antecedentes.map((id) => patologiaNombre(id, patologias))} />
            <HcSummaryCard icon={IC.pill} accent="#0d9488" title="Medicación"
              empty="Sin medicamentos registrados."
              items={resumen!.medicamentos.map(medFull)} />
          </div>

          {/* Evolución clínica (timeline) */}
          <div className="bal-panel">
            <div className="bal-panel__head"><span className="bal-panel__ico">{IC.timeline}</span><h3>Evolución clínica</h3></div>
            <ol className="hc-timeline">
              {paciente.consultas.map((c, i) => {
                const diag: string[] = Array.isArray(c.diagnosticoPatologiaIds) ? c.diagnosticoPatologiaIds : [];
                const ant: string[] = Array.isArray(c.antecedentesPatologiaIds) ? c.antecedentesPatologiaIds : [];
                const recetas: Medicamento[] = Array.isArray(c.diagnosticoMedicamentoIds) ? c.diagnosticoMedicamentoIds : [];
                const lesiones: Lesion[] = Array.isArray(c.lesiones) ? c.lesiones : [];
                const tipo = c.tipoPaciente || "REFUGIADO";
                const when = c.fechaConsulta || c.createdAt;
                return (
                  <li key={c.id || i} className="hc-tl">
                    <span className="hc-tl__dot" aria-hidden />
                    <div className="hc-tl__card">
                      <div className="hc-tl__head">
                        <span className="hc-tl__date">{fmtFecha(when)} · {fmtHora(when)}</span>
                        {i === 0 && <span className="hc-tl__badge hc-tl__badge--last">Más reciente</span>}
                        {tipo !== "REFUGIADO" && <span className={`hc-chip hc-chip--tipo hc-chip--${tipo.toLowerCase()}`}>{TIPO_LABEL[tipo] || tipo}</span>}
                        <button
                          type="button"
                          className="morb-row-actions__btn morb-row-actions__btn--view"
                          style={{ marginLeft: "auto", padding: "0.3rem 0.75rem", borderRadius: "100px", border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.1)", color: "#6366f1", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", cursor: "pointer" }}
                          onClick={() => { setHcStep(1); setViewConsulta({ ...c, data: c }); }}
                          data-tip="Ver detalle"
                          aria-label="Ver detalle de la consulta"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          <span>Ver</span>
                        </button>
                      </div>
                      <div className="hc-tl__body">
                        <HcField label="Diagnóstico" tone="diag" items={diag.map((id) => patologiaNombre(id, patologias))} />
                        {recetas.length > 0 && (
                          <div className="hc-tl__meds">
                            <span className="hc-tl__flabel">Recetado</span>
                            <ul>{recetas.map((m, j) => <li key={j}>{medFull(m)}</li>)}</ul>
                          </div>
                        )}
                        {lesiones.length > 0 && (
                          <div className="hc-tl__field">
                            <span className="hc-tl__flabel">Lesiones y curas</span>
                            <ul className="hc-tl__lesiones">
                              {lesiones.map((l, j) => (
                                <li key={j}>
                                  <strong>{tipoLesionNombre(l.tipoId, tiposLesion)}</strong>
                                  {l.zona ? ` · ${l.zona}` : ""}
                                  {ESTADO_LESION_LABELS[l.estado] ? ` · ${ESTADO_LESION_LABELS[l.estado]}` : ""}
                                  {l.cura ? <> — <span className="hc-tl__cura">{l.cura}</span></> : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {ant.length > 0 && <HcField label="Antecedentes" tone="ant" items={ant.map((id) => patologiaNombre(id, patologias))} />}
                        {c.tipoNota && <p className="hc-tl__nota"><strong>Nota del apoyo:</strong> {c.tipoNota}</p>}
                        {c.notasDoctor ? (
                          <p className="hc-tl__doctor"><strong>Nota del médico:</strong> {c.notasDoctor}</p>
                        ) : (!diag.length && !recetas.length && !ant.length && !lesiones.length) ? (
                          <p className="hc-tl__empty">Consulta sin diagnóstico ni indicaciones registradas.</p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}

      {/* Modal: VER DETALLE de consulta en solo lectura (consistente con Morbilidad) */}
      {viewConsulta && typeof window !== "undefined" && createPortal(
        <div className={`modal-overlay${viewClosing ? " modal-overlay--closing" : ""}`} onClick={closeView}>
          <div className={`modal-content modal-content--morb${viewClosing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Detalle de consulta</span>
              <button className="modal-close" onClick={closeView} aria-label="Cerrar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="morb pill-form morb-editbody">
              {tieneHistoriaExtendida(viewConsulta.data) && <WizardNav step={hcStep} setStep={setHcStep} />}
              {/* Paso 1: datos básicos + antecedentes + diagnóstico. Si la consulta NO tiene
                  datos del wizard, se muestran siempre (sin barra de pasos). */}
              <div style={{ display: !tieneHistoriaExtendida(viewConsulta.data) || hcStep === 1 ? "block" : "none" }}>
              {/* Datos Básicos */}
              <div className="morb-card morb-card--primary">
                <h3 className="morb-card__title">Datos Básicos del Paciente</h3>
                <div className="morb-tipo">
                  <div className="morb-field">
                    <label className="morb-field__label">Tipo de atención</label>
                    <input className="morb-control" type="text" value={TIPO_LABEL[viewConsulta.data?.tipoPaciente] || viewConsulta.data?.tipoPaciente || "Refugiado"} disabled />
                  </div>
                  {viewConsulta.data?.tipoPaciente !== "REFUGIADO" && (
                    <div className="morb-field">
                      <label className="morb-field__label">Nota del apoyo</label>
                      <input className="morb-control" type="text" value={viewConsulta.data?.tipoNota || "—"} disabled />
                    </div>
                  )}
                </div>

                <div className="morb-basic">
                  <div className="morb-field f-cedula">
                    <label className="morb-field__label">Cédula</label>
                    <input className="morb-control" type="text" value={formatCedulaDisplay(viewConsulta.data?.cedula, registros)} disabled />
                  </div>
                  <div className="morb-field f-nombre">
                    <label className="morb-field__label">Nombre y Apellido</label>
                    <input className="morb-control" type="text" value={viewConsulta.data?.nombreApellido || "—"} disabled />
                  </div>
                  <div className="morb-field f-genero">
                    <label className="morb-field__label">Género</label>
                    <input className="morb-control" type="text" value={viewConsulta.data?.genero || "—"} disabled />
                  </div>
                  <div className="morb-field f-fecha">
                    <label className="morb-field__label">Fecha y hora de consulta</label>
                    <input className="morb-control" type="text" value={new Date(viewConsulta.data?.fechaConsulta || viewConsulta.createdAt).toLocaleString("es-VE")} disabled />
                  </div>
                  <div className="morb-field f-edad">
                    <label className="morb-field__label">Edad (años)</label>
                    <input className="morb-control" type="text" value={(() => {
                      const ed = viewConsulta.data?.edad ?? edadFromISO(viewConsulta.data?.fechaNacimiento);
                      return ed != null ? `${ed} años` : "—";
                    })()} disabled />
                  </div>
                  <div className="morb-field f-refugio">
                    <label className="morb-field__label">Campamento Transitorio (Refugio)</label>
                    <input className="morb-control" type="text" value={viewConsulta.data?.refugio || "—"} disabled />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginTop: "0.8rem", paddingTop: "0.8rem", borderTop: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span className="morb-field__label" style={{ margin: 0 }}>Estado Físico:</span>
                    <span style={{ fontWeight: "700", color: viewConsulta.data?.estadoFisico === "LESIONADO" ? "var(--color-danger)" : "var(--color-success)" }}>
                      {viewConsulta.data?.estadoFisico || "ILESO"}
                    </span>
                  </div>
                  {viewConsulta.data?.genero === "FEMENINO" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className="morb-field__label" style={{ margin: 0 }}>Embarazo:</span>
                      <span style={{ fontWeight: viewConsulta.data?.embarazo === "SI" ? "700" : "normal", color: viewConsulta.data?.embarazo === "SI" ? "#db2777" : "inherit" }}>
                        {viewConsulta.data?.embarazo === "SI" ? "Sí (Embarazada)" : "No"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Antecedentes | Diagnóstico en 2 columnas: morb-duo */}
              <div className="morb-duo">
                <div className="morb-card morb-card--primary">
                  <h3 className="morb-card__title">Antecedentes Crónicos</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                    <div className="morb-field">
                      <label className="morb-field__label">Patologías Crónicas</label>
                      {Array.isArray(viewConsulta.data?.antecedentesPatologiaIds) && viewConsulta.data.antecedentesPatologiaIds.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.3rem" }}>
                          {viewConsulta.data.antecedentesPatologiaIds.map((id: string) => (
                            <span key={id} style={{ padding: "0.35rem 0.75rem", background: "var(--color-primary-light, rgba(37,99,235,0.12))", color: "var(--color-primary, #2563eb)", borderRadius: "100px", fontSize: "0.82rem", fontWeight: "600" }}>
                              {patologiaNombre(id, patologias)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <input className="morb-control" type="text" value="Sin patologías previas registradas" disabled />
                      )}
                    </div>
                    <div className="morb-field">
                      <label className="morb-field__label">Medicamentos Crónicos</label>
                      {Array.isArray(viewConsulta.data?.antecedentesMedicamentoIds) && viewConsulta.data.antecedentesMedicamentoIds.length > 0 ? (
                        <div className="med-items" style={{ marginTop: "0.3rem" }}>
                          {viewConsulta.data.antecedentesMedicamentoIds.map((m: Medicamento, i: number) => (
                            <div key={i} className="med-item">
                              <div className="med-item__head">
                                <span className="med-item__name">{medLabel(m.id, predefinedMedicamentos)}</span>
                              </div>
                              {(m.dosis || m.periodo) && (
                                <div className="med-item__fields" style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                                  {m.dosis ? `Dosis: ${m.dosis}` : ""}{m.dosis && m.periodo ? " · " : ""}{m.periodo ? `Período: ${m.periodo}` : ""}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <input className="morb-control" type="text" value="Sin medicamentos previos registrados" disabled />
                      )}
                    </div>
                  </div>
                </div>

                <div className="morb-card morb-card--success">
                  <h3 className="morb-card__title">Diagnóstico de Consulta</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                    <div className="morb-field">
                      <label className="morb-field__label">Patologías Diagnósticas</label>
                      {Array.isArray(viewConsulta.data?.diagnosticoPatologiaIds) && viewConsulta.data.diagnosticoPatologiaIds.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.3rem" }}>
                          {viewConsulta.data.diagnosticoPatologiaIds.map((id: string) => (
                            <span key={id} style={{ padding: "0.35rem 0.75rem", background: "rgba(22,163,74,0.14)", color: "var(--color-success, #16a34a)", borderRadius: "100px", fontSize: "0.82rem", fontWeight: "600" }}>
                              {patologiaNombre(id, patologias)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <input className="morb-control" type="text" value="Sin patologías diagnosticadas" disabled />
                      )}
                    </div>

                    <div className="morb-field">
                      <label className="morb-field__label">Lesiones / Heridas</label>
                      {Array.isArray(viewConsulta.data?.lesiones) && viewConsulta.data.lesiones.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.3rem" }}>
                          {viewConsulta.data.lesiones.map((l: Lesion, idx: number) => (
                            <div key={idx} style={{ padding: "0.5rem 0.75rem", background: "var(--bg-primary)", borderRadius: "8px", borderLeft: "3px solid var(--color-warning)" }}>
                              <div style={{ fontWeight: "700", color: "var(--color-warning, #b45309)", fontSize: "0.82rem" }}>
                                {tipoLesionNombre(l.tipoId, tiposLesion)} {l.zona ? `· (${l.zona})` : ""}
                              </div>
                              {l.estado && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Estado: {ESTADO_LESION_LABELS[l.estado] || l.estado}</div>}
                              {l.cura && <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", marginTop: "2px" }}>Cura / Tratamiento: {l.cura}</div>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <input className="morb-control" type="text" value="Sin lesiones o heridas" disabled />
                      )}
                    </div>

                    <div className="morb-field">
                      <label className="morb-field__label">Medicamentos Diagnosticados (Receta)</label>
                      {Array.isArray(viewConsulta.data?.diagnosticoMedicamentoIds) && viewConsulta.data.diagnosticoMedicamentoIds.length > 0 ? (
                        <div className="med-items" style={{ marginTop: "0.3rem" }}>
                          {viewConsulta.data.diagnosticoMedicamentoIds.map((m: Medicamento, i: number) => (
                            <div key={i} className="med-item" style={{ borderLeft: "3px solid var(--color-success)" }}>
                              <div className="med-item__head">
                                <span className="med-item__name">{medLabel(m.id, predefinedMedicamentos)}</span>
                              </div>
                              {(m.dosis || m.periodo) && (
                                <div className="med-item__fields" style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                                  {m.dosis ? `Dosis: ${m.dosis}` : ""}{m.dosis && m.periodo ? " · " : ""}{m.periodo ? `Período: ${m.periodo}` : ""}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <input className="morb-control" type="text" value="Sin medicamentos en receta" disabled />
                      )}
                    </div>

                    <div className="morb-field">
                      <label className="morb-field__label">Notas Médicas / Observaciones</label>
                      <textarea className="morb-control" value={viewConsulta.data?.notasDoctor || ""} disabled placeholder="Sin notas u observaciones" style={{ minHeight: "60px", resize: "none" }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Pasos 2-4 del wizard (solo lectura), navegables con la barra de pasos —
                  igual que en Morbilidad. El paso 1 es el detalle básico de arriba. */}
              {tieneHistoriaExtendida(viewConsulta.data) && hcStep !== 1 && (
                <div className="morb-card morb-card--primary">
                  <HistoriaClinicaExtendida formData={viewConsulta.data || {}} onChange={() => {}} readOnly step={hcStep} />
                </div>
              )}
              </div>

              <div className="morb-actions">
                <button type="button" className="morb-btn morb-btn--ghost" onClick={closeView}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Sub-piezas ───────────────────────────────────────────────────────────────
function HcSummaryCard({ icon, accent, title, items, empty }: { icon: ReactNode; accent: string; title: string; items: string[]; empty: string }) {
  const uniq = [...new Set(items.filter(Boolean))];
  return (
    <div className="hc-sum" style={{ ["--accent" as any]: accent }}>
      <div className="hc-sum__head"><span className="hc-sum__ico">{icon}</span><h4>{title}</h4><span className="hc-sum__count">{uniq.length}</span></div>
      {uniq.length === 0 ? (
        <p className="hc-sum__empty">{empty}</p>
      ) : (
        <div className="hc-tags">{uniq.map((t, i) => <span key={i} className="hc-tag">{t}</span>)}</div>
      )}
    </div>
  );
}

function HcField({ label, items, tone }: { label: string; items: string[]; tone: "diag" | "ant" }) {
  const uniq = [...new Set(items.filter(Boolean))];
  if (uniq.length === 0) return null;
  return (
    <div className="hc-tl__field">
      <span className="hc-tl__flabel">{label}</span>
      <div className="hc-tags">{uniq.map((t, i) => <span key={i} className={`hc-tag hc-tag--${tone}`}>{t}</span>)}</div>
    </div>
  );
}

const IC = {
  file: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4M12 11v6" opacity="0"/><path d="M12 11.5v5M9.5 14h5"/></svg>,
  pulse: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  history: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>,
  pill: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7Z"/><path d="m8.5 8.5 7 7"/></svg>,
  timeline: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><circle cx="12" cy="7" r="2"/><circle cx="12" cy="17" r="2"/></svg>,
};
