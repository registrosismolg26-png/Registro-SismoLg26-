"use client";

// ── Pestaña VZLA RENACE (Venezuela Renace) ──────────────────────────────────
// Módulo INDEPENDIENTE del censo. Base de familias (jefe + grupo familiar)
// importada desde un Excel; el operador BUSCA una cédula → se precarga el jefe y
// se listan sus miembros → registra un PLANTEAMIENTO de solución habitacional por
// núcleo. Además, dos tablas (Jefes / Grupo familiar) buscables y paginadas.
// Todo en MAYÚSCULAS (el backend es la fuente de verdad y normaliza al guardar).
// Diseño ONLINE: el listado se cachea en localStorage con ETag/304.

import { useState, useEffect, useMemo, useRef } from "react";
import { useAppContext } from "@/context/AppContext";
import { apiFetch } from "@/lib/apiFetch";
import { normalizeText, cedulaFamilia } from "@/lib/helpers";
import { canImportRenace } from "@/lib/permissions";
import { VENEZUELA_ESTADOS, RENACE_PLANTEAMIENTO_TIPOS, RENACE_MODALIDAD_PLAN } from "@/lib/constants";
import Pagination from "@/components/Pagination";
import StyledSelect from "@/components/StyledSelect";
import Reveal from "@/components/Reveal";
import type { RenaceJefe, RenaceMiembro, RenacePlanteamiento, RenaceTipo } from "@/types";

const LIST_CACHE_KEY = "renace_list_cache_v1";

// ── Estado del formulario de planteamiento (todo texto, se envía tal cual) ───
type PlanForm = {
  tipo: RenaceTipo | "";
  modalidadPlan: string; precioOCanon: string;
  nombreContraparte: string; cedulaContraparte: string;
  contacto: string; contactoSecundario: string;
  estado: string; municipio: string; parroquia: string; direccionEspecifica: string;
  estadoPreferencia: string; observacion: string;
};
const EMPTY_PLAN: PlanForm = {
  tipo: "", modalidadPlan: "", precioOCanon: "", nombreContraparte: "", cedulaContraparte: "",
  contacto: "", contactoSecundario: "", estado: "", municipio: "", parroquia: "",
  direccionEspecifica: "", estadoPreferencia: "", observacion: "",
};
function planFromRecord(p: RenacePlanteamiento | null): PlanForm {
  if (!p) return { ...EMPTY_PLAN };
  return {
    tipo: (p.tipo as RenaceTipo) || "",
    modalidadPlan: p.modalidadPlan || "", precioOCanon: p.precioOCanon || "",
    nombreContraparte: p.nombreContraparte || "", cedulaContraparte: p.cedulaContraparte || "",
    contacto: p.contacto || "", contactoSecundario: p.contactoSecundario || "",
    estado: p.estado || "", municipio: p.municipio || "", parroquia: p.parroquia || "",
    direccionEspecifica: p.direccionEspecifica || "", estadoPreferencia: p.estadoPreferencia || "",
    observacion: p.observacion || "",
  };
}

// ── Sub-controles pill (module-level → no pierden foco al re-render) ──────────
function Txt({ label, value, onChange, error, placeholder, wide, inputMode }: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; placeholder?: string; wide?: boolean; inputMode?: "text" | "numeric" | "decimal" | "tel";
}) {
  return (
    <label className={`carac-field${wide ? " carac-field--wide" : ""}`}>
      <span>{label}</span>
      <input className={`morb-control${error ? " has-error" : ""}`} value={value} placeholder={placeholder}
        inputMode={inputMode} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <div className="error-container">{error && <span className="field-error-message">{error}</span>}</div>
    </label>
  );
}
function Sel({ label, value, onChange, options, error }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; error?: string;
}) {
  return (
    <label className="carac-field">
      <span>{label}</span>
      <StyledSelect value={value} onChange={onChange} options={options} ariaLabel={label} error={!!error} />
      <div className="error-container">{error && <span className="field-error-message">{error}</span>}</div>
    </label>
  );
}
function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="carac-field carac-field--wide">
      <span>{label}</span>
      <textarea className="morb-control" rows={2} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <div className="error-container" />
    </label>
  );
}

