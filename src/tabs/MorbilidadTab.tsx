"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAppContext } from "@/context/AppContext";
import { saveLocalConsulta, deleteLocalConsulta, buscarCedulaEnCliente, saveLocal } from "@/lib/db";
import { fetchCedulaExterna } from "@/lib/cedulaApi";
import { patologiaNombre, medLabel, medItemsText, tipoLesionNombre, normalizeText } from "@/lib/helpers";
import { exportMorbilidadExcel } from "@/lib/exportMorbilidadExcel";
import { exportRegistroMinSaludExcel } from "@/lib/exportRegistroMinSaludExcel";
import { logActivity } from "@/lib/activityLog";
import { apiFetch } from "@/lib/apiFetch";
import { canDeleteConsulta } from "@/lib/permissions";
import SearchableSelect from "@/components/SearchableSelect";
import StyledSelect from "@/components/StyledSelect";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import CatalogosMedicos from "@/components/CatalogosMedicos";
import { useBodyScrollLock } from "@/components/useBodyScrollLock";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import Pagination from "@/components/Pagination";
import { PERIODO_OPTIONS, TIPO_PACIENTE_OPTS, TIPO_PACIENTE_LABELS, ZONAS_CUERPO, ESTADO_LESION_OPTS, ESTADO_LESION_LABELS } from "@/lib/constants";
import type { Medicamento, Lesion, Patologia } from "@/types";

const GENERO_OPTS = [{ value: "MASCULINO", label: "Masculino" }, { value: "FEMENINO", label: "Femenino" }];
const PERIODO_OPTS = [{ value: "", label: "Período…" }, ...PERIODO_OPTIONS.map((op) => ({ value: op, label: op }))];
const ZONA_OPTS = ZONAS_CUERPO.map((z) => ({ value: z, label: z }));

