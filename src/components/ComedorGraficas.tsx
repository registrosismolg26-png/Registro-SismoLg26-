"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { ComedorStats } from "@/types";
import { exportComedorExcel } from "@/lib/exportComedorExcel";
import { exportComedorPdf } from "@/lib/exportComedorPdf";

interface Props {
  stats: ComedorStats | null;
  loading: boolean;
  onRefresh: (desde?: string, hasta?: string) => void;
  rangoDias?: number;
  setRangoDias?: (dias: number) => void;
  selectedRefugio?: string;
  currentUser?: { nombre?: string; email?: string } | null;
}

type PeriodoModo = "HOY" | "SEMANA" | "MES" | "ANO" | "DIA" | "RANGO";

const getLocalYmd = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function ComedorGraficas({
  stats,
  loading,
  onRefresh,
  selectedRefugio = "TODOS",
  currentUser,
}: Props) {
  const [hoveredBar, setHoveredBar] = useState<any | null>(null);
  const [modo, setModo] = useState<PeriodoModo>("SEMANA");

  const todayStr = useMemo(() => getLocalYmd(), []);
  const [fechaEspecifica, setFechaEspecifica] = useState<string>(todayStr);
  const [fechaDesde, setFechaDesde] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getLocalYmd(d);
  });
  const [fechaHasta, setFechaHasta] = useState<string>(todayStr);
  const [selectedAno, setSelectedAno] = useState<number>(() => new Date().getFullYear());

  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Calcular las fechas efectivas según el modo seleccionado
  const { desdeEfectiva, hastaEfectiva, periodoEtiqueta } = useMemo(() => {
    if (modo === "HOY") {
      return {
        desdeEfectiva: todayStr,
        hastaEfectiva: todayStr,
        periodoEtiqueta: `Hoy (${todayStr})`,
      };
    }
    if (modo === "DIA") {
      return {
        desdeEfectiva: fechaEspecifica,
        hastaEfectiva: fechaEspecifica,
        periodoEtiqueta: `Día: ${fechaEspecifica}`,
      };
    }
    if (modo === "SEMANA") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      const start = getLocalYmd(d);
      return {
        desdeEfectiva: start,
        hastaEfectiva: todayStr,
        periodoEtiqueta: `Últimos 7 días (${start} al ${todayStr})`,
      };
    }
    if (modo === "MES") {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      const start = getLocalYmd(d);
      return {
        desdeEfectiva: start,
        hastaEfectiva: todayStr,
        periodoEtiqueta: `Últimos 30 días (${start} al ${todayStr})`,
      };
    }
    if (modo === "ANO") {
      const start = `${selectedAno}-01-01`;
      const end = `${selectedAno}-12-31`;
      return {
        desdeEfectiva: start,
        hastaEfectiva: end,
        periodoEtiqueta: `Año ${selectedAno}`,
      };
    }
    // RANGO
    return {
      desdeEfectiva: fechaDesde,
      hastaEfectiva: fechaHasta,
      periodoEtiqueta: `Rango: ${fechaDesde} al ${fechaHasta}`,
    };
  }, [modo, todayStr, fechaEspecifica, fechaDesde, fechaHasta, selectedAno]);

  // Ejecutar carga al cambiar de modo predeterminado
  const handleCambiarModo = (nuevoModo: PeriodoModo) => {
    setModo(nuevoModo);
    let d = "";
    let h = "";
    if (nuevoModo === "HOY") {
      d = todayStr;
      h = todayStr;
    } else if (nuevoModo === "SEMANA") {
      const dt = new Date();
      dt.setDate(dt.getDate() - 6);
      d = getLocalYmd(dt);
      h = todayStr;
    } else if (nuevoModo === "MES") {
      const dt = new Date();
      dt.setDate(dt.getDate() - 29);
      d = getLocalYmd(dt);
      h = todayStr;
    } else if (nuevoModo === "ANO") {
      d = `${selectedAno}-01-01`;
      h = `${selectedAno}-12-31`;
    } else if (nuevoModo === "DIA") {
      d = fechaEspecifica;
      h = fechaEspecifica;
    } else if (nuevoModo === "RANGO") {
      d = fechaDesde;
      h = fechaHasta;
    }
    onRefresh(d, h);
  };

  const handleAplicarFiltro = () => {
    onRefresh(desdeEfectiva, hastaEfectiva);
  };

  const porDia = useMemo(() => {
    if (!stats || !stats.porDia) return [];
    return stats.porDia;
  }, [stats]);

  const maxTotalRaciones = useMemo(() => {
    if (!porDia.length) return 1;
    return Math.max(...porDia.map((d) => d.total), 1);
  }, [porDia]);

  // Totales y cálculos derivados
  const totalR = stats?.totalRaciones || 0;
  const totalA = stats?.totalAtendidos || 0;
  const desR = stats?.desayunoRaciones || 0;
  const almR = stats?.almuerzoRaciones || 0;
  const cenR = stats?.cenaRaciones || 0;

  const desPct = totalR > 0 ? Number(((desR / totalR) * 100).toFixed(1)) : 0;
  const almPct = totalR > 0 ? Number(((almR / totalR) * 100).toFixed(1)) : 0;
  const cenPct = totalR > 0 ? Number(((cenR / totalR) * 100).toFixed(1)) : 0;

  const promPorDia = stats?.promedios?.racionesPorDia ?? (porDia.length > 0 ? Number((totalR / porDia.length).toFixed(1)) : 0);
  const promPorPersona = stats?.promedios?.racionesPorPersona ?? (totalA > 0 ? Number((totalR / totalA).toFixed(1)) : 0);

  // ── DESCARGA EXCEL ────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (!stats) return;
    setExportingExcel(true);
    try {
      await exportComedorExcel({
        stats,
        refugio: selectedRefugio || "TODOS",
        periodoLabel: periodoEtiqueta,
        desde: desdeEfectiva,
        hasta: hastaEfectiva,
        generadoPor: currentUser?.nombre || currentUser?.email || "Usuario del Sistema",
      });
    } catch (err) {
      console.error("Error al exportar Excel:", err);
      alert("Hubo un error al generar el archivo Excel.");
    } finally {
      setExportingExcel(false);
    }
  };

  // ── IMPRESIÓN DIRECTA / PRESENTACIÓN PDF ──────────────────────────────────
  const handleExportPdf = async (action: "print" | "download" = "print") => {
    if (!stats) return;
    if (action === "download") setDownloadingPdf(true);
    else setExportingPdf(true);

    try {
      await exportComedorPdf({
        stats,
        refugio: selectedRefugio || "TODOS",
        periodoLabel: periodoEtiqueta,
        desde: desdeEfectiva,
        hasta: hastaEfectiva,
        generadoPor: currentUser?.nombre || currentUser?.email || "Usuario del Sistema",
        action,
      });
    } catch (err) {
      console.error("Error al generar PDF:", err);
      alert("Hubo un error al generar el reporte en PDF.");
    } finally {
      setExportingPdf(false);
      setDownloadingPdf(false);
    }
  };

  // SVG Donut calculations
  const radius = 54;
  const circ = 2 * Math.PI * radius;
  const desStroke = (desPct / 100) * circ;
  const almStroke = (almPct / 100) * circ;
  const cenStroke = (cenPct / 100) * circ;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* ══════════════════════════════════════════════════════════════════════════
          BARRA PRINCIPAL: TÍTULO, ACCIONES DE EXPORTACIÓN Y REPORTES
      ══════════════════════════════════════════════════════════════════════════ */}
      <div
        className="comedor-card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          padding: "1rem 1.25rem",
          background: "linear-gradient(135deg, rgba(30, 58, 138, 0.04) 0%, rgba(15, 23, 42, 0.02) 100%)",
          border: "1px solid var(--border-color)",
          borderRadius: "12px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.35rem" }}>📊</span>
            <div>
              <span style={{ fontWeight: 900, fontSize: "1.1rem", color: "var(--text-primary)" }}>
                Estadísticas y Control de Comedor
              </span>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                {selectedRefugio && selectedRefugio !== "TODOS" ? `Campamento: ${selectedRefugio}` : "Todos los Campamentos"} · {periodoEtiqueta}
              </div>
            </div>
          </div>
        </div>

        {/* 2 BOTONES IMPORTANTES DE EXPORTACIÓN */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
          {/* BOTÓN 1: DESCARGAR EXCEL CON SUS GRÁFICAS */}
          <button
            type="button"
            className="toolbar-btn"
            onClick={handleExportExcel}
            disabled={exportingExcel || loading || !stats}
            style={{
              padding: "0.55rem 0.95rem",
              fontSize: "0.85rem",
              fontWeight: 800,
              background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              boxShadow: "0 2px 8px rgba(5, 150, 105, 0.3)",
              cursor: "pointer",
            }}
            title="Descargar libro Excel con resumen ejecutivo, KPIs y consolidado histórico"
          >
            {exportingExcel ? <span className="spinner spinner-sm" /> : <span style={{ fontSize: "1.05rem" }}>📗</span>}
            <span>Descargar Excel</span>
          </button>

          {/* BOTÓN 2: IMPRIMIR REPORTE DIRECTO / PRESENTACIÓN PDF */}
          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => handleExportPdf("print")}
              disabled={exportingPdf || loading || !stats}
              style={{
                padding: "0.55rem 0.95rem",
                fontSize: "0.85rem",
                fontWeight: 800,
                background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px 0 0 8px",
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                boxShadow: "0 2px 8px rgba(37, 99, 235, 0.3)",
                cursor: "pointer",
              }}
              title="Imprimir reporte en formato presentación oficial con logos de la Gobernación y Min. de Alimentación"
            >
              {exportingPdf ? <span className="spinner spinner-sm" /> : <span style={{ fontSize: "1.05rem" }}>🖨️</span>}
              <span>Imprimir Reporte PDF</span>
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => handleExportPdf("download")}
              disabled={downloadingPdf || loading || !stats}
              style={{
                padding: "0.55rem 0.65rem",
                fontSize: "0.85rem",
                fontWeight: 800,
                background: "linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)",
                color: "#FFFFFF",
                border: "none",
                borderLeft: "1px solid rgba(255,255,255,0.25)",
                borderRadius: "0 8px 8px 0",
                display: "flex",
                alignItems: "center",
                boxShadow: "0 2px 8px rgba(37, 99, 235, 0.3)",
                cursor: "pointer",
              }}
              title="Descargar archivo PDF al dispositivo"
            >
              {downloadingPdf ? <span className="spinner spinner-sm" /> : "⬇️"}
            </button>
          </div>

          {/* Botón Refrescar */}
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => onRefresh(desdeEfectiva, hastaEfectiva)}
            disabled={loading}
            title="Refrescar estadísticas"
            style={{ padding: "0.55rem 0.75rem", fontSize: "0.85rem" }}
          >
            {loading ? <span className="spinner spinner-sm" /> : "🔄"}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          FILTRO DE TIEMPO: DÍA, SEMANA, MES HASTA AÑO Y RANGO LIBRE
      ══════════════════════════════════════════════════════════════════════════ */}
      <div
        className="comedor-card"
        style={{
          padding: "0.85rem 1.15rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          border: "1px solid var(--border-color)",
          borderRadius: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Filtrar Periodo:
            </span>
            <div className="btn-seg-group">
              <button
                type="button"
                className={`toolbar-btn ${modo === "HOY" ? "toolbar-btn--primary" : ""}`}
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem", fontWeight: modo === "HOY" ? 800 : 500 }}
                onClick={() => handleCambiarModo("HOY")}
              >
                📅 Hoy
              </button>
              <button
                type="button"
                className={`toolbar-btn ${modo === "SEMANA" ? "toolbar-btn--primary" : ""}`}
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem", fontWeight: modo === "SEMANA" ? 800 : 500 }}
                onClick={() => handleCambiarModo("SEMANA")}
              >
                📆 Semana (7 días)
              </button>
              <button
                type="button"
                className={`toolbar-btn ${modo === "MES" ? "toolbar-btn--primary" : ""}`}
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem", fontWeight: modo === "MES" ? 800 : 500 }}
                onClick={() => handleCambiarModo("MES")}
              >
                🗓️ Mes (30 días)
              </button>
              <button
                type="button"
                className={`toolbar-btn ${modo === "ANO" ? "toolbar-btn--primary" : ""}`}
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem", fontWeight: modo === "ANO" ? 800 : 500 }}
                onClick={() => handleCambiarModo("ANO")}
              >
                🏛️ Año
              </button>
              <button
                type="button"
                className={`toolbar-btn ${modo === "DIA" ? "toolbar-btn--primary" : ""}`}
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem", fontWeight: modo === "DIA" ? 800 : 500 }}
                onClick={() => setModo("DIA")}
              >
                🎯 Día Específico
              </button>
              <button
                type="button"
                className={`toolbar-btn ${modo === "RANGO" ? "toolbar-btn--primary" : ""}`}
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem", fontWeight: modo === "RANGO" ? 800 : 500 }}
                onClick={() => setModo("RANGO")}
              >
                🔍 Rango Libre
              </button>
            </div>
          </div>

          {/* Badge del período activo */}
          <div
            style={{
              padding: "0.3rem 0.75rem",
              borderRadius: "20px",
              background: "rgba(37, 99, 235, 0.08)",
              border: "1px solid rgba(37, 99, 235, 0.25)",
              color: "#2563eb",
              fontSize: "0.78rem",
              fontWeight: 700,
            }}
          >
            {periodoEtiqueta}
          </div>
        </div>

        {/* CONTROLES EXTRA CUANDO SE SELECCIONA DÍA ESPECÍFICO, AÑO O RANGO */}
        {(modo === "DIA" || modo === "ANO" || modo === "RANGO") && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              paddingTop: "0.6rem",
              borderTop: "1px dashed var(--border-color)",
            }}
          >
            {modo === "DIA" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  Fecha a consultar:
                </label>
                <input
                  type="date"
                  className="filter-input"
                  value={fechaEspecifica}
                  onChange={(e) => setFechaEspecifica(e.target.value)}
                  style={{ padding: "0.35rem 0.65rem", fontSize: "0.85rem", borderRadius: "6px" }}
                />
              </div>
            )}

            {modo === "ANO" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  Seleccionar Año:
                </label>
                <select
                  className="filter-input"
                  value={selectedAno}
                  onChange={(e) => setSelectedAno(Number(e.target.value))}
                  style={{ padding: "0.35rem 0.65rem", fontSize: "0.85rem", borderRadius: "6px" }}
                >
                  {[2024, 2025, 2026, 2027].map((yr) => (
                    <option key={yr} value={yr}>
                      Año {yr}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {modo === "RANGO" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  Desde:
                </label>
                <input
                  type="date"
                  className="filter-input"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  style={{ padding: "0.35rem 0.65rem", fontSize: "0.85rem", borderRadius: "6px" }}
                />
                <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  Hasta:
                </label>
                <input
                  type="date"
                  className="filter-input"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  style={{ padding: "0.35rem 0.65rem", fontSize: "0.85rem", borderRadius: "6px" }}
                />
              </div>
            )}

            <button
              type="button"
              className="toolbar-btn toolbar-btn--primary"
              onClick={handleAplicarFiltro}
              disabled={loading}
              style={{ padding: "0.35rem 0.85rem", fontSize: "0.82rem", fontWeight: 700 }}
            >
              {loading ? <span className="spinner spinner-sm" /> : "⚡ Aplicar Filtro"}
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          TARJETAS DE MÉTRICAS GENERALES CON EFECTOS DE COLOR
      ══════════════════════════════════════════════════════════════════════════ */}
      <div className="comedor-kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))" }}>
        {/* TOTAL RACIONES */}
        <div
          className="comedor-kpi-card"
          style={{
            background: "linear-gradient(135deg, rgba(37, 99, 235, 0.16) 0%, rgba(59, 130, 246, 0.05) 100%)",
            border: "1px solid rgba(59, 130, 246, 0.35)",
            boxShadow: "0 4px 14px rgba(37, 99, 235, 0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Total Raciones
            </span>
            <span style={{ fontSize: "1.3rem" }}>🍲</span>
          </div>
          <div className="comedor-kpi-val" style={{ fontSize: "1.85rem", fontWeight: 900, color: "#2563eb" }}>
            {totalR.toLocaleString("es-VE")}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.3rem" }}>
            Platos servidos en el periodo
          </div>
        </div>

        {/* BENEFICIARIOS ATENDIDOS */}
        <div
          className="comedor-kpi-card"
          style={{
            background: "linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(5, 150, 105, 0.05) 100%)",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            boxShadow: "0 4px 14px rgba(16, 185, 129, 0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Atenciones
            </span>
            <span style={{ fontSize: "1.3rem" }}>👥</span>
          </div>
          <div className="comedor-kpi-val" style={{ fontSize: "1.85rem", fontWeight: 900, color: "#059669" }}>
            {totalA.toLocaleString("es-VE")}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.3rem" }}>
            Jefes y personas solas
          </div>
        </div>

        {/* DESAYUNOS */}
        <div
          className="comedor-kpi-card"
          style={{
            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.16) 0%, rgba(217, 119, 6, 0.05) 100%)",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            boxShadow: "0 4px 14px rgba(245, 158, 11, 0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Desayunos
            </span>
            <span style={{ fontSize: "1.3rem" }}>☀️</span>
          </div>
          <div className="comedor-kpi-val" style={{ fontSize: "1.85rem", fontWeight: 900, color: "#d97706" }}>
            {desR.toLocaleString("es-VE")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "0.35rem" }}>
            <div style={{ flex: 1, height: "5px", background: "rgba(0,0,0,0.08)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${desPct}%`, height: "100%", background: "#f59e0b" }} />
            </div>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#d97706" }}>{desPct}%</span>
          </div>
        </div>

        {/* ALMUERZOS */}
        <div
          className="comedor-kpi-card"
          style={{
            background: "linear-gradient(135deg, rgba(14, 165, 233, 0.16) 0%, rgba(2, 132, 199, 0.05) 100%)",
            border: "1px solid rgba(14, 165, 233, 0.35)",
            boxShadow: "0 4px 14px rgba(14, 165, 233, 0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Almuerzos
            </span>
            <span style={{ fontSize: "1.3rem" }}>🍽️</span>
          </div>
          <div className="comedor-kpi-val" style={{ fontSize: "1.85rem", fontWeight: 900, color: "#0284c7" }}>
            {almR.toLocaleString("es-VE")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "0.35rem" }}>
            <div style={{ flex: 1, height: "5px", background: "rgba(0,0,0,0.08)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${almPct}%`, height: "100%", background: "#0ea5e9" }} />
            </div>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#0284c7" }}>{almPct}%</span>
          </div>
        </div>

        {/* CENAS */}
        <div
          className="comedor-kpi-card"
          style={{
            background: "linear-gradient(135deg, rgba(139, 92, 246, 0.16) 0%, rgba(109, 40, 217, 0.05) 100%)",
            border: "1px solid rgba(139, 92, 246, 0.35)",
            boxShadow: "0 4px 14px rgba(139, 92, 246, 0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Cenas
            </span>
            <span style={{ fontSize: "1.3rem" }}>🌙</span>
          </div>
          <div className="comedor-kpi-val" style={{ fontSize: "1.85rem", fontWeight: 900, color: "#7c3aed" }}>
            {cenR.toLocaleString("es-VE")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "0.35rem" }}>
            <div style={{ flex: 1, height: "5px", background: "rgba(0,0,0,0.08)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${cenPct}%`, height: "100%", background: "#a78bfa" }} />
            </div>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#7c3aed" }}>{cenPct}%</span>
          </div>
        </div>

        {/* PROMEDIO PLATO / PERSONA */}
        <div
          className="comedor-kpi-card"
          style={{
            background: "linear-gradient(135deg, rgba(99, 102, 241, 0.16) 0%, rgba(79, 70, 229, 0.05) 100%)",
            border: "1px solid rgba(99, 102, 241, 0.35)",
            boxShadow: "0 4px 14px rgba(99, 102, 241, 0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Ratio Familiar
            </span>
            <span style={{ fontSize: "1.3rem" }}>📈</span>
          </div>
          <div className="comedor-kpi-val" style={{ fontSize: "1.85rem", fontWeight: 900, color: "#4f46e5" }}>
            {promPorPersona}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.3rem" }}>
            Platos por atención · {promPorDia} / día
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SECCIÓN INTERMEDIA: GRÁFICA DONUT DE SERVICIOS Y RESUMEN OPERATIVO
      ══════════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
        {/* GRÁFICA DONUT DE PROPORCIÓN DE SERVICIOS */}
        <div className="comedor-card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
            Distribución por Servicio de Alimentación
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
            Participación porcentual de raciones servidas
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", flexWrap: "wrap", gap: "1rem", flex: 1 }}>
            {/* SVG Donut */}
            <div style={{ position: "relative", width: "140px", height: "140px" }}>
              <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
                {/* Background circle */}
                <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="16" />
                {/* Segmento Desayuno */}
                {desPct > 0 && (
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="16"
                    strokeDasharray={`${desStroke} ${circ}`}
                    strokeDashoffset={0}
                  />
                )}
                {/* Segmento Almuerzo */}
                {almPct > 0 && (
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth="16"
                    strokeDasharray={`${almStroke} ${circ}`}
                    strokeDashoffset={-desStroke}
                  />
                )}
                {/* Segmento Cena */}
                {cenPct > 0 && (
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke="#a78bfa"
                    strokeWidth="16"
                    strokeDasharray={`${cenStroke} ${circ}`}
                    strokeDashoffset={-(desStroke + almStroke)}
                  />
                )}
              </svg>
              {/* Texto central en el donut */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <span style={{ fontSize: "1.15rem", fontWeight: 900, color: "var(--text-primary)" }}>
                  {totalR.toLocaleString("es-VE")}
                </span>
                <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 700 }}>
                  Platos
                </span>
              </div>
            </div>

            {/* Leyenda interactiva al lado */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", minWidth: "160px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" }}>☀️ Desayuno</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#d97706" }}>{desR.toLocaleString("es-VE")}</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginLeft: "4px" }}>({desPct}%)</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#0ea5e9", display: "inline-block" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" }}>🍽️ Almuerzo</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#0284c7" }}>{almR.toLocaleString("es-VE")}</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginLeft: "4px" }}>({almPct}%)</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#a78bfa", display: "inline-block" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" }}>🌙 Cena</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#7c3aed" }}>{cenR.toLocaleString("es-VE")}</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginLeft: "4px" }}>({cenPct}%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* DISTRIBUCIÓN POR CAMPAMENTO / REFUGIO (O TIPO DE BENEFICIARIO) */}
        <div className="comedor-card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
            {stats?.porRefugio && stats.porRefugio.length > 1
              ? "Afluencia por Campamento / Refugio"
              : "Clasificación de Beneficiarios"}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
            {stats?.porRefugio && stats.porRefugio.length > 1
              ? "Comparativa de raciones y atenciones en campamentos"
              : "Núcleos familiares vs personas solas registradas"}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", flex: 1, justifyContent: "center" }}>
            {stats?.porRefugio && stats.porRefugio.length > 1 ? (
              stats.porRefugio.slice(0, 5).map((rf) => {
                const pct = totalR > 0 ? (rf.raciones / totalR) * 100 : 0;
                return (
                  <div key={rf.refugio} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                      <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{rf.refugio}</span>
                      <span style={{ fontWeight: 800, color: "#0284c7" }}>
                        {rf.raciones.toLocaleString("es-VE")} raciones ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div style={{ height: "7px", background: "rgba(0,0,0,0.06)", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #3b82f6, #0ea5e9)" }} />
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                      {rf.atenciones.toLocaleString("es-VE")} atenciones realizadas
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div
                  style={{
                    padding: "0.85rem",
                    borderRadius: "10px",
                    background: "rgba(37, 99, 235, 0.05)",
                    border: "1px solid rgba(37, 99, 235, 0.2)",
                  }}
                >
                  <span style={{ fontSize: "1.2rem", display: "block", marginBottom: "4px" }}>👨‍👩‍👧‍👦</span>
                  <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                    Jefes de Familia
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                    Núcleos con carga familiar
                  </div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 900, color: "#2563eb", marginTop: "6px" }}>
                    {stats?.porTipoBeneficiario?.find((t) => t.tipo.includes("Jefe"))?.raciones.toLocaleString("es-VE") || desR + almR + cenR}
                  </div>
                </div>

                <div
                  style={{
                    padding: "0.85rem",
                    borderRadius: "10px",
                    background: "rgba(16, 185, 129, 0.05)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                  }}
                >
                  <span style={{ fontSize: "1.2rem", display: "block", marginBottom: "4px" }}>👤</span>
                  <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                    Personas Solas
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                    Beneficiarios individuales
                  </div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 900, color: "#059669", marginTop: "6px" }}>
                    {stats?.porTipoBeneficiario?.find((t) => t.tipo.includes("Sola"))?.raciones.toLocaleString("es-VE") || 0}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          GRÁFICA DE EVOLUCIÓN TEMPORAL DE COMIDAS ENTREGADAS
      ══════════════════════════════════════════════════════════════════════════ */}
      <div className="comedor-card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-primary)" }}>
              Evolución Diaria de Comidas Entregadas
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Desglose apilado de raciones por servicio en el período seleccionado
            </div>
          </div>

          {/* Leyenda de colores */}
          <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem", color: "var(--text-primary)", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#f59e0b", display: "inline-block" }} />
              <span>Desayuno</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#0ea5e9", display: "inline-block" }} />
              <span>Almuerzo</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#a78bfa", display: "inline-block" }} />
              <span>Cena</span>
            </div>
          </div>
        </div>

        {porDia.length === 0 ? (
          <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <span style={{ fontSize: "2rem", display: "block", marginBottom: "0.5rem" }}>🥣</span>
            <p style={{ fontWeight: 600, color: "var(--text-primary)" }}>Aún no hay registros de entregas en este periodo.</p>
            <span style={{ fontSize: "0.8rem" }}>Las entregas registradas en el Submódulo 2 aparecerán aquí reflejadas.</span>
          </div>
        ) : (
          <div style={{ position: "relative", marginTop: "1.5rem" }}>
            {/* Altura de barras */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: porDia.length > 20 ? "3px" : porDia.length > 14 ? "6px" : "12px",
                height: "230px",
                paddingBottom: "24px",
                borderBottom: "1px solid var(--border-color)",
                overflowX: "auto",
              }}
            >
              {porDia.map((d) => {
                const heightPct = Math.round((d.total / maxTotalRaciones) * 100);
                const desP = d.total > 0 ? (d.desayuno / d.total) * 100 : 0;
                const almP = d.total > 0 ? (d.almuerzo / d.total) * 100 : 0;
                const cenP = d.total > 0 ? (d.cena / d.total) * 100 : 0;

                return (
                  <div
                    key={d.fecha}
                    style={{
                      flex: 1,
                      minWidth: porDia.length > 20 ? "20px" : porDia.length > 14 ? "28px" : "38px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      height: "100%",
                      justifyContent: "flex-end",
                      cursor: "pointer",
                      position: "relative",
                    }}
                    onMouseEnter={() => setHoveredBar(d)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    {/* Total arriba de la barra */}
                    <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
                      {d.total}
                    </span>

                    {/* Barra apilada con 3 servicios */}
                    <div
                      style={{
                        width: "100%",
                        height: `${Math.max(heightPct, 5)}%`,
                        borderRadius: "6px 6px 0 0",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        boxShadow: "0 2px 5px rgba(0,0,0,0.12)",
                        transition: "transform 0.15s ease",
                        transform: hoveredBar?.fecha === d.fecha ? "scaleY(1.04)" : "none",
                      }}
                    >
                      {cenP > 0 && <div style={{ height: `${cenP}%`, background: "#a78bfa" }} title={`Cena: ${d.cena}`} />}
                      {almP > 0 && <div style={{ height: `${almP}%`, background: "#0ea5e9" }} title={`Almuerzo: ${d.almuerzo}`} />}
                      {desP > 0 && <div style={{ height: `${desP}%`, background: "#f59e0b" }} title={`Desayuno: ${d.desayuno}`} />}
                    </div>

                    {/* Etiqueta de fecha abajo */}
                    <span
                      style={{
                        position: "absolute",
                        bottom: "2px",
                        fontSize: "0.68rem",
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                        transform: porDia.length > 10 ? "rotate(-35deg)" : "none",
                        transformOrigin: "left center",
                      }}
                    >
                      {d.fecha.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Tooltip flotante al pasar el mouse */}
            {hoveredBar && (
              <div
                style={{
                  position: "absolute",
                  top: "10px",
                  right: "10px",
                  background: "var(--card-bg, var(--bg-secondary))",
                  border: "1px solid var(--border-color)",
                  borderRadius: "10px",
                  padding: "0.65rem 0.95rem",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
                  fontSize: "0.82rem",
                  zIndex: 10,
                  minWidth: "175px",
                  color: "var(--text-primary)",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: "0.35rem", color: "var(--text-primary)" }}>
                  📅 Fecha: {hoveredBar.fecha}
                </div>
                <div style={{ color: "#d97706", display: "flex", justifyContent: "space-between", margin: "2px 0" }}>
                  <span>Desayuno:</span> <strong>{hoveredBar.desayuno}</strong>
                </div>
                <div style={{ color: "#0284c7", display: "flex", justifyContent: "space-between", margin: "2px 0" }}>
                  <span>Almuerzo:</span> <strong>{hoveredBar.almuerzo}</strong>
                </div>
                <div style={{ color: "#7c3aed", display: "flex", justifyContent: "space-between", margin: "2px 0" }}>
                  <span>Cena:</span> <strong>{hoveredBar.cena}</strong>
                </div>
                <div style={{ borderTop: "1px solid var(--border-color)", marginTop: "0.4rem", paddingTop: "0.4rem", fontWeight: 800, display: "flex", justifyContent: "space-between" }}>
                  <span>Total Raciones:</span> <span>{hoveredBar.total}</span>
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem", marginTop: "3px" }}>
                  {hoveredBar.beneficiarios} personas atendidas
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          GRÁFICA DE HORAS PICO DE AFLUENCIA (DISTRIBUCIÓN HORARIA)
      ══════════════════════════════════════════════════════════════════════════ */}
      {stats?.porHora && stats.porHora.length > 0 && (
        <div className="comedor-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
            ⏰ Horas Pico de Afluencia en Comedor
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
            Distribución horaria de entrega de raciones para optimización logística
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "8px",
              height: "120px",
              paddingBottom: "22px",
              borderBottom: "1px solid var(--border-color)",
              overflowX: "auto",
            }}
          >
            {(() => {
              const maxH = Math.max(...stats.porHora.map((h) => h.raciones), 1);
              return stats.porHora.map((h) => {
                const pct = Math.round((h.raciones / maxH) * 100);
                return (
                  <div
                    key={h.hora}
                    style={{
                      flex: 1,
                      minWidth: "32px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      height: "100%",
                      justifyContent: "flex-end",
                      position: "relative",
                    }}
                    title={`${h.hora} hrs: ${h.raciones} raciones (${h.atenciones} atenciones)`}
                  >
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>
                      {h.raciones}
                    </span>
                    <div
                      style={{
                        width: "100%",
                        height: `${Math.max(pct, 6)}%`,
                        background: "linear-gradient(180deg, #3b82f6 0%, #1e3a8a 100%)",
                        borderRadius: "4px 4px 0 0",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        bottom: "2px",
                        fontSize: "0.65rem",
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h.hora.slice(0, 2)}h
                    </span>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TABLA DE CONSOLIDADO HISTÓRICO POR FECHA
      ══════════════════════════════════════════════════════════════════════════ */}
      {porDia.length > 0 && (
        <div className="comedor-card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)" }}>
              Consolidado Histórico por Fecha
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              Mostrando {porDia.length} días de actividad
            </div>
          </div>

          <div className="table-responsive" style={{ overflowX: "auto" }}>
            <table className="registro-table" style={{ width: "100%", fontSize: "0.85rem" }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th style={{ textAlign: "center" }}>☀️ Desayuno</th>
                  <th style={{ textAlign: "center" }}>🍽️ Almuerzo</th>
                  <th style={{ textAlign: "center" }}>🌙 Cena</th>
                  <th style={{ textAlign: "center" }}>🍲 Total Raciones</th>
                  <th style={{ textAlign: "center" }}>👥 Atenciones</th>
                  <th style={{ textAlign: "center" }}>Platos / Persona</th>
                </tr>
              </thead>
              <tbody>
                {porDia.slice().reverse().map((d) => (
                  <tr key={d.fecha}>
                    <td><strong style={{ color: "var(--text-primary)" }}>{d.fecha}</strong></td>
                    <td style={{ textAlign: "center", color: "#d97706", fontWeight: 700 }}>{d.desayuno}</td>
                    <td style={{ textAlign: "center", color: "#0284c7", fontWeight: 700 }}>{d.almuerzo}</td>
                    <td style={{ textAlign: "center", color: "#7c3aed", fontWeight: 700 }}>{d.cena}</td>
                    <td style={{ textAlign: "center", fontWeight: 900, color: "var(--text-primary)" }}>{d.total}</td>
                    <td style={{ textAlign: "center", color: "var(--text-secondary)" }}>{d.beneficiarios}</td>
                    <td style={{ textAlign: "center", color: "var(--text-secondary)", fontWeight: 600 }}>
                      {d.beneficiarios > 0 ? (d.total / d.beneficiarios).toFixed(1) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
