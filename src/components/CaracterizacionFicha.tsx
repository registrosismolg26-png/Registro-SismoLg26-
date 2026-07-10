"use client";

// ── Ficha de Caracterización (por familia) ──────────────────────────────────
// Modal: sección HOGAR (una vez) + una tarjeta por MIEMBRO del censo. Reutiliza
// los datos del censo (nombre/edad/sexo solo lectura) y captura lo NUEVO con
// controles no-nativos (pill). Guarda offline (1 registro = 1 familia) → sync.
// Los campos con catálogo se generan desde CARAC_CAMPOS (Fase 1).

import { useState, useEffect, useMemo } from "react";
import { useAppContext } from "@/context/AppContext";
import { apiFetch } from "@/lib/apiFetch";
import { getAllLocalCaracterizacion, saveLocalCaracterizacion } from "@/lib/db";
import { CARAC_CAMPOS, type CaracCampoMeta } from "@/lib/constants";
import { opcionesDe, opcionLabel } from "@/lib/helpers";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import StyledSelect from "@/components/StyledSelect";
import SearchableSelect from "@/components/SearchableSelect";
import DatePicker from "@/components/DatePicker";
import type { CaracterizacionOpcion, CaracterizacionHogarData, CaracterizacionPersonaData, LocalCaracterizacion } from "@/types";

export interface FamiliaMiembro {
  registroId: string; cedula: string; nombreApellido: string;
  genero?: string; edad?: number; fechaNacimiento?: string;
}
export interface Familia {
  familiaCedula: string; jefeRegistroId: string; jefeNombre: string;
  parroquia?: string; direccionExacta?: string; gpsLat?: number | null; gpsLng?: number | null;
  telefono?: string | null; refugio: string;
  miembros: FamiliaMiembro[];
  estado: "sin" | "parcial" | "completa"; personasDone: number;
}

// ── Sub-controles reutilizables (module-level → sin perder foco al re-render) ─
function SingleOpcion({ opciones, meta, value, onChange }: {
  opciones: CaracterizacionOpcion[]; meta: CaracCampoMeta; value: string | null | undefined; onChange: (v: string) => void;
}) {
  const opts = opcionesDe(opciones, meta.modulo, meta.campo);
  return (
    <label className="carac-field">
      <span>{meta.label}</span>
      <StyledSelect value={value || ""} onChange={onChange} ariaLabel={meta.label}
        options={[{ value: "", label: "— Sin especificar —" }, ...opts.map((o) => ({ value: o.id, label: o.valor }))]} />
    </label>
  );
}

function MultiOpcion({ opciones, meta, values, onChange }: {
  opciones: CaracterizacionOpcion[]; meta: CaracCampoMeta; values: string[]; onChange: (v: string[]) => void;
}) {
  const opts = opcionesDe(opciones, meta.modulo, meta.campo);
  const disponibles = opts.filter((o) => !values.includes(o.id)).map((o) => ({ value: o.id, label: o.valor }));
  return (
    <label className="carac-field carac-field--wide">
      <span>{meta.label}</span>
      <SearchableSelect options={disponibles} inputClassName="morb-control" placeholder={`Agregar ${meta.label.toLowerCase()}…`}
        onSelect={(id) => onChange([...values, id])} />
      {values.length > 0 && (
        <div className="carac-chips">
          {values.map((id) => (
            <span key={id} className="carac-chip-tag">
              {opcionLabel(id, opciones)}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== id))} aria-label="Quitar">×</button>
            </span>
          ))}
        </div>
      )}
    </label>
  );
}

function SiNo({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (v: string) => void }) {
  return (
    <label className="carac-field">
      <span>{label}</span>
      <StyledSelect value={value || ""} onChange={onChange} ariaLabel={label}
        options={[{ value: "", label: "—" }, { value: "NO", label: "No" }, { value: "SI", label: "Sí" }]} />
    </label>
  );
}

