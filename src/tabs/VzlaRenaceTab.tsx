"use client";

// ── Pestaña VZLA RENACE (Venezuela Renace) ──────────────────────────────────
// Módulo INDEPENDIENTE del censo. DIRECTORIO de dos tablas (Jefes / Grupo familiar)
// buscables y paginadas. LECTURA EFICIENTE separada por volatilidad: jefes/miembros
// (casi estáticos, solo cambian al importar) y planteamientos (calientes) tienen su
// propia clave de cache + ETag → guardar un plan NO re-descarga las ~1000 filas.
// Desde un jefe se pulsa "Planear" → modal-wizard (RenacePlanModal) que guarda el
// planteamiento OFFLINE-first (cola en IndexedDB + reintentos con backoff, vía
// triggerSync). El semáforo/KPI = servidor ∪ pendientes locales (optimista). Import
// = solo Master; Actualizar = todos. Todo en MAYÚSCULAS (el backend normaliza).

import { useState, useEffect, useMemo, useRef } from "react";
import { useAppContext } from "@/context/AppContext";
import { apiFetch } from "@/lib/apiFetch";
import { getAllLocalRenacePlanteamientos } from "@/lib/db";
import { normalizeText } from "@/lib/helpers";
import { canImportRenace, canExportRenace, canEditRenace, isMaster, isRenaceMaster, canViewRenaceGraficas } from "@/lib/permissions";
import Pagination from "@/components/Pagination";
import RenacePlanModal from "@/components/RenacePlanModal";
import RenaceEditModal from "@/components/RenaceEditModal";
import ConfirmModal from "@/components/ConfirmModal";
import RenaceGraficas from "@/components/RenaceGraficas";
import type { RenaceJefe, RenaceMiembro } from "@/types";

// Caches SEPARADOS por volatilidad: jefes/miembros (casi estáticos, solo cambian al
// importar) y planteamientos (calientes) tienen su propia clave + ETag → guardar un
// plan no re-descarga las ~1000 filas de jefes/miembros.
const JM_CACHE_KEY = "renace_jm_v1";
const PLAN_CACHE_KEY = "renace_plan_v1";

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
    const nroCol = cols.find((x) => ["nro", "n", "no"].includes(cleanH(x.h)))?.c ?? cols[0]?.c ?? 1;
    const g = (row: any, c: number) => (c ? cellText(row.getCell(c).value).trim() : "");
    return { find, nroCol, g };
  };

  const dig = (s: string) => String(s ?? "").replace(/\D/g, "");

  // JEFES → jefes[] + índice cédula(base)→nro, para ENLAZAR los grupos por CÉDULA.
  const jefes: any[] = [];
  const jefeNroByCedula = new Map<string, string>();
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
      if (!nro || !nombres) continue;
      const cedula = g(row, c.ced);
      jefes.push({
        nro, cantMiembros: g(row, c.cant), nombres, cedula,
        fechaNacimiento: g(row, c.fn), sexo: g(row, c.sexo), edad: g(row, c.edad),
        telefono: g(row, c.tel), profesion: g(row, c.prof),
        estadoProcedencia: g(row, c.est), parroquiaProcedencia: g(row, c.parr),
        tipoAfectacion: g(row, c.tipo), condicionVivienda: g(row, c.cond),
        incidencias: g(row, c.inc), numeroCertificado: g(row, c.cert),
        planteamientoAfectacion: g(row, c.plan), observaciones: g(row, c.obs),
      });
      const base = dig(cedula);
      if (base && !jefeNroByCedula.has(base)) jefeNroByCedula.set(base, nro);
    }
  }

  // GRUPO FAMILIAR: las familias vienen agrupadas por Nº en una celda COMBINADA por
  // familia (exceljs propaga el valor a las filas hijas; forward-fill como respaldo).
  // OJO: el Nº del grupo NO corresponde al NRO de la hoja de jefes → el enlace se hace
  // por la CÉDULA del jefe (= primer miembro del grupo), y se asigna UN grupo por jefe
  // (se omiten familias duplicadas del Excel y grupos sin jefe identificable).
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
    // 1) Agrupar filas por Nº (forward-fill de la celda combinada).
    const groups = new Map<string, any[]>();
    let curNo = "";
    for (let r = 2; r <= miembrosWs.rowCount; r++) {
      const row = miembrosWs.getRow(r);
      let no = g(row, nroCol);
      if (!no) no = curNo; else curNo = no;
      const nombres = g(row, c.nom);
      if (!no || !nombres) continue;
      const rd = {
        nombres, cedula: g(row, c.ced),
        fechaNacimiento: g(row, c.fn), sexo: g(row, c.sexo), edad: g(row, c.edad),
        parentesco: g(row, c.parent), telefono: g(row, c.tel), profesion: g(row, c.prof),
        estadoProcedencia: g(row, c.est), parroquiaProcedencia: g(row, c.parr),
      };
      (groups.get(no) ?? groups.set(no, []).get(no)!).push(rd);
    }
    // 2) Enlazar cada grupo a su jefe por la cédula del PRIMER miembro (un grupo/jefe).
    const asignados = new Set<string>();
    for (const rows of groups.values()) {
      const jefeNro = jefeNroByCedula.get(dig(rows[0]?.cedula));
      if (!jefeNro || asignados.has(jefeNro)) continue; // sin jefe o familia duplicada
      asignados.add(jefeNro);
      for (const rd of rows) miembros.push({ jefeNro, ...rd });
    }
  }

  return { jefes, miembros };
}

