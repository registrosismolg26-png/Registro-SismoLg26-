"use client";

// ── Modal de EDICIÓN / ALTA de un registro de VZLA Renace ────────────────────
// Edita un jefe o miembro, o AGREGA un miembro nuevo a un núcleo. Usa los controles
// del sistema (todo pill): DatePicker, teléfono código+número, edad AUTO, selects de
// parentesco/oficio del catálogo de Caracterización, estado (La Guaira / Distrito
// Capital) + parroquia dependiente, cédula solo dígitos (6-8) con lupa (padrón/API).
//   · Editar → PATCH /api/vzlarenace/{jefe|miembro}
//   · Crear miembro → POST /api/vzlarenace/miembro (jefe fijo por-fila o elegido)

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import ConfirmModal from "@/components/ConfirmModal";
import StyledSelect from "@/components/StyledSelect";
import DatePicker from "@/components/DatePicker";
import SearchableSingleSelect from "@/components/SearchableSingleSelect";
import { TELEFONO_CODIGOS, PARROQUIAS_POR_ESTADO, RENACE_TIPO_AFECTACION, RENACE_CONDICION_VIVIENDA, RENACE_PLANTEAMIENTO_AFECTACION } from "@/lib/constants";
import { buscarCedulaEnCliente } from "@/lib/db";
import { fetchCedulaExterna } from "@/lib/cedulaApi";
import type { RenaceJefe, RenaceMiembro } from "@/types";

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
  const b = new Date(ymd); const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const md = t.getMonth() - b.getMonth();
  if (md < 0 || (md === 0 && t.getDate() < b.getDate())) a--;
  return a >= 0 ? String(a) : "0";
};
const splitTel = (t: string): { cod: string; num: string } => {
  const d = (t || "").replace(/\D/g, "");
  if (!d) return { cod: TELEFONO_CODIGOS[0], num: "" };
  return { cod: d.slice(0, 4), num: d.slice(4, 11) };
};
const withCurrent = (list: readonly string[], cur: string) =>
  (cur && !list.includes(cur) ? [cur, ...list] : list).map((v) => ({ value: v, label: v }));
// Limpia el valor de una opción de catálogo (quita espacios y punto final que traía el
// Excel, p. ej. "…PERMANENCIA.") para que calce con la opción limpia de la constante.
const cleanOpt = (v: unknown): string => String(v ?? "").trim().replace(/\.+$/, "").trim();

const ESTADOS = ["LA GUAIRA", "DISTRITO CAPITAL"];

