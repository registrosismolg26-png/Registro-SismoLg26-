"use client";

import { useState, useMemo } from "react";
import type { ComedorStats } from "@/types";

interface Props {
  stats: ComedorStats | null;
  loading: boolean;
  onRefresh: () => void;
  rangoDias: number;
  setRangoDias: (dias: number) => void;
}

export default function ComedorGraficas({
  stats,
  loading,
  onRefresh,
  rangoDias,
  setRangoDias,
}: Props) {
  const [hoveredBar, setHoveredBar] = useState<any | null>(null);

  const porDia = useMemo(() => {
    if (!stats || !stats.porDia) return [];
    return stats.porDia.slice(-rangoDias);
  }, [stats, rangoDias]);

  const maxTotalRaciones = useMemo(() => {
    if (!porDia.length) return 1;
    return Math.max(...porDia.map((d) => d.total), 1);
  }, [porDia]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Barra superior de controles del submódulo */}
      <div
        className="comedor-card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          padding: "0.85rem 1.15rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.2rem" }}>📊</span>
          <span style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)" }}>
            Estadísticas y Afluencia de Comedor
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <div className="btn-seg-group">
            {[7, 14, 30].map((dias) => (
              <button
                key={dias}
                type="button"
                className={`toolbar-btn ${rangoDias === dias ? "toolbar-btn--primary" : ""}`}
                style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                onClick={() => setRangoDias(dias)}
              >
                {dias === 7 ? "7 días" : dias === 14 ? "14 días" : "30 días"}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="toolbar-btn"
            onClick={onRefresh}
            disabled={loading}
            title="Refrescar estadísticas"
            style={{ padding: "0.35rem 0.65rem" }}
          >
            {loading ? <span className="spinner spinner-sm" /> : "🔄 Refrescar"}
          </button>
        </div>
      </div>

      {/* TARJETAS DE MÉTRICAS GENERALES */}
      <div className="comedor-kpi-grid">
        {/* TOTAL RACIONES */}
        <div
          className="comedor-kpi-card"
          style={{
            background: "linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(59, 130, 246, 0.04) 100%)",
            border: "1px solid rgba(59, 130, 246, 0.25)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Total Raciones
            </span>
            <span style={{ fontSize: "1.2rem" }}>🍲</span>
          </div>
          <div className="comedor-kpi-val" style={{ fontSize: "1.75rem", fontWeight: 900, color: "#3b82f6" }}>
            {(stats?.totalRaciones || 0).toLocaleString("es-VE")}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Platos servidos en el periodo
          </div>
        </div>

        {/* BENEFICIARIOS ATENDIDOS */}
        <div
          className="comedor-kpi-card"
          style={{
            background: "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.04) 100%)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Atenciones
            </span>
            <span style={{ fontSize: "1.2rem" }}>👥</span>
          </div>
          <div className="comedor-kpi-val" style={{ fontSize: "1.75rem", fontWeight: 900, color: "#10b981" }}>
            {(stats?.totalAtendidos || 0).toLocaleString("es-VE")}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Jefes y personas solas
          </div>
        </div>

        {/* DESAYUNOS */}
        <div
          className="comedor-kpi-card"
          style={{
            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.04) 100%)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Desayunos
            </span>
            <span style={{ fontSize: "1.2rem" }}>☀️</span>
          </div>
          <div className="comedor-kpi-val" style={{ fontSize: "1.75rem", fontWeight: 900, color: "#f59e0b" }}>
            {(stats?.desayunoRaciones || 0).toLocaleString("es-VE")}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            {stats?.desayunoAtendidos || 0} atenciones registradas
          </div>
        </div>

        {/* ALMUERZOS */}
        <div
          className="comedor-kpi-card"
          style={{
            background: "linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(2, 132, 199, 0.04) 100%)",
            border: "1px solid rgba(14, 165, 233, 0.25)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Almuerzos
            </span>
            <span style={{ fontSize: "1.2rem" }}>🍽️</span>
          </div>
          <div className="comedor-kpi-val" style={{ fontSize: "1.75rem", fontWeight: 900, color: "#0ea5e9" }}>
            {(stats?.almuerzoRaciones || 0).toLocaleString("es-VE")}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            {stats?.almuerzoAtendidos || 0} atenciones registradas
          </div>
        </div>

        {/* CENAS */}
        <div
          className="comedor-kpi-card"
          style={{
            background: "linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(109, 40, 217, 0.04) 100%)",
            border: "1px solid rgba(139, 92, 246, 0.25)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Cenas
            </span>
            <span style={{ fontSize: "1.2rem" }}>🌙</span>
          </div>
          <div className="comedor-kpi-val" style={{ fontSize: "1.75rem", fontWeight: 900, color: "#a78bfa" }}>
            {(stats?.cenaRaciones || 0).toLocaleString("es-VE")}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            {stats?.cenaAtendidos || 0} atenciones registradas
          </div>
        </div>
      </div>

      {/* GRÁFICA DE AFLUENCIA DIARIA */}
      <div className="comedor-card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-primary)" }}>
              Evolución Diaria de Comidas Entregadas
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Desglose de raciones por servicio en los últimos {rangoDias} días
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
                gap: porDia.length > 14 ? "4px" : "12px",
                height: "220px",
                paddingBottom: "24px",
                borderBottom: "1px solid var(--border-color)",
                overflowX: "auto",
              }}
            >
              {porDia.map((d) => {
                const heightPct = Math.round((d.total / maxTotalRaciones) * 100);
                const desPct = d.total > 0 ? (d.desayuno / d.total) * 100 : 0;
                const almPct = d.total > 0 ? (d.almuerzo / d.total) * 100 : 0;
                const cenPct = d.total > 0 ? (d.cena / d.total) * 100 : 0;

                return (
                  <div
                    key={d.fecha}
                    style={{
                      flex: 1,
                      minWidth: porDia.length > 14 ? "24px" : "36px",
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
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
                      {d.total}
                    </span>

                    {/* Barra apilada con 3 servicios */}
                    <div
                      style={{
                        width: "100%",
                        height: `${Math.max(heightPct, 4)}%`,
                        borderRadius: "6px 6px 0 0",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                        transition: "transform 0.15s ease",
                        transform: hoveredBar?.fecha === d.fecha ? "scaleY(1.03)" : "none",
                      }}
                    >
                      {cenPct > 0 && <div style={{ height: `${cenPct}%`, background: "#a78bfa" }} title={`Cena: ${d.cena}`} />}
                      {almPct > 0 && <div style={{ height: `${almPct}%`, background: "#0ea5e9" }} title={`Almuerzo: ${d.almuerzo}`} />}
                      {desPct > 0 && <div style={{ height: `${desPct}%`, background: "#f59e0b" }} title={`Desayuno: ${d.desayuno}`} />}
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
                  padding: "0.6rem 0.85rem",
                  boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
                  fontSize: "0.8rem",
                  zIndex: 10,
                  minWidth: "160px",
                  color: "var(--text-primary)",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: "0.3rem", color: "var(--text-primary)" }}>
                  📅 Fecha: {hoveredBar.fecha}
                </div>
                <div style={{ color: "#f59e0b", display: "flex", justifyContent: "space-between" }}>
                  <span>Desayuno:</span> <strong>{hoveredBar.desayuno}</strong>
                </div>
                <div style={{ color: "#0ea5e9", display: "flex", justifyContent: "space-between" }}>
                  <span>Almuerzo:</span> <strong>{hoveredBar.almuerzo}</strong>
                </div>
                <div style={{ color: "#a78bfa", display: "flex", justifyContent: "space-between" }}>
                  <span>Cena:</span> <strong>{hoveredBar.cena}</strong>
                </div>
                <div style={{ borderTop: "1px solid var(--border-color)", marginTop: "0.3rem", paddingTop: "0.3rem", fontWeight: 800, display: "flex", justifyContent: "space-between" }}>
                  <span>Total Raciones:</span> <span>{hoveredBar.total}</span>
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem", marginTop: "2px" }}>
                  {hoveredBar.beneficiarios} personas atendidas
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* TABLA DE CONSOLIDADO DIARIO */}
      {porDia.length > 0 && (
        <div className="comedor-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)", marginBottom: "0.75rem" }}>
            Consolidado Histórico por Fecha
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
                  <th style={{ textAlign: "center" }}>👥 Personas Atendidas</th>
                </tr>
              </thead>
              <tbody>
                {porDia.slice().reverse().map((d) => (
                  <tr key={d.fecha}>
                    <td><strong style={{ color: "var(--text-primary)" }}>{d.fecha}</strong></td>
                    <td style={{ textAlign: "center", color: "#f59e0b", fontWeight: 700 }}>{d.desayuno}</td>
                    <td style={{ textAlign: "center", color: "#0ea5e9", fontWeight: 700 }}>{d.almuerzo}</td>
                    <td style={{ textAlign: "center", color: "#a78bfa", fontWeight: 700 }}>{d.cena}</td>
                    <td style={{ textAlign: "center", fontWeight: 900, color: "var(--text-primary)" }}>{d.total}</td>
                    <td style={{ textAlign: "center", color: "var(--text-secondary)" }}>{d.beneficiarios}</td>
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