// Fecha-hora de la consulta (elegida a mano, distinta del momento de carga).
const pad2 = (n: number) => String(n).padStart(2, "0");
const todayYmd = (): string => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const nowHm = (): string => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(Math.floor(d.getMinutes() / 5) * 5)}`; };
// Combina yyyy-mm-dd + HH:MM (hora local) → ISO para guardar; sin fecha → undefined.
const combineFechaHora = (ymd: string, hm: string): string | undefined => {
  if (!ymd) return undefined;
  const [h, m] = (hm || "00:00").split(":");
  const d = new Date(`${ymd}T${pad2(Number(h) || 0)}:${pad2(Number(m) || 0)}:00`);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};
// Divide un ISO en { ymd, hm } (hora local) para poblar los selects al editar.
const splitFechaHora = (iso?: string): { ymd: string; hm: string } => {
  if (!iso) return { ymd: "", hm: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { ymd: "", hm: "" };
  return { ymd: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, hm: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
};

// Palabras clave que identifican una LESIÓN/trauma en el NOMBRE de una patología.
// Sirven para marcar el estado físico del censo cuando la herida se registró como
// PATOLOGÍA (en diagnóstico o antecedentes) y no en la sección Lesiones. Ajustable:
// agrega/quita términos aquí (se comparan sin acentos/mayúsculas).
const INJURY_KEYWORDS = [
  "herida", "fractura", "quemadura", "traumatismo", "politraumatismo", "contusion",
  "laceracion", "escoriacion", "excoriacion", "abrasion", "esguince", "luxacion",
  "amputacion", "mordedura", "aplastamiento", "avulsion", "hematoma",
];
const isInjuryPatologiaId = (id: string, catalogo: Patologia[]): boolean => {
  const nombre = normalizeText(catalogo.find((p) => p.id === id)?.nombre ?? "");
  return !!nombre && INJURY_KEYWORDS.some((k) => nombre.includes(k));
};
// Una patología es de EMBARAZO si su nombre contiene "embarazo" (cualquier variante).
const isEmbarazoPatologiaId = (id: string, catalogo: Patologia[]): boolean =>
  normalizeText(catalogo.find((p) => p.id === id)?.nombre ?? "").includes("embarazo");
// ¿Hay señal de lesión? (lesión activa en la sección Lesiones o patología de trauma en
// antecedentes/diagnóstico). Alimenta la AUTO-SUGERENCIA del toggle de estado físico.
const hasInjurySignal = (lesiones: Lesion[], patologiaIds: string[], catalogo: Patologia[]): boolean =>
  (Array.isArray(lesiones) ? lesiones : []).some((l) => l?.tipoId && l.estado !== "CICATRIZADA") ||
  (Array.isArray(patologiaIds) ? patologiaIds : []).some((id) => isInjuryPatologiaId(id, catalogo));

// Edad (a hoy) a partir de una fecha yyyy-mm-dd. Siempre se recalcula desde la fecha.
const computeEdad = (ymd: string): string => {
  if (!ymd) return "";
  const d = new Date(ymd + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 ? String(age) : "";
};
const ymdFromISO = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const initialsOf = (name?: string): string =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0] || "")
    .join("")
    .toUpperCase() || "?";

/**
 * Formatea una cédula para mostrar al usuario.
 * Si ya trae prefijo (V-/E-) la devuelve tal cual.
 * Si no, busca el registro vinculado para obtener el prefijo real;
 * si no lo encuentra, usa "V-" por defecto.
 */
const formatCedulaDisplay = (rawCed: string, registros: any[]): string => {
  if (!rawCed) return "";
  const up = rawCed.trim().toUpperCase();
  // Ya tiene prefijo
  if (/^[VE]-/.test(up)) return up;
  // Buscar en los registros del censo
  const digits = up.replace(/\D/g, "");
  const reg = registros.find((r: any) => (r.cedula || "").replace(/\D/g, "") === digits);
  const prefix = reg ? (reg.cedula || "").replace(/^([VE])-.*/i, "$1") || "V" : "V";
  return `${prefix}-${digits}`;
};

export default function MorbilidadTab() {
  const {
    currentUser,
    registros,
    setRegistros,
    refreshLocalRecords,
    patologias,
    tiposLesion,
    consultas,
    localConsultas,
    refreshLocalConsultas,
    triggerSync,
    showToast,
    effectiveRefugio,
    predefinedMedicamentos,
    isOnline,
    fetchConsultas,
    setActiveTab,
    setPendingHistorialCedula,
  } = useAppContext();

  const canDelete = canDeleteConsulta(currentUser?.role || "");

  // Modal "Nueva consulta" (antes era el flujo inline buscar + formulario).
  const [showCreate, setShowCreate] = useState(false);
  useBodyScrollLock(showCreate);

  // Búsqueda y formulario
  const [searchCedula, setSearchCedula] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Historial (tabla): buscador + filtros avanzados propios.
  const [histSearch, setHistSearch] = useState("");
  const [histFiltersOpen, setHistFiltersOpen] = useState(false);
  const [fTipo, setFTipo] = useState("");
  const [fDiag, setFDiag] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fDesde, setFDesde] = useState(""); // yyyy-mm-dd (fecha de la consulta)
  const [fHasta, setFHasta] = useState("");

  // Datos Básicos del Paciente
  const [cedula, setCedula] = useState("");
  const [registroId, setRegistroId] = useState<string | undefined>(undefined);  // UID del registro del censo
  const [matchedRegistro, setMatchedRegistro] = useState<any | null>(null);     // registro completo (para actualizar el censo)
  const [nombreApellido, setNombreApellido] = useState("");
  const [genero, setGenero] = useState("MASCULINO");
  const [fechaNacimiento, setFechaNacimiento] = useState(""); // yyyy-mm-dd (editable)
  const [edad, setEdad] = useState("");                       // calculada desde la fecha
  const [refugio, setRefugio] = useState(effectiveRefugio || "");

  // Tipo de atención: refugiado (censo) o apoyo externo (con nota opcional).
  const [tipoPaciente, setTipoPaciente] = useState("REFUGIADO");
  const [tipoNota, setTipoNota] = useState("");

  const onFechaChange = (ymd: string) => { setFechaNacimiento(ymd); setEdad(computeEdad(ymd)); };

  // Antecedentes del censo — EDITABLES (guardar actualiza el registro del censo). Por-ID.
  const [antecedentesPatologiaIds, setAntecedentesPatologiaIds] = useState<string[]>([]);
  const [antecedentesMedicamentoIds, setAntecedentesMedicamentoIds] = useState<Medicamento[]>([]);

  // Diagnóstico de esta consulta (modificable) — por-ID.
  const [diagnosticoPatologiaIds, setDiagnosticoPatologiaIds] = useState<string[]>([]);
  const [diagnosticoMedicamentoIds, setDiagnosticoMedicamentoIds] = useState<Medicamento[]>([]);
  const [notasDoctor, setNotasDoctor] = useState("");

  // Fecha-hora de la consulta: se ELIGE a mano (no es el momento de carga). Se
  // inicializa a hoy/ahora como punto de partida editable.
  const [fechaConsulta, setFechaConsulta] = useState<string>(() => todayYmd());
  const [horaConsulta, setHoraConsulta] = useState<string>(() => nowHm());

  // Lesiones, heridas y curas de esta consulta: [{ tipoId, zona, estado, cura }].
  const [lesiones, setLesiones] = useState<Lesion[]>([]);

  // ── Estados EXPLÍCITOS del paciente (toggles): auto-sugeridos por lesiones/patologías
  //    pero el médico decide (una vez que toca el toggle, `touched` congela su elección).
  //    La "base" = valor del censo al cargar (para no revertir un lesionado/embarazo del
  //    triaje solo porque esta consulta no traiga señal).
  const [estadoFisico, setEstadoFisico] = useState<"ILESO" | "LESIONADO">("ILESO");
  const [estadoTouched, setEstadoTouched] = useState(false);
  const estadoBaseRef = useRef<"ILESO" | "LESIONADO">("ILESO");
  const [embarazo, setEmbarazo] = useState<"SI" | "NO">("NO");
  const [embarazoTouched, setEmbarazoTouched] = useState(false);
  const embarazoBaseRef = useRef<"SI" | "NO">("NO");

  // Señales clínicas para auto-sugerir (lesión activa / patología de trauma o embarazo).
  const injuryPresent = useMemo(
    () => hasInjurySignal(lesiones, [...antecedentesPatologiaIds, ...diagnosticoPatologiaIds], patologias),
    [lesiones, antecedentesPatologiaIds, diagnosticoPatologiaIds, patologias]
  );
  const embarazoPresent = useMemo(
    () => [...antecedentesPatologiaIds, ...diagnosticoPatologiaIds].some((id) => isEmbarazoPatologiaId(id, patologias)),
    [antecedentesPatologiaIds, diagnosticoPatologiaIds, patologias]
  );
  // Auto-sugerencia (mientras el médico no haya tocado el toggle).
  useEffect(() => { if (!estadoTouched) setEstadoFisico(injuryPresent ? "LESIONADO" : estadoBaseRef.current); }, [injuryPresent, estadoTouched]);
  useEffect(() => { if (!embarazoTouched) setEmbarazo(embarazoPresent ? "SI" : embarazoBaseRef.current); }, [embarazoPresent, embarazoTouched]);
  const toggleEstado = (v: "ILESO" | "LESIONADO") => { setEstadoTouched(true); setEstadoFisico(v); };
  const toggleEmbarazo = (v: "SI" | "NO") => { setEmbarazoTouched(true); setEmbarazo(v); };
  // Fija la "base" (valor del censo) y reinicia la auto-sugerencia (sin tocar).
  const seedEstados = (estado: "ILESO" | "LESIONADO", emb: "SI" | "NO") => {
    estadoBaseRef.current = estado; embarazoBaseRef.current = emb;
    setEstadoTouched(false); setEmbarazoTouched(false);
    setEstadoFisico(estado); setEmbarazo(emb);
  };

  const [saving, setSaving] = useState(false);

  // Animación de salida: marca una clave (namespaced) como "saliendo" y la remueve al terminar.
  const [exiting, setExiting] = useState<Record<string, boolean>>({});
  const animateOut = (key: string, remove: () => void) => {
    setExiting((e) => ({ ...e, [key]: true }));
    window.setTimeout(() => {
      remove();
      setExiting((e) => { const n = { ...e }; delete n[key]; return n; });
    }, 200);
  };

  // Agregar un medicamento (nombre y dosis salen del catálogo por ID; dosis = concentración).
  const buildMedItem = (medId: string): Medicamento | null => {
    const match = predefinedMedicamentos.find((m) => m.id === medId);
    if (!match) return null;
    return { id: match.id, dosis: match.concentracion || "", periodo: "" };
  };

  // --- BÚSQUEDA ---
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCedula = searchCedula.replace(/\D/g, "");
    if (!cleanCedula) {
      showToast("Ingrese una cédula para buscar.", "warning");
      return;
    }

    setSearching(true);
    setSearched(true);
    setCedula(cleanCedula);

    // 1. Buscar en registros censados (estado registros)
    const localMatch = registros.find(
      (r) => r.cedula.replace(/\D/g, "") === cleanCedula && r.retirado !== "SI"
    );

    if (localMatch) {
      setRegistroId(localMatch.id);   // vinculación por UID
      setMatchedRegistro(localMatch);
      setNombreApellido(localMatch.nombreApellido);
      setGenero(localMatch.genero);
      const fnCenso = ymdFromISO(localMatch.fechaNacimiento);
      setFechaNacimiento(fnCenso);
      setEdad(fnCenso ? computeEdad(fnCenso) : String(localMatch.edad ?? "")); // recalcula a hoy
      setRefugio(localMatch.refugio);
      setAntecedentesPatologiaIds(Array.isArray(localMatch.patologiaIds) ? localMatch.patologiaIds : []);
      setAntecedentesMedicamentoIds(Array.isArray(localMatch.medicamentoIds) ? localMatch.medicamentoIds : []);
      setTipoPaciente("REFUGIADO"); setTipoNota("");   // está en el censo → refugiado
      // Estados explícitos: base = valor actual del censo; sin tocar aún.
      seedEstados(localMatch.estadoFisico === "LESIONADO" ? "LESIONADO" : "ILESO", localMatch.embarazo === "SI" ? "SI" : "NO");
      showToast("Paciente encontrado en el Censo.", "success");
    } else {
      // 2. Buscar en Padrón Electoral local en IndexedDB
      try {
        const padronMatch = await buscarCedulaEnCliente(cleanCedula);
        setRegistroId(undefined);
        setMatchedRegistro(null);
        setAntecedentesPatologiaIds([]);
        setAntecedentesMedicamentoIds([]);
        setTipoPaciente("APOYO_COMUNITARIO");   // no está en el censo → apoyo externo (editable)
        seedEstados("ILESO", "NO"); // no está en el censo → base neutra
        if (padronMatch) {
          setNombreApellido(padronMatch.nombreCompleto);
          setGenero(padronMatch.sexo === "M" ? "MASCULINO" : "FEMENINO");
          const fnPad = ymdFromISO(padronMatch.fechaNacimiento);
          setFechaNacimiento(fnPad);
          setEdad(computeEdad(fnPad));
          setRefugio(effectiveRefugio || currentUser?.campamentoTransitorio || "");
          showToast("Paciente encontrado en el Padrón.", "info");
        } else {
          // 3. API externa en línea (api.cedula.com.ve), como tercera fuente.
          const ext = await fetchCedulaExterna("V", cleanCedula);
          setRefugio(effectiveRefugio || currentUser?.campamentoTransitorio || "");
          if (ext) {
            setNombreApellido(ext.nombreApellido || "");
            setGenero(ext.genero || "MASCULINO");
            const fnExt = ext.fechaNacimiento || "";  // yyyy-mm-dd
            setFechaNacimiento(fnExt);
            setEdad(fnExt ? computeEdad(fnExt) : "");
            showToast("Paciente verificado en línea (api.cedula.com.ve).", "info");
          } else {
            setNombreApellido("");
            setGenero("MASCULINO");
            setFechaNacimiento("");
            setEdad("");
            showToast("No encontrado. Rellene los datos manualmente.", "warning");
          }
        }
      } catch (err) {
        console.error(err);
        showToast("Error al buscar en el padrón.", "error");
      }
    }
    setSearching(false);
  };

  // --- ANTECEDENTES (editables) ---
  const addAntPatologia = (id: string) => { if (id) setAntecedentesPatologiaIds((p) => (p.includes(id) ? p : [...p, id])); };
  const removeAntPatologia = (id: string) => setAntecedentesPatologiaIds((p) => p.filter((x) => x !== id));
  const addAntMed = (medId: string) => {
    const item = buildMedItem(medId);
    if (item && !antecedentesMedicamentoIds.some((x) => x.id === medId)) setAntecedentesMedicamentoIds((p) => [...p, item]);
  };
  const removeAntMed = (id: string) => setAntecedentesMedicamentoIds((p) => p.filter((m) => m.id !== id));
  const updateAntMed = (i: number, field: "dosis" | "periodo", value: string) =>
    setAntecedentesMedicamentoIds((p) => p.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));

  // --- DIAGNÓSTICO ---
  const addDiagPatologia = (id: string) => { if (id) setDiagnosticoPatologiaIds((p) => (p.includes(id) ? p : [...p, id])); };
  const removeDiagPatologia = (id: string) => setDiagnosticoPatologiaIds((p) => p.filter((x) => x !== id));
  const addDiagMed = (medId: string) => {
    const item = buildMedItem(medId);
    if (item && !diagnosticoMedicamentoIds.some((x) => x.id === medId)) setDiagnosticoMedicamentoIds((p) => [...p, item]);
  };
  const removeDiagMed = (id: string) => setDiagnosticoMedicamentoIds((p) => p.filter((m) => m.id !== id));
  const updateDiagMed = (i: number, field: "dosis" | "periodo", value: string) =>
    setDiagnosticoMedicamentoIds((p) => p.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));

  // --- LESIONES / HERIDAS / CURAS ---
  // Se permite el MISMO tipo varias veces (p. ej. dos heridas iguales en zonas
  // distintas), por eso no se deduplica por tipoId.
  const addLesion = (tipoId: string) => { if (tipoId) setLesiones((p) => [...p, { tipoId, zona: "", estado: "NUEVA", cura: "" }]); };
  const removeLesion = (i: number) => setLesiones((p) => p.filter((_, idx) => idx !== i));
  const updateLesion = (i: number, field: keyof Lesion, value: string) => setLesiones((p) => p.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));

  // --- RESET STATE ---
  const handleReset = () => {
    setSearchCedula("");
    setSearched(false);
    setCedula("");
    setRegistroId(undefined);
    setMatchedRegistro(null);
    setNombreApellido("");
    setGenero("MASCULINO");
    setFechaNacimiento("");
    setEdad("");
    setRefugio(effectiveRefugio || "");
    setTipoPaciente("REFUGIADO");
    setTipoNota("");
    setAntecedentesPatologiaIds([]);
    setAntecedentesMedicamentoIds([]);
    setDiagnosticoPatologiaIds([]);
    setDiagnosticoMedicamentoIds([]);
    setNotasDoctor("");
    setFechaConsulta(todayYmd());
    setHoraConsulta(nowHm());
    setLesiones([]);
    seedEstados("ILESO", "NO");
  };

  // Descargar Excel: modal con 2 formatos (General con membrete / Registro Min Salud SIS-02).
  const [exporting, setExporting] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [exportingMinSalud, setExportingMinSalud] = useState(false);
  const [minSaludDia, setMinSaludDia] = useState(""); // yyyy-mm-dd del reporte diario oficial
  const handleExportExcel = async () => {
    if (filteredConsultas.length === 0) { showToast("No hay consultas para exportar.", "warning"); return; }
    setExporting(true);
    try {
      // Resumen legible de los filtros activos (para el membrete del Excel).
      const dmy = (s: string) => s.split("-").reverse().join("/");
      const filtrosParts: string[] = [];
      if (histSearch.trim()) filtrosParts.push(`Búsqueda "${histSearch.trim()}"`);
      if (fTipo) filtrosParts.push(`Atención: ${TIPO_PACIENTE_LABELS[fTipo] || fTipo}`);
      if (fDiag) filtrosParts.push(fDiag === "con" ? "Con diagnóstico" : "Sin diagnóstico");
      if (fEstado) filtrosParts.push(`Estado: ${fEstado === "LESIONADO" ? "Lesionado" : "Ileso"}`);
      if (fDesde) filtrosParts.push(`Desde ${dmy(fDesde)}`);
      if (fHasta) filtrosParts.push(`Hasta ${dmy(fHasta)}`);
      await exportMorbilidadExcel({
        consultas: filteredConsultas,
        patologias, predefinedMedicamentos, tiposLesion,
        refugio: effectiveRefugio || currentUser?.campamentoTransitorio || "",
        generadoEn: new Date().toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        filtros: filtrosParts.join("   ·   "),
      });
      showToast("Excel descargado.", "success");
      logActivity({ accion: "EXPORT", recurso: "Morbilidad", formato: "Excel", refugio: effectiveRefugio || currentUser?.campamentoTransitorio || undefined, filtros: filtrosParts.join("   ·   ") || undefined, total: filteredConsultas.length });
      setShowExcelModal(false);
    } catch (e) {
      console.error(e);
      showToast("No se pudo generar el Excel.", "error");
    } finally {
      setExporting(false);
    }
  };

  // Descargar el formulario oficial del MPPS (SIS-02 EPI-10/13), POR DÍA elegido.
  // Toma las consultas del campamento en vista de ese día; deriva P/S (primera/sucesiva
  // consulta de cada cédula) y rellena la plantilla oficial. Si el día supera 25
  // consultas, el generador descarga varias partes.
  const handleExportMinSalud = async () => {
    const dia = minSaludDia;
    if (!dia) { showToast("Elige el día del reporte.", "warning"); return; }
    // yyyy-mm-dd LOCAL de una fecha (para casar el día elegido con la fecha-hora clínica).
    const ymdOf = (iso: any) => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const when = (c: any) => new Date(c.data?.fechaConsulta || c.createdAt).getTime();
    const dayConsultas = allConsultas
      .filter((c) => ymdOf(c.data?.fechaConsulta || c.createdAt) === dia)
      .slice()
      .sort((a, b) => when(a) - when(b)); // cronológico ascendente (fila 1 = primera del día)
    if (dayConsultas.length === 0) { showToast("No hay consultas ese día en este campamento.", "info"); return; }
    // Primera consulta (cronológica) de cada cédula entre TODAS las del campamento → P; resto → S.
    const primeraIdPorCedula = new Map<string, string>();
    [...allConsultas].sort((a, b) => when(a) - when(b)).forEach((c) => {
      const ced = String(c.data?.cedula || "").trim().toUpperCase();
      if (ced && !primeraIdPorCedula.has(ced)) primeraIdPorCedula.set(ced, c.id);
    });
    const refugioActual = effectiveRefugio || currentUser?.campamentoTransitorio || "";
    const items = dayConsultas.map((c) => ({
      data: c.data,
      createdAt: c.createdAt,
      esPrimera: primeraIdPorCedula.get(String(c.data?.cedula || "").trim().toUpperCase()) === c.id,
    }));
    setExportingMinSalud(true);
    try {
      await exportRegistroMinSaludExcel({
        consultas: items,
        registros,
        patologias,
        predefinedMedicamentos,
        dia,
        refugio: refugioActual,
        medico: "",                               // VACÍO (se llena a mano)
        establecimiento: refugioActual ? `Campamento Transitorio ${refugioActual}` : "",
        asic: "",                                 // VACÍO (se llena a mano)
        parroquia: "",                            // VACÍO (se llena a mano)
        tipoConsulta: "",                         // VACÍO (se llena a mano)
      });
      showToast(`Formulario SIS-02 del ${dia.split("-").reverse().join("/")} descargado.`, "success");
      logActivity({ accion: "EXPORT", recurso: "Morbilidad (SIS-02 EPI-10/13)", formato: "Excel", refugio: refugioActual || undefined, filtros: `Día ${dia.split("-").reverse().join("/")}`, total: dayConsultas.length });
      setShowExcelModal(false);
    } catch (e) {
      console.error(e);
      showToast("No se pudo generar el formulario oficial.", "error");
    } finally {
      setExportingMinSalud(false);
    }
  };

  // Modal "Nueva consulta": abrir (arranca en el buscador de cédula) / cerrar.
  const openCreate = () => { handleReset(); setShowCreate(true); };
  // No reseteamos aquí para que el formulario NO "salte" (se vacíe) durante la animación
  // de cierre; el reset ya ocurre al ABRIR (openCreate → handleReset).
  const closeCreate = () => { setShowCreate(false); };
  // "Ver historial": salta a la pestaña Historial Clínico y abre a ese paciente.
  const verHistorial = (cedula: string) => { setPendingHistorialCedula(String(cedula || "")); setActiveTab("historial"); };

  // Al guardar, si el paciente está en el censo, propaga los cambios de Datos Básicos
  // (nombre, género, fecha de nacimiento, edad) y de Antecedentes al Registro del censo.
  const syncPatientToRegistro = async () => {
    if (!matchedRegistro) return;
    const prevPat = Array.isArray(matchedRegistro.patologiaIds) ? matchedRegistro.patologiaIds : [];
    const prevMed = Array.isArray(matchedRegistro.medicamentoIds) ? matchedRegistro.medicamentoIds : [];
    const prevFechaYmd = ymdFromISO(matchedRegistro.fechaNacimiento);
    const nuevaEdad = edad ? parseInt(edad) : null;
    // Estados EXPLÍCITOS elegidos en los toggles (auto-sugeridos pero decididos por el médico).
    const nuevoEstadoFisico = estadoFisico;
    const nuevoEmbarazo = genero === "FEMENINO" ? embarazo : "NO"; // embarazo solo aplica a mujeres
    const changed =
      JSON.stringify(antecedentesPatologiaIds) !== JSON.stringify(prevPat) ||
      JSON.stringify(antecedentesMedicamentoIds) !== JSON.stringify(prevMed) ||
      nombreApellido.trim() !== (matchedRegistro.nombreApellido || "") ||
      genero !== matchedRegistro.genero ||
      (fechaNacimiento || "") !== (prevFechaYmd || "") ||
      nuevaEdad !== (matchedRegistro.edad ?? null) ||
      nuevoEstadoFisico !== (matchedRegistro.estadoFisico || "") ||
      nuevoEmbarazo !== (matchedRegistro.embarazo || "NO");
    if (!changed) return;

    const patologia = antecedentesPatologiaIds.length > 0 ? "SI" : "NO";
    const updatedReg = {
      ...matchedRegistro,
      nombreApellido: nombreApellido.trim() || matchedRegistro.nombreApellido,
      genero,
      fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento + "T00:00:00").toISOString() : matchedRegistro.fechaNacimiento,
      edad: nuevaEdad ?? matchedRegistro.edad,
      estadoFisico: nuevoEstadoFisico,
      embarazo: nuevoEmbarazo,
      patologia,
      patologiaIds: antecedentesPatologiaIds,
      medicamentoIds: antecedentesMedicamentoIds,
    };
    setRegistros((prev) => {
      const next = prev.map((r) => (r.id === updatedReg.id ? updatedReg : r));
      if (typeof window !== "undefined") localStorage.setItem("cached_registros", JSON.stringify(next));
      return next;
    });
    setMatchedRegistro(updatedReg);
    const regUpdate = {
      id: updatedReg.id,
      type: "update" as const,
      refugio: matchedRegistro.refugio || currentUser?.campamentoTransitorio,
      userId: currentUser?.id,
      data: updatedReg,
    };
    await saveLocal(regUpdate);
    await refreshLocalRecords();
    // Confirmación explícita: si cambió el estado físico por las lesiones, se dice
    // (el médico no ve el censo, así sabe que la sincronía ocurrió).
    const estadoMsg = nuevoEstadoFisico !== (matchedRegistro.estadoFisico || "")
      ? ` Estado físico → ${nuevoEstadoFisico === "LESIONADO" ? "Lesionado" : "Ileso"}.`
      : "";
    const embMsg = nuevoEmbarazo !== (matchedRegistro.embarazo || "NO")
      ? ` Embarazo → ${nuevoEmbarazo === "SI" ? "Sí" : "No"}.`
      : "";
    showToast("Datos del paciente actualizados en el censo." + estadoMsg + embMsg, "info");
  };

  // --- GUARDAR CONSULTA (OFFLINE-FIRST) ---
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cedula || !nombreApellido.trim() || !refugio) {
      showToast("Por favor complete los datos del paciente.", "error");
      return;
    }
    setSaving(true);
    const docId = crypto.randomUUID();
    const localConsultaData = {
      id: docId,
      data: {
        cedula,
        nombreApellido: nombreApellido.trim(),
        registroId,
        genero,
        edad: edad ? parseInt(edad) : undefined,
        fechaNacimiento: fechaNacimiento || undefined,
        tipoPaciente,
        tipoNota: tipoPaciente !== "REFUGIADO" && tipoNota.trim() ? tipoNota.trim() : undefined,
        fechaConsulta: combineFechaHora(fechaConsulta, horaConsulta),
        lesiones: lesiones.filter((l) => l.tipoId),
        estadoFisico,
        embarazo: genero === "FEMENINO" ? embarazo : "NO",
        refugio,
        antecedentesPatologiaIds,
        antecedentesMedicamentoIds,
        diagnosticoPatologiaIds,
        diagnosticoMedicamentoIds: diagnosticoMedicamentoIds.filter((m) => m.id),
        notasDoctor: notasDoctor.trim() || undefined,
      },
      userId: currentUser?.email,
    };
    try {
      await saveLocalConsulta(localConsultaData);
      await syncPatientToRegistro();
      showToast("Consulta médica registrada localmente.", "success");
      handleReset();
      setShowCreate(false);
      await refreshLocalConsultas();
      triggerSync();
    } catch (err) {
      console.error(err);
      showToast("Error al guardar la consulta.", "error");
    } finally {
      setSaving(false);
    }
  };

  // ── EDICIÓN de una consulta existente (offline-first) ──────────────────────
  // Guardar re-encola la consulta con su MISMO id (pending) y sincroniza; el backend
  // hace upsert-update. Permiso: quien ve Morbilidad puede editar (Operador/Asistente/
  // AdminMedico/Master); nadie elimina.
  const [editForm, setEditForm] = useState<any | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  useBodyScrollLock(!!editForm);

  // Ver detalle de una consulta en modal de solo lectura
  const [viewConsulta, setViewConsulta] = useState<any | null>(null);
  const [viewClosing, setViewClosing] = useState(false);
  useBodyScrollLock(!!viewConsulta);

  const openView = (c: any) => setViewConsulta(c);
  const closeView = () => {
    if (viewClosing || !viewConsulta) return;
    setViewClosing(true);
    setTimeout(() => { setViewConsulta(null); setViewClosing(false); }, 220);
  };

  // Eliminar consulta (solo AdminMedico + Master) — con modal de confirmación.
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  useBodyScrollLock(!!deleteTarget);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const c = deleteTarget;
    setDeleting(true);
    try {
      const isLocal = localConsultas.some((lc) => lc.id === c.id);
      const enServidor = c.status === "synced"; // sincronizada (local ya confirmada) o remota
      if (enServidor) {
        if (!isOnline) {
          showToast("Necesitas conexión para eliminar esta consulta.", "error");
          setDeleting(false);
          return;
        }
        const r = await apiFetch(`/api/consultas?id=${encodeURIComponent(c.id)}`, { method: "DELETE" });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          showToast(d.error || "No se pudo eliminar la consulta.", "error");
          setDeleting(false);
          return;
        }
      }
      if (isLocal) await deleteLocalConsulta(c.id);
      await refreshLocalConsultas();
      if (enServidor) fetchConsultas();
      showToast("Consulta eliminada.", "success");
      setDeleteTarget(null);
    } catch {
      showToast("No se pudo eliminar la consulta.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (c: any) => {
    // Fecha de nacimiento: la almacenada; si es una consulta vieja sin ella, se
    // intenta recuperar del censo (por UID o cédula). La edad se DERIVA de aquí.
    let fecha: string = c.data.fechaNacimiento || "";
    if (!fecha) {
      const ced = String(c.data.cedula || "").replace(/\D/g, "");
      const reg = registros.find((r: any) => (c.data.registroId && r.id === c.data.registroId) || (r.cedula || "").replace(/\D/g, "") === ced);
      if (reg) fecha = ymdFromISO(reg.fechaNacimiento);
    }
    // Fecha-hora de la consulta: la guardada; si la consulta es vieja y no la tiene,
    // se parte de su createdAt como valor editable.
    const fh = splitFechaHora(c.data.fechaConsulta || c.createdAt);
    const antPat: string[] = Array.isArray(c.data.antecedentesPatologiaIds) ? [...c.data.antecedentesPatologiaIds] : [];
    const diagPat: string[] = Array.isArray(c.data.diagnosticoPatologiaIds) ? [...c.data.diagnosticoPatologiaIds] : [];
    const lesionesE: Lesion[] = Array.isArray(c.data.lesiones) ? c.data.lesiones.map((l: Lesion) => ({ ...l })) : [];
    // Estados explícitos: base = valor del censo (para no revertir); valor guardado en la
    // consulta si existe. `touched` = el valor guardado difiere de la auto-sugerencia (fue un
    // override manual → se respeta y no se auto-recalcula).
    const regE = registros.find((r: any) => (c.data.registroId && r.id === c.data.registroId) || (r.cedula || "").replace(/\D/g, "") === String(c.data.cedula || "").replace(/\D/g, ""));
    const baseEstado: "ILESO" | "LESIONADO" = regE?.estadoFisico === "LESIONADO" ? "LESIONADO" : "ILESO";
    const baseEmb: "SI" | "NO" = regE?.embarazo === "SI" ? "SI" : "NO";
    const autoEstado = hasInjurySignal(lesionesE, [...antPat, ...diagPat], patologias) ? "LESIONADO" : baseEstado;
    const autoEmb = [...antPat, ...diagPat].some((id) => isEmbarazoPatologiaId(id, patologias)) ? "SI" : baseEmb;
    const savedEstado: "ILESO" | "LESIONADO" = c.data.estadoFisico === "LESIONADO" ? "LESIONADO" : c.data.estadoFisico === "ILESO" ? "ILESO" : baseEstado;
    const savedEmb: "SI" | "NO" = c.data.embarazo === "SI" ? "SI" : c.data.embarazo === "NO" ? "NO" : baseEmb;
    setEditForm({
      id: c.id, createdAt: c.createdAt, registroId: c.data.registroId, refugio: c.data.refugio,
      cedula: c.data.cedula, nombreApellido: c.data.nombreApellido || "",
      genero: c.data.genero || "MASCULINO",
      tipoPaciente: c.data.tipoPaciente || "REFUGIADO",
      tipoNota: c.data.tipoNota || "",
      fechaNacimiento: fecha,
      edadFallback: c.data.edad != null ? c.data.edad : null, // solo si no hay fecha
      fechaConsulta: fh.ymd,
      horaConsulta: fh.hm,
      antPat, antMed: Array.isArray(c.data.antecedentesMedicamentoIds) ? [...c.data.antecedentesMedicamentoIds] : [],
      diagPat, diagMed: Array.isArray(c.data.diagnosticoMedicamentoIds) ? [...c.data.diagnosticoMedicamentoIds] : [],
      lesiones: lesionesE,
      estadoFisico: savedEstado, estadoTouched: savedEstado !== autoEstado, estadoBase: baseEstado,
      embarazo: savedEmb, embarazoTouched: savedEmb !== autoEmb, embarazoBase: baseEmb,
      notas: c.data.notasDoctor || "",
    });
  };
  // Cierre del modal de EDICIÓN con animación de salida: mantenemos `editForm` (el
  // contenido) durante la animación y lo limpiamos al terminar, para que no salte.
  const [editClosing, setEditClosing] = useState(false);
  const closeEdit = () => {
    if (editClosing) return;
    setEditClosing(true);
    setTimeout(() => { setEditForm(null); setEditClosing(false); }, 220);
  };

  const efPatAdd = (key: "antPat" | "diagPat", id: string) => { if (id) setEditForm((f: any) => f && !f[key].includes(id) ? { ...f, [key]: [...f[key], id] } : f); };
  const efPatRemove = (key: "antPat" | "diagPat", id: string) => setEditForm((f: any) => f ? { ...f, [key]: f[key].filter((x: string) => x !== id) } : f);
  const efMedAdd = (key: "antMed" | "diagMed", medId: string) => { const it = buildMedItem(medId); if (it) setEditForm((f: any) => f && !f[key].some((m: Medicamento) => m.id === medId) ? { ...f, [key]: [...f[key], it] } : f); };
  const efMedRemove = (key: "antMed" | "diagMed", id: string) => setEditForm((f: any) => f ? { ...f, [key]: f[key].filter((m: Medicamento) => m.id !== id) } : f);
  const efMedUpdate = (key: "antMed" | "diagMed", i: number, field: "dosis" | "periodo", value: string) => setEditForm((f: any) => f ? { ...f, [key]: f[key].map((m: Medicamento, idx: number) => idx === i ? { ...m, [field]: value } : m) } : f);

  // Lesiones dentro del formulario de edición.
  const efLesAdd = (tipoId: string) => { if (tipoId) setEditForm((f: any) => f ? { ...f, lesiones: [...(f.lesiones || []), { tipoId, zona: "", estado: "NUEVA", cura: "" }] } : f); };
  const efLesRemove = (i: number) => setEditForm((f: any) => f ? { ...f, lesiones: f.lesiones.filter((_: Lesion, idx: number) => idx !== i) } : f);
  const efLesUpdate = (i: number, field: keyof Lesion, value: string) => setEditForm((f: any) => f ? { ...f, lesiones: f.lesiones.map((l: Lesion, idx: number) => idx === i ? { ...l, [field]: value } : l) } : f);

  // Toggles de estado en el modal de edición (mismo comportamiento: auto-sugerido + override).
  const efToggleEstado = (v: "ILESO" | "LESIONADO") => setEditForm((f: any) => f ? { ...f, estadoTouched: true, estadoFisico: v } : f);
  const efToggleEmbarazo = (v: "SI" | "NO") => setEditForm((f: any) => f ? { ...f, embarazoTouched: true, embarazo: v } : f);
  // Auto-sugerencia dentro del modal (solo mientras no se haya tocado el toggle).
  useEffect(() => {
    if (!editForm || editForm.estadoTouched) return;
    const v = hasInjurySignal(editForm.lesiones || [], [...(editForm.antPat || []), ...(editForm.diagPat || [])], patologias) ? "LESIONADO" : editForm.estadoBase;
    if (v !== editForm.estadoFisico) setEditForm((f: any) => f ? { ...f, estadoFisico: v } : f);
  }, [editForm?.lesiones, editForm?.antPat, editForm?.diagPat, editForm?.estadoTouched, editForm?.estadoBase, patologias]);
  useEffect(() => {
    if (!editForm || editForm.embarazoTouched) return;
    const v = [...(editForm.antPat || []), ...(editForm.diagPat || [])].some((id: string) => isEmbarazoPatologiaId(id, patologias)) ? "SI" : editForm.embarazoBase;
    if (v !== editForm.embarazo) setEditForm((f: any) => f ? { ...f, embarazo: v } : f);
  }, [editForm?.antPat, editForm?.diagPat, editForm?.embarazoTouched, editForm?.embarazoBase, patologias]);

  // Al editar, si la consulta está vinculada al censo, propaga los Datos Básicos
  // (nombre, género, fecha de nacimiento, edad) y los Antecedentes al Registro —
  // igual que hace el formulario de crear (syncPatientToRegistro).
  const syncEditToRegistro = async (ef: any, edad: number | null) => {
    const reg = ef.registroId ? registros.find((r) => r.id === ef.registroId) : null;
    if (!reg) return;
    const prevPat = Array.isArray(reg.patologiaIds) ? reg.patologiaIds : [];
    const prevMed = Array.isArray(reg.medicamentoIds) ? reg.medicamentoIds : [];
    const prevFechaYmd = ymdFromISO(reg.fechaNacimiento);
    // Estados EXPLÍCITOS elegidos en el modal (toggles).
    const nuevoEstadoFisico = ef.estadoFisico === "LESIONADO" ? "LESIONADO" : "ILESO";
    const nuevoEmbarazo = ef.genero === "FEMENINO" ? (ef.embarazo === "SI" ? "SI" : "NO") : "NO";
    const changed =
      JSON.stringify(ef.antPat) !== JSON.stringify(prevPat) ||
      JSON.stringify(ef.antMed) !== JSON.stringify(prevMed) ||
      ef.nombreApellido.trim() !== (reg.nombreApellido || "") ||
      ef.genero !== reg.genero ||
      (ef.fechaNacimiento || "") !== (prevFechaYmd || "") ||
      (edad ?? null) !== (reg.edad ?? null) ||
      nuevoEstadoFisico !== (reg.estadoFisico || "") ||
      nuevoEmbarazo !== (reg.embarazo || "NO");
    if (!changed) return;
    const updatedReg = {
      ...reg,
      nombreApellido: ef.nombreApellido.trim() || reg.nombreApellido,
      genero: ef.genero,
      fechaNacimiento: ef.fechaNacimiento ? new Date(ef.fechaNacimiento + "T00:00:00").toISOString() : reg.fechaNacimiento,
      edad: edad ?? reg.edad,
      estadoFisico: nuevoEstadoFisico,
      embarazo: nuevoEmbarazo,
      patologia: ef.antPat.length > 0 ? "SI" : "NO",
      patologiaIds: ef.antPat,
      medicamentoIds: ef.antMed,
    };
    setRegistros((prev) => {
      const next = prev.map((r) => (r.id === updatedReg.id ? updatedReg : r));
      if (typeof window !== "undefined") localStorage.setItem("cached_registros", JSON.stringify(next));
      return next;
    });
    await saveLocal({
      id: updatedReg.id, type: "update" as const,
      refugio: reg.refugio || currentUser?.campamentoTransitorio, userId: currentUser?.id, data: updatedReg,
    });
    await refreshLocalRecords();
  };

  const saveEdit = async () => {
    if (!editForm) return;
    setEditSaving(true);
    try {
      const eStr = editForm.fechaNacimiento ? computeEdad(editForm.fechaNacimiento) : "";
      const data = {
        cedula: editForm.cedula,
        nombreApellido: editForm.nombreApellido.trim() || editForm.cedula,
        registroId: editForm.registroId,
        genero: editForm.genero,
        edad: eStr ? parseInt(eStr) : (editForm.edadFallback ?? undefined),
        fechaNacimiento: editForm.fechaNacimiento || undefined,
        tipoPaciente: editForm.tipoPaciente,
        tipoNota: editForm.tipoPaciente !== "REFUGIADO" && editForm.tipoNota?.trim() ? editForm.tipoNota.trim() : undefined,
        fechaConsulta: combineFechaHora(editForm.fechaConsulta, editForm.horaConsulta),
        lesiones: (Array.isArray(editForm.lesiones) ? editForm.lesiones : []).filter((l: Lesion) => l.tipoId),
        estadoFisico: editForm.estadoFisico === "LESIONADO" ? "LESIONADO" : "ILESO",
        embarazo: editForm.genero === "FEMENINO" ? (editForm.embarazo === "SI" ? "SI" : "NO") : "NO",
        refugio: editForm.refugio,
        antecedentesPatologiaIds: editForm.antPat,
        antecedentesMedicamentoIds: editForm.antMed,
        diagnosticoPatologiaIds: editForm.diagPat,
        diagnosticoMedicamentoIds: editForm.diagMed.filter((m: Medicamento) => m.id),
        notasDoctor: editForm.notas.trim() || undefined,
      };
      await saveLocalConsulta({ id: editForm.id, data, userId: currentUser?.email, createdAt: editForm.createdAt });
      // Persistir también en el censo (si el paciente está vinculado).
      const edadNum = eStr ? parseInt(eStr) : (editForm.edadFallback ?? null);
      await syncEditToRegistro(editForm, edadNum);
      showToast("Consulta actualizada. Se sincronizará cuando haya señal.", "success");
      setEditForm(null);
      await refreshLocalConsultas();
      triggerSync();
    } catch (err) {
      console.error(err);
      showToast("Error al actualizar la consulta.", "error");
    } finally {
      setEditSaving(false);
    }
  };

  // Combinar consultas remotas y pendientes locales para historial
  const allConsultas = useMemo(() => {
    // Las consultas REMOTAS ya vienen filtradas por el refugio de vista (backend);
    // las LOCALES (IndexedDB de este dispositivo) hay que filtrarlas también, para
    // que Master, al cambiar de refugio en el selector, no vea consultas de otros
    // campamentos. Master en consolidado (sin refugio de vista) → ve todas.
    const scopedLocal = effectiveRefugio
      ? localConsultas.filter((c) => (c.data?.refugio || "") === effectiveRefugio)
      : localConsultas;
    const combined = [...scopedLocal];
    const localIds = new Set(scopedLocal.map((c) => c.id));
    consultas.forEach((c) => {
      if (!localIds.has(c.id)) {
        combined.push({
          id: c.id,
          data: {
            cedula: c.cedula,
            nombreApellido: c.nombreApellido,
            registroId: c.registroId,
            genero: c.genero,
            edad: c.edad,
            fechaNacimiento: c.fechaNacimiento,
            tipoPaciente: c.tipoPaciente || "REFUGIADO",
            tipoNota: c.tipoNota,
            fechaConsulta: c.fechaConsulta,
            lesiones: c.lesiones || [],
            estadoFisico: c.estadoFisico,
            embarazo: c.embarazo,
            refugio: c.refugio,
            antecedentesPatologiaIds: c.antecedentesPatologiaIds || [],
            antecedentesMedicamentoIds: c.antecedentesMedicamentoIds || [],
            diagnosticoPatologiaIds: c.diagnosticoPatologiaIds || [],
            diagnosticoMedicamentoIds: c.diagnosticoMedicamentoIds || [],
            notasDoctor: c.notasDoctor,
          },
          status: "synced",
          attempts: 0,
          createdAt: c.createdAt,
          userId: c.userId,
        });
      }
    });
    // Orden por la fecha-hora clínica (la elegida a mano); si no la hay, por createdAt.
    const when = (c: any) => new Date(c.data?.fechaConsulta || c.createdAt).getTime();
    return combined.sort((a, b) => when(b) - when(a));
  }, [localConsultas, consultas, effectiveRefugio]);

  // Historial filtrado (buscador + filtros avanzados). Insensible a acentos/mayúsculas.
  const filteredConsultas = useMemo(() => {
    let list = allConsultas;
    const q = normalizeText(histSearch.trim());
    const qDigits = histSearch.replace(/\D/g, "");
    if (q) {
      list = list.filter((c) => {
        const nom = normalizeText(c.data?.nombreApellido || "");
        const ced = String(c.data?.cedula || "").replace(/\D/g, "");
        return nom.includes(q) || (!!qDigits && ced.includes(qDigits));
      });
    }
    if (fTipo) list = list.filter((c) => (c.data?.tipoPaciente || "REFUGIADO") === fTipo);
    if (fDiag) list = list.filter((c) => {
      const has = Array.isArray(c.data?.diagnosticoPatologiaIds) && c.data.diagnosticoPatologiaIds.length > 0;
      return fDiag === "con" ? has : !has;
    });
    if (fEstado) list = list.filter((c) => (c.data?.estadoFisico || "") === fEstado);
    // Rango de fechas de la CONSULTA (fechaConsulta || createdAt), inclusivo.
    const ymd = (v: any) => { const d = new Date(v); return isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
    if (fDesde) list = list.filter((c) => ymd(c.data?.fechaConsulta || c.createdAt) >= fDesde);
    if (fHasta) list = list.filter((c) => { const s = ymd(c.data?.fechaConsulta || c.createdAt); return !!s && s <= fHasta; });
    return list;
  }, [allConsultas, histSearch, fTipo, fDiag, fEstado, fDesde, fHasta]);

  // Paginación (cliente) del historial de consultas — misma idea que en Registrados.
  const [consPage, setConsPage] = useState(1);
  const [consPageSize, setConsPageSize] = useState(20);
  useEffect(() => { setConsPage(1); }, [histSearch, fTipo, fDiag, fEstado, fDesde, fHasta, consPageSize]);
  useEffect(() => {
    const tp = Math.max(1, Math.ceil(filteredConsultas.length / consPageSize));
    if (consPage > tp) setConsPage(tp);
  }, [filteredConsultas.length, consPageSize, consPage]);
  const pagedConsultas = useMemo(() => {
    const off = (consPage - 1) * consPageSize;
    return filteredConsultas.slice(off, off + consPageSize);
  }, [filteredConsultas, consPage, consPageSize]);
  const histFiltersActive = !!(fTipo || fDiag || fEstado || fDesde || fHasta);

  // Opciones para los buscadores (excluyendo lo ya elegido).
  const patologiaOptions = (excluir: string[]) =>
    patologias.filter((p) => !excluir.includes(p.id)).map((p) => ({ value: p.id, label: p.nombre }));
  const medOptions = (excluir: Medicamento[]) =>
    predefinedMedicamentos
      .filter((m) => !excluir.some((x) => x.id === m.id))
      .map((m) => ({ value: m.id, label: [m.nombre, m.concentracion, m.presentacion].filter(Boolean).join(" · ") }));
  // El mismo tipo puede repetirse (varias heridas iguales) → no se excluye lo ya elegido.
  const tipoLesionOptions = tiposLesion.map((t) => ({ value: t.id, label: t.nombre }));

  // ── Render helpers (funciones, no componentes: evita remonte de inputs) ──
  const patologiaChips = (ids: string[], onRemove: (id: string) => void, variant: "primary" | "success", ns: string) => (
    <div className="morb-pills">
      {ids.length === 0 ? (
        <span className="morb-pills__empty">(Ninguna seleccionada)</span>
      ) : ids.map((id) => {
        const key = `${ns}:${id}`;
        return (
          <span key={id} className={`morb-pill morb-pill--${variant} ${exiting[key] ? "morb-pill--out" : ""}`}>
            {patologiaNombre(id, patologias)}
            <button type="button" className="morb-pill__x" aria-label="Quitar" onClick={() => animateOut(key, () => onRemove(id))}>×</button>
          </span>
        );
      })}
    </div>
  );

  const medRowsView = (items: Medicamento[], onUpdate: (i: number, f: "dosis" | "periodo", v: string) => void, onRemove: (id: string) => void, ns: string) => (
    items.length === 0 ? (
      <p className="morb-meds__empty">Sin medicamentos. Búscalo y agrégalo del catálogo.</p>
    ) : (
      <div className="morb-meds">
        <div className="morb-meds__head"><span>Medicamento</span><span>Dosis</span><span>Período</span><span /></div>
        {items.map((m, i) => {
          const key = `${ns}:${m.id}`;
          return (
            <div key={m.id} className={`morb-med ${exiting[key] ? "morb-med--out" : ""}`}>
              <span className="morb-med__name" title={medLabel(m.id, predefinedMedicamentos)}>{medLabel(m.id, predefinedMedicamentos)}</span>
              <span className="morb-med__dosis" title={m.dosis}>{m.dosis || "—"}</span>
              <StyledSelect dense value={m.periodo} onChange={(v) => onUpdate(i, "periodo", v)} options={PERIODO_OPTS} placeholder="Período…" ariaLabel="Período" />
              <button type="button" className="morb-med__x" aria-label="Quitar" onClick={() => animateOut(key, () => onRemove(m.id))}>×</button>
            </div>
          );
        })}
      </div>
    )
  );

  // Campo fecha-hora de la consulta (DatePicker + TimePicker), reutilizable en crear/editar.
  const fechaHoraField = (ymd: string, hm: string, onYmd: (v: string) => void, onHm: (v: string) => void) => (
    <div className="morb-datetime">
      <div className="morb-field f-fechaconsulta">
        <label className="morb-field__label">Fecha de la consulta</label>
        <DatePicker value={ymd} onChange={onYmd} placeholder="Seleccionar fecha…" />
      </div>
      <div className="morb-field f-horaconsulta">
        <label className="morb-field__label">Hora de la consulta</label>
        <TimePicker value={hm} onChange={onHm} minuteStep={5} />
      </div>
    </div>
  );

  // Estados explícitos del paciente (toggles segmentados pill). El de embarazo solo aparece
  // en mujeres. Auto-sugeridos por lesiones/patologías; el médico decide.
  const estadosRow = (estadoVal: string, embVal: string, gen: string, onEstado: (v: "ILESO" | "LESIONADO") => void, onEmb: (v: "SI" | "NO") => void) => (
    <div className="morb-estados">
      <div className="morb-field">
        <label className="morb-field__label">Estado físico</label>
        <div className="morb-seg" role="group" aria-label="Estado físico">
          <button type="button" className={`morb-seg__btn ${estadoVal === "ILESO" ? "is-active is-ok" : ""}`} aria-pressed={estadoVal === "ILESO"} onClick={() => onEstado("ILESO")}>Ileso</button>
          <button type="button" className={`morb-seg__btn ${estadoVal === "LESIONADO" ? "is-active is-danger" : ""}`} aria-pressed={estadoVal === "LESIONADO"} onClick={() => onEstado("LESIONADO")}>Lesionado</button>
        </div>
      </div>
      {gen === "FEMENINO" && (
        <div className="morb-field">
          <label className="morb-field__label">Embarazo</label>
          <div className="morb-seg" role="group" aria-label="Embarazo">
            <button type="button" className={`morb-seg__btn ${embVal === "NO" ? "is-active" : ""}`} aria-pressed={embVal === "NO"} onClick={() => onEmb("NO")}>No</button>
            <button type="button" className={`morb-seg__btn ${embVal === "SI" ? "is-active is-accent" : ""}`} aria-pressed={embVal === "SI"} onClick={() => onEmb("SI")}>Sí</button>
          </div>
        </div>
      )}
    </div>
  );

  // Bloque de lesiones/heridas/curas (add por catálogo + tarjeta por lesión).
  // Va DENTRO del Diagnóstico, ANTES de los medicamentos (no es su propia tarjeta).
  const lesionesSection = (items: Lesion[], onAdd: (tipoId: string) => void, onUpdate: (i: number, f: keyof Lesion, v: string) => void, onRemove: (i: number) => void, ns: string) => (
    <div className="morb-field">
      <label className="morb-field__label">Lesiones, Heridas y Curas</label>
      <SearchableSelect inputClassName="morb-control" placeholder="Buscar y agregar tipo de lesión…" options={tipoLesionOptions} onSelect={onAdd} />
      {items.length > 0 && (
        <div className="morb-lesiones">
          {items.map((l, i) => {
            const key = `${ns}:${i}`;
            return (
              <div key={key} className="morb-les">
                <div className="morb-les__head">
                  <span className="morb-les__name">{tipoLesionNombre(l.tipoId, tiposLesion)}</span>
                  <button type="button" className="morb-les__x" aria-label="Quitar lesión" onClick={() => onRemove(i)}>×</button>
                </div>
                <div className="morb-les__grid">
                  <div className="morb-field">
                    <label className="morb-field__label">Zona del cuerpo</label>
                    <StyledSelect value={l.zona} onChange={(v) => onUpdate(i, "zona", v)} options={ZONA_OPTS} placeholder="Zona…" ariaLabel="Zona del cuerpo" />
                  </div>
                  <div className="morb-field">
                    <label className="morb-field__label">Estado</label>
                    <StyledSelect value={l.estado} onChange={(v) => onUpdate(i, "estado", v)} options={ESTADO_LESION_OPTS} ariaLabel="Estado de la lesión" />
                  </div>
                </div>
                <div className="morb-field">
                  <label className="morb-field__label">Cura / tratamiento aplicado</label>
                  <textarea className="morb-control morb-les__cura" value={l.cura} onChange={(e) => onUpdate(i, "cura", e.target.value)} placeholder="Limpieza, sutura, antiséptico, vendaje, indicaciones…" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // Animación de salida suave: crear / eliminar / Excel (el contenido no depende del
  // estado que se limpia al cerrar, o se conserva vía `.data`).
  const mCreate = useAnimatedModal(showCreate);
  const mDelete = useAnimatedModal(deleteTarget);
  const mExcel = useAnimatedModal(showExcelModal);

  return (
    <div className="tab-view morb">
      {/* 1. Header (estilo hero, coherente con Balance) */}
      <div className="morb-head">
        <span className="morb-head__icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.8 4.8a4 4 0 0 1 5.6 0L12 6.4l1.6-1.6a4 4 0 1 1 5.6 5.6L12 17.6 4.8 10.4a4 4 0 0 1 0-5.6z"/><path d="M2.5 12.5h4l1.8-3 2.4 5 1.8-3H16"/></svg>
        </span>
        <div className="morb-head__titles">
          <h2>Consultas Médicas</h2>
          <p>Registro clínico y diagnóstico de pacientes refugiados</p>
        </div>
        {/* Acciones: "Nueva consulta" (abre el modal) ANTES de los catálogos médicos. */}
        <div className="morb-head__actions">
          <button type="button" className="morb-newbtn" onClick={openCreate}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span className="btn-txt-collapsible-sm">Nueva consulta</span>
          </button>
          {/* Catálogos médicos: botones discretos + modales. Solo a quien puede editar catálogos. */}
          <CatalogosMedicos />
        </div>
      </div>

      {/* 2. Modal "Nueva consulta": buscar cédula → formulario de carga */}
      {mCreate.mounted && (
        <div className={`modal-overlay${mCreate.closing ? " modal-overlay--closing" : ""}`} onClick={closeCreate}>
          <div className={`modal-content modal-content--morb${mCreate.closing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Nueva consulta médica</span>
              <button className="modal-close" onClick={closeCreate} aria-label="Cerrar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="morb morb-editbody">
            {!searched ? (
              <div className="morb-search">
                <form onSubmit={handleSearch} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div className="morb-field">
              <label className="morb-field__label" htmlFor="search-cedula">Buscar paciente por cédula</label>
              <div className="morb-search__row">
                <input
                  className="morb-control"
                  type="text"
                  id="search-cedula"
                  placeholder="ej: V-12345678"
                  value={searchCedula}
                  onChange={(e) => setSearchCedula(e.target.value.replace(/[^\dVEve-]/g, ""))}
                />
                <button type="submit" className="morb-btn morb-btn--primary" disabled={searching} style={{ minWidth: "104px" }}>
                  {searching ? <span className="spinner spinner-sm" /> : "Buscar"}
                </button>
              </div>
            </div>
                </form>
              </div>
            ) : (
              <form onSubmit={handleSave} className="morb-form">
          {/* Datos Básicos — ocupa todo el ancho */}
          <div className="morb-card morb-card--primary">
            <h3 className="morb-card__title">Datos Básicos del Paciente</h3>
            <div className="morb-tipo">
              <div className="morb-field">
                <label className="morb-field__label">Tipo de atención</label>
                <StyledSelect value={tipoPaciente} onChange={(v) => setTipoPaciente(v)} options={TIPO_PACIENTE_OPTS} ariaLabel="Tipo de atención" />
              </div>
              {tipoPaciente !== "REFUGIADO" && (
                <div className="morb-field">
                  <label className="morb-field__label">Nota del apoyo (opcional)</label>
                  <input className="morb-control" type="text" value={tipoNota} onChange={(e) => setTipoNota(e.target.value)} placeholder="Institución, contexto de la atención…" />
                </div>
              )}
            </div>
            {fechaHoraField(fechaConsulta, horaConsulta, setFechaConsulta, setHoraConsulta)}
            <div className="morb-basic">
              <div className="morb-field f-cedula">
                <label className="morb-field__label">Cédula</label>
                <input className="morb-control" type="text" value={cedula} disabled />
              </div>
              <div className="morb-field f-nombre">
                <label className="morb-field__label">Nombre y Apellido</label>
                <input className="morb-control" type="text" value={nombreApellido} onChange={(e) => setNombreApellido(e.target.value)} required />
              </div>
              <div className="morb-field f-genero">
                <label className="morb-field__label">Género</label>
                <StyledSelect value={genero} onChange={setGenero} options={GENERO_OPTS} ariaLabel="Género" />
              </div>
              <div className="morb-field f-fecha">
                <label className="morb-field__label">Fecha de Nacimiento</label>
                <DatePicker value={fechaNacimiento} onChange={onFechaChange} placeholder="Seleccionar fecha…" />
              </div>
              <div className="morb-field f-edad">
                <label className="morb-field__label">Edad (años)</label>
                <input className="morb-control" type="text" value={edad === "" ? "—" : edad} disabled title="Se calcula automáticamente de la fecha de nacimiento" />
              </div>
              <div className="morb-field f-refugio">
                <label className="morb-field__label">Campamento Transitorio (Refugio)</label>
                <input className="morb-control" type="text" value={refugio} disabled />
              </div>
            </div>
            {/* Estados del paciente — al final de Datos Básicos, tras el campamento */}
            {estadosRow(estadoFisico, embarazo, genero, toggleEstado, toggleEmbarazo)}
          </div>

          {/* Antecedentes | Diagnóstico — 2 columnas simétricas */}
          <div className="morb-duo">
            <div className="morb-card morb-card--primary">
              <h3 className="morb-card__title">Antecedentes Clínicos (Censo)</h3>
              <p className="morb-hint">
                {matchedRegistro ? "Editables: al guardar la consulta se actualizan en el censo del paciente." : "El paciente no está en el censo; estos datos solo quedan en la consulta."}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                <div className="morb-field">
                  <label className="morb-field__label">Patologías del paciente</label>
                  <SearchableSelect inputClassName="morb-control" placeholder="Buscar y agregar patología…" options={patologiaOptions(antecedentesPatologiaIds)} onSelect={addAntPatologia} />
                  {patologiaChips(antecedentesPatologiaIds, removeAntPatologia, "primary", "antpat")}
                </div>
                <div className="morb-field">
                  <label className="morb-field__label">Medicamentos del paciente</label>
                  <SearchableSelect inputClassName="morb-control" placeholder="Buscar y agregar medicamento…" options={medOptions(antecedentesMedicamentoIds)} onSelect={addAntMed} />
                  {medRowsView(antecedentesMedicamentoIds, updateAntMed, removeAntMed, "antmed")}
                </div>
              </div>
            </div>

            <div className="morb-card morb-card--success">
              <h3 className="morb-card__title">Diagnóstico de Consulta</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                <div className="morb-field">
                  <label className="morb-field__label">Patologías Diagnósticas</label>
                  <SearchableSelect inputClassName="morb-control" placeholder="Buscar y agregar patología…" options={patologiaOptions(diagnosticoPatologiaIds)} onSelect={addDiagPatologia} />
                  {patologiaChips(diagnosticoPatologiaIds, removeDiagPatologia, "success", "diagpat")}
                </div>
                {lesionesSection(lesiones, addLesion, updateLesion, removeLesion, "les")}
                <div className="morb-field">
                  <label className="morb-field__label">Medicamentos Diagnósticados (Receta)</label>
                  <SearchableSelect inputClassName="morb-control" placeholder="Buscar y agregar medicamento…" options={medOptions(diagnosticoMedicamentoIds)} onSelect={addDiagMed} />
                  {medRowsView(diagnosticoMedicamentoIds, updateDiagMed, removeDiagMed, "diagmed")}
                </div>
                <div className="morb-field">
                  <label className="morb-field__label" htmlFor="notas-doctor">Notas Médicas / Observaciones</label>
                  <textarea className="morb-control" id="notas-doctor" placeholder="Escriba aquí los comentarios del doctor..." value={notasDoctor} onChange={(e) => setNotasDoctor(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="morb-actions">
            <button type="button" className="morb-btn morb-btn--ghost" onClick={closeCreate}>Cancelar</button>
            <button type="submit" className="morb-btn morb-btn--primary" disabled={saving} style={{ minWidth: "160px" }}>
              {saving ? <span className="spinner spinner-sm" /> : "Guardar Consulta"}
            </button>
          </div>
              </form>
            )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Historial de Consultas */}
      <div className="morb-card">
        <div className="morb-hist__head">
          <div className="morb-hist__titlewrap">
            <h3 className="morb-card__title" style={{ margin: 0 }}>Historial de Consultas Médicas</h3>
            <span className="morb-hist__count">{filteredConsultas.length} de {allConsultas.length}</span>
          </div>
          {allConsultas.length > 0 && (
            <button type="button" className="toolbar-btn" onClick={() => {
              const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
              setMinSaludDia(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`); // día por defecto: hoy
              setShowExcelModal(true);
            }} disabled={exporting || exportingMinSalud} title="Descargar en Excel (General o formulario oficial SIS-02)">
              {(exporting || exportingMinSalud) ? <span className="spinner spinner-sm" /> : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>
              )}
              <span className="btn-txt-collapsible">Excel</span>
            </button>
          )}
        </div>

        {allConsultas.length > 0 && (
          <>
            <div className="asign-search-wrap" style={{ marginBottom: "0.5rem" }}>
              <input type="text" placeholder="Buscar por nombre o cédula…" value={histSearch} onChange={(e) => setHistSearch(e.target.value)} />
              {histSearch && (
                <button className="asign-search-clear" onClick={() => setHistSearch("")} aria-label="Limpiar búsqueda">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            <div className="toolbar-row" style={{ marginTop: "0.5rem", marginBottom: "1rem" }}>
              <button type="button" className={`toolbar-btn${histFiltersOpen ? " is-active" : ""}`} onClick={() => setHistFiltersOpen((o) => !o)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                {histFiltersOpen ? "Ocultar Filtros" : "Filtros Avanzados"}
              </button>
              {histFiltersActive && (
                <button type="button" className="toolbar-btn toolbar-btn--danger" onClick={() => { setFTipo(""); setFDiag(""); setFEstado(""); setFDesde(""); setFHasta(""); }}>Limpiar Filtros</button>
              )}
            </div>
            {histFiltersOpen && (
              <div className="reg-filters-panel pill-form">
                <div className="form-group">
                  <label>Tipo de atención</label>
                  <StyledSelect value={fTipo} onChange={setFTipo} ariaLabel="Tipo de atención" options={[{ value: "", label: "Todos" }, ...TIPO_PACIENTE_OPTS]} />
                </div>
                <div className="form-group">
                  <label>Diagnóstico</label>
                  <StyledSelect value={fDiag} onChange={setFDiag} ariaLabel="Diagnóstico" options={[{ value: "", label: "Todos" }, { value: "con", label: "Con diagnóstico" }, { value: "sin", label: "Sin diagnóstico" }]} />
                </div>
                <div className="form-group">
                  <label>Estado físico</label>
                  <StyledSelect value={fEstado} onChange={setFEstado} ariaLabel="Estado físico" options={[{ value: "", label: "Todos" }, { value: "ILESO", label: "Ileso" }, { value: "LESIONADO", label: "Lesionado" }]} />
                </div>
                <div className="form-group">
                  <label>Consultas desde</label>
                  <DatePicker value={fDesde} onChange={setFDesde} placeholder="Desde…" defaultToday />
                </div>
                <div className="form-group">
                  <label>Consultas hasta</label>
                  <DatePicker value={fHasta} onChange={setFHasta} placeholder="Hasta…" defaultToday />
                </div>
              </div>
            )}
          </>
        )}

        {allConsultas.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "1.5rem 0", margin: 0 }}>No hay consultas registradas en este refugio.</p>
        ) : filteredConsultas.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "1.5rem 0", margin: 0 }}>Ninguna consulta coincide con la búsqueda o los filtros.</p>
        ) : (
          <div className="morb-history__scroll">
            <table className="matrix-table" style={{ fontSize: "0.8rem", minWidth: "700px" }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Paciente</th>
                  <th>Diagnóstico</th>
                  <th>Notas del Dr.</th>
                  <th style={{ textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pagedConsultas.map((c) => {
                  const dt = new Date(c.data.fechaConsulta || c.createdAt);
                  const dateStr = dt.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
                  const timeStr = dt.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
                  const diagPatIds: string[] = Array.isArray(c.data.diagnosticoPatologiaIds) ? c.data.diagnosticoPatologiaIds : [];
                  const diagMeds: Medicamento[] = Array.isArray(c.data.diagnosticoMedicamentoIds) ? c.data.diagnosticoMedicamentoIds : [];
                  const lesionesC: Lesion[] = Array.isArray(c.data.lesiones) ? c.data.lesiones : [];
                  const initials = initialsOf(c.data.nombreApellido);
                  return (
                    <tr key={c.id}>

                      {/* FECHA apilada: día encima, hora debajo */}
                      <td data-label="Fecha" style={{ whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontWeight: "700" }}>{dateStr}</span>
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{timeStr}</span>
                        </div>
                      </td>

                      {/* PACIENTE apilado: avatar + nombre + cédula + tipo-badge */}
                      <td data-label="Paciente">
                        <div className="person-cell">
                          <span className="person-avatar" aria-hidden="true">{initials}</span>
                          <div className="person-info">
                            <div className="person-top">
                              <span className="person-name">{c.data.nombreApellido}</span>
                              {c.data.tipoPaciente && c.data.tipoPaciente !== "REFUGIADO" && (
                                <span className={`morb-tipo-badge morb-tipo-badge--${c.data.tipoPaciente.toLowerCase()}`} title={c.data.tipoNota || ""}>
                                  {TIPO_PACIENTE_LABELS[c.data.tipoPaciente] || c.data.tipoPaciente}
                                </span>
                              )}
                            </div>
                            <div className="person-sub">
                              <span className="person-cedula">{formatCedulaDisplay(c.data.cedula, registros)}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* DIAGNÓSTICO apilado */}
                      <td data-label="Diagnóstico">
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {diagPatIds.length > 0 ? (
                            <span style={{ color: "var(--color-success)", fontWeight: "600" }}>
                              {diagPatIds.map((id) => patologiaNombre(id, patologias)).join(", ")}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin diagnóstico</span>
                          )}
                          {diagMeds.length > 0 && (
                            <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                              R: {medItemsText(diagMeds, predefinedMedicamentos)}
                            </span>
                          )}
                          {lesionesC.length > 0 && (
                            <span style={{ fontSize: "0.7rem", color: "var(--color-warning, #b45309)" }}>
                              Lesiones: {lesionesC.map((l) => {
                                const est = ESTADO_LESION_LABELS[l.estado] ? ` – ${ESTADO_LESION_LABELS[l.estado]}` : "";
                                return tipoLesionNombre(l.tipoId, tiposLesion) + (l.zona ? ` (${l.zona})` : "") + est;
                              }).join(", ")}
                            </span>
                          )}
                        </div>
                      </td>

                      <td data-label="Notas del Dr." className="morb-hist__notas" title={c.data.notasDoctor}>{c.data.notasDoctor || "-"}</td>

                      {/* ACCIONES: grupo segmentado con tooltips */}
                      <td data-label="Acciones" className="morb-hist__actioncell">
                        <div className="morb-row-actions">
                          <button
                            type="button"
                            className="morb-row-actions__btn morb-row-actions__btn--view"
                            data-tip="Ver detalle"
                            aria-label="Ver detalle de la consulta"
                            onClick={() => openView(c)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            <span className="morb-row-actions__txt">Ver</span>
                          </button>
                          <button
                            type="button"
                            className="morb-row-actions__btn morb-row-actions__btn--hist"
                            data-tip="Ver historial"
                            aria-label="Ver historial clínico del paciente"
                            onClick={() => verHistorial(c.data.cedula)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 14h2l1-2 2 4 1-2h2"/></svg>
                            <span className="morb-row-actions__txt">Historial</span>
                          </button>
                          <button
                            type="button"
                            className="morb-row-actions__btn morb-row-actions__btn--edit"
                            data-tip="Editar consulta"
                            aria-label="Editar consulta"
                            onClick={() => openEdit(c)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            <span className="morb-row-actions__txt">Editar</span>
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              className="morb-row-actions__btn morb-row-actions__btn--delete"
                              data-tip="Eliminar consulta"
                              aria-label="Eliminar consulta"
                              onClick={() => setDeleteTarget(c)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                              <span className="morb-row-actions__txt">Eliminar</span>
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>

          </div>
        )}
        {filteredConsultas.length > 0 && (
          <Pagination
            total={filteredConsultas.length}
            page={consPage}
            pageSize={consPageSize}
            onPageChange={setConsPage}
            onPageSizeChange={setConsPageSize}
            itemLabel="consultas"
          />
        )}
      </div>

      {/* Modal: EDITAR consulta — mismo layout que el formulario de crear (Datos
          Básicos + Antecedentes | Diagnóstico en 2 columnas). Ancho en PC, pill,
          100% responsive. La edad se DERIVA de la fecha de nacimiento (no manual). */}
      {editForm && (
        <div className={`modal-overlay${editClosing ? " modal-overlay--closing" : ""}`} onClick={closeEdit}>
          <div className={`modal-content modal-content--morb${editClosing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Editar consulta</span>
              <button className="modal-close" onClick={closeEdit} aria-label="Cerrar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="morb pill-form morb-editbody">
              {/* Datos Básicos */}
              <div className="morb-card morb-card--primary">
                <h3 className="morb-card__title">Datos Básicos del Paciente</h3>
                <div className="morb-tipo">
                  <div className="morb-field">
                    <label className="morb-field__label">Tipo de atención</label>
                    <StyledSelect value={editForm.tipoPaciente} onChange={(v) => setEditForm((f: any) => ({ ...f, tipoPaciente: v }))} options={TIPO_PACIENTE_OPTS} ariaLabel="Tipo de atención" />
                  </div>
                  {editForm.tipoPaciente !== "REFUGIADO" && (
                    <div className="morb-field">
                      <label className="morb-field__label">Nota del apoyo (opcional)</label>
                      <input className="morb-control" type="text" value={editForm.tipoNota} onChange={(e) => setEditForm((f: any) => ({ ...f, tipoNota: e.target.value }))} placeholder="Institución, contexto…" />
                    </div>
                  )}
                </div>
                {fechaHoraField(editForm.fechaConsulta, editForm.horaConsulta, (v) => setEditForm((f: any) => ({ ...f, fechaConsulta: v })), (v) => setEditForm((f: any) => ({ ...f, horaConsulta: v })))}
                <div className="morb-basic">
                  <div className="morb-field f-cedula">
                    <label className="morb-field__label">Cédula</label>
                    <input className="morb-control" type="text" value={editForm.cedula} disabled />
                  </div>
                  <div className="morb-field f-nombre">
                    <label className="morb-field__label">Nombre y Apellido</label>
                    <input className="morb-control" type="text" value={editForm.nombreApellido} onChange={(e) => setEditForm((f: any) => ({ ...f, nombreApellido: e.target.value }))} />
                  </div>
                  <div className="morb-field f-genero">
                    <label className="morb-field__label">Género</label>
                    <StyledSelect value={editForm.genero} onChange={(v) => setEditForm((f: any) => ({ ...f, genero: v }))} options={GENERO_OPTS} ariaLabel="Género" />
                  </div>
                  <div className="morb-field f-fecha">
                    <label className="morb-field__label">Fecha de Nacimiento</label>
                    <DatePicker value={editForm.fechaNacimiento} onChange={(v) => setEditForm((f: any) => ({ ...f, fechaNacimiento: v }))} placeholder="Seleccionar fecha…" />
                  </div>
                  <div className="morb-field f-edad">
                    <label className="morb-field__label">Edad (años)</label>
                    <input className="morb-control" type="text" value={editForm.fechaNacimiento ? (computeEdad(editForm.fechaNacimiento) || "—") : (editForm.edadFallback ?? "—")} disabled title="Se calcula automáticamente de la fecha de nacimiento" />
                  </div>
                  <div className="morb-field f-refugio">
                    <label className="morb-field__label">Campamento Transitorio (Refugio)</label>
                    <input className="morb-control" type="text" value={editForm.refugio} disabled />
                  </div>
                </div>
                {estadosRow(editForm.estadoFisico, editForm.embarazo, editForm.genero, efToggleEstado, efToggleEmbarazo)}
              </div>

              {/* Antecedentes | Diagnóstico */}
              <div className="morb-duo">
                <div className="morb-card morb-card--primary">
                  <h3 className="morb-card__title">Antecedentes Clínicos (Censo)</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                    <div className="morb-field">
                      <label className="morb-field__label">Patologías del paciente</label>
                      <SearchableSelect inputClassName="morb-control" placeholder="Buscar y agregar patología…" options={patologiaOptions(editForm.antPat)} onSelect={(id) => efPatAdd("antPat", id)} />
                      {patologiaChips(editForm.antPat, (id) => efPatRemove("antPat", id), "primary", "eantpat")}
                    </div>
                    <div className="morb-field">
                      <label className="morb-field__label">Medicamentos del paciente</label>
                      <SearchableSelect inputClassName="morb-control" placeholder="Buscar y agregar medicamento…" options={medOptions(editForm.antMed)} onSelect={(id) => efMedAdd("antMed", id)} />
                      {medRowsView(editForm.antMed, (i, f, v) => efMedUpdate("antMed", i, f, v), (id) => efMedRemove("antMed", id), "eantmed")}
                    </div>
                  </div>
                </div>

                <div className="morb-card morb-card--success">
                  <h3 className="morb-card__title">Diagnóstico de Consulta</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                    <div className="morb-field">
                      <label className="morb-field__label">Patologías Diagnósticas</label>
                      <SearchableSelect inputClassName="morb-control" placeholder="Buscar y agregar patología…" options={patologiaOptions(editForm.diagPat)} onSelect={(id) => efPatAdd("diagPat", id)} />
                      {patologiaChips(editForm.diagPat, (id) => efPatRemove("diagPat", id), "success", "ediagpat")}
                    </div>
                    {lesionesSection(editForm.lesiones || [], efLesAdd, efLesUpdate, efLesRemove, "eles")}
                    <div className="morb-field">
                      <label className="morb-field__label">Medicamentos Diagnósticados (Receta)</label>
                      <SearchableSelect inputClassName="morb-control" placeholder="Buscar y agregar medicamento…" options={medOptions(editForm.diagMed)} onSelect={(id) => efMedAdd("diagMed", id)} />
                      {medRowsView(editForm.diagMed, (i, f, v) => efMedUpdate("diagMed", i, f, v), (id) => efMedRemove("diagMed", id), "ediagmed")}
                    </div>
                    <div className="morb-field">
                      <label className="morb-field__label">Notas Médicas / Observaciones</label>
                      <textarea className="morb-control" value={editForm.notas} onChange={(e) => setEditForm((f: any) => ({ ...f, notas: e.target.value }))} placeholder="Comentarios del doctor…" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="morb-actions">
                <button type="button" className="morb-btn morb-btn--ghost" onClick={closeEdit} disabled={editSaving}>Cancelar</button>
                <button type="button" className="morb-btn morb-btn--primary" style={{ minWidth: "160px" }} onClick={saveEdit} disabled={editSaving}>
                  {editSaving ? <span className="spinner spinner-sm" /> : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: VER DETALLE de consulta en solo lectura (mismo ancho y layout que crear/editar) */}
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
              {/* Datos Básicos */}
              <div className="morb-card morb-card--primary">
                <h3 className="morb-card__title">Datos Básicos del Paciente</h3>
                <div className="morb-tipo">
                  <div className="morb-field">
                    <label className="morb-field__label">Tipo de atención</label>
                    <input className="morb-control" type="text" value={TIPO_PACIENTE_LABELS[viewConsulta.data?.tipoPaciente] || viewConsulta.data?.tipoPaciente || "Refugiado"} disabled />
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
                      let fn = viewConsulta.data?.fechaNacimiento || "";
                      if (!fn && registros) {
                        const ced = String(viewConsulta.data?.cedula || "").replace(/\D/g, "");
                        const reg = registros.find((r: any) => (viewConsulta.data?.registroId && r.id === viewConsulta.data.registroId) || (r.cedula || "").replace(/\D/g, "") === ced);
                        if (reg && reg.fechaNacimiento) fn = reg.fechaNacimiento;
                      }
                      return fn ? computeEdad(fn) : viewConsulta.data?.edad != null ? String(viewConsulta.data.edad) : "—";
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
                  <h3 className="morb-card__title">Antecedentes Clínicos (Censo)</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                    <div className="morb-field">
                      <label className="morb-field__label">Patologías del paciente</label>
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
                      <label className="morb-field__label">Medicamentos del paciente</label>
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

              <div className="morb-actions">
                <button type="button" className="morb-btn morb-btn--ghost" onClick={closeView}>Cerrar</button>
                <button type="button" className="morb-btn morb-btn--primary" style={{ minWidth: "160px" }} onClick={() => {
                  const currentCons = viewConsulta;
                  closeView();
                  setTimeout(() => openEdit(currentCons), 250);
                }}>
                  Editar consulta
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: CONFIRMAR eliminación de consulta (solo AdminMedico + Master) */}
      {mDelete.mounted && (
        <div className={`modal-overlay${mDelete.closing ? " modal-overlay--closing" : ""}`} onClick={() => !deleting && setDeleteTarget(null)}>
          <div className={`modal-content confirm-modal${mDelete.closing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px", width: "92%" }}>
            <div className="confirm-modal__icon confirm-modal__icon--danger">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </div>
            <h3 className="confirm-modal__title">Eliminar consulta</h3>
            <p className="confirm-modal__text">
              ¿Seguro que deseas eliminar la consulta de <strong>{mDelete.data?.data?.nombreApellido || "este paciente"}</strong>
              {mDelete.data?.data?.cedula ? <> (C.I. {mDelete.data.data.cedula})</> : null}? Esta acción no se puede deshacer.
            </p>
            <div className="confirm-modal__actions">
              <button type="button" className="btn-secondary" style={{ margin: 0 }} onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancelar
              </button>
              <button type="button" className="btn-danger" style={{ margin: 0 }} onClick={confirmDelete} disabled={deleting}>
                {deleting ? <span className="spinner spinner-sm" /> : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: elegir qué Excel descargar (General con membrete / formulario oficial SIS-02 por día) */}
      {mExcel.mounted && (
        <div className={`modal-overlay${mExcel.closing ? " modal-overlay--closing" : ""}`} onClick={() => { if (!exporting && !exportingMinSalud) setShowExcelModal(false); }}>
          <div className={`modal-content modal-content--detail${mExcel.closing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <span className="modal-title">Descargar Excel</span>
              <button className="modal-close" onClick={() => setShowExcelModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 1rem" }}>Elige qué exportar:</p>
            <div className="export-options">
              <button type="button" className="export-option" onClick={handleExportExcel} disabled={exporting || exportingMinSalud}>
                <span className="export-option__icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                </span>
                <span className="export-option__text">
                  <strong>Excel General</strong>
                  <small>El historial con los <b>filtros aplicados</b> ahora ({filteredConsultas.length}).</small>
                </span>
              </button>

              <div className="export-option export-option--form">
                <span className="export-option__icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="10" y1="9" x2="9" y2="9"/></svg>
                </span>
                <span className="export-option__text" style={{ width: "100%" }}>
                  <strong>Registro Min Salud (SIS-02 · EPI-10/13)</strong>
                  <small>Formulario oficial del MPPS, <b>por día</b>: las consultas del campamento en el día elegido (si superan 25, van en <b>varias hojas</b> del mismo archivo).</small>
                  <div className="pill-form" style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                    <div className="form-group">
                      <label>Día del reporte</label>
                      <DatePicker value={minSaludDia} onChange={setMinSaludDia} placeholder="Elegir día…" defaultToday />
                    </div>
                    <button type="button" className="btn-submit" onClick={handleExportMinSalud} disabled={exportingMinSalud || exporting}>
                      {exportingMinSalud ? <span className="spinner spinner-sm" /> : "Descargar formulario del día"}
                    </button>
                  </div>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
