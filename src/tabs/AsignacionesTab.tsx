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
import { PARROQUIAS, PERIODO_OPTIONS } from "@/lib/constants";
import { formatRoomLabel, roomFillLevel, patologiaNombre, patologiaNombres, medLabel, medItemsText, normalizeText } from "@/lib/helpers";
import SearchableSelect from "@/components/SearchableSelect";
import SearchableSingleSelect from "@/components/SearchableSingleSelect";
import StyledSelect from "@/components/StyledSelect";
import DatePicker from "@/components/DatePicker";
import type { Medicamento } from "@/types";
import { useAppContext } from "@/context/AppContext";
import { apiFetch } from "@/lib/apiFetch";
import { canRegister, canDeleteRegistro } from "@/lib/permissions";

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
    triggerSync,
    refreshLocalRecords,
    pendingSelectId,
    setPendingSelectId,
    patologias,
    predefinedMedicamentos
  } = useAppContext();

  const [registroSearch, setRegistroSearch] = useState("");
  const [selectedRegistro, setSelectedRegistro] = useState<any | null>(null);
  const [modalClosing, setModalClosing] = useState(false);
  const [asignCuarto, setAsignCuarto] = useState("");
  const [savingCuarto, setSavingCuarto] = useState(false);
  // Modal DEDICADO de asignar habitación (independiente del de ver/editar).
  const [assignRoomFor, setAssignRoomFor] = useState<any | null>(null);
  const openAssignRoom = (reg: any) => { setAssignRoomFor(reg); setAsignCuarto(reg.cuarto || ""); };
  const closeAssignRoom = () => { setAssignRoomFor(null); setAsignCuarto(""); };
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [originalMedsCount, setOriginalMedsCount] = useState(0);

  // Lookup del Jefe de Familia por su cédula al editar (igual que en registro):
  // muestra su nombre si está en el sistema, o avisa si no está registrado.
  const [jefeEditLookup, setJefeEditLookup] = useState<{ found: boolean; nombre?: string } | null>(null);

  // Consulta AUTOMÁTICA de la cédula del afectado en el padrón local (igual que en
  // registro): al terminar de escribir (debounce), autocompleta nombre y género.
  const editCedulaLookupRef = useRef<NodeJS.Timeout | null>(null);
  const lookupEditCedulaPadron = (cleanNum: string) => {
    if (editCedulaLookupRef.current) clearTimeout(editCedulaLookupRef.current);
    if (cleanNum.length < 7) return;
    editCedulaLookupRef.current = setTimeout(async () => {
      try {
        const citizen = await buscarCedulaEnCliente(cleanNum);
        if (citizen) {
          setEditData(prev => ({
            ...prev,
            nombreApellido: citizen.nombreCompleto || prev.nombreApellido,
            genero: (citizen.sexo === "F" || citizen.sexo === "FEMENINO") ? "FEMENINO"
              : (citizen.sexo === "M" || citizen.sexo === "MASCULINO") ? "MASCULINO" : prev.genero,
          }));
          showToast("Identidad verificada en padrón local.", "info");
        }
      } catch { /* padrón no disponible: se ingresa manual */ }
    }, 250);
  };

  const lookupJefeEdit = (cleanVal: string) => {
    if (cleanVal.length >= 5) {
      const jefe = registros.find(r => (r.cedula || "").replace(/\D/g, "") === cleanVal);
      setJefeEditLookup(jefe ? { found: true, nombre: jefe.nombreApellido } : { found: false });
    } else {
      setJefeEditLookup(null);
    }
  };

  // Patologías por-ID en la edición: array de ids del catálogo.
  const addEditPatologia = (id: string) => {
    if (!id) return;
    setEditData(prev => {
      const current: string[] = Array.isArray(prev.patologiaIds) ? prev.patologiaIds : [];
      if (current.includes(id)) return prev;
      return { ...prev, patologiaIds: [...current, id] };
    });
  };
  const removeEditPatologia = (id: string) => {
    setEditData(prev => ({
      ...prev,
      patologiaIds: (Array.isArray(prev.patologiaIds) ? prev.patologiaIds : []).filter((x: string) => x !== id),
    }));
  };

  // Medicamentos por-ID: solo desde el catálogo (id + posología editable).
  const handleSelectEditPredefinedMed = (medId: string) => {
    if (!medId) return;
    const match = predefinedMedicamentos.find(m => m.id === medId);
    if (match && !editMedicamentos.some(x => x.id === medId)) {
      // Nombre y dosis salen del catálogo por ID (solo lectura); dosis = concentración.
      setEditMedicamentos(prev => [...prev, { id: match.id, dosis: match.concentracion || "", periodo: "" }]);
    }
  };

  const [editMedicamentos, setEditMedicamentos] = useState<Medicamento[]>([]);
  const removeEditMed = (i: number) => setEditMedicamentos(p => p.filter((_, idx) => idx !== i));
  const updateEditMed = (i: number, field: "dosis" | "periodo", val: string) =>
    setEditMedicamentos(p => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  // Filters State for search table
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterGenero, setFilterGenero] = useState("");
  const [filterEdad, setFilterEdad] = useState("");
  const [filterParroquia, setFilterParroquia] = useState("");
  const [filterEstadoFisico, setFilterEstadoFisico] = useState("");
  const [filterCuarto, setFilterCuarto] = useState("");
  const [filterRetirado, setFilterRetirado] = useState("NO");

  // Navegación por notificación PWA: cuando pendingSelectId tiene match en
  // registros, abrir su detalle y limpiar el pendiente. (Home ya cambió el tab.)
  useEffect(() => {
    if (!pendingSelectId || !registros.length) return;
    const match = registros.find(r => r.id === pendingSelectId);
    if (match) {
      setSelectedRegistro(match);
      setPendingSelectId(null);
    }
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
      result = result.filter(r => {
        if (
          normalizeText(r.nombreApellido).includes(q) ||
          normalizeText(r.cedula).includes(q) ||
          normalizeText(r.parroquia).includes(q)
        ) return true;
        if (looksLikeCedula) {
          const ced  = (r.cedula || "").replace(/\D/g, "");
          const jefe = (r.cedulaJefeFamilia || "").replace(/\D/g, "");
          return ced.includes(qDigits) || jefe.includes(qDigits);
        }
        return false;
      });
    }

    // Apply filters
    if (filterGenero) {
      result = result.filter(r => r.genero === filterGenero);
    }
    if (filterEdad) {
      result = result.filter(r => {
        const edad = r.edad || 0;
        if (filterEdad === "menores") return edad < 18;
        if (filterEdad === "adultos") return edad >= 18 && edad < 60;
        if (filterEdad === "mayores") return edad >= 60;
        return true;
      });
    }
    if (filterParroquia) {
      result = result.filter(r => r.parroquia === filterParroquia);
    }
    if (filterEstadoFisico) {
      result = result.filter(r => r.estadoFisico === filterEstadoFisico);
    }
    if (filterCuarto) {
      result = result.filter(r => {
        if (filterCuarto === "sin_asignar") return !r.cuarto;
        return r.cuarto === filterCuarto;
      });
    }
    if (filterRetirado) {
      result = result.filter(r => (r.retirado || "NO") === filterRetirado);
    }

    return result;
  }, [registros, registroSearch, filterGenero, filterEdad, filterParroquia, filterEstadoFisico, filterCuarto, filterRetirado]);

  const roomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allCuartos.forEach(room => {
      counts[room] = 0;
    });
    registros.filter(r => r.retirado !== "SI" && r.cuarto).forEach(r => {
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

  const handleAsignarCuarto = async (target: any = selectedRegistro, room: string = asignCuarto) => {
    if (!target || !room) return;
    setSavingCuarto(true);

    const updated = { ...target, cuarto: room };

    // 1. Optimistic UI update
    setRegistros(prev => {
      const next = prev.map(r => r.id === updated.id ? updated : r);
      if (typeof window !== "undefined") {
        localStorage.setItem("cached_registros", JSON.stringify(next));
      }
      return next;
    });
    // Si el afectado está abierto en el modal de detalle, refléjalo también.
    if (selectedRegistro && selectedRegistro.id === updated.id) setSelectedRegistro(updated);

    // 2. Queue in IndexedDB in the background
    try {
      const localRec = {
        id: updated.id,
        type: 'update' as const,   // asignar cuarto ES una edición (no una creación)
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
          patologiaIds: Array.isArray(updated.patologiaIds) ? updated.patologiaIds : [],
          telefono: updated.telefono || undefined,
          medicamentoIds: Array.isArray(updated.medicamentoIds) ? updated.medicamentoIds : [],
          cuarto: updated.cuarto,
          retirado: updated.retirado || "NO",
          retiradoRazon: updated.retiradoRazon || undefined,
          intermitente: updated.intermitente || "NO",
          motivoIntermitente: updated.motivoIntermitente || undefined,
          refugio: updated.refugio || currentUser?.campamentoTransitorio || ""
        }
      };
      await saveLocal(localRec);
      await refreshLocalRecords();
      showToast("Habitación asignada correctamente (sincronizando en segundo plano)", "success");
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

  const handleSaveEdit = async () => {
    if (!selectedRegistro) return;
    setSavingEdit(true);

    const nac = editData.nacionalidad || (selectedRegistro.cedula.startsWith("E-") ? "E" : "V");
    const cleanCedNum = editData.cedula ? String(editData.cedula).trim().replace(/\D/g, "") : selectedRegistro.cedula.replace(/\D/g, "");
    const finalCedula = `${nac}-${cleanCedNum}`;

    // Guard (front): no permitir editar a una cédula que YA pertenece a OTRO afectado
    // activo (no retirado). El backend lo valida también.
    const dupOtro = registros.find(r =>
      r.id !== selectedRegistro.id && r.retirado !== "SI" &&
      (r.cedula || "").toUpperCase().trim() === finalCedula.toUpperCase());
    if (dupOtro) {
      showToast(`Esa cédula ya pertenece a otro afectado registrado: ${dupOtro.nombreApellido}.`, "error");
      setSavingEdit(false);
      return;
    }

    const rawJefeCed = editData.cedulaJefeFamilia ? String(editData.cedulaJefeFamilia).trim().toUpperCase() : (selectedRegistro.cedulaJefeFamilia || "");
    const finalJefeCedula = rawJefeCed
      ? ((rawJefeCed.startsWith("V-") || rawJefeCed.startsWith("E-")) ? rawJefeCed : `V-${rawJefeCed}`)
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
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < tempDate.getDate())) {
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
      medicamentoIds: editMedicamentos
    };

    // 1. Optimistic UI update
    setRegistros(prev => {
      const next = prev.map(r => r.id === updated.id ? updated : r);
      if (typeof window !== "undefined") {
        localStorage.setItem("cached_registros", JSON.stringify(next));
      }
      return next;
    });
    setSelectedRegistro(updated);
    setEditMode(false);

    // 2. Queue in IndexedDB in the background
    try {
      const localRec = {
        id: updated.id,
        type: 'update' as const,
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
          patologia: updated.patologia,
          patologiaIds: updated.patologia === "SI" ? (Array.isArray(updated.patologiaIds) ? updated.patologiaIds : []) : [],
          telefono: updated.telefono || undefined,
          medicamentoIds: Array.isArray(updated.medicamentoIds) ? updated.medicamentoIds : [],
          cuarto: updated.cuarto || undefined,
          retirado: updated.retirado || "NO",
          retiradoRazon: updated.retirado === "SI" ? updated.retiradoRazon : undefined,
          intermitente: updated.intermitente || "NO",
          motivoIntermitente: updated.intermitente === "SI" ? updated.motivoIntermitente : undefined,
          refugio: updated.refugio || currentUser?.campamentoTransitorio || ""
        }
      };
      await saveLocal(localRec);
      await refreshLocalRecords();
      showToast("Registro guardado (sincronizando en segundo plano)", "success");
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
        setRegistros(prev => {
          const next = prev.filter(r => r.id !== id);
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

  const handleExportExcel = () => {
    const present = registros.filter(r => r.retirado !== "SI");
    if (present.length === 0) {
      showToast("No hay registros de personas presentes para exportar", "warning");
      return;
    }

    const headers = [
      "Cédula", "Nombre y Apellido", "Género", "Fecha de Nacimiento", "Edad",
      "Parroquia", "Sector", "Comunidad", "Dirección Exacta", "Teléfono",
      "Cuarto/Habitación", "Estado Físico", "Jefe de Familia", "Cédula Jefe",
      "Patología", "Descripción Patología", "Medicamentos", "Fecha de Registro"
    ];

    const rows = present.map(r => {
      const meds = medItemsText(r.medicamentoIds, predefinedMedicamentos);
      return [
        r.cedula,
        r.nombreApellido,
        r.genero,
        r.fechaNacimiento,
        r.edad,
        r.parroquia,
        r.sector,
        r.comunidad,
        r.direccionExacta,
        r.telefono || "",
        r.cuarto || "Sin asignar",
        r.estadoFisico,
        r.jefeFamilia,
        r.cedulaJefeFamilia || "",
        r.patologia,
        patologiaNombres(r.patologiaIds, patologias).join(", "),
        meds,
        r.createdAt ? new Date(r.createdAt).toLocaleString("es-VE") : ""
      ];
    });

    const campamentoActivo = effectiveRefugio || currentUser?.campamentoTransitorio || "";
    const csvContent = [
      `"CAMPAMENTO TRANSITORIO: ${String(campamentoActivo).replace(/"/g, '""')}"`,
      "",
      headers.join(";"),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";")),
    ].join("\n");
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `registro_censo_presentes_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV para Excel descargado correctamente", "success");
  };

  const handlePrintPDFList = () => {
    const present = registros.filter(r => r.retirado !== "SI");
    if (present.length === 0) {
      showToast("No hay registros de personas presentes para imprimir", "warning");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showToast("Por favor permita las ventanas emergentes para imprimir", "error");
      return;
    }

    const campamentoActivo = effectiveRefugio || currentUser?.campamentoTransitorio || "";

    const sorted = [...present].sort((a, b) => {
      const roomA = a.cuarto || "ZZZ";
      const roomB = b.cuarto || "ZZZ";
      return roomA.localeCompare(roomB) || a.nombreApellido.localeCompare(b.nombreApellido);
    });

    // Un solo nombre + un solo apellido para ahorrar espacio (la cédula identifica
    // de forma única). Heurística venezolana: [N1 N2 A1 A2] -> N1 A1; [N1 A1 A2] -> N1 A1.
    const shortName = (full: string) => {
      const p = (full || "").trim().split(/\s+/);
      if (p.length >= 4) return `${p[0]} ${p[2]}`;
      if (p.length === 3) return `${p[0]} ${p[1]}`;
      return p.slice(0, 2).join(" ");
    };

    const rowsHtml = sorted.map((r, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${shortName(r.nombreApellido)}</td>
        <td>${r.cedula}</td>
        <td class="c">${r.edad}</td>
        <td>${r.cuarto || '<span style="color:#999">Sin asignar</span>'}</td>
      </tr>
    `).join("");

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

  // Guarda de tipos: este tab solo se monta autenticado (activeTab === "asignaciones").
  if (!currentUser) return null;

  return (
    <>
      <div className="tab-view tab-enter">
        <div className="dashboard-section">
          <div className="asign-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <div className="dashboard-section-title">Registro de Afectados</div>
              {!loadingRegistros && (
                <span className="asign-count" style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  {filteredRegistros.length} de {registros.length}
                </span>
              )}
            </div>
            {/* Exportar: disponible para todos los roles (un Visualizador solo ve y exporta). */}
            {(
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={handleExportExcel}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  Exportar Excel
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={handlePrintPDFList}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Imprimir PDF Presentes
                </button>
              </div>
            )}
          </div>

          <div className="asign-search-wrap" style={{ marginBottom: "0.5rem" }}>
            <input
              type="text"
              placeholder="Buscar por nombre, cédula o parroquia..."
              value={registroSearch}
              onChange={e => setRegistroSearch(e.target.value)}
            />
            {registroSearch && (
              <button
                className="asign-search-clear"
                onClick={() => setRegistroSearch("")}
                aria-label="Limpiar búsqueda"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>

          <div className="toolbar-row" style={{ marginTop: "0.5rem", marginBottom: "1rem" }}>
            <button
              type="button"
              className={`toolbar-btn${filtersOpen ? " is-active" : ""}`}
              onClick={() => setFiltersOpen(o => !o)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              {filtersOpen ? "Ocultar Filtros" : "Filtros Avanzados"}
            </button>

            {(filterGenero || filterEdad || filterParroquia || filterEstadoFisico || filterCuarto || filterRetirado !== "NO") && (
              <button
                type="button"
                className="toolbar-btn toolbar-btn--danger"
                onClick={() => {
                  setFilterGenero("");
                  setFilterEdad("");
                  setFilterParroquia("");
                  setFilterEstadoFisico("");
                  setFilterCuarto("");
                  setFilterRetirado("NO");
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
                  value={filterGenero} onChange={setFilterGenero} ariaLabel="Género"
                  options={[{ value: "", label: "Todos" }, { value: "MASCULINO", label: "Masculino" }, { value: "FEMENINO", label: "Femenino" }]}
                />
              </div>

              <div className="form-group">
                <label>Grupo de Edad</label>
                <StyledSelect
                  value={filterEdad} onChange={setFilterEdad} ariaLabel="Grupo de Edad"
                  options={[{ value: "", label: "Todos" }, { value: "menores", label: "Menores de edad (<18)" }, { value: "adultos", label: "Adultos (18-59)" }, { value: "mayores", label: "Adultos mayores (60+)" }]}
                />
              </div>

              <div className="form-group">
                <label>Parroquia</label>
                <StyledSelect
                  value={filterParroquia} onChange={setFilterParroquia} ariaLabel="Parroquia"
                  options={[{ value: "", label: "Todas" }, ...PARROQUIAS.map(p => ({ value: p, label: p }))]}
                />
              </div>

              <div className="form-group">
                <label>Estado Físico</label>
                <StyledSelect
                  value={filterEstadoFisico} onChange={setFilterEstadoFisico} ariaLabel="Estado Físico"
                  options={[{ value: "", label: "Todos" }, { value: "ILESO", label: "Ileso" }, { value: "LESIONADO", label: "Lesionado" }]}
                />
              </div>

              <div className="form-group">
                <label>Habitación / Salón</label>
                <StyledSelect
                  value={filterCuarto} onChange={setFilterCuarto} ariaLabel="Habitación / Salón"
                  options={[{ value: "", label: "Todos" }, { value: "sin_asignar", label: "Sin asignar" }, ...allCuartos.map(c => ({ value: c, label: formatRoomLabel(c) }))]}
                />
              </div>

              <div className="form-group">
                <label>Estatus de Permanencia</label>
                <StyledSelect
                  value={filterRetirado} onChange={setFilterRetirado} ariaLabel="Estatus de Permanencia"
                  options={[{ value: "", label: "Todos (Presentes y Egresados)" }, { value: "NO", label: "Presentes actualmente" }, { value: "SI", label: "Egresados / Retirados" }]}
                />
              </div>
            </div>
          )}

          {loadingRegistros ? (
            <div className="registro-table-wrapper">
              <table className="registro-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nombre y Apellido</th>
                    <th className="col-cedula">Cédula</th>
                    <th className="col-parroquia">Parroquia</th>
                    <th>Estado</th>
                    <th>Cuarto</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...Array(6)].map((_, i) => (
                    <tr key={i} style={{ animationDelay: `${i * 60}ms` }}>
                      <td className="col-num"><span className="skeleton-cell" style={{ width: "18px", margin: "0 auto" }} /></td>
                      <td className="col-nombre"><span className="skeleton-cell" style={{ width: `${55 + (i % 4) * 12}%` }} /></td>
                      <td className="col-cedula"><span className="skeleton-cell" style={{ width: "72px" }} /></td>
                      <td className="col-parroquia"><span className="skeleton-cell" style={{ width: "85px" }} /></td>
                      <td><span className="skeleton-cell skeleton-cell--pill" style={{ width: "58px" }} /></td>
                      <td><span className="skeleton-cell skeleton-cell--pill" style={{ width: "68px" }} /></td>
                      <td className="col-action"><span className="skeleton-cell skeleton-cell--icon" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : registros.length === 0 ? (
            <div className="reg-empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <p>No hay afectados registrados</p>
              <span>Los registros aparecerán aquí una vez sincronizados</span>
            </div>
          ) : filteredRegistros.length === 0 ? (
            <div className="reg-empty-state">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <p>Sin resultados</p>
              <span>Ningún registro coincide con &ldquo;{registroSearch || "los filtros aplicados"}&rdquo;</span>
            </div>
          ) : (
            <div className="registro-table-wrapper">
              <table className="registro-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nombre y Apellido</th>
                    <th className="col-cedula">Cédula</th>
                    <th className="col-parroquia">Parroquia</th>
                    <th>Estado</th>
                    <th>Cuarto</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegistros.map((reg, i) => (
                    <tr key={reg.id} className="reg-row-enter" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
                      <td className="col-num">{i + 1}</td>
                      <td className="col-nombre">{reg.nombreApellido}</td>
                      <td className="col-cedula">{reg.cedula}</td>
                      <td className="col-parroquia">{reg.parroquia}</td>
                      <td className="col-estado">
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span className={`estado-pill ${reg.estadoFisico === "LESIONADO" ? "estado-pill--danger" : "estado-pill--ok"}`}>
                            {reg.estadoFisico}
                          </span>
                          {reg.retirado === "SI" && (
                            <span className="estado-pill" style={{ backgroundColor: "rgba(239, 68, 68, 0.2)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.4)" }}>
                              RETIRADO
                            </span>
                          )}
                          {reg.intermitente === "SI" && (
                            <span className="estado-pill" style={{ backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.4)" }}>
                              INTERMITENTE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="col-cuarto">
                        {reg.cuarto
                          ? <span className="cuarto-badge cuarto-badge--assigned">{reg.cuarto}</span>
                          : <span className="cuarto-badge cuarto-badge--none">Sin asignar</span>
                        }
                      </td>
                      <td className="col-action">
                        <div className="row-actions">
                          {canRegister(currentUser.role) && (
                            <button
                              className="btn-ver btn-ver--room"
                              aria-label="Asignar habitación"
                              title="Asignar habitación"
                              onClick={() => openAssignRoom(reg)}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                            </button>
                          )}
                          <button
                            className="btn-ver"
                            aria-label="Ver detalles"
                            title="Ver detalles"
                            onClick={() => {
                              setSelectedRegistro(reg);
                              setAsignCuarto(reg.cuarto || "");
                              setEditMode(false);
                              setEditData({});
                            }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Registro Detail & Edit & Asignación Modal */}
      {selectedRegistro && (
        <div className={`modal-overlay${modalClosing ? " modal-overlay--closing" : ""}`} onClick={closeModal}>
          <div className={`modal-content modal-content--detail pill-form${modalClosing ? " modal-content--closing" : ""}`} onClick={e => e.stopPropagation()}>

            {/* ── Header ── */}
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                {!editMode && (
                  <div className="modal-avatar">
                    {selectedRegistro.nombreApellido.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0] || "").join("").toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <span className="modal-title">
                    {editMode ? "Editar Registro" : selectedRegistro.nombreApellido}
                  </span>
                  <div className="modal-subtitle">
                    <span>C.I. {selectedRegistro.cedula}</span>
                    {!editMode && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", fontWeight: "700", color: selectedRegistro.estadoFisico === "LESIONADO" ? "var(--color-danger)" : "var(--color-success)" }}>
                        <span style={{
                          width: "6px", height: "6px", borderRadius: "50%",
                          backgroundColor: selectedRegistro.estadoFisico === "LESIONADO" ? "var(--color-danger)" : "var(--color-success)",
                          display: "inline-block"
                        }}></span>
                        {selectedRegistro.estadoFisico}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={closeModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
                    <span className="detail-value">{selectedRegistro.nombreApellido}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Edad</span>
                    <span className="detail-value">{selectedRegistro.edad} años</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Género</span>
                    <span className="detail-value">{selectedRegistro.genero}</span>
                  </div>

                  {/* Grupo Familiar */}
                  <div className="detail-section-title">Grupo Familiar</div>
                  <div className="detail-field">
                    <span className="detail-label">Jefe de Familia</span>
                    <span className="detail-value">{selectedRegistro.jefeFamilia}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Pertenece a Núcleo</span>
                    <span className="detail-value">{selectedRegistro.perteneceNucleo || "NO"}</span>
                  </div>
                  {selectedRegistro.perteneceNucleo === "SI" && selectedRegistro.jefeFamilia === "NO" && selectedRegistro.cedulaJefeFamilia && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label">Cédula Jefe de Familia</span>
                      <span className="detail-value">{selectedRegistro.cedulaJefeFamilia}</span>
                      {(() => {
                        const jefeDigits = (selectedRegistro.cedulaJefeFamilia || "").replace(/\D/g, "");
                        const jd = registros.find(r => (r.cedula || "").replace(/\D/g, "") === jefeDigits);
                        return jd ? (
                          <span className="detail-hint detail-hint--ok">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            {jd.nombreApellido}
                          </span>
                        ) : (
                          <span className="detail-hint detail-hint--warn">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
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
                    <span className="detail-value">{selectedRegistro.parroquia}</span>
                  </div>
                  <div className="detail-field detail-field--full">
                    <span className="detail-label">Sector / Comunidad</span>
                    <span className="detail-value">{selectedRegistro.sector} — {selectedRegistro.comunidad}</span>
                  </div>
                  <div className="detail-field detail-field--full">
                    <span className="detail-label">Dirección Exacta</span>
                    <span className="detail-value">{selectedRegistro.direccionExacta}</span>
                  </div>
                  {selectedRegistro.telefono && (
                    <div className="detail-field">
                      <span className="detail-label">Teléfono</span>
                      <span className="detail-value">{selectedRegistro.telefono}</span>
                    </div>
                  )}

                  {/* Salud */}
                  <div className="detail-section-title">Salud</div>
                  <div className="detail-field">
                    <span className="detail-label">Estado Físico</span>
                    <span className="detail-value" style={{ color: selectedRegistro.estadoFisico === "LESIONADO" ? "var(--color-danger)" : "var(--color-success)" }}>
                      <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: selectedRegistro.estadoFisico === "LESIONADO" ? "var(--color-danger)" : "var(--color-success)", display: "inline-block" }} />
                      {selectedRegistro.estadoFisico}
                    </span>
                  </div>
                  {selectedRegistro.patologia === "SI" && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label">Patología</span>
                      <span className="detail-value">{patologiaNombres(selectedRegistro.patologiaIds, patologias).join(", ") || "Sí"}</span>
                    </div>
                  )}
                  {(selectedRegistro.patologia === "SI" || selectedRegistro.estadoFisico === "LESIONADO") && Array.isArray(selectedRegistro.medicamentoIds) && selectedRegistro.medicamentoIds.length > 0 && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label">Medicamentos</span>
                      <div className="med-items">
                        {(selectedRegistro.medicamentoIds as Medicamento[]).map((m, i) => (
                          <div key={i} className="med-item">
                            <div className="med-item__head">
                              <span className="med-item__name">{medLabel(m.id, predefinedMedicamentos)}</span>
                            </div>
                            <div className="med-item__fields">
                              <div className="med-item__field med-item__field--dose">
                                <span className="med-item__label">Dosis</span>
                                <span className="med-item__dose">{m.dosis || "—"}</span>
                              </div>
                              <div className="med-item__field med-item__field--periodo">
                                <span className="med-item__label">Período</span>
                                <span className="med-item__dose">{m.periodo || "—"}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alojamiento y Estatus */}
                  {(selectedRegistro.cuarto || selectedRegistro.retirado === "SI" || selectedRegistro.intermitente === "SI") && (
                    <div className="detail-section-title">Alojamiento y Estatus</div>
                  )}
                  {selectedRegistro.cuarto && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label">Cuarto Asignado</span>
                      <span className="detail-value" style={{ color: "var(--color-success)" }}>
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "var(--color-success)", display: "inline-block" }} />
                        {selectedRegistro.cuarto}
                      </span>
                    </div>
                  )}
                  {selectedRegistro.retirado === "SI" && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label" style={{ color: "var(--color-danger)", opacity: 1 }}>Retirado / Egresado</span>
                      <span className="detail-value">
                        {selectedRegistro.retiradoRazon && <span>Razón: {selectedRegistro.retiradoRazon}</span>}
                        {selectedRegistro.retiradoFecha && (
                          <span style={{ flexBasis: "100%", fontSize: "0.78rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                            {new Date(selectedRegistro.retiradoFecha).toLocaleString("es-VE")}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {selectedRegistro.intermitente === "SI" && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label" style={{ color: "var(--color-warning)", opacity: 1 }}>Residente Intermitente</span>
                      <span className="detail-value">{selectedRegistro.motivoIntermitente}</span>
                    </div>
                  )}
                </div>

                 {(canDeleteRegistro(currentUser.role) || canRegister(currentUser.role)) && (
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", width: "100%" }}>
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
                          height: "var(--element-height, 42px)"
                        }}
                        onClick={() => {
                          const confirmDel = window.confirm(`¿Está seguro de que desea eliminar permanentemente a ${selectedRegistro.nombreApellido} de los registros? Esta acción no se puede deshacer.`);
                          if (confirmDel) {
                            handleDeleteRegistro(selectedRegistro.id);
                          }
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        Eliminar
                      </button>
                      )}
                      {canRegister(currentUser.role) && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ flex: 1, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", height: "var(--element-height, 42px)" }}
                        onClick={() => {
                          setEditMode(true);
                          const isoDateStr = selectedRegistro.fechaNacimiento;
                          let formattedBirthDate = "";
                          if (isoDateStr) {
                            const dObj = new Date(isoDateStr);
                            if (!isNaN(dObj.getTime())) {
                              const day = String(dObj.getDate()).padStart(2, "0");
                              const month = String(dObj.getMonth() + 1).padStart(2, "0");
                              const year = dObj.getFullYear();
                              formattedBirthDate = `${day}/${month}/${year}`;
                            }
                          }
                          let nac = "V";
                          let num = selectedRegistro.cedula;
                          if (selectedRegistro.cedula.startsWith("V-")) {
                            nac = "V";
                            num = selectedRegistro.cedula.slice(2);
                          } else if (selectedRegistro.cedula.startsWith("E-")) {
                            nac = "E";
                            num = selectedRegistro.cedula.slice(2);
                          } else if (selectedRegistro.cedula.startsWith("V")) {
                            nac = "V";
                            num = selectedRegistro.cedula.slice(1);
                          } else if (selectedRegistro.cedula.startsWith("E")) {
                            nac = "E";
                            num = selectedRegistro.cedula.slice(1);
                          }

                          let jefeNum = selectedRegistro.cedulaJefeFamilia || "";
                          if (jefeNum.startsWith("V-") || jefeNum.startsWith("E-")) {
                            jefeNum = jefeNum.slice(2);
                          } else if (jefeNum.startsWith("V") || jefeNum.startsWith("E")) {
                            jefeNum = jefeNum.slice(1);
                          }

                          setEditData({
                            nacionalidad: nac,
                            cedula: num,
                            nombreApellido: selectedRegistro.nombreApellido,
                            parroquia: selectedRegistro.parroquia,
                            sector: selectedRegistro.sector,
                            comunidad: selectedRegistro.comunidad,
                            direccionExacta: selectedRegistro.direccionExacta,
                            genero: selectedRegistro.genero,
                            estadoFisico: selectedRegistro.estadoFisico,
                            patologia: selectedRegistro.patologia,
                            patologiaIds: Array.isArray(selectedRegistro.patologiaIds) ? selectedRegistro.patologiaIds : [],
                            telefono: selectedRegistro.telefono || "",
                            retirado: selectedRegistro.retirado || "NO",
                            retiradoRazon: selectedRegistro.retiradoRazon || "",
                            fechaNacimiento: formattedBirthDate,
                            jefeFamilia: selectedRegistro.jefeFamilia || "NO",
                            perteneceNucleo: selectedRegistro.perteneceNucleo || "NO",
                            cedulaJefeFamilia: jefeNum,
                            intermitente: selectedRegistro.intermitente || "NO",
                            motivoIntermitente: selectedRegistro.motivoIntermitente || "",
                            cuarto: selectedRegistro.cuarto || "",
                          });
                          const initialMeds = Array.isArray(selectedRegistro.medicamentoIds) ? selectedRegistro.medicamentoIds : [];
                          setEditMedicamentos(initialMeds);
                          setOriginalMedsCount(initialMeds.length);
                          lookupJefeEdit(jefeNum);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Editar Datos
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
                      <div className="form-group detail-field--full" style={{ marginBottom: "0.25rem" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "700", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={editData.isChildDependent || false}
                            onChange={(e) => {
                              setEditData(prev => ({ ...prev, isChildDependent: e.target.checked }));
                            }}
                          />
                          Menor de edad sin cédula (hijo/dependiente)
                        </label>
                      </div>

                      <div className="form-group detail-field--full">
                        <label>{editData.isChildDependent ? "Cédula del Representante" : "Cédula de Identidad"}</label>
                        <div style={{ display: "flex", gap: "0.5rem", width: "100%", alignItems: "flex-start" }}>
                          <div style={{ width: "84px", flex: "0 0 auto" }}>
                            <StyledSelect
                              value={editData.nacionalidad || "V"}
                              onChange={v => setEditData(prev => ({ ...prev, nacionalidad: v }))}
                              options={[{ value: "V", label: "V" }, { value: "E", label: "E" }]}
                              ariaLabel="Nacionalidad"
                            />
                          </div>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Solo números"
                            value={editData.cedula || ""}
                            onChange={e => {
                              const clean = e.target.value.replace(/\D/g, "");
                              setEditData(prev => ({ ...prev, cedula: clean }));
                              lookupEditCedulaPadron(clean);
                            }}
                            style={{ flex: 1, minWidth: 0 }}
                          />
                        </div>
                      </div>

                      {editData.isChildDependent && (
                        <div className="form-group detail-field--full">
                          <label>Número correlativo de hijo/dependiente</label>
                          <StyledSelect
                            value={editData.dependentNumber || "1"}
                            onChange={(v) => setEditData(prev => ({ ...prev, dependentNumber: v }))}
                            ariaLabel="Número correlativo de hijo/dependiente"
                            options={[
                              { value: "1", label: "1er Hijo/Representado (-1)" },
                              { value: "2", label: "2do Hijo/Representado (-2)" },
                              { value: "3", label: "3er Hijo/Representado (-3)" },
                              { value: "4", label: "4to Hijo/Representado (-4)" },
                              { value: "5", label: "5to Hijo/Representado (-5)" },
                            ]}
                          />
                        </div>
                      )}
                    </>
                  )}
                  <div className="form-group detail-field--full">
                    <label>Nombre y Apellido</label>
                    <input type="text" value={editData.nombreApellido || ""}
                      onChange={e => setEditData(prev => ({ ...prev, nombreApellido: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Fecha de Nacimiento</label>
                    <DatePicker
                      value={(() => {
                        const p = (editData.fechaNacimiento || "").split("/");
                        return p.length === 3 && p[2]?.length === 4 ? `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}` : "";
                      })()}
                      onChange={(ymd) => {
                        const p = ymd.split("-");
                        const dmy = p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : "";
                        setEditData(prev => ({ ...prev, fechaNacimiento: dmy }));
                      }}
                      placeholder="Seleccione la fecha…"
                    />
                  </div>
                  <div className="form-group">
                    <label>Edad Calculada</label>
                    <input
                      type="text"
                      value={(() => {
                        if (!editData.fechaNacimiento) return selectedRegistro.edad;
                        const dateParts = editData.fechaNacimiento.split("/");
                        if (dateParts.length === 3) {
                          const d = parseInt(dateParts[0], 10);
                          const m = parseInt(dateParts[1], 10);
                          const y = parseInt(dateParts[2], 10);
                          const tempDate = new Date(y, m - 1, d);
                          if (!isNaN(tempDate.getTime())) {
                            const today = new Date();
                            let calculatedAge = today.getFullYear() - tempDate.getFullYear();
                            const monthDiff = today.getMonth() - tempDate.getMonth();
                            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < tempDate.getDate())) {
                              calculatedAge--;
                            }
                            return calculatedAge >= 0 ? calculatedAge : 0;
                          }
                        }
                        return selectedRegistro.edad;
                      })() + " años"}
                      disabled
                      style={{ backgroundColor: "var(--bg-primary)", cursor: "not-allowed" }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Género</label>
                    <StyledSelect value={editData.genero || ""} ariaLabel="Género" placeholder="Seleccionar…"
                      onChange={v => setEditData(prev => ({ ...prev, genero: v }))}
                      options={[{ value: "MASCULINO", label: "Masculino" }, { value: "FEMENINO", label: "Femenino" }]} />
                  </div>
                  <div className="detail-section-title">Grupo Familiar</div>
                  <div className="form-group">
                    <label>¿Es Jefe de Familia?</label>
                    <StyledSelect value={editData.jefeFamilia || "NO"} ariaLabel="¿Es Jefe de Familia?"
                      onChange={v => setEditData(prev => ({ ...prev, jefeFamilia: v }))}
                      options={[{ value: "NO", label: "No" }, { value: "SI", label: "Sí" }]} />
                  </div>
                  <div className="form-group">
                    <label>¿Pertenece a un Núcleo Familiar?</label>
                    <StyledSelect value={editData.perteneceNucleo || "NO"} ariaLabel="¿Pertenece a un Núcleo Familiar?"
                      onChange={v => setEditData(prev => ({ ...prev, perteneceNucleo: v }))}
                      options={[{ value: "NO", label: "No" }, { value: "SI", label: "Sí" }]} />
                  </div>
                  {editData.perteneceNucleo === "SI" && editData.jefeFamilia === "NO" && (
                    <div className="form-group detail-field--full">
                      <label>Cédula del Jefe de Familia</label>
                      <input
                        type="text"
                        value={editData.cedulaJefeFamilia || ""}
                        onChange={e => {
                          const clean = e.target.value.replace(/\D/g, "");
                          setEditData(prev => ({ ...prev, cedulaJefeFamilia: clean }));
                          lookupJefeEdit(clean);
                        }}
                        placeholder="Ingrese la cédula del jefe de familia"
                      />
                      {jefeEditLookup?.found && (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--color-success)", fontSize: "0.75rem", fontWeight: 700, marginTop: "0.35rem" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          {jefeEditLookup.nombre}
                        </span>
                      )}
                      {jefeEditLookup && !jefeEditLookup.found && (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--color-warning)", fontSize: "0.75rem", fontWeight: 700, marginTop: "0.35rem" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          Jefe de Familia no registrado
                        </span>
                      )}
                    </div>
                  )}
                  <div className="detail-section-title">Ubicación</div>
                  <div className="form-group">
                    <label>Parroquia</label>
                    <input type="text" value={editData.parroquia || ""}
                      onChange={e => setEditData(prev => ({ ...prev, parroquia: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Sector</label>
                    <input type="text" value={editData.sector || ""}
                      onChange={e => setEditData(prev => ({ ...prev, sector: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Comunidad</label>
                    <input type="text" value={editData.comunidad || ""}
                      onChange={e => setEditData(prev => ({ ...prev, comunidad: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Teléfono</label>
                    <input type="text" value={editData.telefono || ""}
                      onChange={e => setEditData(prev => ({ ...prev, telefono: e.target.value }))} />
                  </div>
                  <div className="form-group detail-field--full">
                    <label>Dirección Exacta</label>
                    <input type="text" value={editData.direccionExacta || ""}
                      onChange={e => setEditData(prev => ({ ...prev, direccionExacta: e.target.value }))} />
                  </div>
                  <div className="detail-section-title">Salud</div>
                  <div className="form-group">
                    <label>Estado Físico</label>
                    <StyledSelect value={editData.estadoFisico || ""} ariaLabel="Estado Físico" placeholder="Seleccionar…"
                      onChange={v => setEditData(prev => ({ ...prev, estadoFisico: v }))}
                      options={[{ value: "ILESO", label: "Ileso" }, { value: "LESIONADO", label: "Lesionado" }]} />
                  </div>
                  {(() => {
                    const isPrivileged = currentUser?.role === "MASTER" || currentUser?.role === "ADMIN";
                    return (
                      <>
                        <div className="form-group">
                          <label>Patología</label>
                          <StyledSelect
                            value={editData.patologia || ""}
                            disabled={!isPrivileged}
                            ariaLabel="Patología"
                            placeholder="Seleccionar…"
                            onChange={v => setEditData(prev => ({ ...prev, patologia: v }))}
                            options={[{ value: "NO", label: "No" }, { value: "SI", label: "Sí" }]}
                          />
                        </div>
                        {editData.patologia === "SI" && (
                          <div className="form-group detail-field--full">
                            <label style={{ marginBottom: "0.5rem", display: "block" }}>Patologías</label>
                            <div style={{ marginBottom: "0.5rem" }}>
                              <SearchableSelect
                                placeholder="Buscar y agregar patología…"
                                disabled={!isPrivileged}
                                options={patologias
                                  .filter(p => !(Array.isArray(editData.patologiaIds) ? editData.patologiaIds : []).includes(p.id))
                                  .map(p => ({ value: p.id, label: p.nombre }))}
                                onSelect={addEditPatologia}
                              />
                            </div>
                            <div className="pathology-pills-grid">
                              {(Array.isArray(editData.patologiaIds) ? editData.patologiaIds : []).length === 0 ? (
                                <span className="pills-empty">(Ninguna)</span>
                              ) : (editData.patologiaIds as string[]).map((id) => (
                                <span key={id} className="chip-pill">
                                  {patologiaNombre(id, patologias)}
                                  {isPrivileged && (
                                    <button type="button" onClick={() => removeEditPatologia(id)} aria-label="Quitar" className="chip-pill__x">×</button>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  {(editData.patologia === "SI" || editData.estadoFisico === "LESIONADO") && (
                    <div className="form-group detail-field--full">
                      <div className="med-section">
                        <div className="med-section-header" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <span className="med-section-title">Medicamentos</span>
                          <SearchableSelect
                            placeholder="Buscar y agregar medicamento…"
                            options={predefinedMedicamentos
                              .filter(m => !editMedicamentos.some(x => x.id === m.id))
                              .map(m => ({ value: m.id, label: [m.nombre, m.concentracion, m.presentacion].filter(Boolean).join(" · ") }))}
                            onSelect={handleSelectEditPredefinedMed}
                          />
                        </div>
                        {editMedicamentos.length === 0 ? (
                          <p className="med-empty">Sin medicamentos. Busca uno del catálogo arriba.</p>
                        ) : (
                          <div className="med-items">
                            {editMedicamentos.map((m, i) => {
                              const isPrivileged = currentUser?.role === "MASTER" || currentUser?.role === "ADMIN";
                              const isExisting = i < originalMedsCount;
                              const isMedReadOnly = !isPrivileged && isExisting;
                              return (
                                <div key={i} className="med-item">
                                  <div className="med-item__head">
                                    <span className="med-item__name">{medLabel(m.id, predefinedMedicamentos)}</span>
                                    {!isMedReadOnly && (
                                      <button type="button" className="btn-remove-med" onClick={() => removeEditMed(i)} aria-label="Quitar medicamento">×</button>
                                    )}
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
                                        disabled={isMedReadOnly}
                                        onChange={v => updateEditMed(i, "periodo", v)}
                                        options={PERIODO_OPTIONS.map(op => ({ value: op, label: op }))}
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
                      onChange={v => setEditData(prev => ({ ...prev, cuarto: v }))}
                      options={allCuartos.map(c => ({ value: c, label: roomLabel(c) }))}
                      placeholder="Sin habitación asignada"
                      searchPlaceholder="Buscar habitación…"
                      clearLabel="— Sin habitación —"
                      emptyText="Sin habitaciones configuradas"
                      ariaLabel="Habitación / Salón"
                    />
                  </div>
                  <div className="detail-section-title">Estatus</div>
                  <div className="form-group">
                    <label>Retirado / Egresado</label>
                    <StyledSelect value={editData.retirado || "NO"} ariaLabel="Retirado / Egresado"
                      onChange={v => setEditData(prev => ({ ...prev, retirado: v }))}
                      options={[{ value: "NO", label: "No" }, { value: "SI", label: "Sí" }]} />
                  </div>
                  {editData.retirado === "SI" && (
                    <div className="form-group detail-field--full">
                      <label>Razón de Retiro</label>
                      <input type="text" placeholder="ej: Retornado a vivienda, alta médica, etc." value={editData.retiradoRazon || ""}
                        onChange={e => setEditData(prev => ({ ...prev, retiradoRazon: e.target.value }))} />
                    </div>
                  )}
                  <div className="form-group">
                    <label>Residente Intermitente</label>
                    <StyledSelect value={editData.intermitente || "NO"} ariaLabel="Residente Intermitente"
                      onChange={v => setEditData(prev => ({ ...prev, intermitente: v, motivoIntermitente: v === "NO" ? "" : prev.motivoIntermitente }))}
                      options={[{ value: "NO", label: "No" }, { value: "SI", label: "Sí" }]} />
                  </div>
                  {editData.intermitente === "SI" && (
                    <div className="form-group detail-field--full">
                      <label>
                        Motivo del Intermitente <span style={{ color: "var(--color-danger, #e53e3e)" }}>*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Sale a trabajar de lunes a viernes, regresa los fines de semana."
                        value={editData.motivoIntermitente || ""}
                        onChange={e => setEditData(prev => ({ ...prev, motivoIntermitente: e.target.value }))}
                        style={{ borderColor: editData.intermitente === "SI" && !editData.motivoIntermitente?.trim() ? "var(--color-danger, #e53e3e)" : undefined }}
                      />
                      {editData.intermitente === "SI" && !editData.motivoIntermitente?.trim() && (
                        <span style={{ fontSize: "0.78rem", color: "var(--color-danger, #e53e3e)", marginTop: "2px" }}>
                          El motivo es obligatorio para residentes intermitentes
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="modal-edit-actions">
                  <button type="button" className="btn-secondary"
                    onClick={() => { setEditMode(false); setJefeEditLookup(null); }} disabled={savingEdit}>
                    Cancelar
                  </button>
                  <button type="button" className="btn-submit" style={{ flex: 1 }}
                    onClick={handleSaveEdit} disabled={savingEdit}>
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
        <div className="modal-overlay" onClick={closeAssignRoom}>
          <div className="modal-content pill-form" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
                <span className="modal-title" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Asignar Habitación
                </span>
              </div>
              <button className="modal-close" onClick={closeAssignRoom} aria-label="Cerrar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 0.75rem" }}>
              {assignRoomFor.nombreApellido} · {assignRoomFor.cedula}
            </div>
            <div className="form-group">
              <label>Cuarto / Salón</label>
              <SearchableSingleSelect
                value={asignCuarto}
                onChange={setAsignCuarto}
                options={allCuartos.map(c => ({ value: c, label: roomLabel(c) }))}
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
              onClick={async () => { await handleAsignarCuarto(assignRoomFor, asignCuarto); closeAssignRoom(); }}
              disabled={savingCuarto || !asignCuarto || asignCuarto === (assignRoomFor.cuarto || "")}
            >
              {savingCuarto ? "Guardando..." : assignRoomFor.cuarto ? "Reasignar Cuarto" : "Confirmar Asignación"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