export default function RenaceEditModal({ modo = "editar", tipo = "miembro", record, jefeFijo, jefes, puedeEliminar, onClose, onSaved, showToast }: {
  modo?: "editar" | "crear";
  tipo?: "jefe" | "miembro";
  record?: RenaceJefe | RenaceMiembro;
  jefeFijo?: RenaceJefe;          // crear desde la fila de un jefe (núcleo fijo)
  jefes?: RenaceJefe[];           // crear general → selector de núcleo
  puedeEliminar?: boolean;        // eliminar miembro (solo Master normal)
  onClose: () => void;
  onSaved?: () => void;
  showToast: (m: string, t: "success" | "error" | "warning" | "info") => void;
}) {
  const esCrear = modo === "crear";
  const esJefe = !esCrear && tipo === "jefe";
  const rec = (record || {}) as Partial<RenaceJefe & RenaceMiembro>;
  const [show, setShow] = useState(true);
  const modal = useAnimatedModal(show);
  const close = () => setShow(false);
  useEffect(() => { if (!modal.mounted) onClose(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [modal.mounted]);

  // Núcleo destino al CREAR: fijo (por fila) o elegido del selector.
  const [selJefeId, setSelJefeId] = useState<string>(jefeFijo?.id || "");
  const jefeSel = jefeFijo || (jefes || []).find((x) => x.id === selJefeId) || null;

  // Catálogo (parentesco/oficio) de Caracterización — fuente única de las listas cerradas.
  const [cat, setCat] = useState<{ parentesco: string[]; oficio: string[] }>({ parentesco: [], oficio: [] });
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/caracterizacion/opciones");
        if (!res.ok) return;
        const data = await res.json();
        const ops = (data.opciones || []).filter((o: any) => o.activo !== false);
        setCat({
          parentesco: ops.filter((o: any) => o.modulo === "FAMILIA" && o.campo === "parentesco").map((o: any) => o.valor),
          oficio: ops.filter((o: any) => o.modulo === "LABORAL" && o.campo === "oficio").map((o: any) => o.valor),
        });
      } catch { /* sin catálogo: solo el valor actual */ }
    })();
  }, []);

  const tel0 = splitTel(rec.telefono || "");
  const [f, setF] = useState<Record<string, string>>(() => ({
    cedula: rec.cedula || "",
    nombres: rec.nombres || "",
    fechaNacimiento: rec.fechaNacimiento || "",
    sexo: rec.sexo || "",
    telefonoCod: tel0.cod,
    telefonoNum: tel0.num,
    profesion: rec.profesion || "",
    estadoProcedencia: rec.estadoProcedencia || "",
    parroquiaProcedencia: rec.parroquiaProcedencia || "",
    parentesco: rec.parentesco || "",
    tipoAfectacion: cleanOpt(rec.tipoAfectacion),
    condicionVivienda: cleanOpt(rec.condicionVivienda),
    numeroCertificado: rec.numeroCertificado || "",
    planteamientoAfectacion: cleanOpt(rec.planteamientoAfectacion),
    incidencias: rec.incidencias || "",
  }));
  const [saving, setSaving] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => { setF((p) => ({ ...p, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: "" })); };

  const edad = calcEdad(dmyToYmd(f.fechaNacimiento));

  const buscarCedula = async () => {
    if (buscando) return;
    const clean = f.cedula.replace(/\D/g, "");
    if (clean.length < 6) { showToast("Ingresa una cédula válida para buscar.", "warning"); return; }
    setBuscando(true);
    try {
      let nombre = "", genero = "", ymd = "";
      const citizen = await buscarCedulaEnCliente(clean);
      if (citizen) {
        nombre = citizen.nombreCompleto || "";
        genero = (citizen.sexo === "F" || citizen.sexo === "FEMENINO") ? "FEMENINO"
          : (citizen.sexo === "M" || citizen.sexo === "MASCULINO") ? "MASCULINO" : "";
        ymd = String(citizen.fechaNacimiento || "").slice(0, 10);
      } else {
        const ext = await fetchCedulaExterna("V", clean);
        if (ext) { nombre = ext.nombreApellido || ""; genero = ext.genero || ""; ymd = String(ext.fechaNacimiento || "").slice(0, 10); }
      }
      if (nombre || genero || ymd) {
        setF((p) => ({
          ...p,
          ...(nombre ? { nombres: nombre.toUpperCase() } : {}),
          ...(genero ? { sexo: genero } : {}),
          ...(ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? { fechaNacimiento: ymdToDmy(ymd) } : {}),
        }));
        showToast("Datos encontrados y cargados.", "success");
      } else {
        showToast("Cédula no encontrada en el padrón ni en la API.", "warning");
      }
    } catch (e) { console.error(e); showToast("No se pudo consultar la cédula.", "error"); }
    finally { setBuscando(false); }
  };

  const save = async () => {
    if (saving) return;
    const e: Record<string, string> = {};
    if (esCrear && !jefeSel) e.jefe = "Elige el núcleo (jefe) al que pertenece.";
    if (!f.nombres.trim()) e.nombres = "El nombre es obligatorio.";
    const cedLen = f.cedula.length;
    if (esJefe && !f.cedula) e.cedula = "La cédula del jefe es obligatoria.";
    else if (f.cedula && (cedLen < 6 || cedLen > 8)) e.cedula = "La cédula debe tener entre 6 y 8 dígitos.";
    if (!f.estadoProcedencia) e.estadoProcedencia = "Selecciona el estado.";
    if (!f.parroquiaProcedencia.trim()) e.parroquiaProcedencia = "Selecciona la parroquia.";
    if (Object.keys(e).length) {
      setErrors(e);
      showToast("Revisa los campos marcados.", "warning");
      setTimeout(() => { document.querySelector(".renace-edit-modal .has-error")?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 50);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const telefono = f.telefonoNum ? `${f.telefonoCod}-${f.telefonoNum}` : "";
      const base: Record<string, string> = {
        cedula: f.cedula, nombres: f.nombres, fechaNacimiento: f.fechaNacimiento, sexo: f.sexo, edad,
        telefono, profesion: f.profesion, estadoProcedencia: f.estadoProcedencia, parroquiaProcedencia: f.parroquiaProcedencia,
      };
      let url: string, method: string, payload: Record<string, string>;
      if (esCrear) {
        url = "/api/vzlarenace/miembro"; method = "POST";
        payload = { ...base, parentesco: f.parentesco, jefeNro: String(jefeSel!.nro), refugioId: jefeSel!.refugioId };
      } else if (esJefe) {
        url = "/api/vzlarenace/jefe"; method = "PATCH";
        payload = { ...base, id: record!.id, tipoAfectacion: f.tipoAfectacion, condicionVivienda: f.condicionVivienda, numeroCertificado: f.numeroCertificado, planteamientoAfectacion: f.planteamientoAfectacion, incidencias: f.incidencias };
      } else {
        url = "/api/vzlarenace/miembro"; method = "PATCH";
        payload = { ...base, id: record!.id, parentesco: f.parentesco };
      }
      const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        showToast(esCrear ? "Miembro agregado." : "Datos actualizados.", "success");
        onSaved?.();
        close();
      } else {
        showToast(data?.error || "No se pudo guardar.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error al guardar los cambios.", "error");
    } finally {
      setSaving(false);
    }
  };

  // Ejecuta el DELETE (la confirmación la hace ConfirmModal). Lanza si falla → el modal
  // de confirmación queda abierto para reintentar.
  const eliminar = async () => {
    if (esCrear || esJefe || !record?.id) return;
    const res = await apiFetch(`/api/vzlarenace/miembro?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success) { showToast("Miembro eliminado.", "success"); onSaved?.(); close(); }
    else { showToast(data?.error || "No se pudo eliminar el miembro.", "error"); throw new Error("delete failed"); }
  };

  const puedeBorrar = !!puedeEliminar && !esCrear && !esJefe;
  const parroquiasEstado = PARROQUIAS_POR_ESTADO[f.estadoProcedencia] || [];
  const titulo = esCrear ? "Agregar miembro" : `Editar ${esJefe ? "jefe" : "miembro"}`;
  const sub = esCrear
    ? (jefeSel ? `Al núcleo #${jefeSel.nro} · ${jefeSel.nombres}` : "Elige el núcleo")
    : `${esJefe ? `NÚCLEO #${rec.nro}` : `Del núcleo #${rec.jefeNro}`}${rec.cedula ? ` · C.I. ${rec.cedula}` : ""}`;

  if (!modal.mounted) return null;
  return (
    <>
    <div className={`modal-overlay${modal.closing ? " modal-overlay--closing" : ""}`} onClick={close}>
      <div className={`modal-content renace-modal renace-edit-modal${modal.closing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="renace-edit-modal__head">
          <div>
            <h3>{titulo}</h3>
            <p className="renace-modal__sub">{sub}</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Cerrar">×</button>
        </div>
        <div className="pill-form renace-edit-modal__body">
          <div className="carac-grid">
            {/* Selector de núcleo (solo al crear sin jefe fijo) */}
            {esCrear && !jefeFijo && (
              <div className="carac-field carac-field--wide">
                <span>Núcleo (jefe de familia)<span className="required-star"> *</span></span>
                <SearchableSingleSelect value={selJefeId} onChange={(v) => { setSelJefeId(v); if (errors.jefe) setErrors((e) => ({ ...e, jefe: "" })); }}
                  ariaLabel="Núcleo" placeholder="Buscar jefe por nombre, cédula o N°…" clearLabel={null} error={!!errors.jefe}
                  options={(jefes || []).map((jj) => ({ value: jj.id, label: `#${jj.nro} · ${jj.nombres}${jj.cedula ? ` · ${jj.cedula}` : ""}` }))} />
                <div className="error-container">{errors.jefe && <span className="field-error-message">{errors.jefe}</span>}</div>
              </div>
            )}
            {/* Cédula (solo dígitos, 6-8) con lupa */}
            <label className="carac-field">
              <span>Cédula{esJefe && <span className="required-star"> *</span>}</span>
              <div className="renace-ced-input">
                <input className={`morb-control${errors.cedula ? " has-error" : ""}`} inputMode="numeric" value={f.cedula}
                  onChange={(e) => set("cedula", e.target.value.replace(/\D/g, "").slice(0, 8))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarCedula(); } }} />
                <button type="button" className="renace-ced-btn" onClick={buscarCedula} disabled={buscando}
                  data-tip="Buscar en el padrón / API" aria-label="Buscar cédula">
                  {buscando ? <span className="spinner spinner-sm" aria-hidden /> : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  )}
                </button>
              </div>
              <div className="error-container">{errors.cedula && <span className="field-error-message">{errors.cedula}</span>}</div>
            </label>
            {/* Nombres */}
            <label className="carac-field carac-field--wide">
              <span>Nombres y apellidos<span className="required-star"> *</span></span>
              <input className={`morb-control${errors.nombres ? " has-error" : ""}`} value={f.nombres} onChange={(e) => set("nombres", e.target.value.toUpperCase())} />
              <div className="error-container">{errors.nombres && <span className="field-error-message">{errors.nombres}</span>}</div>
            </label>
            {/* Fecha */}
            <div className="carac-field">
              <span>Fecha de nacimiento</span>
              <DatePicker value={dmyToYmd(f.fechaNacimiento)} onChange={(ymd) => set("fechaNacimiento", ymdToDmy(ymd))} placeholder="Seleccione la fecha…" />
            </div>
            {/* Edad (auto) */}
            <label className="carac-field">
              <span>Edad (automática)</span>
              <input className="morb-control input-disabled" value={edad || "—"} readOnly disabled />
            </label>
            {/* Sexo */}
            <div className="carac-field">
              <span>Sexo</span>
              <StyledSelect value={f.sexo} onChange={(v) => set("sexo", v)} ariaLabel="Sexo"
                options={[{ value: "", label: "—" }, { value: "MASCULINO", label: "MASCULINO" }, { value: "FEMENINO", label: "FEMENINO" }]} />
            </div>
            {/* Teléfono */}
            <div className="carac-field">
              <span>Teléfono</span>
              <div className="field-row-phone">
                <StyledSelect value={f.telefonoCod} onChange={(v) => set("telefonoCod", v)} ariaLabel="Código de área"
                  options={withCurrent(TELEFONO_CODIGOS as unknown as string[], f.telefonoCod)} />
                <input className="morb-control" inputMode="numeric" placeholder="7 dígitos" value={f.telefonoNum}
                  onChange={(e) => set("telefonoNum", e.target.value.replace(/\D/g, "").slice(0, 7))} />
              </div>
            </div>
            {/* Profesión / oficio */}
            <div className="carac-field">
              <span>Profesión / oficio</span>
              <SearchableSingleSelect value={f.profesion} onChange={(v) => set("profesion", v)} ariaLabel="Profesión / oficio"
                options={withCurrent(cat.oficio, f.profesion)} placeholder="Seleccionar…" clearLabel="— Sin especificar —" />
            </div>
            {/* Parentesco (miembro: crear o editar) */}
            {!esJefe && (
              <div className="carac-field">
                <span>Parentesco</span>
                <SearchableSingleSelect value={f.parentesco} onChange={(v) => set("parentesco", v)} ariaLabel="Parentesco"
                  options={withCurrent(cat.parentesco, f.parentesco)} placeholder="Seleccionar…" clearLabel="— Sin especificar —" />
              </div>
            )}
            {/* Estado (obligatorio) */}
            <div className="carac-field">
              <span>Estado de procedencia<span className="required-star"> *</span></span>
              <StyledSelect value={f.estadoProcedencia} ariaLabel="Estado de procedencia" error={!!errors.estadoProcedencia}
                onChange={(v) => { setF((p) => ({ ...p, estadoProcedencia: v, parroquiaProcedencia: "" })); setErrors((e) => ({ ...e, estadoProcedencia: "", parroquiaProcedencia: "" })); }}
                options={[{ value: "", label: "—" }, ...withCurrent(ESTADOS, f.estadoProcedencia)]} />
              <div className="error-container">{errors.estadoProcedencia && <span className="field-error-message">{errors.estadoProcedencia}</span>}</div>
            </div>
            {/* Parroquia (dependiente, obligatorio) */}
            <div className="carac-field">
              <span>Parroquia de procedencia<span className="required-star"> *</span></span>
              <SearchableSingleSelect value={f.parroquiaProcedencia} onChange={(v) => set("parroquiaProcedencia", v)} ariaLabel="Parroquia de procedencia" error={!!errors.parroquiaProcedencia}
                options={withCurrent(parroquiasEstado, f.parroquiaProcedencia)} placeholder="Seleccionar…" clearLabel="— Sin especificar —" />
              <div className="error-container">{errors.parroquiaProcedencia && <span className="field-error-message">{errors.parroquiaProcedencia}</span>}</div>
            </div>
            {esJefe && (
              <>
                <div className="carac-field"><span>Tipo de afectación</span>
                  <StyledSelect value={f.tipoAfectacion} onChange={(v) => set("tipoAfectacion", v)} ariaLabel="Tipo de afectación"
                    options={[{ value: "", label: "—" }, ...withCurrent(RENACE_TIPO_AFECTACION, f.tipoAfectacion)]} /></div>
                <div className="carac-field"><span>Condición de vivienda</span>
                  <StyledSelect value={f.condicionVivienda} onChange={(v) => set("condicionVivienda", v)} ariaLabel="Condición de vivienda"
                    options={[{ value: "", label: "—" }, ...withCurrent(RENACE_CONDICION_VIVIENDA, f.condicionVivienda)]} /></div>
                <div className="carac-field carac-field--wide"><span>Planteamiento según afectación</span>
                  <SearchableSingleSelect value={f.planteamientoAfectacion} onChange={(v) => set("planteamientoAfectacion", v)} ariaLabel="Planteamiento según afectación"
                    options={withCurrent(RENACE_PLANTEAMIENTO_AFECTACION, f.planteamientoAfectacion)} placeholder="Seleccionar…" clearLabel="— Sin especificar —" /></div>
                <label className="carac-field"><span>N° de certificado</span>
                  <input className="morb-control" value={f.numeroCertificado} onChange={(e) => set("numeroCertificado", e.target.value.toUpperCase())} /></label>
                <label className="carac-field carac-field--wide"><span>Incidencias</span>
                  <input className="morb-control" value={f.incidencias} onChange={(e) => set("incidencias", e.target.value.toUpperCase())} /></label>
              </>
            )}
          </div>
          <div className="renace-edit-modal__actions">
            {puedeBorrar && (
              <button type="button" className="renace-edit-modal__delete" onClick={() => setConfirmDel(true)} disabled={saving}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                Eliminar
              </button>
            )}
            <div className="renace-edit-modal__actions-main">
              <button type="button" className="btn-secondary" onClick={close} disabled={saving}>Cancelar</button>
              <button type="button" className="btn-submit" onClick={save} disabled={saving}>{saving ? "Guardando…" : (esCrear ? "Agregar miembro" : "Guardar cambios")}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    {confirmDel && (
      <ConfirmModal
        message={<>¿Eliminar a este miembro del núcleo <strong>#{rec.jefeNro}</strong>?</>}
        highlight={rec.nombres}
        onConfirm={eliminar}
        onClose={() => setConfirmDel(false)}
      />
    )}
    </>
  );
}