// ── Parseo del Excel en el cliente (exceljs perezoso) ────────────────────────
// Devuelve filas CRUDAS (strings); el backend normaliza a MAYÚSCULA + sexo + ints.
// Mapea columnas por NOMBRE de encabezado (tolera reordenamientos), no por posición.
function fmtDateUTC(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}
function cellText(v: any): string {
  if (v == null) return "";
  if (v instanceof Date) return fmtDateUTC(v);
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join("");
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    return "";
  }
  return String(v);
}
async function parseRenaceXlsx(file: File): Promise<{ jefes: any[]; miembros: any[] }> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const norm = (s: string) => normalizeText(s).replace(/\s+/g, " ").trim();
  const cleanH = (h: string) => h.replace(/[^a-z0-9]/g, "");

  const pickSheet = (pred: (name: string) => boolean, fallbackIdx: number) => {
    let found: any = null;
    wb.eachSheet((ws) => { if (!found && pred(norm(ws.name))) found = ws; });
    return found || wb.worksheets[fallbackIdx] || null;
  };
  const jefesWs = pickSheet((n) => n.includes("jefe"), 0);
  const miembrosWs = pickSheet((n) => n.includes("grupo") || n.includes("familiar") || n.includes("miembro"), 1);

  const mapper = (ws: any) => {
    const header = ws.getRow(1);
    const cols: { c: number; h: string }[] = [];
    for (let c = 1; c <= ws.columnCount; c++) cols.push({ c, h: norm(cellText(header.getCell(c).value)) });
    const find = (pred: (h: string) => boolean) => cols.find((x) => x.h && pred(x.h))?.c ?? 0;
    // La columna del "número" (NRO / Nº) enlaza jefe↔miembro: match por versión limpia.
    const nroCol = cols.find((x) => ["nro", "n", "no"].includes(cleanH(x.h)))?.c ?? cols[0]?.c ?? 1;
    const g = (row: any, c: number) => (c ? cellText(row.getCell(c).value).trim() : "");
    return { find, nroCol, g };
  };

  const jefes: any[] = [];
  if (jefesWs) {
    const { find, nroCol, g } = mapper(jefesWs);
    const c = {
      cant: find((h) => h.includes("cant") && h.includes("miembro")),
      nom: find((h) => h.includes("nombres")),
      ced: find((h) => h.includes("cedula")),
      fn: find((h) => h.includes("fecha") && h.includes("nac")),
      sexo: find((h) => h === "sexo"),
      edad: find((h) => h === "edad"),
      tel: find((h) => h.includes("telefono")),
      prof: find((h) => h.includes("profesion") || h.includes("oficio")),
      est: find((h) => h.includes("estado") && h.includes("procedencia")),
      parr: find((h) => h.includes("parroquia") && h.includes("procedencia")),
      tipo: find((h) => h.includes("tipo") && h.includes("afecta")),
      cond: find((h) => h.includes("condicion") && h.includes("vivi")),
      inc: find((h) => h.includes("incidencia")),
      cert: find((h) => h.includes("certificado")),
      plan: find((h) => h.includes("planteamiento")),
      obs: find((h) => h.includes("observ")),
    };
    for (let r = 2; r <= jefesWs.rowCount; r++) {
      const row = jefesWs.getRow(r);
      const nro = g(row, nroCol), nombres = g(row, c.nom);
      if (!nro || !nombres) continue; // salta filas vacías/incompletas
      jefes.push({
        nro, cantMiembros: g(row, c.cant), nombres, cedula: g(row, c.ced),
        fechaNacimiento: g(row, c.fn), sexo: g(row, c.sexo), edad: g(row, c.edad),
        telefono: g(row, c.tel), profesion: g(row, c.prof),
        estadoProcedencia: g(row, c.est), parroquiaProcedencia: g(row, c.parr),
        tipoAfectacion: g(row, c.tipo), condicionVivienda: g(row, c.cond),
        incidencias: g(row, c.inc), numeroCertificado: g(row, c.cert),
        planteamientoAfectacion: g(row, c.plan), observaciones: g(row, c.obs),
      });
    }
  }

  const miembros: any[] = [];
  if (miembrosWs) {
    const { find, nroCol, g } = mapper(miembrosWs);
    const c = {
      nom: find((h) => h.includes("nombres")),
      ced: find((h) => h.includes("cedula")),
      fn: find((h) => h.includes("fecha") && h.includes("nac")),
      sexo: find((h) => h === "sexo"),
      edad: find((h) => h === "edad"),
      parent: find((h) => h === "parentesco"),
      tel: find((h) => h.includes("telefono")),
      prof: find((h) => h.includes("profesion") || h.includes("oficio")),
      est: find((h) => h.includes("estado") && h.includes("procedencia")),
      parr: find((h) => h.includes("parroquia") && h.includes("procedencia")),
    };
    for (let r = 2; r <= miembrosWs.rowCount; r++) {
      const row = miembrosWs.getRow(r);
      const jefeNro = g(row, nroCol), nombres = g(row, c.nom);
      if (!jefeNro || !nombres) continue;
      miembros.push({
        jefeNro, nombres, cedula: g(row, c.ced),
        fechaNacimiento: g(row, c.fn), sexo: g(row, c.sexo), edad: g(row, c.edad),
        parentesco: g(row, c.parent), telefono: g(row, c.tel), profesion: g(row, c.prof),
        estadoProcedencia: g(row, c.est), parroquiaProcedencia: g(row, c.parr),
      });
    }
  }

  return { jefes, miembros };
}

