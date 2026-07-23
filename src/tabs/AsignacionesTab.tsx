"use client";

// ── Pestaña: Registro de Afectados / Asignaciones ───────────────────────────
// Toda la vista de asignaciones vive aquí: tabla filtrable de registros,
// exportación (Excel / PDF de presentes) y el modal de detalle con sus tres
// modos (ver / editar / asignar cuarto).
//
// Del context global consume: registros, setRegistros, fetchRegistros,
// loadingRegistros, customCuartos, allCuartos, sortedCustomCuartos, showToast,
// currentUser, isOnline, triggerSync, refreshLocalRecords, isPowerAdmin,
// pendingSelectId, setPendingSelectId.
//
// ACOPLAMIENTO PWA: el banner interno y el service-worker useEffect (que viven
// en Home) setean pendingSelectId. Home hace setActiveTab("asignaciones") al
// llegar; aquí un useEffect selecciona el registro (setSelectedRegistro) cuando
// aparece en `registros` y luego limpia pendingSelectId.

import { useState, useEffect, useMemo, useRef } from "react";
import { saveLocal, buscarCedulaEnCliente } from "@/lib/db";
import { fetchCedulaExterna } from "@/lib/cedulaApi";
import Reveal from "@/components/Reveal";
import { PARROQUIAS, PERIODO_OPTIONS, DEPENDENT_NUMBER_OPTIONS } from "@/lib/constants";
import {
  formatRoomLabel,
  roomFillLevel,
  patologiaNombre,
  patologiaNombres,
  medLabel,
  medItemsText,
  normalizeText,
  findRepresentante,
  cedulaFamilia,
} from "@/lib/helpers";
import { exportRegistrosExcel } from "@/lib/exportRegistrosExcel";
import { exportFamiliasExcel } from "@/lib/exportFamiliasExcel";
import { logActivity } from "@/lib/activityLog";
import SearchableSelect from "@/components/SearchableSelect";
import SearchableSingleSelect from "@/components/SearchableSingleSelect";
import StyledSelect from "@/components/StyledSelect";
import DatePicker from "@/components/DatePicker";
import { useBodyScrollLock } from "@/components/useBodyScrollLock";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import Pagination from "@/components/Pagination";
import type { Medicamento } from "@/types";
import { useAppContext } from "@/context/AppContext";
import { apiFetch } from "@/lib/apiFetch";
import { canRegister, canDeleteRegistro, isMaster } from "@/lib/permissions";

