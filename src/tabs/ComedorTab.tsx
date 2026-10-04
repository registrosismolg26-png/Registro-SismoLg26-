"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAppContext } from "@/context/AppContext";
import { apiFetch } from "@/lib/apiFetch";
import { normalizeText } from "@/lib/helpers";
import StyledSelect from "@/components/StyledSelect";
import ComedorCarnetModal from "@/components/ComedorCarnetModal";
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

  // Campamento seleccionado para el comedor (default: effectiveRefugio del Master)
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

  // ── FILTRADO SUBMÓDULO 1: BENEFICIARIOS ──────────────────────────────────────
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
    if (filterTipoBeneficiario) {
      result = result.filter((b) => b.tipoBeneficiario === filterTipoBeneficiario);
    }
    return result;
  }, [beneficiarios, searchBeneficiario, filterTipoBeneficiario]);

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
    <div className="tab-pane active" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* CABECERA PRINCIPAL DEL MÓDULO */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          background: "var(--card-bg, #ffffff)",
          padding: "1rem 1.25rem",
          borderRadius: "16px",
          border: "1px solid var(--border-color, #e2e8f0)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.4rem" }}>🍲</span>
            <div className="dashboard-section-title" style={{ margin: 0 }}>
              Comedor Comunitario
            </div>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: "999px",
                background: "rgba(37, 99, 235, 0.12)",
                color: "#1d4ed8",
                fontWeight: 700,
              }}
            >
              Solo Master
            </span>
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "2px" }}>
            Control de alimentación, escaneo QR de carnets y métricas de raciones por servicio
          </div>
        </div>

        {/* SELECTOR DE CAMPAMENTO */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: "260px" }}>
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
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          background: "var(--bg-secondary, #f1f5f9)",
          padding: "6px",
          borderRadius: "12px",
          overflowX: "auto",
        }}
      >
        <button
          type="button"
          onClick={() => setSubmodulo(1)}
          style={{
            flex: 1,
            padding: "0.6rem 1rem",
            borderRadius: "8px",
            border: "none",
            fontWeight: 700,
            fontSize: "0.9rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            background: submodulo === 1 ? "var(--card-bg, #ffffff)" : "transparent",
            color: submodulo === 1 ? "var(--color-primary, #2563eb)" : "var(--text-secondary)",
            boxShadow: submodulo === 1 ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span>🪪</span>
          <span>1. Carnets Digitales</span>
          <span style={{ fontSize: "0.75rem", opacity: 0.75 }}>({beneficiarios.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubmodulo(2)}
          style={{
            flex: 1,
            padding: "0.6rem 1rem",
            borderRadius: "8px",
            border: "none",
            fontWeight: 700,
            fontSize: "0.9rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            background: submodulo === 2 ? "var(--card-bg, #ffffff)" : "transparent",
            color: submodulo === 2 ? "var(--color-primary, #2563eb)" : "var(--text-secondary)",
            boxShadow: submodulo === 2 ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span>📷</span>
          <span>2. Control y Escáner QR</span>
          <span style={{ fontSize: "0.75rem", opacity: 0.75 }}>({entregas.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubmodulo(3)}
          style={{
            flex: 1,
            padding: "0.6rem 1rem",
            borderRadius: "8px",
            border: "none",
            fontWeight: 700,
            fontSize: "0.9rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            background: submodulo === 3 ? "var(--card-bg, #ffffff)" : "transparent",
            color: submodulo === 3 ? "var(--color-primary, #2563eb)" : "var(--text-secondary)",
            boxShadow: submodulo === 3 ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span>📊</span>
          <span>3. Gráficas y Estadísticas</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SUBMÓDULO 1: CARNETS DIGITALES (LISTA DE JEFES Y PERSONAS SOLAS)
          ══════════════════════════════════════════════════════════════════════════ */}
      {submodulo === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Barra de búsqueda y filtros */}
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              flexWrap: "wrap",
              background: "var(--card-bg, #ffffff)",
              padding: "0.85rem 1rem",
              borderRadius: "14px",
              border: "1px solid var(--border-color, #e2e8f0)",
            }}
          >
            <div style={{ flex: 1, minWidth: "240px" }}>
              <input
                type="text"
                placeholder="Buscar por nombre, cédula o habitación..."
                value={searchBeneficiario}
                onChange={(e) => setSearchBeneficiario(e.target.value)}
                style={{ width: "100%", padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}
              />
            </div>

            <div style={{ width: "200px" }}>
              <StyledSelect
                value={filterTipoBeneficiario}
                onChange={setFilterTipoBeneficiario}
                ariaLabel="Filtrar por Condición"
                options={[
                  { value: "", label: "Todas las Condiciones" },
                  { value: "JEFE", label: "Jefes de Familia" },
                  { value: "SOLO", label: "Personas Solas" },
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
          </div>

          {/* Listado de Beneficiarios */}
          <div
            style={{
              background: "var(--card-bg, #ffffff)",
              borderRadius: "16px",
              border: "1px solid var(--border-color, #e2e8f0)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1.25rem",
                borderBottom: "1px solid var(--border-color, #e2e8f0)",
                background: "var(--bg-secondary, #f8fafc)",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>
                Beneficiarios que Pernoctan (Jefes y Personas Solas)
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {filteredBeneficiarios.length} de {beneficiarios.length}
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
                <p style={{ fontWeight: 700 }}>No se encontraron beneficiarios.</p>
                <span style={{ fontSize: "0.8rem" }}>
                  Verifique que las personas registradas no estén en estatus de retiro o cambie el filtro.
                </span>
              </div>
            ) : (
              <div className="table-responsive" style={{ overflowX: "auto" }}>
                <table className="registro-table" style={{ width: "100%", fontSize: "0.85rem" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "45px", textAlign: "center" }}>#</th>
                      <th>Beneficiario</th>
                      <th>Cédula</th>
                      <th>Teléfono</th>
                      <th>Alojamiento</th>
                      <th style={{ textAlign: "center" }}>Condición</th>
                      <th style={{ textAlign: "center" }}>Carga Familiar / Raciones</th>
                      <th style={{ textAlign: "center", width: "140px" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBeneficiarios.map((b, idx) => (
                      <tr key={b.id}>
                        <td style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                          {idx + 1}
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{b.nombreApellido}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{b.refugio}</div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{b.cedula}</td>
                        <td style={{ color: "var(--text-secondary)" }}>{b.telefono || "—"}</td>
                        <td>{b.cuarto || <span style={{ color: "var(--text-muted)" }}>Sin asignar</span>}</td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "999px",
                              background: b.tipoBeneficiario === "JEFE" ? "rgba(2, 132, 199, 0.12)" : "rgba(16, 185, 129, 0.12)",
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
                          <button
                            type="button"
                            className="toolbar-btn toolbar-btn--primary"
                            style={{ padding: "0.3rem 0.65rem", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                            onClick={() => setSelectedCarnet(b)}
                          >
                            <span>🪪</span>
                            <span>Escanear carnet</span>
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
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          SUBMÓDULO 2: CONTROL Y ESCANEO DE COMEDOR (REGISTRO POR DÍA Y SERVICIO)
          ══════════════════════════════════════════════════════════════════════════ */}
      {submodulo === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* PANEL DE CONTROL SUPERIOR: FECHA, SERVICIO Y BOTÓN DE ESCÁNER */}
          <div
            style={{
              background: "var(--card-bg, #ffffff)",
              padding: "1.25rem",
              borderRadius: "16px",
              border: "1px solid var(--border-color, #e2e8f0)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              {/* Fecha y servicio */}
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>
                    Fecha del Servicio:
                  </label>
                  <input
                    type="date"
                    value={fechaControl}
                    onChange={(e) => setFechaControl(e.target.value)}
                    style={{ padding: "0.45rem 0.75rem", fontSize: "0.9rem", borderRadius: "8px" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>
                    Tipo de Comida:
                  </label>
                  <div className="btn-seg-group">
                    {(["DESAYUNO", "ALMUERZO", "CENA"] as ComedorServicio[]).map((serv) => (
                      <button
                        key={serv}
                        type="button"
                        className={`toolbar-btn ${servicioControl === serv ? "toolbar-btn--primary" : ""}`}
                        style={{ padding: "0.45rem 0.85rem", fontSize: "0.85rem", fontWeight: 700 }}
                        onClick={() => setServicioControl(serv)}
                      >
                        {serv === "DESAYUNO" ? "☀️ Desayuno" : serv === "ALMUERZO" ? "🍽️ Almuerzo" : "🌙 Cena"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Botón destacado: Abrir Escáner QR */}
              <div>
                <button
                  type="button"
                  className="btn-submit"
                  style={{
                    padding: "0.65rem 1.25rem",
                    fontSize: "0.95rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
                  }}
                  onClick={() => setScannerOpen(true)}
                >
                  <span style={{ fontSize: "1.2rem" }}>📷</span>
                  <span>Escanear Carnet QR</span>
                </button>
              </div>
            </div>

            {/* BARRA DE REGISTRO RÁPIDO MANUAL */}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                paddingTop: "0.75rem",
                borderTop: "1px dashed var(--border-color, #e2e8f0)",
              }}
            >
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                Registro Rápido por Cédula:
              </span>
              <input
                type="text"
                placeholder="Ingresar cédula (ej. V-12345678)..."
                value={quickCedula}
                onChange={(e) => setQuickCedula(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleQuickRegister();
                }}
                style={{ flex: 1, maxWidth: "300px", padding: "0.45rem 0.75rem", fontSize: "0.85rem" }}
              />
              <button
                type="button"
                className="btn-submit"
                onClick={handleQuickRegister}
                disabled={registeringQuick || !quickCedula.trim()}
                style={{ padding: "0.45rem 0.85rem", fontSize: "0.85rem" }}
              >
                {registeringQuick ? "Registrando..." : "Registrar"}
              </button>
            </div>
          </div>

          {/* TARJETAS RESUMEN DE LAS ENTREGAS DE HOY / FECHA */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
            }}
          >
            <div style={{ background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "12px", padding: "0.85rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
                Raciones {servicioControl}
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#2563eb", marginTop: "2px" }}>
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

            <div style={{ background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "12px", padding: "0.85rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
                Personas Atendidas
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#059669", marginTop: "2px" }}>
                {servicioControl === "DESAYUNO"
                  ? totalesEntregas.desayunoAtendidos
                  : servicioControl === "ALMUERZO"
                  ? totalesEntregas.almuerzoAtendidos
                  : totalesEntregas.cenaAtendidos}
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                Jefes y personas solas que retiraron
              </div>
            </div>

            <div style={{ background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "12px", padding: "0.85rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
                Total Raciones del Día
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--text-primary)", marginTop: "2px" }}>
                {totalesEntregas.totalRaciones}
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                Suma de Desayuno + Almuerzo + Cena
              </div>
            </div>
          </div>

          {/* LISTA DE ENTREGAS REGISTRADAS */}
          <div
            style={{
              background: "var(--card-bg, #ffffff)",
              borderRadius: "16px",
              border: "1px solid var(--border-color, #e2e8f0)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1.25rem",
                borderBottom: "1px solid var(--border-color, #e2e8f0)",
                background: "var(--bg-secondary, #f8fafc)",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>
                Registro de Entregas: {servicioControl} · {fechaControl}
              </div>
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
                <p style={{ fontWeight: 700 }}>Aún no hay entregas registradas para este servicio y fecha.</p>
                <span style={{ fontSize: "0.8rem" }}>
                  Utilice el botón <strong>"Escanear Carnet QR"</strong> o el ingreso rápido por cédula para registrar entregas.
                </span>
              </div>
            ) : (
              <div className="table-responsive" style={{ overflowX: "auto" }}>
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
                    {entregas.map((e, idx) => (
                      <tr key={e.id}>
                        <td style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                          {idx + 1}
                        </td>
                        <td style={{ fontWeight: 700, color: "var(--text-primary)" }}>{e.hora}</td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{e.nombre}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{e.refugio}</div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{e.cedula}</td>
                        <td style={{ color: "var(--text-secondary)" }}>{e.telefono || "—"}</td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "999px",
                              background: e.tipoBeneficiario === "JEFE" ? "rgba(2, 132, 199, 0.12)" : "rgba(16, 185, 129, 0.12)",
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
                    ))}
                  </tbody>
                </table>
              </div>
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

      {/* MODAL DE CARNET DIGITAL CON QR */}
      <ComedorCarnetModal
        beneficiario={selectedCarnet}
        isOpen={!!selectedCarnet}
        onClose={() => setSelectedCarnet(null)}
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