function TextField({ label, value, onChange, wide, type = "text", placeholder }: {
  label: string; value: string | null | undefined; onChange: (v: string) => void; wide?: boolean; type?: string; placeholder?: string;
}) {
  return (
    <label className={`carac-field${wide ? " carac-field--wide" : ""}`}>
      <span>{label}</span>
      <input type={type} className="morb-control" value={value ?? ""} placeholder={placeholder}
        inputMode={type === "number" ? "decimal" : undefined}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function EnumSelect({ label, value, onChange, opts }: { label: string; value: string | null | undefined; onChange: (v: string) => void; opts: { value: string; label: string }[] }) {
  return (
    <label className="carac-field">
      <span>{label}</span>
      <StyledSelect value={value || ""} onChange={onChange} ariaLabel={label}
        options={[{ value: "", label: "—" }, ...opts]} />
    </label>
  );
}

const campoMeta = (campo: string) => CARAC_CAMPOS.find((c) => c.campo === campo)!;
const RESCATO_OPTS = [{ value: "SI", label: "Sí" }, { value: "NO", label: "No" }, { value: "PARCIAL", label: "Parcial" }];
const VALIDACION_OPTS = [{ value: "PENDIENTE", label: "Pendiente" }, { value: "APROBADA", label: "Aprobada" }, { value: "RECHAZADA", label: "Rechazada" }];

export default function CaracterizacionFicha({ familia, onClose, onSaved }: { familia: Familia; onClose: () => void; onSaved: () => void }) {
  const { caracterizacionOpciones, currentUser, effectiveRefugio, coords, showToast, triggerSync } = useAppContext();
  // `show` local → la animación de salida corre ANTES de avisar al padre (que desmonta).
  const [show, setShow] = useState(true);
  const modal = useAnimatedModal(show);
  const close = () => setShow(false);
  useEffect(() => { if (!modal.mounted) onClose(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [modal.mounted]);

  const [hogar, setHogar] = useState<Partial<CaracterizacionHogarData>>({});
  const [personas, setPersonas] = useState<Record<string, Partial<CaracterizacionPersonaData>>>({});
  const [expandido, setExpandido] = useState<string | null>(familia.miembros[0]?.registroId ?? null);
  const [saving, setSaving] = useState(false);

  const opc = caracterizacionOpciones;
  const setH = (patch: Partial<CaracterizacionHogarData>) => setHogar((h) => ({ ...h, ...patch }));
  const setP = (rid: string, patch: Partial<CaracterizacionPersonaData>) => setPersonas((p) => ({ ...p, [rid]: { ...p[rid], ...patch } }));
  const getP = (rid: string): Partial<CaracterizacionPersonaData> => personas[rid] || {};

  // Prefill: primero la ficha LOCAL pendiente (si existe), si no la del servidor.
  useEffect(() => {
    let cancel = false;
    (async () => {
      const locales = await getAllLocalCaracterizacion();
      const local = locales.find((f) => f.id === familia.jefeRegistroId);
      if (local && !cancel) {
        setHogar(local.data.hogar || {});
        const map: Record<string, Partial<CaracterizacionPersonaData>> = {};
        for (const p of local.data.personas || []) map[p.registroId] = p;
        setPersonas(map);
        return;
      }
      if (!navigator.onLine) return;
      try {
        const q = effectiveRefugio ? `?refugio=${encodeURIComponent(effectiveRefugio)}` : "";
        const res = await apiFetch(`/api/caracterizacion/${encodeURIComponent(familia.jefeRegistroId)}${q}`);
        if (res.ok && !cancel) {
          const data = await res.json();
          if (data?.hogar) setHogar(data.hogar);
          if (Array.isArray(data?.personas)) {
            const map: Record<string, Partial<CaracterizacionPersonaData>> = {};
            for (const p of data.personas) map[p.registroId] = p;
            setPersonas(map);
          }
        }
      } catch (e) { console.error(e); }
    })();
    return () => { cancel = true; };
  }, [familia.jefeRegistroId, effectiveRefugio]);

  const hogarCampos = useMemo(() => CARAC_CAMPOS.filter((c) => c.nivel === "hogar" && c.fase === 1), []);
  const hogarCamposF2 = useMemo(() => CARAC_CAMPOS.filter((c) => c.nivel === "hogar" && c.fase === 2), []);

  const usarUbicacion = () => {
    if (coords?.lat != null && coords?.lng != null) { setH({ gpsViviendaLat: coords.lat, gpsViviendaLng: coords.lng }); showToast("Ubicación actual tomada.", "success"); }
    else showToast("Sin coordenadas GPS disponibles.", "warning");
  };

  const guardar = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const refugio = familia.refugio || effectiveRefugio || "";
      const hogarData: CaracterizacionHogarData = {
        ...hogar,
        jefeRegistroId: familia.jefeRegistroId,
        familiaCedula: familia.familiaCedula,
        refugio,
      };
      // Se guarda una persona por CADA miembro (aunque tenga campos en blanco): así la
      // familia queda "revisada" y el estado puede llegar a Completa.
      const personasData: CaracterizacionPersonaData[] = familia.miembros.map((m) => ({
        ...getP(m.registroId),
        registroId: m.registroId,
        cedula: m.cedula,
        familiaCedula: familia.familiaCedula,
        refugio,
      }));
      const ficha: Omit<LocalCaracterizacion, "status" | "attempts" | "createdAt"> = {
        id: familia.jefeRegistroId,
        type: "new",
        data: { hogar: hogarData, personas: personasData },
        refugio,
        userId: currentUser?.id,
      };
      await saveLocalCaracterizacion(ficha);
      showToast("Ficha guardada. Se sincronizará cuando haya señal.", "success");
      if (navigator.onLine) triggerSync();
      onSaved();
    } catch (e) {
      console.error(e);
      showToast("No se pudo guardar la ficha.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!modal.mounted) return null;

  return (
    <div className={`modal-overlay${modal.closing ? " modal-overlay--closing" : ""}`} onClick={close}>
      <div className={`modal-content pill-form carac-ficha${modal.closing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="carac-ficha__head">
          <div>
            <h3>Caracterización — {familia.jefeNombre}</h3>
            <p className="carac-ficha__sub">C.I. {familia.familiaCedula} · {familia.miembros.length} {familia.miembros.length === 1 ? "persona" : "personas"} · {familia.parroquia || "—"}</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Cerrar">×</button>
        </div>

        <div className="carac-ficha__body">
          {/* ── HOGAR ── */}
          <section className="carac-sec">
            <h4 className="carac-sec__title">Hogar y vivienda</h4>
            <div className="carac-grid">
              <label className="carac-field">
                <span>Fecha de ingreso al refugio</span>
                <DatePicker value={hogar.fechaIngresoRefugio ? String(hogar.fechaIngresoRefugio).slice(0, 10) : ""}
                  onChange={(ymd) => setH({ fechaIngresoRefugio: ymd || null })} placeholder="Seleccionar fecha…" />
              </label>
              <SiNo label="¿Adquirida por Misión Vivienda?" value={hogar.misionVivienda} onChange={(v) => setH({ misionVivienda: v })} />
              {hogarCampos.map((meta) => meta.multi
                ? <MultiOpcion key={meta.campo} opciones={opc} meta={meta} values={(hogar as any)[`${meta.campo}Ids`] || []} onChange={(v) => setH({ [`${meta.campo}Ids`]: v } as any)} />
                : <SingleOpcion key={meta.campo} opciones={opc} meta={meta} value={(hogar as any)[`${meta.campo}Id`]} onChange={(v) => setH({ [`${meta.campo}Id`]: v || null } as any)} />
              )}
              <div className="carac-field carac-field--wide carac-gps">
                <span>Ubicación de la vivienda afectada (opcional)</span>
                <div className="carac-gps__row">
                  <button type="button" className="btn-secondary" onClick={usarUbicacion}>Usar mi ubicación actual</button>
                  <span className="carac-gps__val">{hogar.gpsViviendaLat != null ? `${Number(hogar.gpsViviendaLat).toFixed(5)}, ${Number(hogar.gpsViviendaLng).toFixed(5)}` : "Sin ubicación"}</span>
                  {hogar.gpsViviendaLat != null && <button type="button" className="carac-gps__clear" onClick={() => setH({ gpsViviendaLat: null, gpsViviendaLng: null })}>Quitar</button>}
                </div>
              </div>
            </div>
            <h4 className="carac-sec__title carac-sec__title--sub">Socioeconómico del hogar</h4>
            <div className="carac-grid">
              {hogarCamposF2.map((meta) => (
                <SingleOpcion key={meta.campo} opciones={opc} meta={meta} value={(hogar as any)[`${meta.campo}Id`]} onChange={(v) => setH({ [`${meta.campo}Id`]: v || null } as any)} />
              ))}
              <SiNo label="¿Recibe remesas del exterior?" value={hogar.recibeRemesas} onChange={(v) => setH({ recibeRemesas: v })} />
              <SiNo label="¿Recibe CLAP regularmente?" value={hogar.recibeClap} onChange={(v) => setH({ recibeClap: v })} />
              <SiNo label="¿Recibe bonos del Sistema Patria?" value={hogar.recibeBonosPatria} onChange={(v) => setH({ recibeBonosPatria: v })} />
            </div>
          </section>

          {/* ── PERSONAS ── */}
          <section className="carac-sec">
            <h4 className="carac-sec__title">Personas ({familia.miembros.length})</h4>
            {familia.miembros.map((m) => {
              const abierto = expandido === m.registroId;
              const p = getP(m.registroId);
              const esJefe = m.registroId === familia.jefeRegistroId;
              const esFem = String(m.genero || "").toUpperCase().startsWith("F");
              return (
                <div key={m.registroId} className={`carac-member${abierto ? " is-open" : ""}`}>
                  <button type="button" className="carac-member__head" onClick={() => setExpandido(abierto ? null : m.registroId)}>
                    <span className="carac-member__name">{m.nombreApellido}{esJefe && <em> · Jefe</em>}</span>
                    <span className="carac-member__meta">{m.edad != null ? `${m.edad} años` : "—"} · {m.genero || "—"}</span>
                    <svg className="carac-member__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {abierto && (
                    <div className="carac-grid carac-member__body">
                      {!esJefe && <SingleOpcion opciones={opc} meta={campoMeta("parentesco")} value={p.parentescoId} onChange={(v) => setP(m.registroId, { parentescoId: v || null })} />}
                      <SingleOpcion opciones={opc} meta={campoMeta("estadoCivil")} value={p.estadoCivilId} onChange={(v) => setP(m.registroId, { estadoCivilId: v || null })} />
                      <SiNo label="¿Asiste a la escuela?" value={p.asisteEscuela} onChange={(v) => setP(m.registroId, { asisteEscuela: v })} />
                      <SingleOpcion opciones={opc} meta={campoMeta("vulnerabilidad")} value={p.vulnerabilidadId} onChange={(v) => setP(m.registroId, { vulnerabilidadId: v || null })} />
                      <SingleOpcion opciones={opc} meta={campoMeta("grupoSanguineo")} value={p.grupoSanguineoId} onChange={(v) => setP(m.registroId, { grupoSanguineoId: v || null })} />
                      <MultiOpcion opciones={opc} meta={campoMeta("alergia")} values={p.alergiaIds || []} onChange={(v) => setP(m.registroId, { alergiaIds: v })} />
                      <SiNo label="¿Discapacidad?" value={p.discapacidad} onChange={(v) => setP(m.registroId, { discapacidad: v })} />
                      {p.discapacidad === "SI" && <SingleOpcion opciones={opc} meta={campoMeta("discapacidadTipo")} value={p.discapacidadTipoId} onChange={(v) => setP(m.registroId, { discapacidadTipoId: v || null })} />}
                      {p.discapacidad === "SI" && <TextField label="Detalle de la discapacidad" wide value={p.discapacidadDesc} onChange={(v) => setP(m.registroId, { discapacidadDesc: v })} />}
                      <SingleOpcion opciones={opc} meta={campoMeta("vacunaAntitetanica")} value={p.vacunaAntitetanicaId} onChange={(v) => setP(m.registroId, { vacunaAntitetanicaId: v || null })} />
                      <SiNo label="¿Apoyo psicológico / salud mental?" value={p.saludMental} onChange={(v) => setP(m.registroId, { saludMental: v })} />
                      <SiNo label="¿Requiere atención médica inmediata?" value={p.requiereAtencion} onChange={(v) => setP(m.registroId, { requiereAtencion: v })} />
                      {p.requiereAtencion === "SI" && <TextField label="¿Qué atención requiere?" wide value={p.detalleAtencion} onChange={(v) => setP(m.registroId, { detalleAtencion: v })} />}
                      {esFem && <TextField label="Semanas de gestación (si embarazada)" type="number" value={p.semanasGestacion != null ? String(p.semanasGestacion) : ""} onChange={(v) => setP(m.registroId, { semanasGestacion: v === "" ? null : Number(v) })} />}
                      <TextField label="Peso actual (kg)" type="number" value={p.pesoKg != null ? String(p.pesoKg) : ""} onChange={(v) => setP(m.registroId, { pesoKg: v === "" ? null : Number(v) })} />
                      <TextField label="Estatura (cm)" type="number" value={p.estaturaCm != null ? String(p.estaturaCm) : ""} onChange={(v) => setP(m.registroId, { estaturaCm: v === "" ? null : Number(v) })} />
                      <SingleOpcion opciones={opc} meta={campoMeta("tallaCamisa")} value={p.tallaCamisaId} onChange={(v) => setP(m.registroId, { tallaCamisaId: v || null })} />
                      <SingleOpcion opciones={opc} meta={campoMeta("tallaPantalon")} value={p.tallaPantalonId} onChange={(v) => setP(m.registroId, { tallaPantalonId: v || null })} />
                      <SingleOpcion opciones={opc} meta={campoMeta("tallaCalzado")} value={p.tallaCalzadoId} onChange={(v) => setP(m.registroId, { tallaCalzadoId: v || null })} />
                      <MultiOpcion opciones={opc} meta={campoMeta("necesidad")} values={p.necesidadIds || []} onChange={(v) => setP(m.registroId, { necesidadIds: v })} />
                      <TextField label="Correo electrónico" value={p.correo} onChange={(v) => setP(m.registroId, { correo: v })} />
                      <TextField label="Teléfono alternativo" value={p.telefonoAlt} onChange={(v) => setP(m.registroId, { telefonoAlt: v })} />
                      <h5 className="carac-sub-head">Educación y perfil laboral</h5>
                      <SingleOpcion opciones={opc} meta={campoMeta("nivelEducativo")} value={p.nivelEducativoId} onChange={(v) => setP(m.registroId, { nivelEducativoId: v || null })} />
                      <SingleOpcion opciones={opc} meta={campoMeta("impactoLaboral")} value={p.impactoLaboralId} onChange={(v) => setP(m.registroId, { impactoLaboralId: v || null })} />
                      <SingleOpcion opciones={opc} meta={campoMeta("sectorEconomico")} value={p.sectorEconomicoId} onChange={(v) => setP(m.registroId, { sectorEconomicoId: v || null })} />
                      <SingleOpcion opciones={opc} meta={campoMeta("oficio")} value={p.oficioId} onChange={(v) => setP(m.registroId, { oficioId: v || null })} />
                      <TextField label="Años de experiencia" type="number" value={p.aniosExperiencia != null ? String(p.aniosExperiencia) : ""} onChange={(v) => setP(m.registroId, { aniosExperiencia: v === "" ? null : Number(v) })} />
                      <EnumSelect label="¿Rescató sus herramientas?" value={p.rescatoHerramientas} onChange={(v) => setP(m.registroId, { rescatoHerramientas: v })} opts={RESCATO_OPTS} />
                      <SingleOpcion opciones={opc} meta={campoMeta("aptitudFisica")} value={p.aptitudFisicaLaboralId} onChange={(v) => setP(m.registroId, { aptitudFisicaLaboralId: v || null })} />
                      <SingleOpcion opciones={opc} meta={campoMeta("disponibilidad")} value={p.disponibilidadId} onChange={(v) => setP(m.registroId, { disponibilidadId: v || null })} />
                      <SiNo label="¿Puede trabajar de inmediato?" value={p.puedeTrabajarInmediato} onChange={(v) => setP(m.registroId, { puedeTrabajarInmediato: v })} />
                      <EnumSelect label="Validación de destreza (uso interno)" value={p.validacionDestreza} onChange={(v) => setP(m.registroId, { validacionDestreza: v })} opts={VALIDACION_OPTS} />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>

        <div className="carac-ficha__foot">
          <button type="button" className="btn-secondary" onClick={close} disabled={saving}>Cancelar</button>
          <button type="button" className="btn-submit" onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar ficha"}</button>
        </div>
      </div>
    </div>
  );
}