export default function VzlaRenaceTab() {
  const { currentUser, showToast } = useAppContext();
  const puedeImportar = canImportRenace(currentUser?.role || "");

  const [view, setView] = useState<"buscar" | "directorio">("buscar");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  // ── Directorio (dos tablas) ──
  const [jefes, setJefes] = useState<RenaceJefe[]>([]);
  const [miembros, setMiembros] = useState<RenaceMiembro[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [dirTab, setDirTab] = useState<"jefes" | "miembros">("jefes");
  const [jq, setJq] = useState(""); const [jPage, setJPage] = useState(1); const [jSize, setJSize] = useState(20);
  const [mq, setMq] = useState(""); const [mPage, setMPage] = useState(1); const [mSize, setMSize] = useState(20);

  const loadList = async (force = false) => {
    let cached: any = null;
    try { cached = JSON.parse(localStorage.getItem(LIST_CACHE_KEY) || "null"); } catch { /* ignore */ }
    if (cached && !force) { setJefes(cached.jefes || []); setMiembros(cached.miembros || []); }
    if (!navigator.onLine) return;
    setLoadingList(true);
    try {
      const headers: Record<string, string> = {};
      if (cached?.etag && !force) headers["If-None-Match"] = cached.etag;
      const res = await apiFetch("/api/vzlarenace/list", { headers });
      if (res.status === 304) return; // cache vigente
      if (res.ok) {
        const etag = res.headers.get("ETag");
        const data = await res.json();
        setJefes(data.jefes || []); setMiembros(data.miembros || []);
        try { localStorage.setItem(LIST_CACHE_KEY, JSON.stringify({ etag, jefes: data.jefes, miembros: data.miembros })); } catch { /* cuota */ }
      }
    } catch (e) { console.error(e); }
    finally { setLoadingList(false); }
  };
  useEffect(() => { loadList(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { setJPage(1); }, [jq, jSize]);
  useEffect(() => { setMPage(1); }, [mq, mSize]);

  const jefesF = useMemo(() => {
    const n = normalizeText(jq.trim());
    if (!n) return jefes;
    return jefes.filter((j) => normalizeText(`${j.nombres} ${j.cedula} ${j.nro}`).includes(n));
  }, [jefes, jq]);
  const miembrosF = useMemo(() => {
    const n = normalizeText(mq.trim());
    if (!n) return miembros;
    return miembros.filter((m) => normalizeText(`${m.nombres} ${m.cedula} ${m.jefeNro} ${m.parentesco || ""}`).includes(n));
  }, [miembros, mq]);
  const jefesPage = jefesF.slice((jPage - 1) * jSize, jPage * jSize);
  const miembrosPage = miembrosF.slice((mPage - 1) * mSize, mPage * mSize);

  // ── Búsqueda de núcleo + planteamiento ──
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [res, setRes] = useState<{ jefe: RenaceJefe; miembros: RenaceMiembro[]; planteamiento: RenacePlanteamiento | null } | null>(null);
  const [plan, setPlan] = useState<PlanForm>({ ...EMPTY_PLAN });
  const [planErrors, setPlanErrors] = useState<Record<string, string>>({});
  const [savingPlan, setSavingPlan] = useState(false);

  const setField = (k: keyof PlanForm, v: string) => {
    setPlan((p) => ({ ...p, [k]: v }));
    if (planErrors[k]) setPlanErrors((e) => ({ ...e, [k]: "" }));
  };

  const doSearch = async (cedula?: string) => {
    const term = (cedula ?? q).trim();
    const digits = cedulaFamilia(term);
    if (!digits || digits.length < 4) { showToast("Ingresa una cédula válida.", "warning"); return; }
    if (cedula != null) setQ(cedula);
    setSearching(true); setSearched(true); setPlanErrors({});
    try {
      const r = await apiFetch(`/api/vzlarenace/search?cedula=${encodeURIComponent(term)}`);
      if (r.ok) {
        const data = await r.json();
        if (data.jefe) {
          setRes({ jefe: data.jefe, miembros: data.miembros || [], planteamiento: data.planteamiento || null });
          setPlan(planFromRecord(data.planteamiento || null));
        } else {
          setRes(null);
        }
      } else {
        showToast("No se pudo buscar. Revisa la conexión.", "error");
      }
    } catch { showToast("Error de red al buscar.", "error"); }
    finally { setSearching(false); }
  };

  const openNucleo = (cedula: string) => { setView("buscar"); doSearch(cedula); };

  const validatePlan = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!plan.tipo) { e.tipo = "Selecciona un planteamiento."; return e; }
    if (plan.tipo === "COMPRA" || plan.tipo === "ALQUILER") {
      if (!plan.precioOCanon.trim()) e.precioOCanon = plan.tipo === "ALQUILER" ? "Indica el cánon." : "Indica el precio.";
      else if (plan.tipo === "ALQUILER") {
        const monto = parseFloat(plan.precioOCanon.replace(/[^\d.]/g, ""));
        if (Number.isFinite(monto) && monto > 500) e.precioOCanon = "El cánon no puede exceder 500 $.";
      }
      if (!plan.nombreContraparte.trim()) e.nombreContraparte = plan.tipo === "ALQUILER" ? "Indica el arrendatario." : "Indica el vendedor.";
    }
    if (plan.tipo === "GMVV_INTERIOR" && !plan.estadoPreferencia) e.estadoPreferencia = "Selecciona el estado de preferencia.";
    if (plan.tipo === "PLAN_RENACE" && !plan.modalidadPlan) e.modalidadPlan = "Selecciona la modalidad.";
    return e;
  };

  const savePlan = async () => {
    if (!res?.jefe) return;
    const errs = validatePlan();
    setPlanErrors(errs);
    if (Object.keys(errs).length) {
      showToast("Revisa los campos marcados.", "warning");
      setTimeout(() => {
        const el = document.querySelector(".renace-plan .field-error-message, .renace-plan .has-error");
        const target = (el?.closest(".carac-field") as HTMLElement) || (el as HTMLElement | null);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    setSavingPlan(true);
    try {
      const r = await apiFetch("/api/vzlarenace/planteamiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jefeNro: res.jefe.nro, ...plan }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.success) {
        showToast("Planteamiento guardado.", "success");
        setRes((prev) => (prev ? { ...prev, planteamiento: data.planteamiento } : prev));
        setPlan(planFromRecord(data.planteamiento));
      } else {
        showToast(data?.error || "No se pudo guardar el planteamiento.", "error");
      }
    } catch { showToast("Error de red al guardar.", "error"); }
    finally { setSavingPlan(false); }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!file) return;
    setImporting(true);
    try {
      const { jefes: pj, miembros: pm } = await parseRenaceXlsx(file);
      if (pj.length === 0) { showToast("El archivo no tiene jefes válidos.", "error"); return; }
      const r = await apiFetch("/api/vzlarenace/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jefes: pj, miembros: pm }),
        timeoutMs: 120000,
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.success) {
        showToast(`Importado: ${data.jefes} jefes y ${data.miembros} miembros.`, "success");
        localStorage.removeItem(LIST_CACHE_KEY);
        await loadList(true);
      } else {
        showToast(data?.error || "No se pudo importar el archivo.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast("Error al leer el archivo Excel.", "error");
    } finally { setImporting(false); }
  };

  const esCompraAlquiler = plan.tipo === "COMPRA" || plan.tipo === "ALQUILER";

  return (
    <div className="renace-tab">
      {/* Encabezado + importar */}
      <div className="renace-head">
        <div className="renace-head__title">
          <h2>VZLA Renace</h2>
          <p className="renace-sub">Familias del programa Venezuela Renace. Busca una cédula para ver el núcleo y registrar su planteamiento.</p>
        </div>
        {puedeImportar && (
          <div className="btn-seg-group renace-head__actions">
            <button type="button" className="toolbar-btn" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? "Importando…" : "Importar Excel"}
            </button>
            <button type="button" className="toolbar-btn" onClick={() => loadList(true)} disabled={loadingList}>
              {loadingList ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={onFile} />
      </div>

      {/* Toggle de vista */}
      <div className="btn-seg-group renace-viewtabs">
        <button type="button" className={`toolbar-btn${view === "buscar" ? " is-active" : ""}`} onClick={() => setView("buscar")}>Consultar núcleo</button>
        <button type="button" className={`toolbar-btn${view === "directorio" ? " is-active" : ""}`} onClick={() => setView("directorio")}>Directorio</button>
      </div>

      {/* ── VISTA: CONSULTAR NÚCLEO ── */}
      {view === "buscar" && (
        <div className="renace-consulta">
          <div className="pill-form renace-search">
            <input className="morb-control" placeholder="Buscar por cédula (del jefe o de un miembro)…" value={q} inputMode="numeric"
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }} />
            <button type="button" className="btn-submit" onClick={() => doSearch()} disabled={searching}>
              {searching ? "Buscando…" : "Buscar"}
            </button>
          </div>

          {searched && !searching && !res && (
            <div className="renace-empty">No se encontró ningún núcleo con esa cédula. Verifica el número o importa la base actualizada.</div>
          )}

          {res && (
            <>
              {/* Tarjeta del jefe (solo lectura) */}
              <div className="renace-jefe-card">
                <div className="renace-jefe-card__head">
                  <h3>{res.jefe.nombres}</h3>
                  <span className="renace-badge">NÚCLEO #{res.jefe.nro}</span>
                </div>
                <dl className="renace-jefe-grid">
                  <div><dt>Cédula</dt><dd>{res.jefe.cedula || "—"}</dd></div>
                  <div><dt>Sexo</dt><dd>{res.jefe.sexo || "—"}</dd></div>
                  <div><dt>Edad</dt><dd>{res.jefe.edad ?? "—"}</dd></div>
                  <div><dt>Teléfono</dt><dd>{res.jefe.telefono || "—"}</dd></div>
                  <div><dt>Profesión</dt><dd>{res.jefe.profesion || "—"}</dd></div>
                  <div><dt>Procedencia</dt><dd>{[res.jefe.estadoProcedencia, res.jefe.parroquiaProcedencia].filter(Boolean).join(" / ") || "—"}</dd></div>
                  <div><dt>Tipo de afectación</dt><dd>{res.jefe.tipoAfectacion || "—"}</dd></div>
                  <div><dt>Condición de la vivienda</dt><dd>{res.jefe.condicionVivienda || "—"}</dd></div>
                  <div><dt>N° de certificado</dt><dd>{res.jefe.numeroCertificado || "—"}</dd></div>
                  <div className="renace-jefe-grid__wide"><dt>Planteamiento según afectación (RUV)</dt><dd>{res.jefe.planteamientoAfectacion || "—"}</dd></div>
                </dl>
              </div>

              {/* Grupo familiar */}
              <div className="renace-block">
                <h4 className="renace-block__title">Grupo familiar ({res.miembros.length})</h4>
                <div className="registro-table-wrapper">
                  <table className="registro-table">
                    <thead><tr><th>Nombre</th><th>Cédula</th><th>Parentesco</th><th>Sexo</th><th>Edad</th></tr></thead>
                    <tbody>
                      {res.miembros.length === 0 ? (
                        <tr><td colSpan={5} className="renace-td-empty">Sin miembros registrados.</td></tr>
                      ) : res.miembros.map((m) => (
                        <tr key={m.id}>
                          <td>{m.nombres}</td><td>{m.cedula || "—"}</td><td>{m.parentesco || "—"}</td><td>{m.sexo || "—"}</td><td>{m.edad ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Planteamiento */}
              <div className="pill-form renace-plan">
                <div className="renace-plan__head">
                  <h4>Planteamiento de solución habitacional</h4>
                  {res.planteamiento && <span className="renace-badge renace-badge--ok">Registrado</span>}
                </div>
                <div className="carac-grid">
                  <Sel label="Planteamiento" value={plan.tipo} error={planErrors.tipo}
                    onChange={(v) => setField("tipo", v)}
                    options={[{ value: "", label: "— Seleccionar —" }, ...RENACE_PLANTEAMIENTO_TIPOS.map((t) => ({ value: t.value, label: t.label }))]} />

                  {/* COMPRA / ALQUILER */}
                  <Reveal open={esCompraAlquiler}>
                    <div className="carac-grid renace-sub">
                      <Txt label={plan.tipo === "ALQUILER" ? "Cánon mensual ($) — máx. 500" : "Precio ($)"}
                        value={plan.precioOCanon} onChange={(v) => setField("precioOCanon", v)} error={planErrors.precioOCanon} inputMode="decimal" />
                      <Txt label={plan.tipo === "ALQUILER" ? "Nombre del arrendatario" : "Nombre del vendedor"}
                        value={plan.nombreContraparte} onChange={(v) => setField("nombreContraparte", v)} error={planErrors.nombreContraparte} />
                      <Txt label="Cédula de la contraparte" value={plan.cedulaContraparte} onChange={(v) => setField("cedulaContraparte", v)} inputMode="text" />
                      <Txt label="Contacto" value={plan.contacto} onChange={(v) => setField("contacto", v)} inputMode="tel" />
                      <Txt label="Contacto secundario" value={plan.contactoSecundario} onChange={(v) => setField("contactoSecundario", v)} inputMode="tel" />
                      <Txt label="Estado" value={plan.estado} onChange={(v) => setField("estado", v)} />
                      <Txt label="Municipio" value={plan.municipio} onChange={(v) => setField("municipio", v)} />
                      <Txt label="Parroquia" value={plan.parroquia} onChange={(v) => setField("parroquia", v)} />
                      <Txt label="Dirección específica" wide value={plan.direccionEspecifica} onChange={(v) => setField("direccionEspecifica", v)} />
                    </div>
                  </Reveal>

                  {/* GMVV – INTERIOR DEL PAÍS */}
                  <Reveal open={plan.tipo === "GMVV_INTERIOR"}>
                    <div className="carac-grid renace-sub">
                      <Sel label="Estado de preferencia" value={plan.estadoPreferencia} error={planErrors.estadoPreferencia}
                        onChange={(v) => setField("estadoPreferencia", v)}
                        options={[{ value: "", label: "— Seleccionar —" }, ...VENEZUELA_ESTADOS.map((s) => ({ value: s, label: s }))]} />
                    </div>
                  </Reveal>

                  {/* PLAN VZLA RENACE */}
                  <Reveal open={plan.tipo === "PLAN_RENACE"}>
                    <div className="carac-grid renace-sub">
                      <Sel label="Modalidad" value={plan.modalidadPlan} error={planErrors.modalidadPlan}
                        onChange={(v) => setField("modalidadPlan", v)}
                        options={[{ value: "", label: "— Seleccionar —" }, ...RENACE_MODALIDAD_PLAN.map((m) => ({ value: m.value, label: m.label }))]} />
                    </div>
                  </Reveal>

                  {/* OBSERVACIÓN — SIEMPRE */}
                  <Area label="Observación" value={plan.observacion} onChange={(v) => setField("observacion", v)} />
                </div>
                <div className="renace-plan__foot">
                  <button type="button" className="btn-submit" onClick={savePlan} disabled={savingPlan || !plan.tipo}>
                    {savingPlan ? "Guardando…" : res.planteamiento ? "Actualizar planteamiento" : "Guardar planteamiento"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── VISTA: DIRECTORIO (dos tablas) ── */}
      {view === "directorio" && (
        <div className="renace-directorio">
          <div className="btn-seg-group renace-dirtabs">
            <button type="button" className={`toolbar-btn${dirTab === "jefes" ? " is-active" : ""}`} onClick={() => setDirTab("jefes")}>Jefes ({jefes.length})</button>
            <button type="button" className={`toolbar-btn${dirTab === "miembros" ? " is-active" : ""}`} onClick={() => setDirTab("miembros")}>Grupo familiar ({miembros.length})</button>
          </div>

          {dirTab === "jefes" && (
            <div className="renace-block">
              <div className="pill-form renace-search">
                <input className="morb-control" placeholder="Buscar jefe por nombre, cédula o N°…" value={jq} onChange={(e) => setJq(e.target.value)} />
              </div>
              <div className="registro-table-wrapper">
                <table className="registro-table">
                  <thead><tr><th className="col-num">N°</th><th>Nombre</th><th>Cédula</th><th>Miembros</th><th>Procedencia</th><th className="col-action"></th></tr></thead>
                  <tbody>
                    {jefesPage.length === 0 ? (
                      <tr><td colSpan={6} className="renace-td-empty">{loadingList ? "Cargando…" : "Sin resultados."}</td></tr>
                    ) : jefesPage.map((j) => (
                      <tr key={j.id}>
                        <td className="col-num">{j.nro}</td>
                        <td>{j.nombres}</td>
                        <td>{j.cedula || "—"}</td>
                        <td>{j.cantMiembros ?? "—"}</td>
                        <td>{[j.estadoProcedencia, j.parroquiaProcedencia].filter(Boolean).join(" / ") || "—"}</td>
                        <td className="col-action">
                          <div className="row-actions">
                            <button type="button" className="btn-ver btn-ver--view" onClick={() => openNucleo(j.cedula || String(j.nro))} title="Ver núcleo" aria-label="Ver núcleo">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination total={jefesF.length} page={jPage} pageSize={jSize} onPageChange={setJPage} onPageSizeChange={setJSize} itemLabel="jefes" />
            </div>
          )}

          {dirTab === "miembros" && (
            <div className="renace-block">
              <div className="pill-form renace-search">
                <input className="morb-control" placeholder="Buscar miembro por nombre, cédula, N° o parentesco…" value={mq} onChange={(e) => setMq(e.target.value)} />
              </div>
              <div className="registro-table-wrapper">
                <table className="registro-table">
                  <thead><tr><th className="col-num">Núcleo</th><th>Nombre</th><th>Cédula</th><th>Parentesco</th><th>Sexo</th><th>Edad</th></tr></thead>
                  <tbody>
                    {miembrosPage.length === 0 ? (
                      <tr><td colSpan={6} className="renace-td-empty">{loadingList ? "Cargando…" : "Sin resultados."}</td></tr>
                    ) : miembrosPage.map((m) => (
                      <tr key={m.id}>
                        <td className="col-num"><button type="button" className="renace-link" onClick={() => openNucleo(m.cedula || String(m.jefeNro))}>#{m.jefeNro}</button></td>
                        <td>{m.nombres}</td>
                        <td>{m.cedula || "—"}</td>
                        <td>{m.parentesco || "—"}</td>
                        <td>{m.sexo || "—"}</td>
                        <td>{m.edad ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination total={miembrosF.length} page={mPage} pageSize={mSize} onPageChange={setMPage} onPageSizeChange={setMSize} itemLabel="miembros" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