// Filas skeleton (shimmer) para las tablas mientras carga la primera vez.
function SkelRows({ widths, n = 6 }: { widths: (string | number)[]; n?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <tr key={`sk-${i}`} style={{ animationDelay: `${i * 50}ms` }}>
          {widths.map((w, c) => (
            <td key={c}><span className="skeleton-cell" style={{ width: w, margin: typeof w === "number" && w < 40 ? "0 auto" : undefined }} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function VzlaRenaceTab() {
  const { currentUser, showToast, effectiveRefugio } = useAppContext();
  const puedeImportar = canImportRenace(currentUser?.role || "");
  const puedeExportar = canExportRenace(currentUser?.role || ""); // descargar Directorio a Excel = MASTER/ADMIN
  const puedeEditar = canEditRenace(currentUser?.role || "");     // editar jefe/miembro = MASTER/ADMIN/REGISTRADOR
  const esMaster = isMaster(currentUser?.role || "");
  // "Master Renace": entra al módulo pero SOLO ve las Gráficas (sin Directorio ni edición).
  const esRenaceMaster = isRenaceMaster(currentUser?.role || "");
  const puedeVerGraficas = canViewRenaceGraficas(currentUser?.role || ""); // Master global + Master Renace
  // Vista inicial: Master Renace arranca (y se queda) en Gráficas; el resto en Directorio.
  const [view, setView] = useState<"directorio" | "graficas">(esRenaceMaster ? "graficas" : "directorio");

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [jefes, setJefes] = useState<RenaceJefe[]>([]);
  const [miembros, setMiembros] = useState<RenaceMiembro[]>([]);
  // Semáforo/KPI: el ancla que MANDA es la CÉDULA del jefe; se conservan los NROs como
  // respaldo (transición antes del backfill, o pendientes offline con NRO viejo).
  const [serverPlanNros, setServerPlanNros] = useState<Set<number>>(new Set());
  const [serverPlanCeds, setServerPlanCeds] = useState<Set<string>>(new Set());
  const [localPlanNros, setLocalPlanNros] = useState<Set<number>>(new Set());
  const [localPlanCeds, setLocalPlanCeds] = useState<Set<string>>(new Set());
  const [loadingList, setLoadingList] = useState(false);
  const [dirTab, setDirTab] = useState<"jefes" | "miembros">("jefes");
  const [jq, setJq] = useState(""); const [jPage, setJPage] = useState(1); const [jSize, setJSize] = useState(20);
  const [mq, setMq] = useState(""); const [mPage, setMPage] = useState(1); const [mSize, setMSize] = useState(20);

  const [planeando, setPlaneando] = useState<RenaceJefe | null>(null);
  const [editando, setEditando] = useState<
    | { modo: "editar"; tipo: "jefe" | "miembro"; record: RenaceJefe | RenaceMiembro }
    | { modo: "crear"; jefeFijo?: RenaceJefe }
    | null
  >(null);
  const [confirmMiembro, setConfirmMiembro] = useState<RenaceMiembro | null>(null);

  // Semáforo/KPI = servidor ∪ pendientes locales (optimista, sin esperar la sync).
  // Cédula → SOLO DÍGITOS (para comparar sin importar formato/cache viejo).
  const cedDigits = (s?: string | null) => (s || "").replace(/\D/g, "");
  const planNros = useMemo(() => new Set<number>([...serverPlanNros, ...localPlanNros]), [serverPlanNros, localPlanNros]);
  const planCeds = useMemo(() => new Set<string>([...serverPlanCeds, ...localPlanCeds]), [serverPlanCeds, localPlanCeds]);
  // ¿El jefe tiene planteamiento? Por CÉDULA (la que manda) o, de respaldo, por NRO.
  const tienePlan = (j: RenaceJefe) => planCeds.has(cedDigits(j.cedula)) || planNros.has(j.nro);

  const jmCacheKey = `${JM_CACHE_KEY}::${effectiveRefugio || "all"}`;
  const planCacheKey = `${PLAN_CACHE_KEY}::${effectiveRefugio || "all"}`;

  // Jefes + miembros: casi estáticos (solo cambian al importar) → casi siempre 304.
  const loadJM = async (force = false) => {
    let cached: any = null;
    try { cached = JSON.parse(localStorage.getItem(jmCacheKey) || "null"); } catch { /* ignore */ }
    if (cached && !force) { setJefes(cached.jefes || []); setMiembros(cached.miembros || []); }
    if (!navigator.onLine) return;
    setLoadingList(true);
    try {
      const headers: Record<string, string> = {};
      if (cached?.etag && !force) headers["If-None-Match"] = cached.etag;
      const q = effectiveRefugio ? `?refugio=${encodeURIComponent(effectiveRefugio)}` : "";
      const res = await apiFetch(`/api/vzlarenace/list${q}`, { headers });
      if (res.status === 304) return;
      if (res.ok) {
        const etag = res.headers.get("ETag");
        const data = await res.json();
        setJefes(data.jefes || []); setMiembros(data.miembros || []);
        try { localStorage.setItem(jmCacheKey, JSON.stringify({ etag, jefes: data.jefes, miembros: data.miembros })); } catch { /* cuota */ }
      }
    } catch (e) { console.error(e); }
    finally { setLoadingList(false); }
  };

  // Planteamientos (semáforo/KPI): payload chico, su propio ETag → barato de refrescar.
  const loadPlans = async (force = false) => {
    let cached: any = null;
    try { cached = JSON.parse(localStorage.getItem(planCacheKey) || "null"); } catch { /* ignore */ }
    if (cached && !force) { setServerPlanNros(new Set(cached.planteamientoNros || [])); setServerPlanCeds(new Set((cached.planteamientoCedulas || []).map(cedDigits))); }
    if (!navigator.onLine) return;
    try {
      const headers: Record<string, string> = {};
      if (cached?.etag && !force) headers["If-None-Match"] = cached.etag;
      const q = effectiveRefugio ? `?refugio=${encodeURIComponent(effectiveRefugio)}` : "";
      const res = await apiFetch(`/api/vzlarenace/planteamientos${q}`, { headers });
      if (res.status === 304) return;
      if (res.ok) {
        const etag = res.headers.get("ETag");
        const data = await res.json();
        setServerPlanNros(new Set(data.planteamientoNros || []));
        setServerPlanCeds(new Set((data.planteamientoCedulas || []).map(cedDigits)));
        try { localStorage.setItem(planCacheKey, JSON.stringify({ etag, planteamientoNros: data.planteamientoNros, planteamientoCedulas: data.planteamientoCedulas })); } catch { /* cuota */ }
      }
    } catch (e) { console.error(e); }
  };

  // Pendientes locales del refugio actual (cola offline) → semáforo optimista.
  const refreshLocalPlanNros = async () => {
    try {
      const locals = await getAllLocalRenacePlanteamientos();
      const refId = jefes[0]?.refugioId; // los jefes del view comparten refugioId
      const nros = new Set<number>();
      const ceds = new Set<string>();
      for (const l of locals) {
        if (l.status === "error") continue;
        if (refId && l.refugioId !== refId) continue;
        nros.add(l.jefeNro);
        if (l.jefeCedula) ceds.add(cedDigits(l.jefeCedula));
      }
      setLocalPlanNros(nros);
      setLocalPlanCeds(ceds);
    } catch { /* ignore */ }
  };

  const reloadAll = (force = false) => { loadJM(force); loadPlans(force); refreshLocalPlanNros(); };

  // Recarga al abrir y cada vez que cambie el campamento (Master).
  useEffect(() => {
    setJefes([]); setMiembros([]);
    setServerPlanNros(new Set()); setServerPlanCeds(new Set()); setLocalPlanNros(new Set()); setLocalPlanCeds(new Set());
    if (esRenaceMaster) return; // Master Renace solo ve Gráficas → no baja el directorio (~1000 filas)
    reloadAll();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [effectiveRefugio]);
  // Cuando llegan los jefes, re-filtra los pendientes locales por su refugioId.
  useEffect(() => { refreshLocalPlanNros(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [jefes]);
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

  // Conteo REAL de miembros por núcleo (desde los `RenaceMiembro` cargados), NO el valor
  // del Excel. INCLUYE al jefe exactamente una vez: en unos campamentos el jefe quedó
  // guardado como miembro (primer miembro del grupo) y en otros no → se suma 1 solo si su
  // cédula NO aparece ya entre los miembros. Clave por refugio+nro (Master ve varios).
  // Miembros agrupados por su vínculo al jefe: por CÉDULA del jefe (la que manda, en
  // dígitos) cuando existe, o por NRO como respaldo (datos pre-backfill). `ced` = cédulas
  // de los miembros (para saber si el jefe ya está entre ellos y no contarlo dos veces).
  const nucleoInfo = useMemo(() => {
    const m = new Map<string, { count: number; ced: Set<string> }>();
    for (const x of miembros) {
      const k = x.jefeCedula ? `${x.refugioId}::C:${cedDigits(x.jefeCedula)}` : `${x.refugioId}::N:${x.jefeNro}`;
      let e = m.get(k);
      if (!e) { e = { count: 0, ced: new Set<string>() }; m.set(k, e); }
      e.count++;
      const d = cedDigits(x.cedula);
      if (d) e.ced.add(d);
    }
    return m;
  }, [miembros]);
  const memberCount = (j: RenaceJefe) => {
    const e = nucleoInfo.get(`${j.refugioId}::C:${cedDigits(j.cedula)}`) || nucleoInfo.get(`${j.refugioId}::N:${j.nro}`);
    const base = e?.count || 0;
    const jefeIncluido = !!e && e.ced.has(cedDigits(j.cedula));
    return base + (jefeIncluido ? 0 : 1);
  };

  // Miembros del núcleo abierto (desde la lista ya cargada → sin fetch extra).
  const miembrosDelNucleo = useMemo(
    () => (planeando ? miembros.filter((m) => (m.jefeCedula ? cedDigits(m.jefeCedula) === cedDigits(planeando.cedula) : m.jefeNro === planeando.nro)) : []),
    [planeando, miembros],
  );
  const openPlanPorNro = (nro: number) => {
    const j = jefes.find((x) => x.nro === nro);
    if (j) setPlaneando(j);
    else showToast("No se encontró el jefe de ese núcleo.", "warning");
  };

  // Eliminar un miembro (solo Master). La CONFIRMACIÓN la hace ConfirmModal (no confirm()
  // nativo); esta función solo ejecuta el DELETE y lanza si falla (para que el modal siga).
  const doDeleteMiembro = async (m: RenaceMiembro) => {
    const res = await apiFetch(`/api/vzlarenace/miembro?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success) { showToast("Miembro eliminado.", "success"); reloadAll(true); }
    else { showToast(data?.error || "No se pudo eliminar el miembro.", "error"); throw new Error("delete failed"); }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // El import va a UN campamento: Master debe tener uno seleccionado (no "todos").
    if (!effectiveRefugio) {
      showToast("Selecciona primero un campamento para importar en él.", "warning");
      return;
    }
    setImporting(true);
    try {
      const { jefes: pj, miembros: pm } = await parseRenaceXlsx(file);
      if (pj.length === 0) { showToast("El archivo no tiene jefes válidos.", "error"); return; }
      const r = await apiFetch("/api/vzlarenace/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refugio: effectiveRefugio, jefes: pj, miembros: pm }),
        timeoutMs: 120000,
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.success) {
        showToast(`Importado en ${effectiveRefugio}: ${data.jefes} jefes y ${data.miembros} miembros.`, "success");
        localStorage.removeItem(jmCacheKey);
        await loadJM(true); loadPlans(true); refreshLocalPlanNros();
      } else {
        showToast(data?.error || "No se pudo importar el archivo.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast("Error al leer el archivo Excel.", "error");
    } finally { setImporting(false); }
  };

  // Descargar el Directorio a Excel (MASTER/ADMIN): reutiliza los jefes/miembros ya
  // cargados y trae los planteamientos COMPLETOS del alcance (`/export`, scoped).
  const onExport = async () => {
    if (exporting) return;
    if (!jefes.length) { showToast("No hay datos para descargar en este alcance.", "warning"); return; }
    setExporting(true);
    try {
      const q = effectiveRefugio ? `?refugio=${encodeURIComponent(effectiveRefugio)}` : "";
      const res = await apiFetch(`/api/vzlarenace/export${q}`);
      if (!res.ok) { showToast("No se pudo preparar la descarga.", "error"); return; }
      const data = await res.json().catch(() => ({}));
      const { exportRenaceExcel } = await import("@/lib/exportRenaceExcel");
      await exportRenaceExcel({
        jefes,
        miembros,
        planteamientos: data.planteamientos || [],
        refugio: effectiveRefugio || "Todos los campamentos",
        generadoEn: new Date().toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      });
      showToast("Directorio descargado.", "success");
    } catch (err: any) {
      console.error(err);
      showToast("Error al generar el Excel.", "error");
    } finally { setExporting(false); }
  };

  return (
    <div className="renace-tab">
      {/* Encabezado + importar */}
      <div className="renace-head">
        <div className="renace-head__title">
          <h2>VZLA Renace</h2>
          <p className="renace-sub">
            {esRenaceMaster
              ? "Panel de gráficas del programa Venezuela Renace — resumen global de todos los campamentos."
              : "Directorio del programa Venezuela Renace. Pulsa “Plantear” en un jefe para registrar la solución habitacional del núcleo."}
          </p>
        </div>
        {/* Master Renace solo ve Gráficas → sin botonera de Importar/Actualizar (son del Directorio). */}
        {!esRenaceMaster && (
          <div className="btn-seg-group renace-head__actions">
            {/* Importar = solo Master (op. masiva); Descargar = Master/Admin; Actualizar = todos. */}
            {puedeImportar && (
              <button type="button" className="toolbar-btn" onClick={() => fileRef.current?.click()} disabled={importing}>
                {importing ? "Importando…" : "Importar Excel"}
              </button>
            )}
            {puedeExportar && (
              <button type="button" className="toolbar-btn" onClick={onExport} disabled={exporting || loadingList}>
                {exporting ? "Descargando…" : "Descargar"}
              </button>
            )}
            <button type="button" className="toolbar-btn" onClick={() => reloadAll(true)} disabled={loadingList}>
              {loadingList ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={onFile} />
      </div>

      {/* Master (global) alterna entre Directorio y Gráficas. Master Renace NO ve el
          toggle: su vista es solo Gráficas. El resto de roles solo ve el Directorio. */}
      {esMaster && (
        <div className="btn-seg-group renace-viewtabs">
          <button type="button" className={`toolbar-btn${view === "directorio" ? " is-active" : ""}`} onClick={() => setView("directorio")}>Directorio</button>
          <button type="button" className={`toolbar-btn${view === "graficas" ? " is-active" : ""}`} onClick={() => setView("graficas")}>Gráficas</button>
        </div>
      )}

      {view === "graficas" && puedeVerGraficas ? (
        <RenaceGraficas />
      ) : (
      <>
      {/* KPIs (mismo lenguaje visual que Estadísticas: .bal-cards/.bal-card) */}
      {(() => {
        const totalFamilias = jefes.length;
        const conPlan = jefes.filter(tienePlan).length;
        const sinPlan = Math.max(0, totalFamilias - conPlan);
        const pct = (n: number) => (totalFamilias ? `${Math.round((n / totalFamilias) * 100)}%` : "0%");
        const fmt = (n: number) => n.toLocaleString("es-VE");
        const kpis = [
          { label: "Familias", value: totalFamilias, accent: "#1e3a8a", icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></svg>) },
          { label: "Con planteamiento", value: conPlan, sub: pct(conPlan), accent: "#059669", icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></svg>) },
          { label: "Sin planteamiento", value: sinPlan, sub: pct(sinPlan), accent: "#d97706", icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>) },
          { label: "Miembros", value: miembros.length, accent: "#0284c7", icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>) },
        ];
        return (
          <div className="bal-cards renace-kpis">
            {kpis.map((c) => (
              <div key={c.label} className="bal-card" style={{ ["--accent" as any]: c.accent } as React.CSSProperties}>
                <span className="bal-card__icon">{c.icon}</span>
                <span key={c.value} className="bal-card__value stat-card-value-animate">{fmt(c.value)}</span>
                <span className="bal-card__label">{c.label}{c.sub && <span className="bal-card__sub"> · {c.sub}</span>}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Sub-tablas */}
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
              <thead><tr><th className="col-num">N°</th><th className="col-sem">Plan</th><th>Nombre</th><th>Cédula</th><th>Miembros</th><th>Procedencia</th><th className="col-action"></th></tr></thead>
              <tbody>
                {loadingList && jefes.length === 0 ? (
                  <SkelRows widths={[24, 32, "60%", 90, 30, 130, 72]} />
                ) : jefesPage.length === 0 ? (
                  <tr><td colSpan={7} className="renace-td-empty">Sin resultados.</td></tr>
                ) : jefesPage.map((j) => (
                  <tr key={j.id}>
                    <td className="col-num">{j.nro}</td>
                    <td className="col-sem" data-label="Plan">
                      {tienePlan(j) ? (
                        <span className="renace-sem renace-sem--ok" data-tip="Con planteamiento" aria-label="Con planteamiento">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></svg>
                        </span>
                      ) : (
                        <span className="renace-sem renace-sem--no" data-tip="Sin planteamiento" aria-label="Sin planteamiento">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
                        </span>
                      )}
                    </td>
                    <td>{j.nombres}</td>
                    <td>{j.cedula || "—"}</td>
                    <td>{memberCount(j)}</td>
                    <td>{[j.estadoProcedencia, j.parroquiaProcedencia].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="col-action">
                      <div className="row-actions">
                        {puedeEditar && (
                          <button type="button" className="btn-ver btn-ver--edit" onClick={() => setEditando({ modo: "editar", tipo: "jefe", record: j })} data-tip="Editar datos del jefe" aria-label="Editar jefe">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                        )}
                        {puedeEditar && (
                          <button type="button" className="btn-ver btn-ver--room" onClick={() => setEditando({ modo: "crear", jefeFijo: j })} data-tip="Agregar miembro a este núcleo" aria-label="Agregar miembro">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
                          </button>
                        )}
                        <button type="button" className="btn-planear" onClick={() => setPlaneando(j)} data-tip="Plantear solución del núcleo">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                          <span className="btn-planear__txt">Plantear</span>
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
          {puedeEditar && (
            <div className="renace-miembros-tools">
              <button type="button" className="toolbar-btn" onClick={() => setEditando({ modo: "crear" })}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
                Agregar miembro
              </button>
            </div>
          )}
          <div className="pill-form renace-search">
            <input className="morb-control" placeholder="Buscar miembro por nombre, cédula, N° o parentesco…" value={mq} onChange={(e) => setMq(e.target.value)} />
          </div>
          <div className="registro-table-wrapper">
            <table className="registro-table">
              <thead><tr><th className="col-num">Núcleo</th><th>Nombre</th><th>Cédula</th><th>Parentesco</th><th>Sexo</th><th>Edad</th>{puedeEditar && <th className="col-action"></th>}</tr></thead>
              <tbody>
                {loadingList && miembros.length === 0 ? (
                  <SkelRows widths={puedeEditar ? [36, "55%", 90, 90, 60, 30, 40] : [36, "55%", 90, 90, 60, 30]} />
                ) : miembrosPage.length === 0 ? (
                  <tr><td colSpan={puedeEditar ? 7 : 6} className="renace-td-empty">Sin resultados.</td></tr>
                ) : miembrosPage.map((m) => (
                  <tr key={m.id}>
                    <td className="col-num"><button type="button" className="renace-link" onClick={() => openPlanPorNro(m.jefeNro)}>#{m.jefeNro}</button></td>
                    <td>{m.nombres}</td>
                    <td>{m.cedula || "—"}</td>
                    <td>{m.parentesco || "—"}</td>
                    <td>{m.sexo || "—"}</td>
                    <td>{m.edad ?? "—"}</td>
                    {puedeEditar && (
                      <td className="col-action">
                        <div className="row-actions">
                          <button type="button" className="btn-ver btn-ver--edit" onClick={() => setEditando({ modo: "editar", tipo: "miembro", record: m })} data-tip="Editar datos del miembro" aria-label="Editar miembro">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                          {esMaster && (
                            <button type="button" className="btn-ver btn-ver--danger" onClick={() => setConfirmMiembro(m)} data-tip="Eliminar miembro" aria-label="Eliminar miembro">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={miembrosF.length} page={mPage} pageSize={mSize} onPageChange={setMPage} onPageSizeChange={setMSize} itemLabel="miembros" />
        </div>
      )}
      </>
      )}

      {planeando && (
        <RenacePlanModal
          jefe={planeando}
          miembros={miembrosDelNucleo}
          onClose={() => setPlaneando(null)}
          onSaved={() => { refreshLocalPlanNros(); loadPlans(true); }}
          showToast={showToast}
        />
      )}

      {editando && (
        <RenaceEditModal
          modo={editando.modo}
          tipo={editando.modo === "editar" ? editando.tipo : "miembro"}
          record={editando.modo === "editar" ? editando.record : undefined}
          jefeFijo={editando.modo === "crear" ? editando.jefeFijo : undefined}
          jefes={jefes}
          puedeEliminar={esMaster}
          onClose={() => setEditando(null)}
          onSaved={() => reloadAll(true)}
          showToast={showToast}
        />
      )}

      {confirmMiembro && (
        <ConfirmModal
          message={<>¿Eliminar a este miembro del núcleo <strong>#{confirmMiembro.jefeNro}</strong>?</>}
          highlight={confirmMiembro.nombres}
          onConfirm={() => doDeleteMiembro(confirmMiembro)}
          onClose={() => setConfirmMiembro(null)}
        />
      )}
    </div>
  );
}
