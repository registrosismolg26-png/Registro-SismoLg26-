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
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          background: "var(--card-bg, #ffffff)",
          padding: "0.85rem 1.15rem",
          borderRadius: "12px",
          border: "1px solid var(--border-color, #e2e8f0)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.2rem" }}>📊</span>
          <span style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)" }}>
            Estadísticas y Afluencia de Comedor
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "0.85rem",
        }}
      >
        {/* TOTAL RACIONES */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(59, 130, 246, 0.03) 100%)",
            border: "1px solid rgba(37, 99, 235, 0.2)",
            borderRadius: "14px",
            padding: "1rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Total Raciones Entregadas
            </span>
            <span style={{ fontSize: "1.2rem" }}>🍲</span>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#1d4ed8" }}>
            {(stats?.totalRaciones || 0).toLocaleString("es-VE")}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Total de platos servidos en el periodo
          </div>
        </div>

        {/* BENEFICIARIOS ATENDIDOS */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.03) 100%)",
            border: "1px solid rgba(16, 185, 129, 0.2)",
            borderRadius: "14px",
            padding: "1rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Atenciones Realizadas
            </span>
            <span style={{ fontSize: "1.2rem" }}>👥</span>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#047857" }}>
            {(stats?.totalAtendidos || 0).toLocaleString("es-VE")}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Jefes y personas solas que retiraron
          </div>
        </div>

        {/* DESAYUNOS */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(217, 119, 6, 0.03) 100%)",
            border: "1px solid rgba(245, 158, 11, 0.2)",
            borderRadius: "14px",
            padding: "1rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Desayunos
            </span>
            <span style={{ fontSize: "1.2rem" }}>☀️</span>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#b45309" }}>
            {(stats?.desayunoRaciones || 0).toLocaleString("es-VE")}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            {stats?.desayunoAtendidos || 0} atenciones registradas
          </div>
        </div>

        {/* ALMUERZOS */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(2, 132, 199, 0.03) 100%)",
            border: "1px solid rgba(14, 165, 233, 0.2)",
            borderRadius: "14px",
            padding: "1rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Almuerzos
            </span>
            <span style={{ fontSize: "1.2rem" }}>🍽️</span>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#0369a1" }}>
            {(stats?.almuerzoRaciones || 0).toLocaleString("es-VE")}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            {stats?.almuerzoAtendidos || 0} atenciones registradas
          </div>
        </div>

        {/* CENAS */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(109, 40, 217, 0.03) 100%)",
            border: "1px solid rgba(139, 92, 246, 0.2)",
            borderRadius: "14px",
            padding: "1rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Cenas
            </span>
            <span style={{ fontSize: "1.2rem" }}>🌙</span>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#6d28d9" }}>
            {(stats?.cenaRaciones || 0).toLocaleString("es-VE")}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            {stats?.cenaAtendidos || 0} atenciones registradas
          </div>
        </div>
      </div>

      {/* GRÁFICA DE AFLUENCIA DIARIA */}
      <div
        style={{
          background: "var(--card-bg, #ffffff)",
          borderRadius: "16px",
          border: "1px solid var(--border-color, #e2e8f0)",
          padding: "1.25rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-primary)" }}>
              Evolución Diaria de Comidas Entregadas
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Desglose de raciones por Desayuno, Almuerzo y Cena en los últimos {rangoDias} días
            </div>
          </div>

          {/* Leyenda de colores */}
          <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#f59e0b", display: "inline-block" }} />
              <span>Desayuno</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#0284c7", display: "inline-block" }} />
              <span>Almuerzo</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#7c3aed", display: "inline-block" }} />
              <span>Cena</span>
            </div>
          </div>
        </div>

        {porDia.length === 0 ? (
          <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <span style={{ fontSize: "2rem", display: "block", marginBottom: "0.5rem" }}>🥣</span>
            <p style={{ fontWeight: 600 }}>Aún no hay registros de entregas en este periodo.</p>
            <span style={{ fontSize: "0.8rem" }}>Las entregas escaneadas en el Submódulo 2 aparecerán aquí reflejadas.</span>
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
                borderBottom: "1px solid var(--border-color, #e2e8f0)",
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
                      {cenPct > 0 && <div style={{ height: `${cenPct}%`, background: "#7c3aed" }} title={`Cena: ${d.cena}`} />}
                      {almPct > 0 && <div style={{ height: `${almPct}%`, background: "#0284c7" }} title={`Almuerzo: ${d.almuerzo}`} />}
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
                  background: "var(--card-bg, #ffffff)",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  borderRadius: "10px",
                  padding: "0.6rem 0.85rem",
                  boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
                  fontSize: "0.8rem",
                  zIndex: 10,
                  minWidth: "160px",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: "0.3rem", color: "var(--text-primary)" }}>
                  📅 Fecha: {hoveredBar.fecha}
                </div>
                <div style={{ color: "#d97706", display: "flex", justifyContent: "space-between" }}>
                  <span>Desayuno:</span> <strong>{hoveredBar.desayuno}</strong>
                </div>
                <div style={{ color: "#0284c7", display: "flex", justifyContent: "space-between" }}>
                  <span>Almuerzo:</span> <strong>{hoveredBar.almuerzo}</strong>
                </div>
                <div style={{ color: "#7c3aed", display: "flex", justifyContent: "space-between" }}>
                  <span>Cena:</span> <strong>{hoveredBar.cena}</strong>
                </div>
                <div style={{ borderTop: "1px solid var(--border-color, #e2e8f0)", marginTop: "0.3rem", paddingTop: "0.3rem", fontWeight: 800, display: "flex", justifyContent: "space-between" }}>
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
        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            borderRadius: "16px",
            border: "1px solid var(--border-color, #e2e8f0)",
            padding: "1.25rem",
          }}
        >
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
                    <td><strong>{d.fecha}</strong></td>
                    <td style={{ textAlign: "center", color: "#b45309", fontWeight: 700 }}>{d.desayuno}</td>
                    <td style={{ textAlign: "center", color: "#0369a1", fontWeight: 700 }}>{d.almuerzo}</td>
                    <td style={{ textAlign: "center", color: "#6d28d9", fontWeight: 700 }}>{d.cena}</td>
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
