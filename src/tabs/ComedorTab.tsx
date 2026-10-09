"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAppContext } from "@/context/AppContext";
import { apiFetch } from "@/lib/apiFetch";
import { normalizeText } from "@/lib/helpers";
import StyledSelect from "@/components/StyledSelect";
import ComedorCarnetModal from "@/components/ComedorCarnetModal";
import ComedorCreateCarnetModal from "@/components/ComedorCreateCarnetModal";
import ComedorBulkCarnetsModal from "@/components/ComedorBulkCarnetsModal";
import ComedorQrScannerModal from "@/components/ComedorQrScannerModal";
import ComedorGraficas from "@/components/ComedorGraficas";
import type {
  ComedorBeneficiario,
  ComedorRegistroItem,
  ComedorServicio,
  ComedorStats,
} from "@/types";

export default function ComedorTab() {
  const {
    currentUser,
    effectiveRefugio,
    refugiosList,
    showToast,
  } = useAppContext();

  // Submódulo activo: 1 = Carnets, 2 = Control/Escáner, 3 = Gráficas
  const [submodulo, setSubmodulo] = useState<1 | 2 | 3>(1);

  // Campamento seleccionado para el comedor (default: effectiveRefugio del usuario)
  const [selectedRefugio, setSelectedRefugio] = useState<string>(() => {
    return effectiveRefugio || "TODOS";
  });

  useEffect(() => {
    if (effectiveRefugio && selectedRefugio === "TODOS") {
      setSelectedRefugio(effectiveRefugio);
    }
  }, [effectiveRefugio, selectedRefugio]);

  // Fecha y servicio actual para el control de comidas
  const todayYmd = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Determinar servicio por la hora actual (mañana = Desayuno, tarde = Almuerzo, noche = Cena)
  const defaultServicio = useMemo<ComedorServicio>(() => {
    const hora = new Date().getHours();
    if (hora < 11) return "DESAYUNO";
    if (hora < 17) return "ALMUERZO";
    return "CENA";
  }, []);

  const [fechaControl, setFechaControl] = useState<string>(todayYmd);
  const [servicioControl, setServicioControl] = useState<ComedorServicio>(defaultServicio);

  // ── ESTADO SUBMÓDULO 1: BENEFICIARIOS Y CARNETS ──────────────────────────────
  const [beneficiarios, setBeneficiarios] = useState<ComedorBeneficiario[]>([]);
  const [loadingBeneficiarios, setLoadingBeneficiarios] = useState(false);
  const [searchBeneficiario, setSearchBeneficiario] = useState("");
  const [filterTipoBeneficiario, setFilterTipoBeneficiario] = useState<string>("");
  const [selectedCarnet, setSelectedCarnet] = useState<ComedorBeneficiario | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [createCarnetModalOpen, setCreateCarnetModalOpen] = useState(false);
  const [editingCarnet, setEditingCarnet] = useState<ComedorBeneficiario | null>(null);

  // Eliminar carnet exclusivo de comedor
  const handleDeleteManualCarnet = async (b: ComedorBeneficiario) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar el carnet de Comedor de "${b.nombreApellido}" (${b.cedula})? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      const res = await apiFetch(`/api/comedor?beneficiarioId=${encodeURIComponent(b.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al eliminar beneficiario.");
      }
      showToast("Carnet de comedor eliminado correctamente.", "success");
      fetchBeneficiarios();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Error al eliminar beneficiario.", "error");
    }
  };

  // Paginación Submódulo 1
  const [pageBeneficiarios, setPageBeneficiarios] = useState(1);
  const [pageSizeBeneficiarios, setPageSizeBeneficiarios] = useState(25);

  // ── ESTADO SUBMÓDULO 2: CONTROL Y ENTREGAS ───────────────────────────────────
  const [entregas, setEntregas] = useState<ComedorRegistroItem[]>([]);
  const [loadingEntregas, setLoadingEntregas] = useState(false);
  const [totalesEntregas, setTotalesEntregas] = useState({
    totalRaciones: 0,
    totalAtendidos: 0,
    desayunoRaciones: 0,
    almuerzoRaciones: 0,
    cenaRaciones: 0,
    desayunoAtendidos: 0,
    almuerzoAtendidos: 0,
    cenaAtendidos: 0,
  });
  const [scannerOpen, setScannerOpen] = useState(false);
  const [quickCedula, setQuickCedula] = useState("");
  const [registeringQuick, setRegisteringQuick] = useState(false);

  // Paginación Submódulo 2
  const [pageEntregas, setPageEntregas] = useState(1);
  const [pageSizeEntregas, setPageSizeEntregas] = useState(25);

  // ── ESTADO SUBMÓDULO 3: GRÁFICAS Y ESTADÍSTICAS ──────────────────────────────
  const [stats, setStats] = useState<ComedorStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [rangoDias, setRangoDias] = useState<number>(14);

  // ── CARGA DE DATOS ───────────────────────────────────────────────────────────

  // Cargar beneficiarios (Submódulo 1)
  const fetchBeneficiarios = useCallback(async () => {
    setLoadingBeneficiarios(true);
    try {
      const q = selectedRefugio ? `&refugio=${encodeURIComponent(selectedRefugio)}` : "";
      const res = await apiFetch(`/api/comedor?type=beneficiarios${q}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setBeneficiarios(data.beneficiarios || []);
      }
    } catch (err) {
      console.error(err);
      showToast("Error al cargar beneficiarios del comedor.", "error");
    } finally {
      setLoadingBeneficiarios(false);
    }
  }, [selectedRefugio, showToast]);

  // Cargar entregas del día y servicio (Submódulo 2)
  const fetchEntregas = useCallback(async () => {
    setLoadingEntregas(true);
    try {
      const qRef = selectedRefugio ? `&refugio=${encodeURIComponent(selectedRefugio)}` : "";
      const qFecha = fechaControl ? `&fecha=${encodeURIComponent(fechaControl)}` : "";
      const qServ = servicioControl ? `&servicio=${encodeURIComponent(servicioControl)}` : "";
      const res = await apiFetch(`/api/comedor?type=entregas${qRef}${qFecha}${qServ}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setEntregas(data.entregas || []);
        if (data.totales) {
          setTotalesEntregas(data.totales);
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Error al cargar entregas del comedor.", "error");
    } finally {
      setLoadingEntregas(false);
    }
  }, [selectedRefugio, fechaControl, servicioControl, showToast]);

  // Cargar estadísticas y gráficas (Submódulo 3)
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const qRef = selectedRefugio ? `&refugio=${encodeURIComponent(selectedRefugio)}` : "";
      const res = await apiFetch(`/api/comedor?type=stats${qRef}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error(err);
      showToast("Error al cargar estadísticas del comedor.", "error");
    } finally {
      setLoadingStats(false);
    }
  }, [selectedRefugio, showToast]);

  // Disparar carga según el submódulo y refugio
  useEffect(() => {
    if (submodulo === 1) {
      fetchBeneficiarios();
    } else if (submodulo === 2) {
      fetchEntregas();
    } else if (submodulo === 3) {
      fetchStats();
    }
  }, [submodulo, selectedRefugio, fetchBeneficiarios, fetchEntregas, fetchStats]);

  // Re-cargar entregas cuando cambia fecha o servicio en el Submódulo 2
  useEffect(() => {
    if (submodulo === 2) {
      fetchEntregas();
    }
  }, [fechaControl, servicioControl, submodulo, fetchEntregas]);

  // ── FILTRADO Y PAGINACIÓN SUBMÓDULO 1: BENEFICIARIOS ────────────────────────
  const filteredBeneficiarios = useMemo(() => {
    let result = beneficiarios;
    if (searchBeneficiario.trim()) {
      const q = normalizeText(searchBeneficiario);
      const digits = searchBeneficiario.replace(/\D/g, "");
      result = result.filter((b) => {
        if (normalizeText(b.nombreApellido).includes(q)) return true;
        if (normalizeText(b.cedula).includes(q)) return true;
        if (digits && b.cedula.replace(/\D/g, "").includes(digits)) return true;
        if (b.cuarto && normalizeText(b.cuarto).includes(q)) return true;
        return false;
      });
    }
    if (filterTipoBeneficiario === "MANUAL") {
      result = result.filter((b) => Boolean(b.isManual || b.origen === "COMEDOR"));
    } else if (filterTipoBeneficiario) {
      result = result.filter((b) => b.tipoBeneficiario === filterTipoBeneficiario);
    }
    return result;
  }, [beneficiarios, searchBeneficiario, filterTipoBeneficiario]);

  // Reiniciar a página 1 al cambiar filtros de beneficiarios
  useEffect(() => {
    setPageBeneficiarios(1);
  }, [searchBeneficiario, filterTipoBeneficiario, selectedRefugio]);

  const totalPagesBeneficiarios = Math.max(1, Math.ceil(filteredBeneficiarios.length / pageSizeBeneficiarios));

  const paginatedBeneficiarios = useMemo(() => {
    const start = (pageBeneficiarios - 1) * pageSizeBeneficiarios;
    return filteredBeneficiarios.slice(start, start + pageSizeBeneficiarios);
  }, [filteredBeneficiarios, pageBeneficiarios, pageSizeBeneficiarios]);

  // ── PAGINACIÓN SUBMÓDULO 2: ENTREGAS ─────────────────────────────────────────
  useEffect(() => {
    setPageEntregas(1);
  }, [fechaControl, servicioControl, selectedRefugio]);

  const totalPagesEntregas = Math.max(1, Math.ceil(entregas.length / pageSizeEntregas));

  const paginatedEntregas = useMemo(() => {
    const start = (pageEntregas - 1) * pageSizeEntregas;
    return entregas.slice(start, start + pageSizeEntregas);
  }, [entregas, pageEntregas, pageSizeEntregas]);

  // ── REGISTRO RÁPIDO MANUAL EN SUBMÓDULO 2 ───────────────────────────────────
  const handleQuickRegister = async () => {
    if (!quickCedula.trim()) {
      showToast("Ingresa una cédula para registrar la entrega.", "warning");
      return;
    }
    setRegisteringQuick(true);
    try {
      // 1. Lookup
      const lookupRes = await apiFetch("/api/comedor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lookup",
          qrInput: quickCedula.trim(),
          refugio: selectedRefugio,
          fecha: fechaControl,
          servicio: servicioControl,
        }),
      });

      const lookupData = await lookupRes.json().catch(() => ({}));

      if (!lookupRes.ok || !lookupData.success) {
        throw new Error(lookupData.error || "No se encontró ningún beneficiario con esa cédula.");
      }

      if (lookupData.yaRetiro) {
        showToast(`⚠️ Esta persona ya retiró ${servicioControl} el día de hoy (${fechaControl}).`, "warning");
        return;
      }

      const b = lookupData.beneficiario;

      // 2. Registrar entrega
      const postRes = await apiFetch("/api/comedor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "entrega",
          cedula: b.cedula,
          nombre: b.nombreApellido,
          telefono: b.telefono,
          refugio: b.refugio,
          tipoBeneficiario: b.tipoBeneficiario,
          fecha: fechaControl,
          servicio: servicioControl,
          raciones: b.raciones,
          registroId: b.id,
        }),
      });

      const postData = await postRes.json().catch(() => ({}));

      if (!postRes.ok || !postData.success) {
        throw new Error(postData.error || "No se pudo registrar la entrega.");
      }

      showToast(`✅ Entrega registrada: ${b.nombreApellido} (${b.raciones} platos de ${servicioControl})`, "success");
      setQuickCedula("");
      fetchEntregas();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Error al registrar la entrega.", "error");
    } finally {
      setRegisteringQuick(false);
    }
  };

  // ── ELIMINAR / ANULAR ENTREGA ───────────────────────────────────────────────
  const handleDeleteEntrega = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Está seguro de anular la entrega registrada para ${nombre}?`)) {
      return;
    }
    try {
      const res = await apiFetch(`/api/comedor?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast("Entrega anulada correctamente.", "success");
        fetchEntregas();
      } else {
        showToast("No se pudo anular la entrega.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error al anular la entrega.", "error");
    }
  };

  return (
    <div className="tab-pane active comedor-container">
      {/* CABECERA PRINCIPAL DEL MÓDULO */}
      <div className="comedor-card comedor-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "1.4rem" }}>🍲</span>
            <div className="dashboard-section-title" style={{ margin: 0, color: "var(--text-primary)" }}>
              Comedor Comunitario
            </div>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: "999px",
                background: "rgba(37, 99, 235, 0.12)",
                color: "var(--color-primary, #2563eb)",
                fontWeight: 700,
              }}
            >
              Master / Master Comedor
            </span>
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "2px" }}>
            Control de alimentación, carnets digitales con QR recortables (8 por hoja) y métricas de raciones
          </div>
        </div>

        {/* SELECTOR DE CAMPAMENTO */}
        <div className="comedor-refugio-selector" style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: "260px" }}>
          <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
            Campamento:
          </label>
          <div style={{ flex: 1 }}>
            <StyledSelect
              value={selectedRefugio}
              onChange={setSelectedRefugio}
              ariaLabel="Seleccionar Campamento"
              options={[
                { value: "TODOS", label: "Todos los Campamentos" },
                ...(refugiosList || []).map((r) => ({ value: r.nombre, label: r.nombre })),
              ]}
            />
          </div>
        </div>
      </div>

      {/* SELECTOR DE SUBMÓDULOS (3 PESTAÑAS) */}
      <div className="comedor-submodulos-bar">
        <button
          type="button"
          onClick={() => setSubmodulo(1)}
          className={`comedor-tab-btn ${submodulo === 1 ? "active" : ""}`}
        >
          <span>🪪</span>
          <span>1. Carnets</span>
          <span className="tab-count" style={{ fontSize: "0.75rem", opacity: 0.75 }}>({beneficiarios.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubmodulo(2)}
          className={`comedor-tab-btn ${submodulo === 2 ? "active" : ""}`}
        >
          <span>📷</span>
          <span>2. Control QR</span>
          <span className="tab-count" style={{ fontSize: "0.75rem", opacity: 0.75 }}>({entregas.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubmodulo(3)}
          className={`comedor-tab-btn ${submodulo === 3 ? "active" : ""}`}
        >
          <span>📊</span>
          <span>3. Gráficas</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SUBMÓDULO 1: CARNETS DIGITALES (LISTA DE JEFES Y PERSONAS SOLAS)
          ══════════════════════════════════════════════════════════════════════════ */}
      {submodulo === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Barra de búsqueda, filtros y Botón de Descarga Masiva */}
          <div
            className="comedor-card comedor-toolbar-row"
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              flexWrap: "wrap",
              padding: "0.85rem 1rem",
            }}
          >
            <div style={{ flex: 1, minWidth: "200px" }}>
              <input
                type="text"
                placeholder="Buscar por nombre, cédula o habitación..."
                value={searchBeneficiario}
                onChange={(e) => setSearchBeneficiario(e.target.value)}
                style={{ width: "100%", padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}
              />
            </div>

            <div style={{ width: "205px" }}>
              <StyledSelect
                value={filterTipoBeneficiario}
                onChange={setFilterTipoBeneficiario}
                ariaLabel="Filtrar por Condición"
                options={[
                  { value: "", label: "Todas las Condiciones" },
                  { value: "JEFE", label: "Jefes de Familia" },
                  { value: "SOLO", label: "Personas Solas" },
                  { value: "MANUAL", label: "🍽️ Creados en Comedor" },
                ]}
              />
            </div>

            <button
              type="button"
              className="toolbar-btn"
              onClick={fetchBeneficiarios}
              disabled={loadingBeneficiarios}
              title="Refrescar lista"
            >
              {loadingBeneficiarios ? <span className="spinner spinner-sm" /> : "🔄 Refrescar"}
            </button>

            {/* BOTÓN CREAR CARNET QR EXCLUSIVO COMEDOR */}
            <button
              type="button"
              className="btn-submit"
              onClick={() => {
                setEditingCarnet(null);
                setCreateCarnetModalOpen(true);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
                padding: "0.52rem 1rem",
                fontSize: "0.85rem",
                whiteSpace: "nowrap",
                background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
                boxShadow: "0 2px 6px rgba(109, 40, 217, 0.3)",
              }}
              title="Crear un carnet QR exclusivo para el módulo de Comedor"
            >
              <span style={{ fontSize: "1.1rem" }}>➕</span>
              <span>Crear QR / Carnet</span>
            </button>

            {/* BOTÓN MASIVO DE CARNETS (8 POR HOJA) */}
            <button
              type="button"
              className="btn-submit"
              onClick={() => setBulkModalOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
                padding: "0.52rem 1rem",
                fontSize: "0.85rem",
                whiteSpace: "nowrap",
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)",
              }}
              title="Descargar o imprimir carnets masivos (8 por hoja)"
            >
              <span style={{ fontSize: "1.1rem" }}>🖨️</span>
              <span>Carnets Masivos (8 por hoja)</span>
            </button>
          </div>

          {/* Listado de Beneficiarios */}
          <div className="comedor-card" style={{ overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1.25rem",
                borderBottom: "1px solid var(--border-color)",
                background: "var(--bg-primary)",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                Beneficiarios que Pernoctan (Jefes y Solos)
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {filteredBeneficiarios.length > 0 ? (pageBeneficiarios - 1) * pageSizeBeneficiarios + 1 : 0}–
                {Math.min(pageBeneficiarios * pageSizeBeneficiarios, filteredBeneficiarios.length)} de{" "}
                <strong>{filteredBeneficiarios.length}</strong>
              </div>
            </div>

            {loadingBeneficiarios ? (
              <div style={{ padding: "3rem", textAlign: "center" }}>
                <span className="spinner" />
                <p style={{ marginTop: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                  Cargando beneficiarios activos del campamento...
                </p>
              </div>
            ) : filteredBeneficiarios.length === 0 ? (
              <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-secondary)" }}>
                <span style={{ fontSize: "2rem", display: "block", marginBottom: "0.5rem" }}>🔍</span>
                <p style={{ fontWeight: 700, color: "var(--text-primary)" }}>No se encontraron beneficiarios.</p>
                <span style={{ fontSize: "0.8rem" }}>
                  Verifique que las personas registradas no estén en estatus de retiro o cambie el filtro.
                </span>
              </div>
            ) : (
              <>
                {/* 1. VISTA DE TABLA (ESCRITORIO / PANTALLAS GRANDES) */}
                <div className="comedor-desktop-table table-responsive" style={{ overflowX: "auto" }}>
                  <table className="registro-table" style={{ width: "100%", fontSize: "0.85rem" }}>
                    <thead>
                      <tr>
                        <th style={{ width: "45px", textAlign: "center" }}>#</th>
                        <th>Beneficiario</th>
                        <th>Cédula</th>
                        <th>Teléfono</th>
                        <th>Alojamiento</th>
                        <th style={{ textAlign: "center" }}>Condición</th>
                        <th style={{ textAlign: "center" }}>Carga / Raciones</th>
                        <th style={{ textAlign: "center", width: "160px" }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedBeneficiarios.map((b, idx) => {
                        const globalIndex = (pageBeneficiarios - 1) * pageSizeBeneficiarios + idx + 1;
                        const isManual = Boolean(b.isManual || b.origen === "COMEDOR");
                        return (
                          <tr key={b.id}>
                            <td style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                              {globalIndex}
                            </td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{b.nombreApellido}</span>
                                {isManual && (
                                  <span
                                    title="Carnet registrado exclusivamente en Comedor"
                                    style={{
                                      fontSize: "0.68rem",
                                      fontWeight: 700,
                                      padding: "1px 6px",
                                      borderRadius: "999px",
                                      background: "rgba(139, 92, 246, 0.14)",
                                      color: "#8b5cf6",
                                      border: "1px solid rgba(139, 92, 246, 0.28)",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    🍽️ Comedor
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                                {b.refugio}
                                {b.observacion && ` · 📝 ${b.observacion}`}
                              </div>
                            </td>
                            <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{b.cedula}</td>
                            <td style={{ color: "var(--text-secondary)" }}>{b.telefono || "—"}</td>
                            <td style={{ color: "var(--text-secondary)" }}>
                              {b.cuarto || <span style={{ color: "var(--text-muted)" }}>{isManual ? "No aplica" : "Sin asignar"}</span>}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: "999px",
                                  background: b.tipoBeneficiario === "JEFE" ? "rgba(2, 132, 199, 0.15)" : "rgba(16, 185, 129, 0.15)",
                                  color: b.tipoBeneficiario === "JEFE" ? "#0284c7" : "#059669",
                                }}
                              >
                                {b.tipoBeneficiario === "JEFE" ? "Jefe de Familia" : "Persona Sola"}
                              </span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span style={{ fontWeight: 800, color: "var(--color-primary, #2563eb)", fontSize: "0.95rem" }}>
                                {b.raciones}
                              </span>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: "4px" }}>
                                {b.raciones === 1 ? "ración" : "raciones"}
                              </span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <button
                                  type="button"
                                  className="toolbar-btn toolbar-btn--primary"
                                  style={{ padding: "0.3rem 0.65rem", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                                  onClick={() => setSelectedCarnet(b)}
                                  title="Ver carnet digital con código QR"
                                >
                                  <span>🪪</span>
                                  <span>Carnet</span>
                                </button>
                                {isManual && (
                                  <>
                                    <button
                                      type="button"
                                      className="toolbar-btn"
                                      style={{ padding: "0.3rem 0.5rem", fontSize: "0.8rem" }}
                                      onClick={() => {
                                        setEditingCarnet(b);
                                        setCreateCarnetModalOpen(true);
                                      }}
                                      title="Editar carnet de comedor"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      type="button"
                                      className="toolbar-btn toolbar-btn--danger"
                                      style={{ padding: "0.3rem 0.5rem", fontSize: "0.8rem" }}
                                      onClick={() => handleDeleteManualCarnet(b)}
                                      title="Eliminar carnet de comedor"
                                    >
                                      🗑️
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 2. VISTA DE TARJETAS MÓVILES (TELÉFONOS / PANTALLAS PEQUEÑAS) */}
                <div className="comedor-mobile-cards">
                  {paginatedBeneficiarios.map((b, idx) => {
                    const globalIndex = (pageBeneficiarios - 1) * pageSizeBeneficiarios + idx + 1;
                    const isManual = Boolean(b.isManual || b.origen === "COMEDOR");
                    return (
                      <div key={b.id} className="comedor-mobile-card">
                        <div className="comedor-mobile-card-top">
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                                #{globalIndex} {b.nombreApellido}
                              </span>
                              {isManual && (
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    padding: "1px 6px",
                                    borderRadius: "999px",
                                    background: "rgba(139, 92, 246, 0.14)",
                                    color: "#8b5cf6",
                                    border: "1px solid rgba(139, 92, 246, 0.28)",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  🍽️ Comedor
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                              {b.refugio}
                              {b.observacion && ` · 📝 ${b.observacion}`}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "999px",
                              background: b.tipoBeneficiario === "JEFE" ? "rgba(2, 132, 199, 0.15)" : "rgba(16, 185, 129, 0.15)",
                              color: b.tipoBeneficiario === "JEFE" ? "#0284c7" : "#059669",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {b.tipoBeneficiario === "JEFE" ? "Jefe Familia" : "Persona Sola"}
                          </span>
                        </div>

                        <div className="comedor-mobile-card-body">
                          <div>
                            <span style={{ color: "var(--text-muted)", display: "block" }}>Cédula:</span>
                            <strong style={{ color: "var(--text-primary)" }}>{b.cedula}</strong>
                          </div>
                          <div>
                            <span style={{ color: "var(--text-muted)", display: "block" }}>Teléfono:</span>
                            <span style={{ color: "var(--text-secondary)" }}>{b.telefono || "—"}</span>
                          </div>
                          <div>
                            <span style={{ color: "var(--text-muted)", display: "block" }}>Alojamiento:</span>
                            <span style={{ color: "var(--text-secondary)" }}>{b.cuarto || (isManual ? "No aplica" : "Sin asignar")}</span>
                          </div>
                          <div>
                            <span style={{ color: "var(--text-muted)", display: "block" }}>Raciones autorizadas:</span>
                            <strong style={{ color: "var(--color-primary, #2563eb)", fontSize: "0.95rem" }}>
                              🍽️ {b.raciones} {b.raciones === 1 ? "ración" : "raciones"}
                            </strong>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                          <button
                            type="button"
                            className="btn-submit"
                            style={{
                              flex: 1,
                              padding: "0.55rem",
                              fontSize: "0.85rem",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "0.4rem",
                            }}
                            onClick={() => setSelectedCarnet(b)}
                          >
                            <span>🪪</span>
                            <span>Ver Carnet</span>
                          </button>
                          {isManual && (
                            <>
                              <button
                                type="button"
                                className="toolbar-btn"
                                style={{ padding: "0.55rem 0.75rem" }}
                                onClick={() => {
                                  setEditingCarnet(b);
                                  setCreateCarnetModalOpen(true);
                                }}
                                title="Editar carnet de comedor"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                className="toolbar-btn toolbar-btn--danger"
                                style={{ padding: "0.55rem 0.75rem" }}
                                onClick={() => handleDeleteManualCarnet(b)}
                                title="Eliminar carnet de comedor"
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* BARRA DE PAGINACIÓN SUBMÓDULO 1 */}
                <div
                  className="comedor-pagination-bar"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    padding: "0.75rem 1.25rem",
                    borderTop: "1px solid var(--border-color)",
                    background: "var(--bg-primary)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Registros por página:
                    </span>
                    <select
                      value={pageSizeBeneficiarios}
                      onChange={(e) => {
                        setPageSizeBeneficiarios(Number(e.target.value));
                        setPageBeneficiarios(1);
                      }}
                      style={{
                        padding: "3px 8px",
                        fontSize: "0.8rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        background: "var(--card-bg, var(--bg-secondary))",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      <option value={15}>15</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap", justifyContent: "center" }}>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => setPageBeneficiarios(1)}
                      disabled={pageBeneficiarios <= 1}
                      style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                      title="Primera página"
                    >
                      « Primera
                    </button>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => setPageBeneficiarios((p) => Math.max(1, p - 1))}
                      disabled={pageBeneficiarios <= 1}
                      style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                      title="Página anterior"
                    >
                      ‹ Anterior
                    </button>

                    <span style={{ fontSize: "0.8rem", fontWeight: 700, padding: "0 0.5rem", color: "var(--text-primary)" }}>
                      Página {pageBeneficiarios} de {totalPagesBeneficiarios}
                    </span>

                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => setPageBeneficiarios((p) => Math.min(totalPagesBeneficiarios, p + 1))}
                      disabled={pageBeneficiarios >= totalPagesBeneficiarios}
                      style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                      title="Página siguiente"
                    >
                      Siguiente ›
                    </button>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => setPageBeneficiarios(totalPagesBeneficiarios)}
                      disabled={pageBeneficiarios >= totalPagesBeneficiarios}
                      style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                      title="Última página"
                    >
                      Última »
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          SUBMÓDULO 2: CONTROL Y ESCANEO DE COMEDOR (REGISTRO POR DÍA Y SERVICIO)
          ══════════════════════════════════════════════════════════════════════════ */}
      {submodulo === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* PANEL DE CONTROL SUPERIOR: FECHA, SERVICIO Y BOTÓN DE ESCÁNER */}
          <div
            className="comedor-card"
            style={{
              padding: "1.15rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              {/* Fecha y servicio */}
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", width: "100%" }}>
                <div style={{ flex: "1 1 180px" }}>
                  <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>
                    Fecha del Servicio:
                  </label>
                  <input
                    type="date"
                    value={fechaControl}
                    onChange={(e) => setFechaControl(e.target.value)}
                    style={{ width: "100%", padding: "0.45rem 0.75rem", fontSize: "0.9rem", borderRadius: "8px" }}
                  />
                </div>

                <div style={{ flex: "2 1 240px" }}>
                  <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>
                    Tipo de Comida:
                  </label>
                  <div className="btn-seg-group" style={{ display: "flex", width: "100%" }}>
                    {(["DESAYUNO", "ALMUERZO", "CENA"] as ComedorServicio[]).map((serv) => (
                      <button
                        key={serv}
                        type="button"
                        className={`toolbar-btn ${servicioControl === serv ? "toolbar-btn--primary" : ""}`}
                        style={{ flex: 1, padding: "0.45rem 0.5rem", fontSize: "0.82rem", fontWeight: 700, textAlign: "center" }}
                        onClick={() => setServicioControl(serv)}
                      >
                        {serv === "DESAYUNO" ? "☀️ Desayuno" : serv === "ALMUERZO" ? "🍽️ Almuerzo" : "🌙 Cena"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Botón destacado: Abrir Escáner QR */}
              <div style={{ width: "100%" }}>
                <button
                  type="button"
                  className="btn-submit"
                  style={{
                    width: "100%",
                    padding: "0.75rem 1.25rem",
                    fontSize: "0.98rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
                  }}
                  onClick={() => setScannerOpen(true)}
                >
                  <span style={{ fontSize: "1.25rem" }}>📷</span>
                  <span>Escanear Carnet QR con Cámara</span>
                </button>
              </div>
            </div>

            {/* BARRA DE REGISTRO RÁPIDO MANUAL */}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                flexWrap: "wrap",
                paddingTop: "0.75rem",
                borderTop: "1px dashed var(--border-color)",
              }}
            >
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                Registro Rápido por Cédula:
              </span>
              <div style={{ display: "flex", gap: "0.5rem", flex: 1, minWidth: "220px" }}>
                <input
                  type="text"
                  placeholder="Ingresar cédula (ej. V-12345678)..."
                  value={quickCedula}
                  onChange={(e) => setQuickCedula(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleQuickRegister();
                  }}
                  style={{ flex: 1, padding: "0.45rem 0.75rem", fontSize: "0.85rem" }}
                />
                <button
                  type="button"
                  className="btn-submit"
                  onClick={handleQuickRegister}
                  disabled={registeringQuick || !quickCedula.trim()}
                  style={{ padding: "0.45rem 0.85rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}
                >
                  {registeringQuick ? "Registrando..." : "Registrar"}
                </button>
              </div>
            </div>
          </div>

          {/* TARJETAS RESUMEN DE LAS ENTREGAS DE HOY / FECHA */}
          <div className="comedor-kpi-grid">
            <div className="comedor-kpi-card">
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
                Raciones {servicioControl}
              </div>
              <div className="comedor-kpi-val" style={{ fontSize: "1.6rem", fontWeight: 900, color: "#2563eb", marginTop: "2px" }}>
                {servicioControl === "DESAYUNO"
                  ? totalesEntregas.desayunoRaciones
                  : servicioControl === "ALMUERZO"
                  ? totalesEntregas.almuerzoRaciones
                  : totalesEntregas.cenaRaciones}
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                Platos entregados en este servicio
              </div>
            </div>

            <div className="comedor-kpi-card">
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
                Personas Atendidas
              </div>
              <div className="comedor-kpi-val" style={{ fontSize: "1.6rem", fontWeight: 900, color: "#059669", marginTop: "2px" }}>
                {servicioControl === "DESAYUNO"
                  ? totalesEntregas.desayunoAtendidos
                  : servicioControl === "ALMUERZO"
                  ? totalesEntregas.almuerzoAtendidos
                  : totalesEntregas.cenaAtendidos}
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                Jefes y solos que retiraron
              </div>
            </div>

            <div className="comedor-kpi-card" style={{ gridColumn: "span 2" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
                Total Raciones del Día (Desayuno + Almuerzo + Cena)
              </div>
              <div className="comedor-kpi-val" style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--text-primary)", marginTop: "2px" }}>
                {totalesEntregas.totalRaciones} platos
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                Total consolidado de platos servidos en la fecha
              </div>
            </div>
          </div>

          {/* LISTA DE ENTREGAS REGISTRADAS */}
          <div className="comedor-card" style={{ overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1.25rem",
                borderBottom: "1px solid var(--border-color)",
                background: "var(--bg-primary)",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                Registro de Entregas: {servicioControl} · {fechaControl}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  {entregas.length} {entregas.length === 1 ? "entrega" : "entregas"}
                </span>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={fetchEntregas}
                  disabled={loadingEntregas}
                  style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
                >
                  {loadingEntregas ? <span className="spinner spinner-sm" /> : "🔄 Refrescar"}
                </button>
              </div>
            </div>

            {loadingEntregas ? (
              <div style={{ padding: "3rem", textAlign: "center" }}>
                <span className="spinner" />
                <p style={{ marginTop: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                  Cargando entregas...
                </p>
              </div>
            ) : entregas.length === 0 ? (
              <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-secondary)" }}>
                <span style={{ fontSize: "2rem", display: "block", marginBottom: "0.5rem" }}>🍽️</span>
                <p style={{ fontWeight: 700, color: "var(--text-primary)" }}>Aún no hay entregas registradas para este servicio y fecha.</p>
                <span style={{ fontSize: "0.8rem" }}>
                  Utilice el botón <strong>"Escanear Carnet QR"</strong> o el ingreso rápido por cédula para registrar entregas.
                </span>
              </div>
            ) : (
              <>
                {/* 1. VISTA DE TABLA (ESCRITORIO) */}
                <div className="comedor-desktop-table table-responsive" style={{ overflowX: "auto" }}>
                  <table className="registro-table" style={{ width: "100%", fontSize: "0.85rem" }}>
                    <thead>
                      <tr>
                        <th style={{ width: "45px", textAlign: "center" }}>#</th>
                        <th>Hora</th>
                        <th>Beneficiario</th>
                        <th>Cédula</th>
                        <th>Teléfono</th>
                        <th style={{ textAlign: "center" }}>Condición</th>
                        <th style={{ textAlign: "center" }}>Raciones Retiradas</th>
                        <th>Servicio</th>
                        <th>Registrado por</th>
                        <th style={{ textAlign: "center", width: "80px" }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedEntregas.map((e, idx) => {
                        const globalIndex = (pageEntregas - 1) * pageSizeEntregas + idx + 1;
                        return (
                          <tr key={e.id}>
                            <td style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                              {globalIndex}
                            </td>
                            <td style={{ fontWeight: 700, color: "var(--text-primary)" }}>{e.hora}</td>
                            <td>
                              <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{e.nombre}</div>
                              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{e.refugio}</div>
                            </td>
                            <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{e.cedula}</td>
                            <td style={{ color: "var(--text-secondary)" }}>{e.telefono || "—"}</td>
                            <td style={{ textAlign: "center" }}>
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: "999px",
                                  background: e.tipoBeneficiario === "JEFE" ? "rgba(2, 132, 199, 0.15)" : "rgba(16, 185, 129, 0.15)",
                                  color: e.tipoBeneficiario === "JEFE" ? "#0284c7" : "#059669",
                                }}
                              >
                                {e.tipoBeneficiario === "JEFE" ? "Jefe de Familia" : "Persona Sola"}
                              </span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span style={{ fontWeight: 900, color: "#059669", fontSize: "1.05rem" }}>
                                {e.raciones}
                              </span>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: "4px" }}>
                                {e.raciones === 1 ? "plato" : "platos"}
                              </span>
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  fontWeight: 800,
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  background:
                                    e.servicio === "DESAYUNO"
                                      ? "rgba(245, 158, 11, 0.15)"
                                      : e.servicio === "ALMUERZO"
                                      ? "rgba(14, 165, 233, 0.15)"
                                      : "rgba(139, 92, 246, 0.15)",
                                  color:
                                    e.servicio === "DESAYUNO"
                                      ? "#b45309"
                                      : e.servicio === "ALMUERZO"
                                      ? "#0369a1"
                                      : "#6d28d9",
                                }}
                              >
                                {e.servicio}
                              </span>
                            </td>
                            <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                              {e.registradoPor || "Master"}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className="btn-ver"
                                style={{ color: "var(--color-danger, #ef4444)", background: "rgba(239, 68, 68, 0.1)", border: "none", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", fontSize: "0.75rem" }}
                                title="Anular entrega"
                                onClick={() => handleDeleteEntrega(e.id, e.nombre)}
                              >
                                Anular
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 2. VISTA DE TARJETAS MÓVILES (TELÉFONOS) */}
                <div className="comedor-mobile-cards">
                  {paginatedEntregas.map((e, idx) => {
                    const globalIndex = (pageEntregas - 1) * pageSizeEntregas + idx + 1;
                    return (
                      <div key={e.id} className="comedor-mobile-card">
                        <div className="comedor-mobile-card-top">
                          <div>
                            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                              #{globalIndex} {e.nombre}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{e.refugio}</div>
                          </div>
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              padding: "2px 8px",
                              borderRadius: "6px",
                              background:
                                e.servicio === "DESAYUNO"
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : e.servicio === "ALMUERZO"
                                  ? "rgba(14, 165, 233, 0.15)"
                                  : "rgba(139, 92, 246, 0.15)",
                              color:
                                e.servicio === "DESAYUNO"
                                  ? "#b45309"
                                  : e.servicio === "ALMUERZO"
                                  ? "#0369a1"
                                  : "#6d28d9",
                            }}
                          >
                            {e.servicio}
                          </span>
                        </div>

                        <div className="comedor-mobile-card-body">
                          <div>
                            <span style={{ color: "var(--text-muted)", display: "block" }}>Hora:</span>
                            <strong style={{ color: "var(--text-primary)" }}>⏰ {e.hora}</strong>
                          </div>
                          <div>
                            <span style={{ color: "var(--text-muted)", display: "block" }}>Cédula:</span>
                            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{e.cedula}</span>
                          </div>
                          <div>
                            <span style={{ color: "var(--text-muted)", display: "block" }}>Platos entregados:</span>
                            <strong style={{ color: "#059669", fontSize: "0.95rem" }}>
                              🍲 {e.raciones} {e.raciones === 1 ? "ración" : "raciones"}
                            </strong>
                          </div>
                          <div>
                            <span style={{ color: "var(--text-muted)", display: "block" }}>Operador:</span>
                            <span style={{ color: "var(--text-secondary)" }}>{e.registradoPor || "Master"}</span>
                          </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                          <button
                            type="button"
                            className="btn-ver"
                            style={{
                              color: "var(--color-danger, #ef4444)",
                              background: "rgba(239, 68, 68, 0.1)",
                              border: "none",
                              borderRadius: "6px",
                              padding: "6px 14px",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                              fontWeight: 700,
                            }}
                            title="Anular entrega"
                            onClick={() => handleDeleteEntrega(e.id, e.nombre)}
                          >
                            ✕ Anular Entrega
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* BARRA DE PAGINACIÓN SUBMÓDULO 2 */}
                <div
                  className="comedor-pagination-bar"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    padding: "0.75rem 1.25rem",
                    borderTop: "1px solid var(--border-color)",
                    background: "var(--bg-primary)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Registros por página:
                    </span>
                    <select
                      value={pageSizeEntregas}
                      onChange={(e) => {
                        setPageSizeEntregas(Number(e.target.value));
                        setPageEntregas(1);
                      }}
                      style={{
                        padding: "3px 8px",
                        fontSize: "0.8rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        background: "var(--card-bg, var(--bg-secondary))",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      <option value={15}>15</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap", justifyContent: "center" }}>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => setPageEntregas(1)}
                      disabled={pageEntregas <= 1}
                      style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                      title="Primera página"
                    >
                      « Primera
                    </button>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => setPageEntregas((p) => Math.max(1, p - 1))}
                      disabled={pageEntregas <= 1}
                      style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                      title="Página anterior"
                    >
                      ‹ Anterior
                    </button>

                    <span style={{ fontSize: "0.8rem", fontWeight: 700, padding: "0 0.5rem", color: "var(--text-primary)" }}>
                      Página {pageEntregas} de {totalPagesEntregas}
                    </span>

                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => setPageEntregas((p) => Math.min(totalPagesEntregas, p + 1))}
                      disabled={pageEntregas >= totalPagesEntregas}
                      style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                      title="Página siguiente"
                    >
                      Siguiente ›
                    </button>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => setPageEntregas(totalPagesEntregas)}
                      disabled={pageEntregas >= totalPagesEntregas}
                      style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                      title="Última página"
                    >
                      Última »
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          SUBMÓDULO 3: GRÁFICAS Y ESTADÍSTICAS
          ══════════════════════════════════════════════════════════════════════════ */}
      {submodulo === 3 && (
        <ComedorGraficas
          stats={stats}
          loading={loadingStats}
          onRefresh={fetchStats}
          rangoDias={rangoDias}
          setRangoDias={setRangoDias}
        />
      )}

      {/* MODAL DE CARNET INDIVIDUAL CON QR */}
      <ComedorCarnetModal
        beneficiario={selectedCarnet}
        isOpen={!!selectedCarnet}
        onClose={() => setSelectedCarnet(null)}
      />

      {/* MODAL DE CREACIÓN / EDICIÓN DE CARNET QR EXCLUSIVO COMEDOR */}
      <ComedorCreateCarnetModal
        isOpen={createCarnetModalOpen}
        onClose={() => {
          setCreateCarnetModalOpen(false);
          setEditingCarnet(null);
        }}
        onSuccess={(nuevo) => {
          showToast(
            editingCarnet
              ? "Carnet de comedor actualizado correctamente."
              : "Carnet QR generado exitosamente.",
            "success"
          );
          fetchBeneficiarios();
          setSelectedCarnet(nuevo);
        }}
        refugioActual={selectedRefugio}
        refugiosList={refugiosList || []}
        initialData={editingCarnet}
      />

      {/* MODAL DE DESCARGA E IMPRESIÓN MASIVA DE CARNETS (8 POR HOJA) */}
      <ComedorBulkCarnetsModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        beneficiarios={beneficiarios}
        refugioActual={selectedRefugio}
        refugiosList={refugiosList || []}
      />

      {/* MODAL DE ESCÁNER QR */}
      <ComedorQrScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        refugio={selectedRefugio}
        fecha={fechaControl}
        servicio={servicioControl}
        onDeliverySuccess={() => {
          fetchEntregas();
        }}
        showToast={showToast}
      />
    </div>
  );
}
