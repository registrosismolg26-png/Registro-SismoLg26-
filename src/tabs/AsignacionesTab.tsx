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

import { useState, useEffect, useMemo } from "react";
import { saveLocal, buscarCedulaEnCliente } from "@/lib/db";
import { PARROQUIAS } from "@/lib/constants";
import { formatRoomLabel } from "@/lib/helpers";
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
    showToast,
    currentUser,
    triggerSync,
    refreshLocalRecords,
    pendingSelectId,
    setPendingSelectId,
  } = useAppContext();

  const [registroSearch, setRegistroSearch] = useState("");
  const [selectedRegistro, setSelectedRegistro] = useState<any | null>(null);
  const [modalClosing, setModalClosing] = useState(false);
  const [asignCuarto, setAsignCuarto] = useState("");
  const [savingCuarto, setSavingCuarto] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [editMedicamentos, setEditMedicamentos] = useState<Medicamento[]>([]);
  const addEditMed    = () => setEditMedicamentos(p => [...p, { nombre: "", dosis: "", periodo: "" }]);
  const removeEditMed = (i: number) => setEditMedicamentos(p => p.filter((_, idx) => idx !== i));
  const updateEditMed = (i: number, field: keyof Medicamento, val: string) =>
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
      const q = registroSearch.toLowerCase();
      // Si el término parece una cédula (V-55555, E-55555 o 55555), se busca por
      // sus dígitos tanto en la cédula propia como en cedulaJefeFamilia, para que
      // al buscar la cédula de un jefe aparezcan los integrantes de su núcleo.
      const qDigits = registroSearch.replace(/\D/g, "");
      const looksLikeCedula = qDigits.length >= 5;
      result = result.filter(r => {
        if (
          r.nombreApellido?.toLowerCase().includes(q) ||
          r.cedula?.toLowerCase().includes(q) ||
          r.parroquia?.toLowerCase().includes(q)
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

  const handleAsignarCuarto = async () => {
    if (!selectedRegistro || !asignCuarto) return;
    setSavingCuarto(true);

    const updated = { ...selectedRegistro, cuarto: asignCuarto };

    // 1. Optimistic UI update
    setRegistros(prev => {
      const next = prev.map(r => r.id === updated.id ? updated : r);
      if (typeof window !== "undefined") {
        localStorage.setItem("cached_registros", JSON.stringify(next));
      }
      return next;
    });
    setSelectedRegistro(updated);

    // 2. Queue in IndexedDB in the background
    try {
      const localRec = {
        id: updated.id,
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
          patologiaDescripcion: updated.patologiaDescripcion || undefined,
          telefono: updated.telefono || undefined,
          medicamentos: updated.medicamentos || [],
          cuarto: updated.cuarto,
          retirado: updated.retirado || "NO",
          retiradoRazon: updated.retiradoRazon || undefined,
          intermitente: updated.intermitente || "NO",
          motivoIntermitente: updated.motivoIntermitente || undefined,
          refugio: updated.refugio || "Complejo Educativo República de Panamá"
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
      medicamentos: editMedicamentos
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
          patologiaDescripcion: updated.patologia === "SI" ? updated.patologiaDescripcion : undefined,
          telefono: updated.telefono || undefined,
          medicamentos: updated.medicamentos || [],
          cuarto: updated.cuarto || undefined,
          retirado: updated.retirado || "NO",
          retiradoRazon: updated.retirado === "SI" ? updated.retiradoRazon : undefined,
          intermitente: updated.intermitente || "NO",
          motivoIntermitente: updated.intermitente === "SI" ? updated.motivoIntermitente : undefined,
          refugio: updated.refugio || "Complejo Educativo República de Panamá"
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
      const meds = Array.isArray(r.medicamentos)
        ? r.medicamentos.map((m: any) => `${m.nombre || ""}:${m.dosis || ""}:${m.periodo || ""}`).join(" | ")
        : "";
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
        r.patologiaDescripcion || "",
        meds,
        r.createdAt ? new Date(r.createdAt).toLocaleString("es-VE") : ""
      ];
    });

    const csvContent = [headers.join(";"), ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))].join("\n");
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
        <title>Listado de Personas Presentes - Censo Sismológico 2026</title>
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
            <h2>Censo de Campamento Transitorio &middot; Sismo La Guaira 2026</h2>
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
          Gobernación del Estado La Guaira &middot; Sistema de Censo Sismológico 2026 &middot; Impresión Oficial
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
                  className="btn-secondary"
                  style={{ width: "auto", margin: 0, padding: "0 0.75rem", fontSize: "0.75rem", height: "32px", display: "flex", alignItems: "center", gap: "0.25rem" }}
                  onClick={handleExportExcel}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  Exportar Excel
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: "auto", margin: 0, padding: "0 0.75rem", fontSize: "0.75rem", height: "32px", display: "flex", alignItems: "center", gap: "0.25rem" }}
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

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-secondary"
              style={{
                width: "auto",
                margin: 0,
                padding: "0 0.75rem",
                fontSize: "0.75rem",
                height: "32px",
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                backgroundColor: filtersOpen ? "var(--color-primary-light)" : undefined,
                color: filtersOpen ? "var(--color-primary)" : undefined
              }}
              onClick={() => setFiltersOpen(o => !o)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              {filtersOpen ? "Ocultar Filtros" : "Filtros Avanzados"}
            </button>

            {(filterGenero || filterEdad || filterParroquia || filterEstadoFisico || filterCuarto || filterRetirado !== "NO") && (
              <button
                type="button"
                className="btn-ver"
                style={{
                  width: "auto",
                  margin: 0,
                  padding: "0 0.75rem",
                  fontSize: "0.75rem",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  backgroundColor: "rgba(220, 38, 38, 0.08)",
                  color: "var(--color-danger)",
                  border: "1px solid rgba(220, 38, 38, 0.25)"
                }}
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
            <div className="reg-filters-panel">
              <div className="form-group">
                <label>Género</label>
                <select value={filterGenero} onChange={e => setFilterGenero(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="MASCULINO">Masculino</option>
                  <option value="FEMENINO">Femenino</option>
                </select>
              </div>

              <div className="form-group">
                <label>Grupo de Edad</label>
                <select value={filterEdad} onChange={e => setFilterEdad(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="menores">Menores de edad (&lt;18)</option>
                  <option value="adultos">Adultos (18-59)</option>
                  <option value="mayores">Adultos mayores (60+)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Parroquia</label>
                <select value={filterParroquia} onChange={e => setFilterParroquia(e.target.value)}>
                  <option value="">Todas</option>
                  {PARROQUIAS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Estado Físico</label>
                <select value={filterEstadoFisico} onChange={e => setFilterEstadoFisico(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="ILESO">Ileso</option>
                  <option value="LESIONADO">Lesionado</option>
                </select>
              </div>

              <div className="form-group">
                <label>Habitación / Salón</label>
                <select value={filterCuarto} onChange={e => setFilterCuarto(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="sin_asignar">Sin asignar</option>
                  {allCuartos.map(c => (
                    <option key={c} value={c}>{formatRoomLabel(c)}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Estatus de Permanencia</label>
                <select value={filterRetirado} onChange={e => setFilterRetirado(e.target.value)}>
                  <option value="">Todos (Presentes y Egresados)</option>
                  <option value="NO">Presentes actualmente</option>
                  <option value="SI">Egresados / Retirados</option>
                </select>
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
                        <button
                          className="btn-ver"
                          aria-label="Ver detalles"
                          onClick={() => {
                            setSelectedRegistro(reg);
                            setAsignCuarto(reg.cuarto || "");
                            setEditMode(false);
                            setEditData({});
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
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
          <div className={`modal-content modal-content--detail${modalClosing ? " modal-content--closing" : ""}`} onClick={e => e.stopPropagation()}>

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
                  <div className="detail-field">
                    <span className="detail-label">Estado Físico</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: "700", color: selectedRegistro.estadoFisico === "LESIONADO" ? "var(--color-danger)" : "var(--color-success)" }}>
                      <span style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        backgroundColor: selectedRegistro.estadoFisico === "LESIONADO" ? "var(--color-danger)" : "var(--color-success)",
                        display: "inline-block"
                      }}></span>
                      {selectedRegistro.estadoFisico}
                    </span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Jefe de Familia</span>
                    <span className="detail-value">{selectedRegistro.jefeFamilia}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Pertenece a Núcleo</span>
                    <span className="detail-value">{selectedRegistro.perteneceNucleo || "NO"}</span>
                  </div>
                  {selectedRegistro.perteneceNucleo === "SI" && selectedRegistro.jefeFamilia === "NO" && selectedRegistro.cedulaJefeFamilia && (
                    <div className="detail-field">
                      <span className="detail-label">Cédula Jefe de Familia</span>
                      <span className="detail-value">{selectedRegistro.cedulaJefeFamilia}</span>
                    </div>
                  )}
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
                  {selectedRegistro.patologia === "SI" && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label">Patología</span>
                      <span className="detail-value">{selectedRegistro.patologiaDescripcion || "Sí"}</span>
                    </div>
                  )}
                  {(selectedRegistro.patologia === "SI" || selectedRegistro.estadoFisico === "LESIONADO") && Array.isArray(selectedRegistro.medicamentos) && selectedRegistro.medicamentos.length > 0 && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label">Medicamentos</span>
                      <div className="med-table-view">
                        <div className="med-row med-row--header">
                          <span>Nombre</span>
                          <span>Dosis</span>
                          <span>Período</span>
                        </div>
                        {(selectedRegistro.medicamentos as Medicamento[]).map((m, i) => (
                          <div key={i} className="med-row med-row--readonly">
                            <span>{m.nombre}</span>
                            <span>{m.dosis}</span>
                            <span>{m.periodo}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedRegistro.cuarto && (
                    <div className="detail-field detail-field--full">
                      <span className="detail-label">Cuarto Asignado</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: "700", color: "var(--color-success)" }}>
                        <span style={{
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          backgroundColor: "var(--color-success)",
                          display: "inline-block"
                        }}></span>
                        {selectedRegistro.cuarto}
                      </span>
                    </div>
                  )}
                  {selectedRegistro.retirado === "SI" && (
                    <div className="detail-field detail-field--full" style={{ borderLeft: "3px solid var(--color-danger, #e53e3e)", paddingLeft: "8px" }}>
                      <span className="detail-label" style={{ color: "var(--color-danger, #e53e3e)" }}>Estado: RETIRADO / EGRESADO</span>
                      <span className="detail-value">
                        {selectedRegistro.retiradoRazon && <div><strong>Razón:</strong> {selectedRegistro.retiradoRazon}</div>}
                        {selectedRegistro.retiradoFecha && (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            <strong>Fecha/Hora:</strong> {new Date(selectedRegistro.retiradoFecha).toLocaleString("es-VE")}
                          </div>
                        )}
                      </span>
                    </div>
                  )}
                  {selectedRegistro.intermitente === "SI" && (
                    <div className="detail-field detail-field--full" style={{ borderLeft: "3px solid #f59e0b", paddingLeft: "8px" }}>
                      <span className="detail-label" style={{ color: "#f59e0b", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        Residente Intermitente
                      </span>
                      <span className="detail-value">
                        Residente intermitente por el siguiente motivo: {selectedRegistro.motivoIntermitente}
                      </span>
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
                            patologiaDescripcion: selectedRegistro.patologiaDescripcion || "",
                            telefono: selectedRegistro.telefono || "",
                            retirado: selectedRegistro.retirado || "NO",
                            retiradoRazon: selectedRegistro.retiradoRazon || "",
                            fechaNacimiento: formattedBirthDate,
                            jefeFamilia: selectedRegistro.jefeFamilia || "NO",
                            perteneceNucleo: selectedRegistro.perteneceNucleo || "NO",
                            cedulaJefeFamilia: jefeNum,
                            intermitente: selectedRegistro.intermitente || "NO",
                            motivoIntermitente: selectedRegistro.motivoIntermitente || "",
                          });
                          setEditMedicamentos(Array.isArray(selectedRegistro.medicamentos) ? selectedRegistro.medicamentos : []);
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
                        <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                          <select
                            value={editData.nacionalidad || "V"}
                            onChange={e => setEditData(prev => ({ ...prev, nacionalidad: e.target.value }))}
                            style={{ width: "80px", height: "42px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem" }}
                          >
                            <option value="V">V</option>
                            <option value="E">E</option>
                          </select>
                          <input
                            type="text"
                            value={editData.cedula || ""}
                            onChange={e => setEditData(prev => ({ ...prev, cedula: e.target.value.replace(/\D/g, "") }))}
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            className="btn-submit"
                            style={{ width: "auto", margin: 0, padding: "0 1rem", fontSize: "0.8rem", height: "auto" }}
                            onClick={async () => {
                              if (!editData.cedula) return;
                              const citizen = await buscarCedulaEnCliente(String(editData.cedula));
                              if (citizen) {
                                setEditData(prev => ({
                                  ...prev,
                                  nombreApellido: citizen.nombreCompleto || prev.nombreApellido,
                                  genero: citizen.sexo === "F" || citizen.sexo === "FEMENINO" ? "FEMENINO" : "MASCULINO"
                                }));
                                showToast("Datos cargados del padrón local", "success");
                              } else {
                                showToast("Cédula no encontrada en el padrón local", "warning");
                              }
                            }}
                          >
                            Consultar Padrón
                          </button>
                        </div>
                      </div>

                      {editData.isChildDependent && (
                        <div className="form-group detail-field--full">
                          <label>Número correlativo de hijo/dependiente</label>
                          <select
                            value={editData.dependentNumber || "1"}
                            onChange={(e) => setEditData(prev => ({ ...prev, dependentNumber: e.target.value }))}
                            style={{ width: "100%", height: "42px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem", backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }}
                          >
                            <option value="1">1er Hijo/Representado (-1)</option>
                            <option value="2">2do Hijo/Representado (-2)</option>
                            <option value="3">3er Hijo/Representado (-3)</option>
                            <option value="4">4to Hijo/Representado (-4)</option>
                            <option value="5">5to Hijo/Representado (-5)</option>
                          </select>
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
                    <label>Fecha de Nacimiento (DD/MM/AAAA)</label>
                    <input
                      type="text"
                      value={editData.fechaNacimiento || ""}
                      onChange={e => {
                        const rawVal = e.target.value.replace(/\D/g, "");
                        let formatted = rawVal.slice(0, 2);
                        if (rawVal.length > 2) formatted += "/" + rawVal.slice(2, 4);
                        if (rawVal.length > 4) formatted += "/" + rawVal.slice(4, 8);
                        setEditData(prev => ({ ...prev, fechaNacimiento: formatted }));
                      }}
                      placeholder="DD/MM/AAAA"
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
                    <label>¿Es Jefe de Familia?</label>
                    <select value={editData.jefeFamilia || "NO"}
                      onChange={e => setEditData(prev => ({ ...prev, jefeFamilia: e.target.value }))}>
                      <option value="NO">No</option>
                      <option value="SI">Sí</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>¿Pertenece a un Núcleo Familiar?</label>
                    <select value={editData.perteneceNucleo || "NO"}
                      onChange={e => setEditData(prev => ({ ...prev, perteneceNucleo: e.target.value }))}>
                      <option value="NO">No</option>
                      <option value="SI">Sí</option>
                    </select>
                  </div>
                  {editData.perteneceNucleo === "SI" && editData.jefeFamilia === "NO" && (
                    <div className="form-group detail-field--full">
                      <label>Cédula del Jefe de Familia</label>
                      <input
                        type="text"
                        value={editData.cedulaJefeFamilia || ""}
                        onChange={e => setEditData(prev => ({ ...prev, cedulaJefeFamilia: e.target.value.replace(/\D/g, "") }))}
                        placeholder="Ingrese la cédula del jefe de familia"
                      />
                    </div>
                  )}
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
                    <label>Género</label>
                    <select value={editData.genero || ""}
                      onChange={e => setEditData(prev => ({ ...prev, genero: e.target.value }))}>
                      <option value="MASCULINO">Masculino</option>
                      <option value="FEMENINO">Femenino</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Estado Físico</label>
                    <select value={editData.estadoFisico || ""}
                      onChange={e => setEditData(prev => ({ ...prev, estadoFisico: e.target.value }))}>
                      <option value="ILESO">Ileso</option>
                      <option value="LESIONADO">Lesionado</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Patología</label>
                    <select value={editData.patologia || ""}
                      onChange={e => setEditData(prev => ({ ...prev, patologia: e.target.value }))}>
                      <option value="NO">No</option>
                      <option value="SI">Sí</option>
                    </select>
                  </div>
                  {editData.patologia === "SI" && (
                    <div className="form-group detail-field--full">
                      <label>Descripción de Patología</label>
                      <input type="text" value={editData.patologiaDescripcion || ""}
                        onChange={e => setEditData(prev => ({ ...prev, patologiaDescripcion: e.target.value }))} />
                    </div>
                  )}
                  {(editData.patologia === "SI" || editData.estadoFisico === "LESIONADO") && (
                    <div className="form-group detail-field--full">
                      <div className="med-section">
                        <div className="med-section-header">
                          <span className="med-section-title">Medicamentos</span>
                          <button type="button" className="btn-add-med" onClick={addEditMed}>
                            + Agregar
                          </button>
                        </div>
                        {editMedicamentos.length === 0 ? (
                          <p className="med-empty">Sin medicamentos. Usa "+ Agregar" para añadir.</p>
                        ) : (
                          <>
                            <div className="med-row med-row--header">
                              <span>Nombre</span>
                              <span>Dosis</span>
                              <span>Período</span>
                              <span />
                            </div>
                            {editMedicamentos.map((m, i) => (
                              <div key={i} className="med-row">
                                <input className="med-input" placeholder="ej: Metformina" value={m.nombre}
                                  onChange={e => updateEditMed(i, "nombre", e.target.value)} />
                                <input className="med-input" placeholder="ej: 500mg" value={m.dosis}
                                  onChange={e => updateEditMed(i, "dosis", e.target.value)} />
                                <input className="med-input" placeholder="ej: 2 veces/día" value={m.periodo}
                                  onChange={e => updateEditMed(i, "periodo", e.target.value)} />
                                <button type="button" className="btn-remove-med" onClick={() => removeEditMed(i)}>×</button>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}
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
                  <div className="form-group">
                    <label>Retirado / Egresado</label>
                    <select value={editData.retirado || "NO"}
                      onChange={e => setEditData(prev => ({ ...prev, retirado: e.target.value }))}>
                      <option value="NO">No</option>
                      <option value="SI">Sí</option>
                    </select>
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
                    <select value={editData.intermitente || "NO"}
                      onChange={e => setEditData(prev => ({ ...prev, intermitente: e.target.value, motivoIntermitente: e.target.value === "NO" ? "" : prev.motivoIntermitente }))}>
                      <option value="NO">No</option>
                      <option value="SI">Sí</option>
                    </select>
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
                    onClick={() => setEditMode(false)} disabled={savingEdit}>
                    Cancelar
                  </button>
                  <button type="button" className="btn-submit" style={{ flex: 1 }}
                    onClick={handleSaveEdit} disabled={savingEdit}>
                    {savingEdit ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>
              </>
            )}

            {/* ── ASIGNAR CUARTO (visible si puede registrar: MASTER/ADMIN/REGISTRADOR) ── */}
            {canRegister(currentUser.role) && (
              <div className="modal-cuarto-section">
                <div className="section-title" style={{ margin: "0 0 0.625rem" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Asignación de Alojamiento
                </div>
                <div className="form-group">
                  <label htmlFor="cuarto-select">Cuarto / Salón</label>
                  <select id="cuarto-select" value={asignCuarto}
                    onChange={e => setAsignCuarto(e.target.value)}>
                    <option value="">— Seleccionar cuarto —</option>
                    {allCuartos.map(c => {
                      const count = roomCounts[c] || 0;
                      let emoji = "🟢";
                      if (count >= 17) {
                        emoji = "🔴";
                      } else if (count >= 11) {
                        emoji = "🟡";
                      }
                      return <option key={c} value={c}>{emoji} {c} ({count} {count === 1 ? 'ocupante' : 'ocupantes'})</option>;
                    })}
                  </select>
                  {asignCuarto && (() => {
                    const count = roomCounts[asignCuarto] || 0;
                    let color = "#10b981"; // Green
                    if (count >= 17) {
                      color = "#ef4444"; // Red
                    } else if (count >= 11) {
                      color = "#f59e0b"; // Yellow/Amber
                    }
                    return (
                      <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", fontWeight: "800", color: color }}>
                        Ocupantes: {count}/18
                      </div>
                    );
                  })()}
                </div>
                <button type="button" className="btn-submit" style={{ marginTop: "0.625rem" }}
                  onClick={handleAsignarCuarto}
                  disabled={savingCuarto || !asignCuarto || asignCuarto === selectedRegistro.cuarto}>
                  {savingCuarto ? "Guardando..." : selectedRegistro.cuarto ? "Reasignar Cuarto" : "Confirmar Asignación"}
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
}