export default function AsignacionesTab() {
  const {
    registros,
    setRegistros,
    fetchRegistros,
    loadingRegistros,
    allCuartos,
    roomCapacities,
    showToast,
    currentUser,
    effectiveRefugio,
    setViewRefugio,
    triggerSync,
    refreshLocalRecords,
    pendingSelectId,
    setPendingSelectId,
    patologias,
    predefinedMedicamentos,
  } = useAppContext();

  const [registroSearch, setRegistroSearch] = useState("");
  const [selectedRegistro, setSelectedRegistro] = useState<any | null>(null);
  const [modalClosing, setModalClosing] = useState(false);
  const [asignCuarto, setAsignCuarto] = useState("");
  const [savingCuarto, setSavingCuarto] = useState(false);
  // Modal DEDICADO de asignar habitación (independiente del de ver/editar).
  const [assignRoomFor, setAssignRoomFor] = useState<any | null>(null);
  const openAssignRoom = (reg: any) => {
    setAssignRoomFor(reg);
    setAsignCuarto(reg.cuarto || "");
  };
  // Cierre con animación de salida: conserva el registro y el cuarto elegido durante la
  // animación (no saltan) y limpia al terminar.
  const [assignRoomClosing, setAssignRoomClosing] = useState(false);
  const closeAssignRoom = () => {
    if (assignRoomClosing) return;
    setAssignRoomClosing(true);
    setTimeout(() => {
      setAssignRoomFor(null);
      setAsignCuarto("");
      setAssignRoomClosing(false);
    }, 220);
  };

  // Con un modal abierto (detalle/edición o asignar habitación), el fondo NO hace scroll.
  useBodyScrollLock(!!selectedRegistro || !!assignRoomFor);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const editErr = (field: string): string => editErrors[field] || "";
  const [savingEdit, setSavingEdit] = useState(false);
  const [originalMedsCount, setOriginalMedsCount] = useState(0);

  // Lookup del Jefe de Familia por su cédula al editar (igual que en registro):
  // muestra su nombre si está en el sistema, o avisa si no está registrado.
  const [jefeEditLookup, setJefeEditLookup] = useState<{
    found: boolean;
    nombre?: string;
  } | null>(null);

  // Consulta AUTOMÁTICA de la cédula del afectado (igual que al registrar): al terminar de
  // escribir (debounce) o al pulsar el botón de sincronizar dentro del input, autocompleta
  // nombre, género y fecha de nacimiento desde el CENSO (otro registro) o el PADRÓN local.
  const editCedulaLookupRef = useRef<NodeJS.Timeout | null>(null);
  const isoToDmy = (iso?: string): string => {
    if (!iso) return "";
    const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
    if (isNaN(d.getTime())) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  const padronDateToDmy = (fn?: string): string => {
    if (!fn) return "";
    const parts = fn.split("-"); // padrón: YYYY-MM-DD
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : fn;
  };
  // Descompone una cédula almacenada. Los hijos/dependientes se guardan como
  // "<nac>-<dígitos del representante>-<correlativo>" (p. ej. "V-12345678-1").
  const parseStoredCedula = (ced: string) => {
    let nac = "V";
    let rest = (ced || "").trim().toUpperCase();
    if (/^[VE]-/.test(rest)) {
      nac = rest[0];
      rest = rest.slice(2);
    } else if (/^[VE]/.test(rest)) {
      nac = rest[0];
      rest = rest.slice(1);
    }
    const m = rest.match(/^(\d+)-(\d+)$/);
    if (m) return { nac, digits: m[1], isChild: true, depNum: m[2] };
    return {
      nac,
      digits: rest.replace(/\D/g, ""),
      isChild: false,
      depNum: "1",
    };
  };

  const runEditCedulaLookup = async (cleanNum: string, manual = false) => {
    if (cleanNum.length < 6) {
      if (manual) showToast("Ingresa una cédula válida.", "warning");
      return;
    }
    const isChild = !!editData.isChildDependent;
    const nac = editData.nacionalidad || "V";
    // Cédula efectiva a comparar: CON el sufijo si es hijo/dependiente (así no se
    // confunde con la del representante).
    const effCedula = isChild
      ? `${nac}-${cleanNum}-${editData.dependentNumber || "1"}`
      : `${nac}-${cleanNum}`;
    // 1) Censo: otro registro ACTIVO con esa MISMA cédula (con sufijo si es hijo),
    //    excluyendo el que se está editando.
    const censoMatch = registros.find(
      (r) =>
        r.id !== selectedRegistro?.id &&
        r.retirado !== "SI" &&
        (r.cedula || "").toUpperCase().trim() === effCedula.toUpperCase(),
    );
    if (censoMatch) {
      setEditData((prev) => ({
        ...prev,
        nombreApellido: censoMatch.nombreApellido || prev.nombreApellido,
        genero: censoMatch.genero || prev.genero,
        fechaNacimiento: censoMatch.fechaNacimiento
          ? isoToDmy(censoMatch.fechaNacimiento)
          : prev.fechaNacimiento,
      }));
      showToast("Datos tomados del censo.", "info");
      return;
    }
    // 2) Padrón electoral local — SOLO si NO es hijo. Un hijo comparte la cédula del
    //    representante, así que el padrón devolvería al padre; se omite a propósito.
    if (isChild) {
      if (manual)
        showToast(
          "Es hijo/dependiente: no se consulta el padrón (comparte la cédula del representante).",
          "info",
        );
      return;
    }
    try {
      const citizen = await buscarCedulaEnCliente(cleanNum);
      if (citizen) {
        setEditData((prev) => ({
          ...prev,
          nombreApellido: citizen.nombreCompleto || prev.nombreApellido,
          genero:
            citizen.sexo === "F" || citizen.sexo === "FEMENINO"
              ? "FEMENINO"
              : citizen.sexo === "M" || citizen.sexo === "MASCULINO"
                ? "MASCULINO"
                : prev.genero,
          fechaNacimiento: citizen.fechaNacimiento
            ? padronDateToDmy(citizen.fechaNacimiento)
            : prev.fechaNacimiento,
        }));
        showToast("Identidad verificada en padrón local.", "info");
        return;
      }
    } catch {
      /* padrón local no disponible; se intenta la API en línea */
    }
    // 3) API externa en línea (api.cedula.com.ve), como tercera fuente.
    const ext = await fetchCedulaExterna(nac, cleanNum);
    if (ext) {
      setEditData((prev) => ({
        ...prev,
        ...(ext.nombreApellido ? { nombreApellido: ext.nombreApellido } : {}),
        ...(ext.genero ? { genero: ext.genero } : {}),
        ...(ext.fechaNacimiento
          ? { fechaNacimiento: padronDateToDmy(ext.fechaNacimiento) }
          : {}),
      }));
      showToast("Identidad verificada en línea (api.cedula.com.ve).", "info");
    } else if (manual) {
      showToast(
        "Cédula no encontrada en el censo, padrón ni en línea.",
        "warning",
      );
    }
  };
  const lookupEditCedulaPadron = (cleanNum: string) => {
    if (editCedulaLookupRef.current) clearTimeout(editCedulaLookupRef.current);
    if (cleanNum.length < 7) return;
    editCedulaLookupRef.current = setTimeout(
      () => runEditCedulaLookup(cleanNum, false),
      250,
    );
  };
  const handleSyncEditCedula = () =>
    runEditCedulaLookup((editData.cedula || "").replace(/\D/g, ""), true);

  const lookupJefeEdit = (cleanVal: string) => {
    if (cleanVal.length >= 5) {
      const jefe = registros.find(
        (r) => (r.cedula || "").replace(/\D/g, "") === cleanVal,
      );
      setJefeEditLookup(
        jefe ? { found: true, nombre: jefe.nombreApellido } : { found: false },
      );
    } else {
      setJefeEditLookup(null);
    }
  };

  // Abre el modal de un registro DIRECTO en modo edición (precarga editData igual
  // que el botón "Editar" de dentro del modal). Se reutiliza desde la fila de la
  // tabla (acción rápida) y desde ese botón, para no duplicar la precarga.
  const enterEditMode = (reg: any) => {
    if (!reg) return;
    setSelectedRegistro(reg);
    setAsignCuarto(reg.cuarto || "");
    setEditMode(true);
    setEditErrors({});
    let formattedBirthDate = "";
    if (reg.fechaNacimiento) {
      const dObj = new Date(reg.fechaNacimiento);
      if (!isNaN(dObj.getTime())) {
        const day = String(dObj.getDate()).padStart(2, "0");
        const month = String(dObj.getMonth() + 1).padStart(2, "0");
        formattedBirthDate = `${day}/${month}/${dObj.getFullYear()}`;
      }
    }
    // Reconoce si el registro es un hijo/dependiente (cédula con sufijo "-N"):
    // separa nacionalidad, dígitos del representante y el correlativo.
    const parsedCed = parseStoredCedula(reg.cedula);
    let jefeNum = reg.cedulaJefeFamilia || "";
    if (jefeNum.startsWith("V-") || jefeNum.startsWith("E-")) {
      jefeNum = jefeNum.slice(2);
    } else if (jefeNum.startsWith("V") || jefeNum.startsWith("E")) {
      jefeNum = jefeNum.slice(1);
    }
    setEditData({
      nacionalidad: parsedCed.nac,
      cedula: parsedCed.digits,
      isChildDependent: parsedCed.isChild,
      dependentNumber: parsedCed.depNum,
      nombreApellido: reg.nombreApellido,
      parroquia: reg.parroquia,
      sector: reg.sector,
      comunidad: reg.comunidad,
      direccionExacta: reg.direccionExacta,
      genero: reg.genero,
      estadoFisico: reg.estadoFisico,
      embarazo: reg.embarazo === "SI" ? "SI" : "NO",
      patologia: reg.patologia,
      patologiaIds: Array.isArray(reg.patologiaIds) ? reg.patologiaIds : [],
      telefono: reg.telefono || "",
      retirado: reg.retirado || "NO",
      retiradoRazon: reg.retiradoRazon || "",
      fechaNacimiento: formattedBirthDate,
      jefeFamilia: reg.jefeFamilia || "NO",
      perteneceNucleo: reg.perteneceNucleo || "NO",
      cedulaJefeFamilia: jefeNum,
      intermitente: reg.intermitente || "NO",
      motivoIntermitente: reg.motivoIntermitente || "",
      cuarto: reg.cuarto || "",
    });
    const initialMeds = Array.isArray(reg.medicamentoIds)
      ? reg.medicamentoIds
      : [];
    setEditMedicamentos(initialMeds);
    setOriginalMedsCount(initialMeds.length);
    lookupJefeEdit(jefeNum);
  };

  // Patologías por-ID en la edición: array de ids del catálogo.
  const addEditPatologia = (id: string) => {
    if (!id) return;
    setEditData((prev) => {
      const current: string[] = Array.isArray(prev.patologiaIds)
        ? prev.patologiaIds
        : [];
      if (current.includes(id)) return prev;
      return { ...prev, patologiaIds: [...current, id] };
    });
  };
  const removeEditPatologia = (id: string) => {
    setEditData((prev) => ({
      ...prev,
      patologiaIds: (Array.isArray(prev.patologiaIds)
        ? prev.patologiaIds
        : []
      ).filter((x: string) => x !== id),
    }));
  };

  // Medicamentos por-ID: solo desde el catálogo (id + posología editable).
  const handleSelectEditPredefinedMed = (medId: string) => {
    if (!medId) return;
    const match = predefinedMedicamentos.find((m) => m.id === medId);
    if (match && !editMedicamentos.some((x) => x.id === medId)) {
      // Nombre y dosis salen del catálogo por ID (solo lectura); dosis = concentración.
      setEditMedicamentos((prev) => [
        ...prev,
        { id: match.id, dosis: match.concentracion || "", periodo: "" },
      ]);
    }
  };

  const [editMedicamentos, setEditMedicamentos] = useState<Medicamento[]>([]);
  const removeEditMed = (i: number) =>
    setEditMedicamentos((p) => p.filter((_, idx) => idx !== i));
  const updateEditMed = (i: number, field: "dosis" | "periodo", val: string) =>
    setEditMedicamentos((p) =>
      p.map((m, idx) => (idx === i ? { ...m, [field]: val } : m)),
    );

  // Filters State for search table
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterGenero, setFilterGenero] = useState("");
  const [filterEdad, setFilterEdad] = useState("");
  const [filterEdadMin, setFilterEdadMin] = useState(""); // edad exacta mínima (rango preciso)
  const [filterEdadMax, setFilterEdadMax] = useState(""); // edad exacta máxima
  const [filterParroquia, setFilterParroquia] = useState("");
  const [filterEstadoFisico, setFilterEstadoFisico] = useState("");
  const [filterCuarto, setFilterCuarto] = useState("");
  const [filterRetirado, setFilterRetirado] = useState("NO");
  const [filterRegistrador, setFilterRegistrador] = useState(""); // operador que censó
  const [filterDesde, setFilterDesde] = useState(""); // yyyy-mm-dd (fecha de registro)
  const [filterHasta, setFilterHasta] = useState("");
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const ymdLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Navegación por notificación/aviso: si pendingSelectId está en la lista, abre su
  // detalle; si NO (Master con aviso de otro campamento, o aviso viejo sin refugio),
  // TRAE la ficha por id (con su refugio) y la abre igual → no depende de la lista,
  // así el detalle SIEMPRE se muestra aunque el campamento en vista no coincida.
  const fetchSelectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingSelectId) return;
    const match = registros.find((r) => r.id === pendingSelectId);
    if (match) { setSelectedRegistro(match); setPendingSelectId(null); fetchSelectRef.current = null; return; }
    if (fetchSelectRef.current === pendingSelectId) return; // ya se está trayendo
    fetchSelectRef.current = pendingSelectId;
    (async () => {
      try {
        const res = await apiFetch(`/api/registros/${pendingSelectId}`);
        const d = await res.json().catch(() => ({}));
        if (res.ok && d.success && d.registro) {
          if (isMaster(currentUser?.role ?? "") && d.registro.refugio) setViewRefugio(d.registro.refugio);
          setSelectedRegistro(d.registro);
        }
      } catch (e) { console.error(e); }
      finally { setPendingSelectId(null); fetchSelectRef.current = null; }
    })();
  }, [registros, pendingSelectId]);

  const filteredRegistros = useMemo(() => {
    let result = registros;

    // Apply text search
    if (registroSearch.trim()) {
      const q = normalizeText(registroSearch);
      // Si el término parece una cédula (V-55555, E-55555 o 55555), se busca por
      // sus dígitos tanto en la cédula propia como en cedulaJefeFamilia, para que
      // al buscar la cédula de un jefe aparezcan los integrantes de su núcleo.
      const qDigits = registroSearch.replace(/\D/g, "");
      const looksLikeCedula = qDigits.length >= 5;
      result = result.filter((r) => {
        if (
          normalizeText(r.nombreApellido).includes(q) ||
          normalizeText(r.cedula).includes(q) ||
          normalizeText(r.parroquia).includes(q)
        )
          return true;
        if (looksLikeCedula) {
          const ced = (r.cedula || "").replace(/\D/g, "");
          const jefe = (r.cedulaJefeFamilia || "").replace(/\D/g, "");
          return ced.includes(qDigits) || jefe.includes(qDigits);
        }
        return false;
      });
    }

    // Apply filters
    if (filterGenero) {
      result = result.filter((r) => r.genero === filterGenero);
    }
    if (filterEdad) {
      result = result.filter((r) => {
        const edad = r.edad || 0;
        if (filterEdad === "menores") return edad < 18;
        if (filterEdad === "adultos") return edad >= 18 && edad < 60;
        if (filterEdad === "mayores") return edad >= 60;
        return true;
      });
    }
    // Rango de edad EXACTO (min/max), inclusivo. Complementa al grupo de edad.
    const edadMin =
      filterEdadMin.trim() === "" ? null : parseInt(filterEdadMin, 10);
    const edadMax =
      filterEdadMax.trim() === "" ? null : parseInt(filterEdadMax, 10);
    if (edadMin !== null && !isNaN(edadMin))
      result = result.filter((r) => (r.edad ?? -1) >= edadMin);
    if (edadMax !== null && !isNaN(edadMax))
      result = result.filter((r) => (r.edad ?? Infinity) <= edadMax);
    if (filterParroquia) {
      result = result.filter((r) => r.parroquia === filterParroquia);
    }
    if (filterEstadoFisico) {
      result = result.filter((r) => r.estadoFisico === filterEstadoFisico);
    }
    if (filterCuarto) {
      result = result.filter((r) => {
        if (filterCuarto === "sin_asignar") return !r.cuarto;
        return r.cuarto === filterCuarto;
      });
    }
    if (filterRetirado) {
      result = result.filter((r) => (r.retirado || "NO") === filterRetirado);
    }
    if (filterRegistrador) {
      result = result.filter(
        (r) => (r.registrador || "").trim() === filterRegistrador,
      );
    }
    // Rango de fechas de REGISTRO (createdAt), inclusivo.
    if (filterDesde)
      result = result.filter(
        (r) => r.createdAt && ymdLocal(new Date(r.createdAt)) >= filterDesde,
      );
    if (filterHasta)
      result = result.filter(
        (r) => r.createdAt && ymdLocal(new Date(r.createdAt)) <= filterHasta,
      );

    return result;
  }, [
    registros,
    registroSearch,
    filterGenero,
    filterEdad,
    filterEdadMin,
    filterEdadMax,
    filterParroquia,
    filterEstadoFisico,
    filterCuarto,
    filterRetirado,
    filterRegistrador,
    filterDesde,
    filterHasta,
  ]);

  // Reordena la lista YA filtrada en bloques familiares: cada núcleo junto, con el
  // JEFE primero y luego los integrantes (alfabético). Las familias conservan el
  // orden de aparición (más reciente primero). Este orden se usa tanto en pantalla
  // (paginado) como en el Excel de registrados → "JEFE / INTEGRANTE / INTEGRANTE".
  const famKeyOf = (r: any) =>
    cedulaFamilia(r.jefeFamilia === "SI" ? r.cedula : r.cedulaJefeFamilia || r.cedula) ||
    r.id;
  // Iniciales para el avatar (primer + último nombre); respaldo "?".
  const initialsOf = (name: string) => {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };
  const orderedRegistros = useMemo(() => {
    const groups = new Map<string, any[]>();
    const order: string[] = [];
    filteredRegistros.forEach((r: any) => {
      const k = famKeyOf(r);
      if (!groups.has(k)) {
        groups.set(k, []);
        order.push(k);
      }
      groups.get(k)!.push(r);
    });
    const flat: any[] = [];
    order.forEach((k) => {
      groups
        .get(k)!
        .slice()
        .sort((a: any, b: any) => {
          const aj = a.jefeFamilia === "SI" ? 0 : 1;
          const bj = b.jefeFamilia === "SI" ? 0 : 1;
          if (aj !== bj) return aj - bj;
          return String(a.nombreApellido || "").localeCompare(
            String(b.nombreApellido || ""),
          );
        })
        .forEach((r) => flat.push(r));
    });
    return flat;
  }, [filteredRegistros]);

  // Lista de registradores distintos (para el filtro avanzado).
  const registradoresList = useMemo(
    () =>
      [...new Set(registros.map((r: any) => (r.registrador || "").trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [registros],
  );

  // ── Paginación (del lado CLIENTE): pagina la lista ya filtrada, sin pedir páginas al
  // servidor → búsqueda/filtros/paginación siguen 100% offline sobre todo el censo. ──
  const [regPage, setRegPage] = useState(1);
  const [regPageSize, setRegPageSize] = useState(20);
  // Volver a la página 1 al cambiar búsqueda/filtros o el tamaño de página.
  useEffect(() => {
    setRegPage(1);
  }, [
    registroSearch,
    filterGenero,
    filterEdad,
    filterEdadMin,
    filterEdadMax,
    filterParroquia,
    filterEstadoFisico,
    filterCuarto,
    filterRetirado,
    filterRegistrador,
    filterDesde,
    filterHasta,
    regPageSize,
  ]);
  // Si la lista se encoge (p. ej. tras un sync) y la página actual queda fuera, ajustar.
  useEffect(() => {
    const tp = Math.max(1, Math.ceil(filteredRegistros.length / regPageSize));
    if (regPage > tp) setRegPage(tp);
  }, [filteredRegistros.length, regPageSize, regPage]);
  const regOffset = (regPage - 1) * regPageSize;
  const pagedRegistros = useMemo(
    () => orderedRegistros.slice(regOffset, regOffset + regPageSize),
    [orderedRegistros, regOffset, regPageSize],
  );

  const roomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allCuartos.forEach((room) => {
      counts[room] = 0;
    });
    registros
      .filter((r) => r.retirado !== "SI" && r.cuarto)
      .forEach((r) => {
        if (r.cuarto && counts[r.cuarto] !== undefined) {
          counts[r.cuarto]++;
        }
      });
    return counts;
  }, [registros, allCuartos]);

  // Etiqueta de un cuarto con su semáforo de ocupación (para el searchable).
  const roomLabel = (c: string) => {
    const count = roomCounts[c] || 0;
    const cap = roomCapacities[c] ?? 18;
    const level = roomFillLevel(count, cap);
    const emoji = level === "red" ? "🔴" : level === "yellow" ? "🟡" : "🟢";
    return `${emoji} ${c} (${count}/${cap})`;
  };

  const handleAsignarCuarto = async (
    target: any = selectedRegistro,
    room: string = asignCuarto,
  ) => {
    if (!target || !room) return;
    setSavingCuarto(true);

    const updated = { ...target, cuarto: room };

    // 1. Optimistic UI update
    setRegistros((prev) => {
      const next = prev.map((r) => (r.id === updated.id ? updated : r));
      if (typeof window !== "undefined") {
        localStorage.setItem("cached_registros", JSON.stringify(next));
      }
      return next;
    });
    // Si el afectado está abierto en el modal de detalle, refléjalo también.
    if (selectedRegistro && selectedRegistro.id === updated.id)
      setSelectedRegistro(updated);

    // 2. Queue in IndexedDB in the background
    try {
      const localRec = {
        id: updated.id,
        type: "update" as const, // asignar cuarto ES una edición (no una creación)
        refugio: currentUser?.campamentoTransitorio,
        userId: currentUser?.id,
        data: {
          parroquia: updated.parroquia,
          sector: updated.sector,
          comunidad: updated.comunidad,
          direccionExacta: updated.direccionExacta,
          nombreApellido: updated.nombreApellido,
          cedula: updated.cedula,
          jefeFamilia: updated.jefeFamilia,
          genero: updated.genero,
          fechaNacimiento: updated.fechaNacimiento,
          edad: updated.edad,
          perteneceNucleo: updated.perteneceNucleo,
          cedulaJefeFamilia: updated.cedulaJefeFamilia,
          estadoFisico: updated.estadoFisico,
          patologia: updated.patologia,
          patologiaIds: Array.isArray(updated.patologiaIds)
            ? updated.patologiaIds
            : [],
          telefono: updated.telefono || undefined,
          medicamentoIds: Array.isArray(updated.medicamentoIds)
            ? updated.medicamentoIds
            : [],
          cuarto: updated.cuarto,
          retirado: updated.retirado || "NO",
          retiradoRazon: updated.retiradoRazon || undefined,
          intermitente: updated.intermitente || "NO",
          motivoIntermitente: updated.motivoIntermitente || undefined,
          refugio: updated.refugio || currentUser?.campamentoTransitorio || "",
        },
      };
      await saveLocal(localRec);
      await refreshLocalRecords();
      showToast(
        "Habitación asignada correctamente (sincronizando en segundo plano)",
        "success",
      );
      if (navigator.onLine) {
        triggerSync();
      }
    } catch (e) {
      console.error(e);
      showToast("Error al procesar en segundo plano", "error");
    } finally {
      setSavingCuarto(false);
    }
  };

  // Validación del formulario de EDICIÓN (espeja las reglas del censo). Antes NO se
  // validaba nada salvo el duplicado → se podía guardar un registro roto que luego
  // fallaba en silencio al sincronizar (400 → error permanente). Devuelve el mapa de
  // errores por campo (vacío = válido).
  const validateEdit = (): Record<string, string> => {
    const e: Record<string, string> = {};
    const s = (v: any) => (v == null ? "" : String(v));
    const cedDigits = s(editData.cedula).replace(/\D/g, "");
    if (!cedDigits) e.cedula = editData.isChildDependent ? "La cédula del representante es obligatoria" : "La cédula es obligatoria";
    else if (cedDigits.length < 5) e.cedula = "La cédula debe tener al menos 5 dígitos";
    const nombre = s(editData.nombreApellido).trim();
    if (!nombre) e.nombreApellido = "El nombre y apellido son obligatorios";
    else if (nombre.split(/\s+/).length < 2) e.nombreApellido = "Ingrese al menos un nombre y un apellido";
    if (!editData.genero) e.genero = "Seleccione el género";
    const fnac = s(editData.fechaNacimiento);
    if (!fnac) e.fechaNacimiento = "La fecha de nacimiento es obligatoria";
    else {
      const dp = fnac.split("/");
      if (dp.length !== 3 || fnac.length < 10) e.fechaNacimiento = "Complete el formato DD/MM/AAAA";
      else {
        const d = parseInt(dp[0], 10), m = parseInt(dp[1], 10), y = parseInt(dp[2], 10);
        const cy = new Date().getFullYear();
        if (isNaN(d) || isNaN(m) || isNaN(y) || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > cy)
          e.fechaNacimiento = "Fecha inválida (use días 01-31, meses 01-12)";
      }
    }
    if (!s(editData.parroquia).trim()) e.parroquia = "La parroquia es obligatoria";
    if (!s(editData.sector).trim()) e.sector = "El sector es obligatorio";
    if (!s(editData.comunidad).trim()) e.comunidad = "La comunidad es obligatoria";
    if (!s(editData.direccionExacta).trim()) e.direccionExacta = "La dirección exacta es obligatoria";
    if (!s(editData.telefono).trim()) e.telefono = "El teléfono es obligatorio";
    else if (s(editData.telefono).replace(/\D/g, "").length < 7) e.telefono = "El teléfono debe tener al menos 7 dígitos";
    if (!editData.estadoFisico) e.estadoFisico = "Seleccione el estado físico";
    if (!editData.patologia) e.patologia = "Seleccione si posee patología";
    if (editData.patologia === "SI" && !(Array.isArray(editData.patologiaIds) && editData.patologiaIds.length > 0))
      e.patologiaIds = "Seleccione al menos una patología";
    if (editData.perteneceNucleo === "SI" && editData.jefeFamilia === "NO") {
      const j = s(editData.cedulaJefeFamilia).replace(/\D/g, "");
      if (!j) e.cedulaJefeFamilia = "La cédula del jefe de familia es obligatoria";
      else if (j.length < 5) e.cedulaJefeFamilia = "La cédula debe tener al menos 5 dígitos";
    }
    if (editData.intermitente === "SI" && !s(editData.motivoIntermitente).trim())
      e.motivoIntermitente = "El motivo es obligatorio para residentes intermitentes";
    return e;
  };

  const handleSaveEdit = async () => {
    if (!selectedRegistro) return;

    // Valida ANTES de guardar (bloquea el guardado de un registro incompleto/roto).
    const editErrs = validateEdit();
    setEditErrors(editErrs);
    if (Object.keys(editErrs).length > 0) {
      const msgs = Object.values(editErrs);
      showToast(
        msgs.length > 1 ? `${msgs[0]}  (y ${msgs.length - 1} campo(s) más marcados)` : msgs[0],
        "warning",
      );
      setTimeout(() => {
        const el = document.querySelector(".modal-overlay .has-error");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    setSavingEdit(true);

    const nac =
      editData.nacionalidad ||
      (selectedRegistro.cedula.startsWith("E-") ? "E" : "V");
    const cleanCedNum =
      (editData.cedula != null ? String(editData.cedula) : "").replace(
        /\D/g,
        "",
      ) || parseStoredCedula(selectedRegistro.cedula).digits;
    // Si es hijo/dependiente, la cédula final lleva el sufijo del correlativo (no es la
    // del representante). Así el chequeo de duplicado compara CON sufijo y no lo cruza
    // con el padre.
    const finalCedula = editData.isChildDependent
      ? `${nac}-${cleanCedNum}-${editData.dependentNumber || "1"}`
      : `${nac}-${cleanCedNum}`;

    // Guard (front): no permitir editar a una cédula que YA pertenece a OTRO afectado
    // activo (no retirado). El backend lo valida también.
    const dupOtro = registros.find(
      (r) =>
        r.id !== selectedRegistro.id &&
        r.retirado !== "SI" &&
        (r.cedula || "").toUpperCase().trim() === finalCedula.toUpperCase(),
    );
    if (dupOtro) {
      showToast(
        `Esa cédula ya pertenece a otro afectado registrado: ${dupOtro.nombreApellido}.`,
        "error",
      );
      setSavingEdit(false);
      return;
    }

    const rawJefeCed = editData.cedulaJefeFamilia
      ? String(editData.cedulaJefeFamilia).trim().toUpperCase()
      : selectedRegistro.cedulaJefeFamilia || "";
    const finalJefeCedula = rawJefeCed
      ? rawJefeCed.startsWith("V-") || rawJefeCed.startsWith("E-")
        ? rawJefeCed
        : `V-${rawJefeCed}`
      : null;

    let finalFechaNac = selectedRegistro.fechaNacimiento;
    let finalEdad = selectedRegistro.edad;

    if (editData.fechaNacimiento) {
      const dateParts = editData.fechaNacimiento.split("/");
      if (dateParts.length === 3) {
        const d = parseInt(dateParts[0], 10);
        const m = parseInt(dateParts[1], 10);
        const y = parseInt(dateParts[2], 10);
        const tempDate = new Date(y, m - 1, d);
        if (!isNaN(tempDate.getTime())) {
          finalFechaNac = tempDate.toISOString();

          // Calculate age
          const today = new Date();
          let calculatedAge = today.getFullYear() - tempDate.getFullYear();
          const monthDiff = today.getMonth() - tempDate.getMonth();
          if (
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < tempDate.getDate())
          ) {
            calculatedAge--;
          }
          finalEdad = calculatedAge >= 0 ? calculatedAge : 0;
        }
      }
    }

    const updated = {
      ...selectedRegistro,
      ...editData,
      fechaNacimiento: finalFechaNac,
      edad: finalEdad,
      cedula: finalCedula,
      cedulaJefeFamilia: finalJefeCedula,
      medicamentoIds: editMedicamentos,
    };

    // 1. Optimistic UI update
    setRegistros((prev) => {
      const next = prev.map((r) => (r.id === updated.id ? updated : r));
      if (typeof window !== "undefined") {
        localStorage.setItem("cached_registros", JSON.stringify(next));
      }
      return next;
    });
    setSelectedRegistro(updated);
    setEditMode(false);
    setEditErrors({});

    // 2. Queue in IndexedDB in the background
    try {
      const localRec = {
        id: updated.id,
        type: "update" as const,
        refugio: currentUser?.campamentoTransitorio,
        userId: currentUser?.id,
        data: {
          parroquia: updated.parroquia,
          sector: updated.sector,
          comunidad: updated.comunidad,
          direccionExacta: updated.direccionExacta,
          nombreApellido: updated.nombreApellido.toUpperCase().trim(),
          cedula: updated.cedula,
          jefeFamilia: updated.jefeFamilia,
          genero: updated.genero,
          fechaNacimiento: updated.fechaNacimiento,
          edad: parseInt(String(updated.edad), 10),
          perteneceNucleo: updated.perteneceNucleo,
          cedulaJefeFamilia: updated.cedulaJefeFamilia || undefined,
          estadoFisico: updated.estadoFisico,
          embarazo:
            updated.genero === "FEMENINO"
              ? updated.embarazo === "SI"
                ? "SI"
                : "NO"
              : "NO",
          patologia: updated.patologia,
          patologiaIds:
            updated.patologia === "SI"
              ? Array.isArray(updated.patologiaIds)
                ? updated.patologiaIds
                : []
              : [],
          telefono: updated.telefono || undefined,
          medicamentoIds: Array.isArray(updated.medicamentoIds)
            ? updated.medicamentoIds
            : [],
          cuarto: updated.cuarto || undefined,
          retirado: updated.retirado || "NO",
          retiradoRazon:
            updated.retirado === "SI" ? updated.retiradoRazon : undefined,
          intermitente: updated.intermitente || "NO",
          motivoIntermitente:
            updated.intermitente === "SI"
              ? updated.motivoIntermitente
              : undefined,
          refugio: updated.refugio || currentUser?.campamentoTransitorio || "",
        },
      };
      await saveLocal(localRec);
      await refreshLocalRecords();
      showToast(
        "Registro guardado (sincronizando en segundo plano)",
        "success",
      );
      if (navigator.onLine) {
        triggerSync();
      }
    } catch (e) {
      console.error(e);
      showToast("Error al guardar cambios locales", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const closeModal = () => {
    setModalClosing(true);
    setTimeout(() => {
      setSelectedRegistro(null);
      setEditMode(false);
      setModalClosing(false);
      setJefeEditLookup(null);
    }, 200);
  };

  const handleDeleteRegistro = async (id: string) => {
    try {
      const res = await apiFetch(`/api/registros/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRegistros((prev) => {
          const next = prev.filter((r) => r.id !== id);
          if (typeof window !== "undefined") {
            localStorage.setItem("cached_registros", JSON.stringify(next));
          }
          return next;
        });
        closeModal();
        showToast("Registro eliminado correctamente", "success");
      } else {
        const errData = await res.json();
        showToast("Error al eliminar: " + (errData.error || ""), "error");
      }
    } catch {
      showToast("Error de conexión", "error");
    }
  };

  // Exporta a un XLSX con membrete/colores lo que se ve (registros FILTRADOS): si hay
  // filtros/búsqueda aplicados, solo esos; si no, todos.
  const handleExportExcel = async () => {
    if (filteredRegistros.length === 0) {
      showToast(
        "No hay registros (con los filtros actuales) para exportar.",
        "warning",
      );
      return;
    }
    setExportingXlsx(true);
    try {
      // Resumen legible de los filtros activos (para el membrete del Excel).
      const dmy = (s: string) => s.split("-").reverse().join("/");
      const edadLbl: Record<string, string> = {
        menores: "Menores de 18",
        adultos: "Adultos (18–59)",
        mayores: "Adultos mayores (60+)",
      };
      const filtrosParts: string[] = [];
      if (registroSearch.trim())
        filtrosParts.push(`Búsqueda "${registroSearch.trim()}"`);
      if (filterGenero)
        filtrosParts.push(
          `Género: ${filterGenero === "FEMENINO" ? "Femenino" : "Masculino"}`,
        );
      if (filterEdad) filtrosParts.push(edadLbl[filterEdad] || filterEdad);
      if (filterEdadMin && filterEdadMax)
        filtrosParts.push(`Edad ${filterEdadMin}–${filterEdadMax} años`);
      else if (filterEdadMin) filtrosParts.push(`Edad ≥ ${filterEdadMin} años`);
      else if (filterEdadMax) filtrosParts.push(`Edad ≤ ${filterEdadMax} años`);
      if (filterParroquia) filtrosParts.push(`Parroquia: ${filterParroquia}`);
      if (filterEstadoFisico)
        filtrosParts.push(
          `Estado: ${filterEstadoFisico === "LESIONADO" ? "Lesionado" : "Ileso"}`,
        );
      if (filterCuarto)
        filtrosParts.push(
          `Habitación: ${filterCuarto === "sin_asignar" ? "Sin asignar" : formatRoomLabel(filterCuarto)}`,
        );
      // "NO" (solo presentes) es el valor por defecto; solo se menciona si cambió.
      if (filterRetirado === "SI")
        filtrosParts.push("Estatus: Egresados / Retirados");
      else if (filterRetirado === "")
        filtrosParts.push("Estatus: Todos (presentes y egresados)");
      if (filterRegistrador) filtrosParts.push(`Registrador: ${filterRegistrador}`);
      if (filterDesde) filtrosParts.push(`Desde ${dmy(filterDesde)}`);
      if (filterHasta) filtrosParts.push(`Hasta ${dmy(filterHasta)}`);
      await exportRegistrosExcel({
        registros: orderedRegistros,
        patologias,
        predefinedMedicamentos,
        refugio: effectiveRefugio || currentUser?.campamentoTransitorio || "",
        generadoEn: new Date().toLocaleString("es-VE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        filtros: filtrosParts.join("   ·   "),
      });
      showToast("Excel descargado.", "success");
      logActivity({
        accion: "EXPORT",
        recurso: "Registrados",
        formato: "Excel",
        refugio:
          effectiveRefugio || currentUser?.campamentoTransitorio || undefined,
        filtros: filtrosParts.join("   ·   ") || undefined,
        total: filteredRegistros.length,
      });
      setShowExportModal(false);
    } catch (e) {
      console.error(e);
      showToast("No se pudo generar el Excel.", "error");
    } finally {
      setExportingXlsx(false);
    }
  };

  // Agrupa los registros PRESENTES por núcleo familiar (IGNORA los filtros de la
  // UI). Cada grupo se ordena con el jefe primero. Devuelve familias (2+ personas)
  // e individuos solos (grupos de 1).
  const buildFamilyGroups = () => {
    const presentes = registros.filter((r: any) => r.retirado !== "SI");
    const familyId = (r: any) =>
      cedulaFamilia(r.jefeFamilia === "SI" ? r.cedula : (r.cedulaJefeFamilia || r.cedula));
    const groups = new Map<string, any[]>();
    presentes.forEach((r: any) => {
      const k = familyId(r) || r.id;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    });
    const ordered = [...groups.values()].map((g) =>
      g.slice().sort((a: any, b: any) => {
        const aj = a.jefeFamilia === "SI" ? 0 : 1;
        const bj = b.jefeFamilia === "SI" ? 0 : 1;
        if (aj !== bj) return aj - bj;
        return String(a.nombreApellido || "").localeCompare(
          String(b.nombreApellido || ""),
        );
      }),
    );
    return {
      familias: ordered.filter((g) => g.length >= 2),
      individuos: ordered.filter((g) => g.length === 1).flat(),
    };
  };

  const generadoEnStr = () =>
    new Date().toLocaleString("es-VE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const refugioActual = () =>
    effectiveRefugio || currentUser?.campamentoTransitorio || "";

  // Excel de FAMILIAS (jefe + integrantes agrupados y coloreados). Sin filtros.
  const handleExportFamilias = async () => {
    const { familias } = buildFamilyGroups();
    if (familias.length === 0) {
      showToast(
        "No hay núcleos familiares (2+ integrantes) para exportar.",
        "info",
      );
      return;
    }
    setExportingXlsx(true);
    try {
      const totalPersonas = familias.reduce((s, g) => s + g.length, 0);
      await exportFamiliasExcel({
        familias,
        refugio: refugioActual(),
        generadoEn: generadoEnStr(),
        totalPersonas,
      });
      showToast("Excel de familias descargado.", "success");
      logActivity({
        accion: "EXPORT",
        recurso: "Núcleos Familiares",
        formato: "Excel",
        refugio: refugioActual() || undefined,
        filtros: "Sin filtros — familias presentes",
        total: totalPersonas,
      });
      setShowExportModal(false);
    } catch (e) {
      console.error(e);
      showToast("No se pudo generar el Excel de familias.", "error");
    } finally {
      setExportingXlsx(false);
    }
  };

  // Excel de INDIVIDUOS SOLOS (sin núcleo). Sin filtros. Reusa el formato general.
  const handleExportIndividuos = async () => {
    const { individuos } = buildFamilyGroups();
    if (individuos.length === 0) {
      showToast("No hay individuos solos para exportar.", "info");
      return;
    }
    setExportingXlsx(true);
    try {
      await exportRegistrosExcel({
        registros: individuos,
        patologias,
        predefinedMedicamentos,
        refugio: refugioActual(),
        generadoEn: generadoEnStr(),
        filtros: "Individuos solos (sin núcleo familiar) — presentes",
      });
      showToast("Excel de individuos solos descargado.", "success");
      logActivity({
        accion: "EXPORT",
        recurso: "Individuos Solos",
        formato: "Excel",
        refugio: refugioActual() || undefined,
        filtros: "Sin filtros — individuos solos presentes",
        total: individuos.length,
      });
      setShowExportModal(false);
    } catch (e) {
      console.error(e);
      showToast("No se pudo generar el Excel de individuos.", "error");
    } finally {
      setExportingXlsx(false);
    }
  };

  const handlePrintPDFList = () => {
    const present = registros.filter((r) => r.retirado !== "SI");
    if (present.length === 0) {
      showToast(
        "No hay registros de personas presentes para imprimir",
        "warning",
      );
      return;
    }
    logActivity({
      accion: "PRINT",
      recurso: "Registrados (presentes)",
      formato: "PDF",
      refugio:
        effectiveRefugio || currentUser?.campamentoTransitorio || undefined,
      total: present.length,
    });

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showToast(
        "Por favor permita las ventanas emergentes para imprimir",
        "error",
      );
      return;
    }

    const campamentoActivo =
      effectiveRefugio || currentUser?.campamentoTransitorio || "";

    const sorted = [...present].sort((a, b) => {
      const roomA = a.cuarto || "ZZZ";
      const roomB = b.cuarto || "ZZZ";
      return (
        roomA.localeCompare(roomB) ||
        a.nombreApellido.localeCompare(b.nombreApellido)
      );
    });

    // Un solo nombre + un solo apellido para ahorrar espacio (la cédula identifica
    // de forma única). Heurística venezolana: [N1 N2 A1 A2] -> N1 A1; [N1 A1 A2] -> N1 A1.
    const shortName = (full: string) => {
      const p = (full || "").trim().split(/\s+/);
      if (p.length >= 4) return `${p[0]} ${p[2]}`;
      if (p.length === 3) return `${p[0]} ${p[1]}`;
      return p.slice(0, 2).join(" ");
    };

    const rowsHtml = sorted
      .map(
        (r, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${shortName(r.nombreApellido)}</td>
        <td>${r.cedula}</td>
        <td class="c">${r.edad}</td>
        <td>${r.cuarto || '<span style="color:#999">Sin asignar</span>'}</td>
      </tr>
    `,
      )
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Listado de Personas Presentes - Campamentos Transitorios 2026</title>
        <style>
          @page { size: A4 portrait; margin: 8mm 10mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; margin: 0; color: #222; }
          .header {
            display: flex; align-items: center; justify-content: space-between;
            border-bottom: 2px solid #1e3a8a; padding-bottom: 6px; margin-bottom: 8px;
          }
          .logo { height: 40px; object-fit: contain; }
          .title-container { text-align: right; }
          h1 { font-size: 15px; margin: 0; color: #1e3a8a; letter-spacing: .02em; }
          h2 { font-size: 10px; margin: 2px 0 0 0; color: #666; font-weight: normal; }
          .meta { font-size: 10px; color: #555; margin: 0 0 6px 0; }
          table { width: 100%; border-collapse: collapse; }
          th, td {
            border: 1px solid #ccc; padding: 2px 5px; text-align: left;
            font-size: 10px; line-height: 1.25;
          }
          td.c, th.c { text-align: center; }
          th { background: #eef1f6; color: #1e3a8a; font-weight: bold; }
          tr:nth-child(even) td { background: #f7f8fa; }
          /* Repetir la cabecera en cada página y no cortar filas al paginar */
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
          .footer {
            margin-top: 10px; font-size: 8px; text-align: center; color: #888;
            border-top: 1px solid #ddd; padding-top: 4px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img class="logo" src="/logo_gob.webp" alt="Gobernación La Guaira">
          <div class="title-container">
            <h1>LISTADO DE PERSONAS PRESENTES</h1>
            <h2>${campamentoActivo || "Campamento Transitorio"}</h2>
            <p style="margin:2px 0 0;font-size:9px;color:#666;font-weight:600;letter-spacing:.02em;">Campamento Transitorio &middot; La Guaira 2026</p>
          </div>
        </div>
        <p class="meta">
          <strong>Total Presentes:</strong> ${present.length} &nbsp;&middot;&nbsp;
          <strong>Generado:</strong> ${new Date().toLocaleString("es-VE")}
        </p>
        <table>
          <thead>
            <tr>
              <th class="c" style="width:26px">#</th>
              <th>Nombre y Apellido</th>
              <th style="width:78px">Cédula</th>
              <th class="c" style="width:34px">Edad</th>
              <th style="width:150px">Habitación / Salón</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="footer">
          Gobernación del Estado La Guaira &middot; Campamentos Transitorios &middot; La Guaira 2026 &middot; Impresión Oficial
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const mExport = useAnimatedModal(showExportModal); // animación de salida del modal de Excel

  // Guarda de tipos: este tab solo se monta autenticado (activeTab === "asignaciones").
  if (!currentUser) return null;

  return (
    <>
      <div className="tab-view tab-enter">
        <div className="dashboard-section">
          <div
            className="asign-header"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}
            >
              <div className="dashboard-section-title">
                Registro de Afectados
              </div>
              {!loadingRegistros && (
                <span
                  className="asign-count"
                  style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}
                >
                  {filteredRegistros.length} de {registros.length}
                </span>
              )}
            </div>
            {/* Exportar: disponible para todos los roles (un Visualizador solo ve y exporta).
                Botonera AGRUPADA (regla de tema visual): grupo segmentado. */}
            {
              <div className="btn-seg-group">
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => setShowExportModal(true)}
                  disabled={exportingXlsx}
                  title="Descargar Excel"
                >
                  {exportingXlsx ? (
                    <span className="spinner spinner-sm" />
                  ) : (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <polyline points="9 15 12 18 15 15" />
                    </svg>
                  )}
                  <span className="btn-txt-collapsible">Excel</span>
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={handlePrintPDFList}
                  title="Imprimir PDF de presentes"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  <span className="btn-txt-collapsible">Imprimir PDF</span>
                </button>
              </div>
            }
          </div>

          <div className="asign-search-wrap" style={{ marginBottom: "0.5rem" }}>
            <input
              type="text"
              placeholder="Buscar por nombre, cédula o parroquia..."
              value={registroSearch}
              onChange={(e) => setRegistroSearch(e.target.value)}
            />
            {registroSearch && (
              <button
                className="asign-search-clear"
                onClick={() => setRegistroSearch("")}
                aria-label="Limpiar búsqueda"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          <div
            className="toolbar-row"
            style={{ marginTop: "0.5rem", marginBottom: "1rem" }}
          >
            <button
              type="button"
              className={`toolbar-btn${filtersOpen ? " is-active" : ""}`}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {filtersOpen ? "Ocultar Filtros" : "Filtros Avanzados"}
            </button>

            {(filterGenero ||
              filterEdad ||
              filterEdadMin ||
              filterEdadMax ||
              filterParroquia ||
              filterEstadoFisico ||
              filterCuarto ||
              filterRetirado !== "NO" ||
              filterRegistrador ||
              filterDesde ||
              filterHasta) && (
              <button
                type="button"
                className="toolbar-btn toolbar-btn--danger"
                onClick={() => {
                  setFilterGenero("");
                  setFilterEdad("");
                  setFilterEdadMin("");
                  setFilterEdadMax("");
                  setFilterParroquia("");
                  setFilterEstadoFisico("");
                  setFilterCuarto("");
                  setFilterRetirado("NO");
                  setFilterRegistrador("");
                  setFilterDesde("");
                  setFilterHasta("");
                }}
              >
                Limpiar Filtros
              </button>
            )}
          </div>

          {filtersOpen && (
            <div className="reg-filters-panel pill-form">
              <div className="form-group">
                <label>Género</label>
                <StyledSelect
                  value={filterGenero}
                  onChange={setFilterGenero}
                  ariaLabel="Género"
                  options={[
                    { value: "", label: "Todos" },
                    { value: "MASCULINO", label: "Masculino" },
                    { value: "FEMENINO", label: "Femenino" },
                  ]}
                />
              </div>

              <div className="form-group">
                <label>Grupo de Edad</label>
                <StyledSelect
                  value={filterEdad}
                  onChange={setFilterEdad}
                  ariaLabel="Grupo de Edad"
                  options={[
                    { value: "", label: "Todos" },
                    { value: "menores", label: "Menores de edad (<18)" },
                    { value: "adultos", label: "Adultos (18-59)" },
                    { value: "mayores", label: "Adultos mayores (60+)" },
                  ]}
                />
              </div>

              <div className="form-group">
                <label>Edad mínima</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  inputMode="numeric"
                  placeholder="Ej. 5"
                  value={filterEdadMin}
                  onChange={(e) =>
                    setFilterEdadMin(
                      e.target.value.replace(/\D/g, "").slice(0, 3),
                    )
                  }
                  aria-label="Edad mínima"
                />
              </div>

              <div className="form-group">
                <label>Edad máxima</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  inputMode="numeric"
                  placeholder="Ej. 12"
                  value={filterEdadMax}
                  onChange={(e) =>
                    setFilterEdadMax(
                      e.target.value.replace(/\D/g, "").slice(0, 3),
                    )
                  }
                  aria-label="Edad máxima"
                />
              </div>

              <div className="form-group">
                <label>Parroquia</label>
                <StyledSelect
                  value={filterParroquia}
                  onChange={setFilterParroquia}
                  ariaLabel="Parroquia"
                  options={[
                    { value: "", label: "Todas" },
                    ...PARROQUIAS.map((p) => ({ value: p, label: p })),
                  ]}
                />
              </div>

              <div className="form-group">
                <label>Estado Físico</label>
                <StyledSelect
                  value={filterEstadoFisico}
                  onChange={setFilterEstadoFisico}
                  ariaLabel="Estado Físico"
                  options={[
                    { value: "", label: "Todos" },
                    { value: "ILESO", label: "Ileso" },
                    { value: "LESIONADO", label: "Lesionado" },
                  ]}
                />
              </div>

              <div className="form-group">
                <label>Habitación / Salón</label>
                <StyledSelect
                  value={filterCuarto}
                  onChange={setFilterCuarto}
                  ariaLabel="Habitación / Salón"
                  options={[
                    { value: "", label: "Todos" },
                    { value: "sin_asignar", label: "Sin asignar" },
                    ...allCuartos.map((c) => ({
                      value: c,
                      label: formatRoomLabel(c),
                    })),
                  ]}
                />
              </div>

              <div className="form-group">
                <label>Estatus de Permanencia</label>
                <StyledSelect
                  value={filterRetirado}
                  onChange={setFilterRetirado}
                  ariaLabel="Estatus de Permanencia"
                  options={[
                    { value: "", label: "Todos (Presentes y Egresados)" },
                    { value: "NO", label: "Presentes actualmente" },
                    { value: "SI", label: "Egresados / Retirados" },
                  ]}
                />
              </div>

              <div className="form-group">
                <label>Registrador (quién censó)</label>
                <StyledSelect
                  value={filterRegistrador}
                  onChange={setFilterRegistrador}
                  ariaLabel="Registrador"
                  options={[
                    { value: "", label: "Todos" },
                    ...registradoresList.map((n) => ({ value: n, label: n })),
                  ]}
                />
              </div>

              <div className="form-group">
                <label>Registrados desde</label>
                <DatePicker
                  value={filterDesde}
                  onChange={setFilterDesde}
                  placeholder="Desde…"
                  defaultToday
                />
              </div>
              <div className="form-group">
                <label>Registrados hasta</label>
                <DatePicker
                  value={filterHasta}
                  onChange={setFilterHasta}
                  placeholder="Hasta…"
                  defaultToday
                />
              </div>
            </div>
          )}

          {loadingRegistros ? (
            <div className="registro-table-wrapper">
              <table className="registro-table">
                <thead>
                  <tr>
                    <th className="col-num">#</th>
                    <th>Persona</th>
                    <th className="col-ubicacion">Ubicación</th>
                    <th>Estatus</th>
                    <th className="col-registrador">Registrador</th>
                    <th className="col-action"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...Array(6)].map((_, i) => (
                    <tr key={i} style={{ animationDelay: `${i * 60}ms` }}>
                      <td className="col-num">
                        <span
                          className="skeleton-cell"
                          style={{ width: "18px", margin: "0 auto" }}
                        />
                      </td>
                      <td className="col-persona">
                        <div className="person-cell">
                          <span
                            className="skeleton-cell"
                            style={{
                              width: "38px",
                              height: "38px",
                              borderRadius: "50%",
                              flexShrink: 0,
                            }}
                          />
                          <div
                            className="person-info"
                            style={{ gap: "7px", flex: 1 }}
                          >
                            <span
                              className="skeleton-cell"
                              style={{ width: `${50 + (i % 4) * 12}%` }}
                            />
                            <span
                              className="skeleton-cell"
                              style={{ width: "95px", height: "9px" }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="col-ubicacion">
                        <span
                          className="skeleton-cell skeleton-cell--pill"
                          style={{ width: "120px" }}
                        />
                      </td>
                      <td>
                        <span
                          className="skeleton-cell skeleton-cell--pill"
                          style={{ width: "58px" }}
                        />
                      </td>
                      <td className="col-registrador">
                        <span
                          className="skeleton-cell"
                          style={{ width: "82px" }}
                        />
                      </td>
                      <td className="col-action">
                        <span className="skeleton-cell skeleton-cell--icon" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : registros.length === 0 ? (
            <div className="reg-empty-state">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <p>No hay afectados registrados</p>
              <span>Los registros aparecerán aquí una vez sincronizados</span>
            </div>
          ) : filteredRegistros.length === 0 ? (
            <div className="reg-empty-state">
              <svg
                width="44"
                height="44"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p>Sin resultados</p>
              <span>
                Ningún registro coincide con &ldquo;
                {registroSearch || "los filtros aplicados"}&rdquo;
              </span>
            </div>
          ) : (
            <div className="registro-table-wrapper">
              <table className="registro-table">
                <thead>
                  <tr>
                    <th className="col-num">#</th>
                    <th>Persona</th>
                    <th className="col-ubicacion">Ubicación</th>
                    <th>Estatus</th>
                    <th className="col-registrador">Registrador</th>
                    <th className="col-action"></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRegistros.map((reg, i) => {
                    const esJefe = reg.jefeFamilia === "SI";
                    const prev = i > 0 ? pagedRegistros[i - 1] : null;
                    const famStart =
                      !!prev && famKeyOf(prev) !== famKeyOf(reg);
                    const origen = [reg.parroquia, reg.comunidad || reg.sector]
                      .map((s) => (s || "").trim())
                      .filter(Boolean)
                      .join(" · ");
                    return (
                    <tr
                      key={reg.id}
                      className={`reg-row-enter${famStart ? " reg-fam-start" : ""}`}
                      style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
                    >
                      <td className="col-num">{regOffset + i + 1}</td>

                      {/* PERSONA: avatar + nombre + rol · cédula · teléfono */}
                      <td className="col-persona" data-label="Persona">
                        <div className="person-cell">
                          <span
                            className={`person-avatar${esJefe ? " person-avatar--jefe" : ""}`}
                            aria-hidden="true"
                          >
                            {initialsOf(reg.nombreApellido)}
                          </span>
                          <div className="person-info">
                            <div className="person-top">
                              <span className="person-name">
                                {reg.nombreApellido}
                              </span>
                              <span
                                className={`role-badge ${esJefe ? "role-badge--jefe" : "role-badge--integ"}`}
                              >
                                {esJefe ? "Jefe" : "Integrante"}
                              </span>
                            </div>
                            <div className="person-sub">
                              <span className="person-cedula">
                                {reg.cedula}
                              </span>
                              {reg.telefono && (
                                <span className="person-phone">
                                  · {reg.telefono}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* UBICACIÓN: asignación (cuarto/carpa) + origen */}
                      <td className="col-ubicacion" data-label="Ubicación">
                        <div className="ubic-cell">
                          {reg.cuarto ? (
                            <span
                              className="cuarto-badge cuarto-badge--assigned"
                              data-tip={reg.cuarto}
                            >
                              <span className="cuarto-badge__txt">
                                {reg.cuarto}
                              </span>
                            </span>
                          ) : (
                            <span className="cuarto-badge cuarto-badge--none">
                              Sin asignar
                            </span>
                          )}
                          {origen && (
                            <span className="ubic-origin" title={origen}>
                              {origen}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* ESTATUS: pills */}
                      <td className="col-estado" data-label="Estatus">
                        <div className="estado-stack">
                          <span
                            className={`estado-pill ${reg.estadoFisico === "LESIONADO" ? "estado-pill--danger" : "estado-pill--ok"}`}
                          >
                            {reg.estadoFisico}
                          </span>
                          {reg.retirado === "SI" && (
                            <span className="estado-pill estado-pill--retirado">
                              RETIRADO
                            </span>
                          )}
                          {reg.intermitente === "SI" && (
                            <span className="estado-pill estado-pill--intermitente">
                              INTERMITENTE
                            </span>
                          )}
                        </div>
                      </td>

                      {/* REGISTRADOR (quién censó) */}
                      <td className="col-registrador" data-label="Registrador">
                        {reg.registrador ? (
                          <span className="registrador-chip">
                            <span
                              className="registrador-avatar"
                              aria-hidden="true"
                            >
                              {initialsOf(reg.registrador)}
                            </span>
                            <span className="registrador-name">
                              {reg.registrador}
                            </span>
                          </span>
                        ) : (
                          <span className="registrador-none">—</span>
                        )}
                      </td>
                      <td className="col-action">
                        <div className="row-actions">
                          {canRegister(currentUser.role) && (
                            <button
                              className="btn-ver btn-ver--room"
                              aria-label="Asignar habitación"
                              data-tip="Habitación"
                              onClick={() => openAssignRoom(reg)}
                            >
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                <polyline points="9 22 9 12 15 12 15 22" />
                              </svg>
                              <span className="btn-ver__txt">Habitación</span>
                            </button>
                          )}
                          <button
                            className="btn-ver btn-ver--view"
                            aria-label="Ver detalles"
                            data-tip="Ver"
                            onClick={() => {
                              setSelectedRegistro(reg);
                              setAsignCuarto(reg.cuarto || "");
                              setEditMode(false);
                              setEditData({});
                            }}
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            <span className="btn-ver__txt">Ver</span>
                          </button>
                          {canRegister(currentUser.role) && (
                            <button
                              className="btn-ver btn-ver--edit"
                              aria-label="Editar registro"
                              data-tip="Editar"
                              onClick={() => enterEditMode(reg)}
                            >
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                              <span className="btn-ver__txt">Editar</span>
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
          {filteredRegistros.length > 0 && (
            <Pagination
              total={filteredRegistros.length}
              page={regPage}
              pageSize={regPageSize}
              onPageChange={setRegPage}
              onPageSizeChange={setRegPageSize}
              itemLabel="registros"
            />
          )}
        </div>
      </div>

      {/* Registro Detail & Edit & Asignación Modal */}
      {selectedRegistro && (
        <div
          className={`modal-overlay${modalClosing ? " modal-overlay--closing" : ""}`}
          onClick={closeModal}
        >
          <div
            className={`modal-content modal-content--detail pill-form${modalClosing ? " modal-content--closing" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="modal-header">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  minWidth: 0,
                }}
              >
                {!editMode && (
                  <div className="modal-avatar">
                    {selectedRegistro.nombreApellido
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w: string) => w[0] || "")
                      .join("")
                      .toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <span className="modal-title">
                    {editMode
                      ? "Editar Registro"
                      : selectedRegistro.nombreApellido}
                  </span>
                  <div className="modal-subtitle">
                    <span>C.I. {selectedRegistro.cedula}</span>
                    {!editMode && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          color:
                            selectedRegistro.estadoFisico === "LESIONADO"
                              ? "var(--color-danger)"
                              : "var(--color-success)",
                        }}
                      >
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor:
                              selectedRegistro.estadoFisico === "LESIONADO"
                                ? "var(--color-danger)"
                                : "var(--color-success)",
                            display: "inline-block",
                          }}
                        ></span>
                        {selectedRegistro.estadoFisico}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={closeModal}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* ── VISTA DETALLE ── */}
            {!editMode && (
              <>
                <div className="detail-grid">
                  {/* Identificación */}
                  <div className="detail-section-title">Identificación</div>
                  <div className="detail-field detail-field--full">
                    <span className="detail-label">Nombre y Apellido</span>
                    <span className="detail-value">
                      {selectedRegistro.nombreApellido}
                    </span>
                  </div>
                  {/* Representante (informativo, NO se persiste): si el registro es un
                      hijo/dependiente (cédula con sufijo), se muestra a quién representa.
                      Va junto a la identidad (bajo la cédula del registro), no en el
                      grupo familiar. */}
                  {parseStoredCedula(selectedRegistro.cedula).isChild && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label">Representante</span>
                      {(() => {
                        const rep = findRepresentante(
                          parseStoredCedula(selectedRegistro.cedula).digits,
                          registros,
                          selectedRegistro.id,
                        );
                        return rep ? (
                          <span className="detail-hint detail-hint--ok">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                              <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            {rep}
                          </span>
                        ) : (
                          <span className="detail-hint detail-hint--warn">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            Representante no registrado en el censo
                          </span>
                        );
                      })()}
                    </div>
                  )}
                  <div className="detail-field">
                    <span className="detail-label">Edad</span>
                    <span className="detail-value">
                      {selectedRegistro.edad} años
                    </span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Género</span>
                    <span className="detail-value">
                      {selectedRegistro.genero}
                    </span>
                  </div>

                  {/* Grupo Familiar */}
                  <div className="detail-section-title">Grupo Familiar</div>
                  <div className="detail-field">
                    <span className="detail-label">Jefe de Familia</span>
                    <span className="detail-value">
                      {selectedRegistro.jefeFamilia}
                    </span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Pertenece a Núcleo</span>
                    <span className="detail-value">
                      {selectedRegistro.perteneceNucleo || "NO"}
                    </span>
                  </div>
                  {selectedRegistro.perteneceNucleo === "SI" &&
                    selectedRegistro.jefeFamilia === "NO" &&
                    selectedRegistro.cedulaJefeFamilia && (
                      <div className="detail-field detail-field--full">
                        <span className="detail-label">
                          Cédula Jefe de Familia
                        </span>
                        <span className="detail-value">
                          {selectedRegistro.cedulaJefeFamilia}
                        </span>
                        {(() => {
                          const jefeDigits = (
                            selectedRegistro.cedulaJefeFamilia || ""
                          ).replace(/\D/g, "");
                          const jd = registros.find(
                            (r) =>
                              (r.cedula || "").replace(/\D/g, "") ===
                              jefeDigits,
                          );
                          return jd ? (
                            <span className="detail-hint detail-hint--ok">
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                              </svg>
                              {jd.nombreApellido}
                            </span>
                          ) : (
                            <span className="detail-hint detail-hint--warn">
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                              Jefe de Familia no registrado
                            </span>
                          );
                        })()}
                      </div>
                    )}

                  {/* Ubicación */}
                  <div className="detail-section-title">Ubicación</div>
                  <div className="detail-field detail-field--full">
                    <span className="detail-label">Parroquia</span>
                    <span className="detail-value">
                      {selectedRegistro.parroquia}
                    </span>
                  </div>
                  <div className="detail-field detail-field--full">
                    <span className="detail-label">Sector / Comunidad</span>
                    <span className="detail-value">
                      {selectedRegistro.sector} — {selectedRegistro.comunidad}
                    </span>
                  </div>
                  <div className="detail-field detail-field--full">
                    <span className="detail-label">Dirección Exacta</span>
                    <span className="detail-value">
                      {selectedRegistro.direccionExacta}
                    </span>
                  </div>
                  {selectedRegistro.telefono && (
                    <div className="detail-field">
                      <span className="detail-label">Teléfono</span>
                      <span className="detail-value">
                        {selectedRegistro.telefono}
                      </span>
                    </div>
                  )}

                  {/* Salud */}
                  <div className="detail-section-title">Salud</div>
                  <div className="detail-field">
                    <span className="detail-label">Estado Físico</span>
                    <span
                      className="detail-value"
                      style={{
                        color:
                          selectedRegistro.estadoFisico === "LESIONADO"
                            ? "var(--color-danger)"
                            : "var(--color-success)",
                      }}
                    >
                      <span
                        style={{
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          backgroundColor:
                            selectedRegistro.estadoFisico === "LESIONADO"
                              ? "var(--color-danger)"
                              : "var(--color-success)",
                          display: "inline-block",
                        }}
                      />
                      {selectedRegistro.estadoFisico}
                    </span>
                  </div>
                  {selectedRegistro.genero === "FEMENINO" &&
                    selectedRegistro.embarazo === "SI" && (
                      <div className="detail-field">
                        <span className="detail-label">Embarazo</span>
                        <span
                          className="detail-value"
                          style={{ color: "#db2777" }}
                        >
                          <span
                            style={{
                              width: "7px",
                              height: "7px",
                              borderRadius: "50%",
                              backgroundColor: "#db2777",
                              display: "inline-block",
                            }}
                          />
                          Embarazada
                        </span>
                      </div>
                    )}
                  {selectedRegistro.patologia === "SI" && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label">Patología</span>
                      <span className="detail-value">
                        {patologiaNombres(
                          selectedRegistro.patologiaIds,
                          patologias,
                        ).join(", ") || "Sí"}
                      </span>
                    </div>
                  )}
                  {(selectedRegistro.patologia === "SI" ||
                    selectedRegistro.estadoFisico === "LESIONADO") &&
                    Array.isArray(selectedRegistro.medicamentoIds) &&
                    selectedRegistro.medicamentoIds.length > 0 && (
                      <div className="detail-field detail-field--full">
                        <span className="detail-label">Medicamentos</span>
                        <div className="med-items">
                          {(
                            selectedRegistro.medicamentoIds as Medicamento[]
                          ).map((m, i) => (
                            <div key={i} className="med-item">
                              <div className="med-item__head">
                                <span className="med-item__name">
                                  {medLabel(m.id, predefinedMedicamentos)}
                                </span>
                              </div>
                              <div className="med-item__fields">
                                <div className="med-item__field med-item__field--dose">
                                  <span className="med-item__label">Dosis</span>
                                  <span className="med-item__dose">
                                    {m.dosis || "—"}
                                  </span>
                                </div>
                                <div className="med-item__field med-item__field--periodo">
                                  <span className="med-item__label">
                                    Período
                                  </span>
                                  <span className="med-item__dose">
                                    {m.periodo || "—"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Alojamiento y Estatus */}
                  {(selectedRegistro.cuarto ||
                    selectedRegistro.retirado === "SI" ||
                    selectedRegistro.intermitente === "SI") && (
                    <div className="detail-section-title">
                      Alojamiento y Estatus
                    </div>
                  )}
                  {selectedRegistro.cuarto && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label">Cuarto Asignado</span>
                      <span
                        className="detail-value"
                        style={{ color: "var(--color-success)" }}
                      >
                        <span
                          style={{
                            width: "7px",
                            height: "7px",
                            borderRadius: "50%",
                            backgroundColor: "var(--color-success)",
                            display: "inline-block",
                          }}
                        />
                        {selectedRegistro.cuarto}
                      </span>
                    </div>
                  )}
                  {selectedRegistro.retirado === "SI" && (
                    <div className="detail-field detail-field--full">
                      <span
                        className="detail-label"
                        style={{ color: "var(--color-danger)", opacity: 1 }}
                      >
                        Retirado / Egresado
                      </span>
                      <span className="detail-value">
                        {selectedRegistro.retiradoRazon && (
                          <span>Razón: {selectedRegistro.retiradoRazon}</span>
                        )}
                        {selectedRegistro.retiradoFecha && (
                          <span
                            style={{
                              flexBasis: "100%",
                              fontSize: "0.78rem",
                              fontWeight: 500,
                              color: "var(--text-secondary)",
                            }}
                          >
                            {new Date(
                              selectedRegistro.retiradoFecha,
                            ).toLocaleString("es-VE")}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {selectedRegistro.intermitente === "SI" && (
                    <div className="detail-field detail-field--full">
                      <span
                        className="detail-label"
                        style={{ color: "var(--color-warning)", opacity: 1 }}
                      >
                        Residente Intermitente
                      </span>
                      <span className="detail-value">
                        {selectedRegistro.motivoIntermitente}
                      </span>
                    </div>
                  )}
                </div>

                {(canDeleteRegistro(currentUser.role) ||
                  canRegister(currentUser.role)) && (
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginTop: "1rem",
                      width: "100%",
                    }}
                  >
                    {canDeleteRegistro(currentUser.role) && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{
                          flex: 1,
                          margin: 0,
                          backgroundColor: "var(--color-danger-light)",
                          color: "var(--color-danger)",
                          borderColor: "rgba(220, 38, 38, 0.2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.5rem",
                          height: "var(--element-height, 42px)",
                        }}
                        onClick={() => {
                          const confirmDel = window.confirm(
                            `¿Está seguro de que desea eliminar permanentemente a ${selectedRegistro.nombreApellido} de los registros? Esta acción no se puede deshacer.`,
                          );
                          if (confirmDel) {
                            handleDeleteRegistro(selectedRegistro.id);
                          }
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                        Eliminar
                      </button>
                    )}
                    {canRegister(currentUser.role) && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{
                          flex: 1,
                          margin: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.5rem",
                          height: "var(--element-height, 42px)",
                        }}
                        onClick={() => enterEditMode(selectedRegistro)}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Editar
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── MODO EDICIÓN ── */}
            {editMode && (
              <>
                <div className="detail-edit-grid">
                  <div className="detail-section-title">Identificación</div>
                  {canRegister(currentUser.role) && (
                    <>
                      <div
                        className="form-group detail-field--full"
                        style={{ marginBottom: "0.25rem" }}
                      >
                        <button
                          type="button"
                          className={`pill-check pill-check--wrap${editData.isChildDependent ? " is-on" : ""}`}
                          aria-pressed={!!editData.isChildDependent}
                          onClick={() =>
                            setEditData((prev) => ({
                              ...prev,
                              isChildDependent: !prev.isChildDependent,
                            }))
                          }
                        >
                          <span className="pill-check__box" aria-hidden>
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                          <span className="pill-check__label">
                            Menor de edad sin cédula (hijo/dependiente)
                          </span>
                        </button>
                      </div>

                      <div className="form-group detail-field--full">
                        <label>
                          {editData.isChildDependent
                            ? "Cédula del Representante"
                            : "Cédula de Identidad"}
                        </label>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.5rem",
                            width: "100%",
                            alignItems: "flex-start",
                          }}
                        >
                          <div style={{ width: "84px", flex: "0 0 auto" }}>
                            <StyledSelect
                              value={editData.nacionalidad || "V"}
                              onChange={(v) =>
                                setEditData((prev) => ({
                                  ...prev,
                                  nacionalidad: v,
                                }))
                              }
                              options={[
                                { value: "V", label: "V" },
                                { value: "E", label: "E" },
                              ]}
                              ariaLabel="Nacionalidad"
                            />
                          </div>
                          <div
                            className="ced-sync-wrap"
                            style={{ flex: 1, minWidth: 0 }}
                          >
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="Solo números"
                              value={editData.cedula || ""}
                              onChange={(e) => {
                                const clean = e.target.value.replace(/\D/g, "");
                                setEditData((prev) => ({
                                  ...prev,
                                  cedula: clean,
                                }));
                                lookupEditCedulaPadron(clean);
                              }}
                              className={editErr("cedula") ? "has-error" : ""}
                              style={{ width: "100%", paddingRight: "2.4rem" }}
                            />
                            <button
                              type="button"
                              className="ced-sync-btn"
                              onClick={handleSyncEditCedula}
                              title="Buscar datos en censo/padrón"
                              aria-label="Buscar datos de la cédula en censo/padrón"
                            >
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="23 4 23 10 17 10" />
                                <polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Informativo (NO se persiste): representante de un hijo/dependiente. */}
                      {editData.isChildDependent &&
                        (editData.cedula || "").replace(/\D/g, "").length >=
                          6 &&
                        (() => {
                          const rep = findRepresentante(
                            editData.cedula,
                            registros,
                            selectedRegistro?.id,
                          );
                          return (
                            <div
                              className="form-group detail-field--full"
                              style={{ marginTop: "-0.25rem" }}
                            >
                              {rep ? (
                                <span className="detail-hint detail-hint--ok">
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                  </svg>
                                  Representante: {rep}
                                </span>
                              ) : (
                                <span className="detail-hint detail-hint--warn">
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                  </svg>
                                  Representante no está registrado en el censo
                                </span>
                              )}
                            </div>
                          );
                        })()}

                      <Reveal
                        open={!!editData.isChildDependent}
                        className="detail-field--full"
                      >
                        <div className="form-group">
                          <label>Número correlativo de hijo/dependiente</label>
                          <StyledSelect
                            value={editData.dependentNumber || "1"}
                            onChange={(v) =>
                              setEditData((prev) => ({
                                ...prev,
                                dependentNumber: v,
                              }))
                            }
                            ariaLabel="Número correlativo de hijo/dependiente"
                            options={DEPENDENT_NUMBER_OPTIONS}
                          />
                        </div>
                      </Reveal>
                    </>
                  )}
                  <div className="form-group detail-field--full">
                    <label>Nombre y Apellido</label>
                    <input
                      type="text"
                      value={editData.nombreApellido || ""}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          nombreApellido: e.target.value,
                        }))
                      }
                      className={editErr("nombreApellido") ? "has-error" : ""}
                    />
                  </div>
                  <div className="form-group">
                    <label>Fecha de Nacimiento</label>
                    <DatePicker
                      value={(() => {
                        const p = (editData.fechaNacimiento || "").split("/");
                        return p.length === 3 && p[2]?.length === 4
                          ? `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`
                          : "";
                      })()}
                      onChange={(ymd) => {
                        const p = ymd.split("-");
                        const dmy =
                          p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : "";
                        setEditData((prev) => ({
                          ...prev,
                          fechaNacimiento: dmy,
                        }));
                      }}
                      placeholder="Seleccione la fecha…"
                      error={!!editErr("fechaNacimiento")}
                    />
                  </div>
                  <div className="form-group">
                    <label>Edad Calculada</label>
                    <input
                      type="text"
                      value={
                        (() => {
                          if (!editData.fechaNacimiento)
                            return selectedRegistro.edad;
                          const dateParts = editData.fechaNacimiento.split("/");
                          if (dateParts.length === 3) {
                            const d = parseInt(dateParts[0], 10);
                            const m = parseInt(dateParts[1], 10);
                            const y = parseInt(dateParts[2], 10);
                            const tempDate = new Date(y, m - 1, d);
                            if (!isNaN(tempDate.getTime())) {
                              const today = new Date();
                              let calculatedAge =
                                today.getFullYear() - tempDate.getFullYear();
                              const monthDiff =
                                today.getMonth() - tempDate.getMonth();
                              if (
                                monthDiff < 0 ||
                                (monthDiff === 0 &&
                                  today.getDate() < tempDate.getDate())
                              ) {
                                calculatedAge--;
                              }
                              return calculatedAge >= 0 ? calculatedAge : 0;
                            }
                          }
                          return selectedRegistro.edad;
                        })() + " años"
                      }
                      disabled
                      style={{
                        backgroundColor: "var(--bg-primary)",
                        cursor: "not-allowed",
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Género</label>
                    <StyledSelect
                      value={editData.genero || ""}
                      ariaLabel="Género"
                      placeholder="Seleccionar…"
                      onChange={(v) =>
                        setEditData((prev) => ({ ...prev, genero: v }))
                      }
                      options={[
                        { value: "MASCULINO", label: "Masculino" },
                        { value: "FEMENINO", label: "Femenino" },
                      ]}
                      error={!!editErr("genero")}
                    />
                  </div>
                  <div className="detail-section-title">Grupo Familiar</div>
                  <div className="form-group">
                    <label>¿Es Jefe de Familia?</label>
                    <StyledSelect
                      value={editData.jefeFamilia || "NO"}
                      ariaLabel="¿Es Jefe de Familia?"
                      onChange={(v) =>
                        setEditData((prev) => ({ ...prev, jefeFamilia: v }))
                      }
                      options={[
                        { value: "NO", label: "No" },
                        { value: "SI", label: "Sí" },
                      ]}
                    />
                  </div>
                  <div className="form-group">
                    <label>¿Pertenece a un Núcleo Familiar?</label>
                    <StyledSelect
                      value={editData.perteneceNucleo || "NO"}
                      ariaLabel="¿Pertenece a un Núcleo Familiar?"
                      onChange={(v) =>
                        setEditData((prev) => ({ ...prev, perteneceNucleo: v }))
                      }
                      options={[
                        { value: "NO", label: "No" },
                        { value: "SI", label: "Sí" },
                      ]}
                    />
                  </div>
                  {editData.perteneceNucleo === "SI" &&
                    editData.jefeFamilia === "NO" && (
                      <div className="form-group detail-field--full">
                        <label>Cédula del Jefe de Familia</label>
                        <input
                          type="text"
                          value={editData.cedulaJefeFamilia || ""}
                          onChange={(e) => {
                            const clean = e.target.value.replace(/\D/g, "");
                            setEditData((prev) => ({
                              ...prev,
                              cedulaJefeFamilia: clean,
                            }));
                            lookupJefeEdit(clean);
                          }}
                          placeholder="Ingrese la cédula del jefe de familia"
                          className={editErr("cedulaJefeFamilia") ? "has-error" : ""}
                        />
                        {jefeEditLookup?.found && (
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              color: "var(--color-success)",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              marginTop: "0.35rem",
                            }}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{ flexShrink: 0 }}
                            >
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                              <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            {jefeEditLookup.nombre}
                          </span>
                        )}
                        {jefeEditLookup && !jefeEditLookup.found && (
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              color: "var(--color-warning)",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              marginTop: "0.35rem",
                            }}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{ flexShrink: 0 }}
                            >
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            Jefe de Familia no registrado
                          </span>
                        )}
                      </div>
                    )}
                  <div className="detail-section-title">Ubicación</div>
                  <div className="form-group">
                    <label>Parroquia</label>
                    <input
                      type="text"
                      value={editData.parroquia || ""}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          parroquia: e.target.value,
                        }))
                      }
                      className={editErr("parroquia") ? "has-error" : ""}
                    />
                  </div>
                  <div className="form-group">
                    <label>Sector</label>
                    <input
                      type="text"
                      value={editData.sector || ""}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          sector: e.target.value,
                        }))
                      }
                      className={editErr("sector") ? "has-error" : ""}
                    />
                  </div>
                  <div className="form-group">
                    <label>Comunidad</label>
                    <input
                      type="text"
                      value={editData.comunidad || ""}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          comunidad: e.target.value,
                        }))
                      }
                      className={editErr("comunidad") ? "has-error" : ""}
                    />
                  </div>
                  <div className="form-group">
                    <label>Teléfono</label>
                    <input
                      type="text"
                      value={editData.telefono || ""}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          telefono: e.target.value,
                        }))
                      }
                      className={editErr("telefono") ? "has-error" : ""}
                    />
                  </div>
                  <div className="form-group detail-field--full">
                    <label>Dirección Exacta</label>
                    <input
                      type="text"
                      value={editData.direccionExacta || ""}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          direccionExacta: e.target.value,
                        }))
                      }
                      className={editErr("direccionExacta") ? "has-error" : ""}
                    />
                  </div>
                  <div className="detail-section-title">Salud</div>
                  <div className="form-group">
                    <label>Estado Físico</label>
                    <StyledSelect
                      value={editData.estadoFisico || ""}
                      ariaLabel="Estado Físico"
                      placeholder="Seleccionar…"
                      onChange={(v) =>
                        setEditData((prev) => ({ ...prev, estadoFisico: v }))
                      }
                      options={[
                        { value: "ILESO", label: "Ileso" },
                        { value: "LESIONADO", label: "Lesionado" },
                      ]}
                      error={!!editErr("estadoFisico")}
                    />
                  </div>
                  {editData.genero === "FEMENINO" && (
                    <div className="form-group">
                      <label>Embarazo</label>
                      <StyledSelect
                        value={editData.embarazo || "NO"}
                        ariaLabel="Embarazo"
                        placeholder="Seleccionar…"
                        onChange={(v) =>
                          setEditData((prev) => ({ ...prev, embarazo: v }))
                        }
                        options={[
                          { value: "NO", label: "No" },
                          { value: "SI", label: "Sí" },
                        ]}
                      />
                    </div>
                  )}
                  {(() => {
                    // Registradores editan TODO (patología incluida). Lo único que NO
                    // pueden hacer es ELIMINAR el registro (gated por canDeleteRegistro).
                    const isPrivileged = true;
                    return (
                      <>
                        <div className="form-group">
                          <label>Patología</label>
                          <StyledSelect
                            value={editData.patologia || ""}
                            disabled={!isPrivileged}
                            ariaLabel="Patología"
                            placeholder="Seleccionar…"
                            onChange={(v) =>
                              setEditData((prev) => ({ ...prev, patologia: v }))
                            }
                            options={[
                              { value: "NO", label: "No" },
                              { value: "SI", label: "Sí" },
                            ]}
                            error={!!editErr("patologia")}
                          />
                        </div>
                        {editData.patologia === "SI" && (
                          <div className="form-group detail-field--full">
                            <label
                              style={{
                                marginBottom: "0.5rem",
                                display: "block",
                              }}
                            >
                              Patologías
                            </label>
                            <div style={{ marginBottom: "0.5rem" }}>
                              <SearchableSelect
                                placeholder="Buscar y agregar patología…"
                                disabled={!isPrivileged}
                                options={patologias
                                  .filter(
                                    (p) =>
                                      !(
                                        Array.isArray(editData.patologiaIds)
                                          ? editData.patologiaIds
                                          : []
                                      ).includes(p.id),
                                  )
                                  .map((p) => ({
                                    value: p.id,
                                    label: p.nombre,
                                  }))}
                                onSelect={addEditPatologia}
                                error={!!editErr("patologiaIds")}
                              />
                            </div>
                            <div className="pathology-pills-grid">
                              {(Array.isArray(editData.patologiaIds)
                                ? editData.patologiaIds
                                : []
                              ).length === 0 ? (
                                <span className="pills-empty">(Ninguna)</span>
                              ) : (
                                (editData.patologiaIds as string[]).map(
                                  (id) => (
                                    <span key={id} className="chip-pill">
                                      {patologiaNombre(id, patologias)}
                                      {isPrivileged && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeEditPatologia(id)
                                          }
                                          aria-label="Quitar"
                                          className="chip-pill__x"
                                        >
                                          ×
                                        </button>
                                      )}
                                    </span>
                                  ),
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  {(editData.patologia === "SI" ||
                    editData.estadoFisico === "LESIONADO") && (
                    <div className="form-group detail-field--full">
                      <div className="med-section">
                        <div
                          className="med-section-header"
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                          }}
                        >
                          <span className="med-section-title">
                            Medicamentos
                          </span>
                          <SearchableSelect
                            placeholder="Buscar y agregar medicamento…"
                            options={predefinedMedicamentos
                              .filter(
                                (m) =>
                                  !editMedicamentos.some((x) => x.id === m.id),
                              )
                              .map((m) => ({
                                value: m.id,
                                label: [
                                  m.nombre,
                                  m.concentracion,
                                  m.presentacion,
                                ]
                                  .filter(Boolean)
                                  .join(" · "),
                              }))}
                            onSelect={handleSelectEditPredefinedMed}
                          />
                        </div>
                        {editMedicamentos.length === 0 ? (
                          <p className="med-empty">
                            Sin medicamentos. Busca uno del catálogo arriba.
                          </p>
                        ) : (
                          <div className="med-items">
                            {editMedicamentos.map((m, i) => {
                              // Registradores editan TODO: también los medicamentos
                              // existentes (editar/quitar). Solo el borrado del registro
                              // está gated (canDeleteRegistro).
                              const isPrivileged = true;
                              const isExisting = i < originalMedsCount;
                              const isMedReadOnly = !isPrivileged && isExisting;
                              return (
                                <div key={i} className="med-item">
                                  <div className="med-item__head">
                                    <span className="med-item__name">
                                      {medLabel(m.id, predefinedMedicamentos)}
                                    </span>
                                    {!isMedReadOnly && (
                                      <button
                                        type="button"
                                        className="btn-remove-med"
                                        onClick={() => removeEditMed(i)}
                                        aria-label="Quitar medicamento"
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                  <div className="med-item__fields">
                                    <div className="med-item__field med-item__field--dose">
                                      <span className="med-item__label">
                                        Dosis
                                      </span>
                                      <span className="med-item__dose">
                                        {m.dosis || "—"}
                                      </span>
                                    </div>
                                    <div className="med-item__field med-item__field--periodo">
                                      <span className="med-item__label">
                                        Período
                                      </span>
                                      <StyledSelect
                                        dense
                                        value={m.periodo}
                                        disabled={isMedReadOnly}
                                        onChange={(v) =>
                                          updateEditMed(i, "periodo", v)
                                        }
                                        options={PERIODO_OPTIONS.map((op) => ({
                                          value: op,
                                          label: op,
                                        }))}
                                        placeholder="Elegir período…"
                                        ariaLabel="Período"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="detail-section-title">Alojamiento</div>
                  <div className="form-group detail-field--full">
                    <label>Habitación / Salón</label>
                    <SearchableSingleSelect
                      value={editData.cuarto || ""}
                      onChange={(v) =>
                        setEditData((prev) => ({ ...prev, cuarto: v }))
                      }
                      options={allCuartos.map((c) => ({
                        value: c,
                        label: roomLabel(c),
                      }))}
                      placeholder="Sin habitación asignada"
                      searchPlaceholder="Buscar habitación…"
                      clearLabel="— Sin habitación —"
                      emptyText="Sin habitaciones configuradas"
                      ariaLabel="Habitación / Salón"
                    />
                  </div>
                  <div className="detail-section-title">Estatus</div>
                  <div className="detail-field--full">
                    <div className="reg-retiro__row">
                      <div className="reg-retiro__field">
                        <label>Retirado / Egresado</label>
                        <StyledSelect
                          value={editData.retirado || "NO"}
                          ariaLabel="Retirado / Egresado"
                          onChange={(v) =>
                            setEditData((prev) => ({
                              ...prev,
                              retirado: v,
                              retiradoRazon:
                                v === "SI" ? prev.retiradoRazon : "",
                            }))
                          }
                          options={[
                            { value: "NO", label: "No" },
                            { value: "SI", label: "Sí" },
                          ]}
                        />
                      </div>
                      <Reveal open={editData.retirado === "SI"} inline>
                        <button
                          type="button"
                          className={`pill-check${editData.retiradoRazon === "HOGAR SOLIDARIO" ? " is-on" : ""}`}
                          aria-pressed={
                            editData.retiradoRazon === "HOGAR SOLIDARIO"
                          }
                          onClick={() =>
                            setEditData((prev) => ({
                              ...prev,
                              retiradoRazon:
                                prev.retiradoRazon === "HOGAR SOLIDARIO"
                                  ? ""
                                  : "HOGAR SOLIDARIO",
                            }))
                          }
                        >
                          <span className="pill-check__box" aria-hidden>
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                          <span className="pill-check__label">
                            Hogar solidario
                          </span>
                        </button>
                      </Reveal>
                    </div>
                    <Reveal open={editData.retirado === "SI"}>
                      <div
                        className="form-group"
                        style={{ marginTop: "0.6rem" }}
                      >
                        <label>Razón de Retiro</label>
                        <input
                          type="text"
                          placeholder="ej: Retornado a vivienda, alta médica, etc."
                          value={editData.retiradoRazon || ""}
                          disabled={
                            editData.retiradoRazon === "HOGAR SOLIDARIO"
                          }
                          onChange={(e) =>
                            setEditData((prev) => ({
                              ...prev,
                              retiradoRazon: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </Reveal>
                  </div>
                  <div className="form-group">
                    <label>Residente Intermitente</label>
                    <StyledSelect
                      value={editData.intermitente || "NO"}
                      ariaLabel="Residente Intermitente"
                      onChange={(v) =>
                        setEditData((prev) => ({
                          ...prev,
                          intermitente: v,
                          motivoIntermitente:
                            v === "NO" ? "" : prev.motivoIntermitente,
                        }))
                      }
                      options={[
                        { value: "NO", label: "No" },
                        { value: "SI", label: "Sí" },
                      ]}
                    />
                  </div>
                  <Reveal
                    open={editData.intermitente === "SI"}
                    className="detail-field--full"
                  >
                    <div className="form-group">
                      <label>
                        Motivo del Intermitente{" "}
                        <span style={{ color: "var(--color-danger, #e53e3e)" }}>
                          *
                        </span>
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Sale a trabajar de lunes a viernes, regresa los fines de semana."
                        value={editData.motivoIntermitente || ""}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            motivoIntermitente: e.target.value,
                          }))
                        }
                        style={{
                          borderColor:
                            editData.intermitente === "SI" &&
                            !editData.motivoIntermitente?.trim()
                              ? "var(--color-danger, #e53e3e)"
                              : undefined,
                        }}
                      />
                      {editData.intermitente === "SI" &&
                        !editData.motivoIntermitente?.trim() && (
                          <span
                            style={{
                              fontSize: "0.78rem",
                              color: "var(--color-danger, #e53e3e)",
                              marginTop: "2px",
                              display: "block",
                            }}
                          >
                            El motivo es obligatorio para residentes
                            intermitentes
                          </span>
                        )}
                    </div>
                  </Reveal>
                </div>
                <div className="modal-edit-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setEditMode(false);
                      setJefeEditLookup(null);
                    }}
                    disabled={savingEdit}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-submit"
                    style={{ flex: 1 }}
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                  >
                    {savingEdit ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL DEDICADO: asignar habitación (desde el botón de la tabla) ── */}
      {assignRoomFor && (
        <div
          className={`modal-overlay${assignRoomClosing ? " modal-overlay--closing" : ""}`}
          onClick={closeAssignRoom}
        >
          <div
            className={`modal-content pill-form${assignRoomClosing ? " modal-content--closing" : ""}`}
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  minWidth: 0,
                }}
              >
                <span
                  className="modal-title"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  Asignar Habitación
                </span>
              </div>
              <button
                className="modal-close"
                onClick={closeAssignRoom}
                aria-label="Cerrar"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div
              style={{
                fontSize: "0.85rem",
                color: "var(--text-secondary)",
                margin: "0 0 0.75rem",
              }}
            >
              {assignRoomFor.nombreApellido} · {assignRoomFor.cedula}
            </div>
            <div className="form-group">
              <label>Cuarto / Salón</label>
              <SearchableSingleSelect
                value={asignCuarto}
                onChange={setAsignCuarto}
                options={allCuartos.map((c) => ({
                  value: c,
                  label: roomLabel(c),
                }))}
                placeholder="Seleccionar cuarto…"
                searchPlaceholder="Buscar cuarto…"
                clearLabel="— Sin cuarto —"
                emptyText="Sin cuartos configurados"
                ariaLabel="Cuarto / Salón"
              />
            </div>
            <button
              type="button"
              className="btn-submit"
              style={{ marginTop: "0.875rem" }}
              onClick={async () => {
                await handleAsignarCuarto(assignRoomFor, asignCuarto);
                closeAssignRoom();
              }}
              disabled={
                savingCuarto ||
                !asignCuarto ||
                asignCuarto === (assignRoomFor.cuarto || "")
              }
            >
              {savingCuarto
                ? "Guardando..."
                : assignRoomFor.cuarto
                  ? "Reasignar Cuarto"
                  : "Confirmar Asignación"}
            </button>
          </div>
        </div>
      )}

      {/* Modal: elegir qué Excel descargar (General / Familias / Individuos solos) */}
      {mExport.mounted && (
        <div
          className={`modal-overlay${mExport.closing ? " modal-overlay--closing" : ""}`}
          onClick={() => setShowExportModal(false)}
        >
          <div
            className={`modal-content modal-content--detail${mExport.closing ? " modal-content--closing" : ""}`}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "480px" }}
          >
            <div className="modal-header">
              <span className="modal-title">Descargar Excel</span>
              <button
                className="modal-close"
                onClick={() => setShowExportModal(false)}
              >
                ✕
              </button>
            </div>
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--text-secondary)",
                margin: "0 0 1rem",
              }}
            >
              Elige qué exportar:
            </p>
            <div className="export-options">
              <button
                type="button"
                className="export-option"
                onClick={handleExportExcel}
                disabled={exportingXlsx}
              >
                <span className="export-option__icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </span>
                <span className="export-option__text">
                  <strong>Excel General</strong>
                  <small>
                    El listado con los <b>filtros aplicados</b> ahora (
                    {filteredRegistros.length}).
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="export-option"
                onClick={handleExportFamilias}
                disabled={exportingXlsx}
              >
                <span className="export-option__icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                <span className="export-option__text">
                  <strong>Excel de Familias</strong>
                  <small>
                    Cada jefe de familia con su núcleo, agrupado y coloreado.{" "}
                    <b>Sin filtros.</b>
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="export-option"
                onClick={handleExportIndividuos}
                disabled={exportingXlsx}
              >
                <span className="export-option__icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <span className="export-option__text">
                  <strong>Excel de Individuos Solos</strong>
                  <small>
                    Personas sin núcleo familiar. <b>Sin filtros.</b>
                  </small>
                </span>
              </button>
            </div>
            {exportingXlsx && (
              <p
                style={{
                  fontSize: "0.78rem",
                  color: "var(--text-muted)",
                  margin: "0.85rem 0 0",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <span className="spinner spinner-sm" /> Generando Excel…
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
