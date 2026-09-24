"use client";

import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/apiFetch";
import StyledSelect from "@/components/StyledSelect";
import { ESTATUS_SALA_OPTIONS } from "@/lib/constants";
import type { PlanteamientoSalaStats } from "@/types";

interface Props {
  campamentosList: { id: string; nombre: string }[];
  showToast: (msg: string, type: "success" | "error" | "info" | "warning") => void;
}

export default function PlanteamientoSalaGraficas({ campamentosList, showToast }: Props) {
  const [stats, setStats] = useState<PlanteamientoSalaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCampamento, setSelectedCampamento] = useState<string>("TODOS");
  const [requisitosTab, setRequisitosTab] = useState<"MERCADO_SECUNDARIO" | "ALQUILER" | "PLAN_VENEZUELA_RENACE">("MERCADO_SECUNDARIO");

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/planteamiento-sala/stats");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && data?.stats) {
        setStats(data.stats);
      } else {
        showToast(data?.error || "Error al cargar estadísticas.", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Error de conexión al obtener estadísticas.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const fmt = (n: number) => (n || 0).toLocaleString("es-VE");
  const pctStr = (val: number, total: number) => `${total > 0 ? Math.round((val / total) * 100) : 0}%`;
  const pctNum = (val: number, total: number) => (total > 0 ? Math.round((val / total) * 100) : 0);

  // Ámbito de datos según selección (Global o Campamento específico)
  const currentScope = useMemo(() => {
    if (!stats) return null;
    if (selectedCampamento === "TODOS") return stats.global;
    return stats.campamentos.find((c) => c.refugio === selectedCampamento) || null;
  }, [stats, selectedCampamento]);

  if (loading) {
    return (
      <div style={{ padding: "3rem 1rem", textAlign: "center" }}>
        <span className="spinner" style={{ width: "36px", height: "36px", margin: "0 auto 1.25rem" }} />
        <h4 style={{ margin: 0, fontWeight: 700, fontSize: "1.1rem" }}>Cargando analítica y gráficas…</h4>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px" }}>
          Consolidando datos demográficos, estatus y cumplimiento de recaudos.
        </p>
      </div>
    );
  }

  if (!stats || !currentScope) {
    return (
      <div className="reg-empty-state" style={{ padding: "3rem" }}>
        <p>No se pudieron cargar las estadísticas del módulo</p>
        <button type="button" className="toolbar-btn" onClick={loadStats} style={{ marginTop: "1rem" }}>
          Reintentar
        </button>
      </div>
    );
  }

  const {
    totalPersonas,
    totalCargaFamiliar = 0,
    totalPoblacion = totalPersonas,
    promedioProgreso = 0,
    porEstatus,
    porTipoOpcion,
    demografia,
    mercadoSecundario,
    alquiler,
    venezuelaRenace,
  } = currentScope;

  const maxCampPersonas = Math.max(1, ...(stats.campamentos.map((c) => c.totalPersonas) || [1]));

  return (
    <div className="sala-graficas" style={{ display: "flex", flexDirection: "column", gap: "1.35rem" }}>
      {/* ── BARRA DE CONTROLES: Selector de Campamento y Actualizar ────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          background: "var(--bg-secondary)",
          padding: "0.85rem 1.15rem",
          borderRadius: "16px",
          border: "1px solid var(--border-color)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#2563eb" }}>
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span style={{ fontSize: "0.86rem", fontWeight: 700 }}>Ámbito de Análisis:</span>
          </div>

          <div style={{ minWidth: "280px", flex: "1 1 300px" }}>
            <StyledSelect
              value={selectedCampamento}
              onChange={setSelectedCampamento}
              ariaLabel="Filtrar métricas por campamento"
              options={[
                { value: "TODOS", label: "Consolidado Global (Todos los Campamentos)" },
                ...campamentosList.map((c) => ({ value: c.nombre, label: c.nombre })),
              ]}
            />
          </div>

          {selectedCampamento !== "TODOS" && (
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => setSelectedCampamento("TODOS")}
              style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem", height: "34px", fontWeight: 600 }}
            >
              Ver Consolidado General
            </button>
          )}
        </div>

        <button
          type="button"
          className="toolbar-btn"
          onClick={loadStats}
          disabled={loading}
          style={{ height: "36px", padding: "0 1rem", fontWeight: 600 }}
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
            style={{ marginRight: "6px" }}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Actualizar Analítica
        </button>
      </div>

      {/* ── INDICADOR DE CAMPO SELECCIONADO ─────────────────────────────────── */}
      {selectedCampamento !== "TODOS" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(37, 99, 235, 0.08)",
            border: "1px solid rgba(37, 99, 235, 0.25)",
            borderRadius: "14px",
            padding: "0.75rem 1.15rem",
            fontSize: "0.88rem",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#2563eb" }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span><b>Campamento Filtrado:</b></span>
            <span style={{ color: "#2563eb", fontWeight: 800, fontSize: "0.95rem" }}>{selectedCampamento}</span>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
              ({fmt(totalPersonas)} expediente{totalPersonas === 1 ? "" : "s"} · {fmt(totalPoblacion)} persona{totalPoblacion === 1 ? "" : "s"} beneficiada{totalPoblacion === 1 ? "" : "s"})
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedCampamento("TODOS")}
            style={{
              background: "transparent",
              border: "none",
              color: "#2563eb",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "0.82rem",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            Quitar filtro y ver todos
          </button>
        </div>
      )}

      {/* ── SECCIÓN 1: TARJETAS KPI PRINCIPALES (6 CARDS) ───────────────────── */}
      <div className="bal-cards">
        {/* 1. Total Expedientes Registrados */}
        <div className="bal-card" style={{ ["--accent" as any]: "#1e3a8a" } as React.CSSProperties}>
          <span className="bal-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </span>
          <span className="bal-card__value stat-card-value-animate">{fmt(totalPersonas)}</span>
          <span className="bal-card__label">
            Expedientes Registrados <span className="bal-card__sub">· Titulares</span>
          </span>
        </div>

        {/* 2. Población Total Beneficiada (Titulares + Carga Familiar) */}
        <div className="bal-card" style={{ ["--accent" as any]: "#4338ca" } as React.CSSProperties}>
          <span className="bal-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <span className="bal-card__value stat-card-value-animate">{fmt(totalPoblacion)}</span>
          <span className="bal-card__label">
            Población Beneficiada <span className="bal-card__sub">· {fmt(totalCargaFamiliar)} familiares</span>
          </span>
        </div>

        {/* 3. Crédito Entregado */}
        <div className="bal-card" style={{ ["--accent" as any]: "#059669" } as React.CSSProperties}>
          <span className="bal-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </span>
          <span className="bal-card__value stat-card-value-animate">{fmt(porEstatus?.["CREDITO ENTREGADO"] || 0)}</span>
          <span className="bal-card__label">
            Crédito Entregado <span className="bal-card__sub">· {pctStr(porEstatus?.["CREDITO ENTREGADO"] || 0, totalPersonas)}</span>
          </span>
        </div>

        {/* 4. En Proceso */}
        <div className="bal-card" style={{ ["--accent" as any]: "#2563eb" } as React.CSSProperties}>
          <span className="bal-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </span>
          <span className="bal-card__value stat-card-value-animate">{fmt(porEstatus?.["EN PROCESO"] || 0)}</span>
          <span className="bal-card__label">
            En Proceso <span className="bal-card__sub">· {pctStr(porEstatus?.["EN PROCESO"] || 0, totalPersonas)}</span>
          </span>
        </div>

        {/* 5. Con Novedad o Retornadas */}
        <div className="bal-card" style={{ ["--accent" as any]: "#dc2626" } as React.CSSProperties}>
          <span className="bal-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
          <span className="bal-card__value stat-card-value-animate">
            {fmt((porEstatus?.["CON NOVEDAD EN LA SEDE"] || 0) + (porEstatus?.["CARPETA RETORNADA"] || 0))}
          </span>
          <span className="bal-card__label">
            Observaciones <span className="bal-card__sub">· {fmt(porEstatus?.["CARPETA RETORNADA"] || 0)} ret / {fmt(porEstatus?.["CON NOVEDAD EN LA SEDE"] || 0)} nov</span>
          </span>
        </div>

        {/* 6. Avance Promedio de Requisitos */}
        <div className="bal-card" style={{ ["--accent" as any]: "#7c3aed" } as React.CSSProperties}>
          <span className="bal-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </span>
          <span className="bal-card__value stat-card-value-animate">{promedioProgreso}%</span>
          <span className="bal-card__label">Avance Promedio Documental</span>
        </div>
      </div>

      {/* ── CUANDO UN CAMPAMENTO NO TIENE REGISTROS ─────────────────────────── */}
      {selectedCampamento !== "TODOS" && totalPersonas === 0 && (
        <div
          className="dashboard-card"
          style={{
            background: "var(--card-bg, var(--bg-secondary))",
            border: "1px solid var(--border-color)",
            borderRadius: "16px",
            padding: "2.5rem 1.5rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(37,99,235,0.08)",
              color: "#2563eb",
              marginBottom: "1rem",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <h4 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
            Sin expedientes registrados en {selectedCampamento}
          </h4>
          <p style={{ margin: "6px auto 1.25rem", fontSize: "0.88rem", color: "var(--text-secondary)", maxWidth: "460px" }}>
            Aún no se ha cargado ninguna persona en este campamento. Puedes ingresar los datos y recaudos desde el submódulo <b>Información</b>.
          </p>
          <button type="button" className="toolbar-btn" onClick={() => setSelectedCampamento("TODOS")}>
            Ver consolidado general
          </button>
        </div>
      )}

      {/* ── SECCIÓN 2: ESTADO OPERATIVO Y MODALIDADES DE VIVIENDA ───────────── */}
      {totalPersonas > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1.25rem" }}>
          {/* Card A: Estatus Operativo de Expedientes */}
          <div
            className="dashboard-card"
            style={{
              background: "var(--card-bg, var(--bg-secondary))",
              border: "1px solid var(--border-color)",
              borderRadius: "16px",
              padding: "1.25rem 1.4rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.85rem" }}>
              <div>
                <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
                  Estatus Operativo del Trámite
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Progreso de gestión de los {fmt(totalPersonas)} expedientes cargados.
                </p>
              </div>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                Total: {fmt(totalPersonas)}
              </span>
            </div>

            {/* Barra multicolor apilada proporcional */}
            <div
              style={{
                width: "100%",
                height: "12px",
                borderRadius: "999px",
                display: "flex",
                overflow: "hidden",
                background: "rgba(0,0,0,0.06)",
                marginBottom: "1.1rem",
              }}
            >
              {ESTATUS_SALA_OPTIONS.map((st) => {
                const count = porEstatus?.[st.value] || 0;
                const pct = totalPersonas ? (count / totalPersonas) * 100 : 0;
                if (pct <= 0) return null;
                return (
                  <div
                    key={st.value}
                    style={{
                      width: `${pct}%`,
                      background: st.color,
                      transition: "width 0.3s ease",
                    }}
                    title={`${st.label}: ${count} (${Math.round(pct)}%)`}
                  />
                );
              })}
            </div>

            {/* Desglose individual de cada estatus */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {ESTATUS_SALA_OPTIONS.map((st) => {
                const count = porEstatus?.[st.value] || 0;
                const pct = pctNum(count, totalPersonas);
                return (
                  <div key={st.value} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                      <span style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: st.color, display: "inline-block" }} />
                        <span>{st.label}</span>
                      </span>
                      <span style={{ fontWeight: 700, color: st.color }}>
                        {fmt(count)} ({pct}%)
                      </span>
                    </div>
                    <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: st.color,
                          borderRadius: "999px",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card B: Modalidad de Solución Habitacional */}
          <div
            className="dashboard-card"
            style={{
              background: "var(--card-bg, var(--bg-secondary))",
              border: "1px solid var(--border-color)",
              borderRadius: "16px",
              padding: "1.25rem 1.4rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.85rem" }}>
              <div>
                <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
                  Modalidad de Solución Habitacional
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Tipificación de soluciones planteadas para las familias.
                </p>
              </div>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                3 modalidades
              </span>
            </div>

            {/* Barra multicolor apilada proporcional de modalidades */}
            <div
              style={{
                width: "100%",
                height: "12px",
                borderRadius: "999px",
                display: "flex",
                overflow: "hidden",
                background: "rgba(0,0,0,0.06)",
                marginBottom: "1.1rem",
              }}
            >
              {[
                { key: "MERCADO_SECUNDARIO", color: "#2563eb", val: porTipoOpcion?.["MERCADO_SECUNDARIO"] || 0 },
                { key: "ALQUILER", color: "#059669", val: porTipoOpcion?.["ALQUILER"] || 0 },
                { key: "PLAN_VENEZUELA_RENACE", color: "#7c3aed", val: porTipoOpcion?.["PLAN_VENEZUELA_RENACE"] || 0 },
              ].map((m) => {
                const pct = totalPersonas ? (m.val / totalPersonas) * 100 : 0;
                if (pct <= 0) return null;
                return (
                  <div
                    key={m.key}
                    style={{
                      width: `${pct}%`,
                      background: m.color,
                      transition: "width 0.3s ease",
                    }}
                    title={`${m.key}: ${m.val} (${Math.round(pct)}%)`}
                  />
                );
              })}
            </div>

            {/* Bloques interactivos por modalidad */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {/* Mercado Secundario */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  borderRadius: "12px",
                  background: "rgba(37, 99, 235, 0.06)",
                  border: "1px solid rgba(37, 99, 235, 0.2)",
                  cursor: "pointer",
                }}
                onClick={() => setRequisitosTab("MERCADO_SECUNDARIO")}
                title="Ver requisitos de Mercado Secundario"
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#2563eb" }} />
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#1e40af" }}>
                      Compra de Vivienda (Mercado Secundario)
                    </span>
                  </div>
                  <span style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginLeft: "15px" }}>
                    10 recaudos de adquisición
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#1e40af" }}>
                    {fmt(porTipoOpcion?.["MERCADO_SECUNDARIO"] || 0)}
                  </div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                    {pctStr(porTipoOpcion?.["MERCADO_SECUNDARIO"] || 0, totalPersonas)}
                  </span>
                </div>
              </div>

              {/* Alquiler */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  borderRadius: "12px",
                  background: "rgba(5, 150, 105, 0.06)",
                  border: "1px solid rgba(5, 150, 105, 0.2)",
                  cursor: "pointer",
                }}
                onClick={() => setRequisitosTab("ALQUILER")}
                title="Ver requisitos de Alquiler"
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#059669" }} />
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#065f46" }}>
                      Alquiler de Vivienda
                    </span>
                  </div>
                  <span style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginLeft: "15px" }}>
                    7 recaudos de arrendamiento
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#065f46" }}>
                    {fmt(porTipoOpcion?.["ALQUILER"] || 0)}
                  </div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                    {pctStr(porTipoOpcion?.["ALQUILER"] || 0, totalPersonas)}
                  </span>
                </div>
              </div>

              {/* Plan Venezuela Renace */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  borderRadius: "12px",
                  background: "rgba(124, 58, 237, 0.06)",
                  border: "1px solid rgba(124, 58, 237, 0.2)",
                  cursor: "pointer",
                }}
                onClick={() => setRequisitosTab("PLAN_VENEZUELA_RENACE")}
                title="Ver requisitos y materiales de Plan Venezuela Renace"
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#7c3aed" }} />
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#5b21b6" }}>
                      Plan Venezuela Renace
                    </span>
                  </div>
                  <span style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginLeft: "15px" }}>
                    Daños y asignación de materiales
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#5b21b6" }}>
                    {fmt(porTipoOpcion?.["PLAN_VENEZUELA_RENACE"] || 0)}
                  </div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                    {pctStr(porTipoOpcion?.["PLAN_VENEZUELA_RENACE"] || 0, totalPersonas)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECCIÓN 3: DEMOGRAFÍA Y CARACTERIZACIÓN SOCIAL ──────────────────── */}
      {totalPersonas > 0 && demografia && (
        <div
          className="dashboard-card"
          style={{
            background: "var(--card-bg, var(--bg-secondary))",
            border: "1px solid var(--border-color)",
            borderRadius: "16px",
            padding: "1.35rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.1rem" }}>
            <div>
              <h4 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 700 }}>
                Demografía y Caracterización de la Población Atendida
              </h4>
              <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Perfil sociodemográfico del total de {fmt(totalPoblacion)} personas ({fmt(totalPersonas)} titulares y {fmt(totalCargaFamiliar)} familiares).
              </p>
            </div>
            <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#2563eb" }}>
              {(totalCargaFamiliar / (totalPersonas || 1)).toFixed(1)} familiares por núcleo
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
            {/* Panel 1: Género (Titulares vs Población Total) */}
            <div
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: "14px",
                padding: "1rem 1.15rem",
              }}
            >
              <span style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.75rem" }}>
                Distribución por Género
              </span>

              {/* Femenino */}
              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "3px" }}>
                  <span style={{ fontWeight: 600, color: "#db2777" }}>Femenino</span>
                  <span style={{ fontWeight: 700 }}>
                    {fmt(demografia.generoTotal.femenino)} ({pctStr(demografia.generoTotal.femenino, totalPoblacion)})
                  </span>
                </div>
                <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pctNum(demografia.generoTotal.femenino, totalPoblacion)}%`,
                      height: "100%",
                      background: "#db2777",
                      borderRadius: "999px",
                    }}
                  />
                </div>
                <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                  {fmt(demografia.generoTitulares.femenino)} titulares
                </span>
              </div>

              {/* Masculino */}
              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "3px" }}>
                  <span style={{ fontWeight: 600, color: "#2563eb" }}>Masculino</span>
                  <span style={{ fontWeight: 700 }}>
                    {fmt(demografia.generoTotal.masculino)} ({pctStr(demografia.generoTotal.masculino, totalPoblacion)})
                  </span>
                </div>
                <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pctNum(demografia.generoTotal.masculino, totalPoblacion)}%`,
                      height: "100%",
                      background: "#2563eb",
                      borderRadius: "999px",
                    }}
                  />
                </div>
                <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                  {fmt(demografia.generoTitulares.masculino)} titulares
                </span>
              </div>

              {/* Sin especificar si existe */}
              {demografia.generoTotal.noEspecificado > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "3px" }}>
                    <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Por determinar</span>
                    <span style={{ fontWeight: 700 }}>{fmt(demografia.generoTotal.noEspecificado)}</span>
                  </div>
                  <div style={{ width: "100%", height: "6px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${pctNum(demografia.generoTotal.noEspecificado, totalPoblacion)}%`,
                        height: "100%",
                        background: "#94a3b8",
                        borderRadius: "999px",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Panel 2: Pirámide de Grupos de Edad */}
            <div
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: "14px",
                padding: "1rem 1.15rem",
              }}
            >
              <span style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.75rem" }}>
                Grupos Etarios (Edad)
              </span>

              {[
                { label: "Niños y Adolescentes (0 - 17)", val: demografia.gruposEdad.ninosAdolescentes, color: "#10b981" },
                { label: "Jóvenes (18 - 29 años)", val: demografia.gruposEdad.jovenes, color: "#3b82f6" },
                { label: "Adultos (30 - 59 años)", val: demografia.gruposEdad.adultos, color: "#6366f1" },
                { label: "Adultos Mayores (60+ años)", val: demografia.gruposEdad.adultosMayores, color: "#f59e0b" },
              ].map((grp) => {
                const p = pctNum(grp.val, totalPoblacion);
                return (
                  <div key={grp.label} style={{ marginBottom: "0.6rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "2px" }}>
                      <span style={{ fontWeight: 600 }}>{grp.label}</span>
                      <span style={{ fontWeight: 700, color: grp.color }}>
                        {fmt(grp.val)} ({p}%)
                      </span>
                    </div>
                    <div style={{ width: "100%", height: "7px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${p}%`,
                          height: "100%",
                          background: grp.color,
                          borderRadius: "999px",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Panel 3: Composición de la Carga Familiar */}
            <div
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: "14px",
                padding: "1rem 1.15rem",
              }}
            >
              <span style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.75rem" }}>
                Parentesco de la Carga Familiar ({fmt(totalCargaFamiliar)})
              </span>

              {totalCargaFamiliar === 0 ? (
                <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem", padding: "1rem 0", textAlign: "center" }}>
                  Aún no se han registrado integrantes en la carga familiar.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                  {Object.entries(demografia.parentescos).map(([k, v]) => {
                    const p = pctNum(v, totalCargaFamiliar);
                    if (v === 0) return null;
                    return (
                      <div key={k} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                          <span style={{ fontWeight: 600 }}>{k}</span>
                          <span style={{ fontWeight: 700 }}>
                            {fmt(v)} ({p}%)
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "6px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${p}%`,
                              height: "100%",
                              background: "#0284c7",
                              borderRadius: "999px",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SECCIÓN 4: CUMPLIMIENTO DE REQUISITOS DOCUMENTALES POR MODALIDAD ── */}
      {totalPersonas > 0 && (
        <div
          className="dashboard-card"
          style={{
            background: "var(--card-bg, var(--bg-secondary))",
            border: "1px solid var(--border-color)",
            borderRadius: "16px",
            padding: "1.35rem",
          }}
        >
          {/* Cabecera con selector por pestaña de modalidad */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "1.1rem",
            }}
          >
            <div>
              <h4 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 700 }}>
                Auditoría y Cumplimiento de Requisitos Documentales
              </h4>
              <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Conteo y porcentaje calculado con exactitud sobre la base de expedientes de cada modalidad.
              </p>
            </div>

            {/* Selector de pestañas */}
            <div className="btn-seg-group">
              <button
                type="button"
                className={`toolbar-btn${requisitosTab === "MERCADO_SECUNDARIO" ? " is-active" : ""}`}
                onClick={() => setRequisitosTab("MERCADO_SECUNDARIO")}
              >
                <span>Mercado Secundario (10)</span>
              </button>
              <button
                type="button"
                className={`toolbar-btn${requisitosTab === "ALQUILER" ? " is-active" : ""}`}
                onClick={() => setRequisitosTab("ALQUILER")}
              >
                <span>Alquiler (7)</span>
              </button>
              <button
                type="button"
                className={`toolbar-btn${requisitosTab === "PLAN_VENEZUELA_RENACE" ? " is-active" : ""}`}
                onClick={() => setRequisitosTab("PLAN_VENEZUELA_RENACE")}
              >
                <span>Venezuela Renace</span>
              </button>
            </div>
          </div>

          {/* TAB 1: MERCADO SECUNDARIO (10 REQUISITOS) */}
          {requisitosTab === "MERCADO_SECUNDARIO" && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(37, 99, 235, 0.07)",
                  border: "1px solid rgba(37, 99, 235, 0.2)",
                  borderRadius: "10px",
                  padding: "0.6rem 1rem",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                }}
              >
                <span>
                  Evaluando <b>{fmt(mercadoSecundario?.total || 0)}</b> expedientes de <b>Compra de Vivienda (Mercado Secundario)</b>.
                </span>
                <span style={{ fontWeight: 700, color: "#2563eb" }}>10 recaudos obligatorios</span>
              </div>

              {mercadoSecundario?.total === 0 ? (
                <div style={{ textAlign: "center", padding: "1.5rem 0", color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                  No hay expedientes registrados bajo la modalidad de Mercado Secundario en este campamento.
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.85rem" }}>
                    {[
                      { label: "1. Planilla de Caracterización", val: mercadoSecundario.porRequisito.planillaCaracterizacion },
                      { label: "2. Cédula Catastral", val: mercadoSecundario.porRequisito.cedulaCatastral },
                      { label: "3. Título de Casa (Cualquiera)", val: mercadoSecundario.porRequisito.conTituloCasa },
                      { label: "4. Ref. Bancaria del Vendedor", val: mercadoSecundario.porRequisito.referenciaBancariaVendedor },
                      { label: "5. QR de Hábitat y Vivienda", val: mercadoSecundario.porRequisito.qrHabitatVivienda },
                      { label: "6. Cédula del Vendedor", val: mercadoSecundario.porRequisito.cedulaVendedor },
                      { label: "7. Cédula del Comprador", val: mercadoSecundario.porRequisito.cedulaComprador },
                      { label: "8. Fotos Impresas de Vivienda", val: mercadoSecundario.porRequisito.fotosVivienda },
                      { label: "9. Vendedor Posee Patria", val: mercadoSecundario.porRequisito.vendedorPoseePatria },
                      { label: "10. QR de Colapso de Vivienda", val: mercadoSecundario.porRequisito.qrColapsoVivienda || 0 },
                    ].map((reqItem) => {
                      const p = pctNum(reqItem.val, mercadoSecundario.total);
                      const color = p >= 70 ? "#059669" : p >= 40 ? "#2563eb" : "#d97706";
                      return (
                        <div
                          key={reqItem.label}
                          style={{
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border-color)",
                            borderRadius: "12px",
                            padding: "0.75rem 1rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "6px" }}>
                            <span style={{ fontWeight: 600 }}>{reqItem.label}</span>
                            <span style={{ fontWeight: 700, color }}>
                              {p}% ({fmt(reqItem.val)})
                            </span>
                          </div>
                          <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${p}%`,
                                height: "100%",
                                background: color,
                                borderRadius: "999px",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desglose de Título de Casa */}
                  <div
                    style={{
                      marginTop: "1.2rem",
                      padding: "0.95rem 1.15rem",
                      background: "var(--bg-primary)",
                      borderRadius: "12px",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.6rem" }}>
                      Tipos de Título de Casa Consignados:
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", fontSize: "0.84rem" }}>
                      <span><b>Título de Propiedad:</b> {fmt(mercadoSecundario.titulosCasaDesglose?.["TITULO_PROPIEDAD"] || 0)}</span>
                      <span><b>Título Supletorio:</b> {fmt(mercadoSecundario.titulosCasaDesglose?.["TITULO_SUPLETORIO"] || 0)}</span>
                      <span><b>Documento Compra/Venta:</b> {fmt(mercadoSecundario.titulosCasaDesglose?.["COMPRA_VENTA"] || 0)}</span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        <b>Sin Título:</b> {fmt(mercadoSecundario.titulosCasaDesglose?.["NINGUNO"] || 0)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: ALQUILER (7 REQUISITOS) */}
          {requisitosTab === "ALQUILER" && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(5, 150, 105, 0.07)",
                  border: "1px solid rgba(5, 150, 105, 0.2)",
                  borderRadius: "10px",
                  padding: "0.6rem 1rem",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                }}
              >
                <span>
                  Evaluando <b>{fmt(alquiler?.total || 0)}</b> expedientes de <b>Alquiler de Vivienda</b>.
                </span>
                <span style={{ fontWeight: 700, color: "#059669" }}>7 recaudos de arrendamiento</span>
              </div>

              {alquiler?.total === 0 ? (
                <div style={{ textAlign: "center", padding: "1.5rem 0", color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                  No hay expedientes registrados bajo la modalidad de Alquiler en este campamento.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.85rem" }}>
                  {[
                    { label: "1. Carta de Compromiso", val: alquiler.porRequisito.cartaCompromiso },
                    { label: "2. Fotos de la Vivienda en Alquiler", val: alquiler.porRequisito.fotosAlquiler },
                    { label: "3. Ref. Bancaria de quien Alquila", val: alquiler.porRequisito.referenciaBancariaAlquiler },
                    { label: "4. Cédula del Arrendador", val: alquiler.porRequisito.cedulaArrendador },
                    { label: "5. Cédula del Arrendatario", val: alquiler.porRequisito.cedulaArrendatario },
                    { label: "6. RIF del Arrendador", val: alquiler.porRequisito.rifArrendador },
                    { label: "7. RIF del Arrendatario", val: alquiler.porRequisito.rifArrendatario },
                  ].map((reqItem) => {
                    const p = pctNum(reqItem.val, alquiler.total);
                    const color = p >= 70 ? "#059669" : p >= 40 ? "#0d9488" : "#d97706";
                    return (
                      <div
                        key={reqItem.label}
                        style={{
                          background: "var(--bg-primary)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "12px",
                          padding: "0.75rem 1rem",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "6px" }}>
                          <span style={{ fontWeight: 600 }}>{reqItem.label}</span>
                          <span style={{ fontWeight: 700, color }}>
                            {p}% ({fmt(reqItem.val)})
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${p}%`,
                              height: "100%",
                              background: color,
                              borderRadius: "999px",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PLAN VENEZUELA RENACE (REQUISITOS Y MATERIALES) */}
          {requisitosTab === "PLAN_VENEZUELA_RENACE" && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(124, 58, 237, 0.07)",
                  border: "1px solid rgba(124, 58, 237, 0.2)",
                  borderRadius: "10px",
                  padding: "0.6rem 1rem",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                }}
              >
                <span>
                  Evaluando <b>{fmt(venezuelaRenace?.total || 0)}</b> expedientes de <b>Plan Venezuela Renace</b>.
                </span>
                <span style={{ fontWeight: 700, color: "#7c3aed" }}>Daños e Insumos</span>
              </div>

              {venezuelaRenace?.total === 0 ? (
                <div style={{ textAlign: "center", padding: "1.5rem 0", color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                  No hay expedientes registrados bajo el Plan Venezuela Renace en este campamento.
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.85rem" }}>
                    {[
                      { label: "1. RIF de la Vivienda con Daños", val: venezuelaRenace.porRequisito.rifViviendaDanos },
                      { label: "2. Fotos de la Vivienda Afectada", val: venezuelaRenace.porRequisito.fotosViviendaRenace },
                      { label: "3. Asignación de Materiales Solicitados", val: venezuelaRenace.porRequisito.conMateriales },
                    ].map((reqItem) => {
                      const p = pctNum(reqItem.val, venezuelaRenace.total);
                      const color = p >= 70 ? "#059669" : p >= 40 ? "#7c3aed" : "#d97706";
                      return (
                        <div
                          key={reqItem.label}
                          style={{
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border-color)",
                            borderRadius: "12px",
                            padding: "0.75rem 1rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "6px" }}>
                            <span style={{ fontWeight: 600 }}>{reqItem.label}</span>
                            <span style={{ fontWeight: 700, color }}>
                              {p}% ({fmt(reqItem.val)})
                            </span>
                          </div>
                          <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${p}%`,
                                height: "100%",
                                background: color,
                                borderRadius: "999px",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Consolidado de Materiales Solicitados */}
                  <div
                    style={{
                      marginTop: "1.2rem",
                      padding: "1rem 1.25rem",
                      background: "var(--bg-primary)",
                      borderRadius: "14px",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <span style={{ fontSize: "0.88rem", fontWeight: 700, display: "block", marginBottom: "0.75rem", color: "#5b21b6" }}>
                      Volumen Total de Materiales Solicitados:
                    </span>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.85rem" }}>
                      <div style={{ padding: "0.75rem", background: "rgba(0,0,0,0.02)", borderRadius: "10px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                        <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#1e3a8a" }}>
                          {fmt(venezuelaRenace.materialesTotales.sacosCemento)}
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                          Sacos Cemento
                        </span>
                      </div>

                      <div style={{ padding: "0.75rem", background: "rgba(0,0,0,0.02)", borderRadius: "10px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                        <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0d9488" }}>
                          {fmt(venezuelaRenace.materialesTotales.metrosArena)} m³
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                          Metros Arena
                        </span>
                      </div>

                      <div style={{ padding: "0.75rem", background: "rgba(0,0,0,0.02)", borderRadius: "10px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                        <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#d97706" }}>
                          {fmt(venezuelaRenace.materialesTotales.bloques)}
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                          Bloques
                        </span>
                      </div>

                      <div style={{ padding: "0.75rem", background: "rgba(0,0,0,0.02)", borderRadius: "10px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                        <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#475569" }}>
                          {fmt(venezuelaRenace.materialesTotales.cabillas)}
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                          Cabillas
                        </span>
                      </div>

                      <div style={{ padding: "0.75rem", background: "rgba(0,0,0,0.02)", borderRadius: "10px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                        <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#7c3aed" }}>
                          {fmt(venezuelaRenace.materialesTotales.pego)}
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                          Sacos de Pego
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SECCIÓN 5: COMPARATIVA Y RANKING DE CAMPAMENTOS ─────────────────── */}
      {selectedCampamento === "TODOS" && (
        <div
          className="dashboard-card"
          style={{
            background: "var(--card-bg, var(--bg-secondary))",
            border: "1px solid var(--border-color)",
            borderRadius: "16px",
            padding: "1.35rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
            <div>
              <h4 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 700 }}>
                Ranking y Comparativa por Campamento
              </h4>
              <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Distribución de carga de los {stats.campamentos.length} campamentos. Haz clic en cualquier campamento para auditar sus métricas.
              </p>
            </div>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#2563eb" }}>
              {fmt(totalPersonas)} expedientes en total
            </span>
          </div>

          {stats.campamentos.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", textAlign: "center", padding: "1.5rem 0" }}>
              Aún no hay expedientes cargados en ningún campamento.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {stats.campamentos.map((c, idx) => {
                const barWidth = Math.max(4, Math.round((c.totalPersonas / maxCampPersonas) * 100));
                return (
                  <div
                    key={c.refugio}
                    onClick={() => setSelectedCampamento(c.refugio)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      cursor: "pointer",
                      padding: "6px 10px",
                      borderRadius: "10px",
                      background: c.totalPersonas > 0 ? "var(--bg-primary)" : "transparent",
                      border: c.totalPersonas > 0 ? "1px solid var(--border-color)" : "1px dashed transparent",
                      transition: "all 0.15s ease",
                    }}
                    title={`Ver métricas detalladas de ${c.refugio}`}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", width: "18px" }}>#{idx + 1}</span>
                        <span>{c.refugio}</span>
                        <span style={{ fontSize: "0.72rem", color: "#2563eb", display: "inline-flex", alignItems: "center", gap: "3px", marginLeft: "4px" }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          <span>filtrar</span>
                        </span>
                      </span>
                      <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                        <b>{fmt(c.totalPersonas)}</b> expedientes · <b>{fmt(c.totalPoblacion)}</b> personas ({c.promedioProgreso}% avance)
                      </span>
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: "10px",
                        borderRadius: "999px",
                        background: "rgba(0,0,0,0.06)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${c.totalPersonas > 0 ? barWidth : 0}%`,
                          height: "100%",
                          background: "linear-gradient(90deg, #2563eb, #3b82f6)",
                          borderRadius: "999px",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SECCIÓN 6: RITMO Y EVOLUCIÓN MENSUAL (AVANCE TEMPORAL) ──────────── */}
      {stats.avanceTemporal && stats.avanceTemporal.length > 0 && (
        <div
          className="dashboard-card"
          style={{
            background: "var(--card-bg, var(--bg-secondary))",
            border: "1px solid var(--border-color)",
            borderRadius: "16px",
            padding: "1.35rem",
          }}
        >
          <div style={{ marginBottom: "1rem" }}>
            <h4 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 700 }}>
              Ritmo de Recepción y Créditos Otorgados
            </h4>
            <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Evolución mensual de carpetas ingresadas versus subsidios/créditos entregados.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.85rem" }}>
            {stats.avanceTemporal.map((item) => (
              <div
                key={item.mes}
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                  padding: "0.85rem",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                  {item.mes}
                </span>
                <div style={{ display: "flex", justifyContent: "space-around", alignItems: "baseline" }}>
                  <div>
                    <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "#2563eb" }}>
                      {fmt(item.carpetas)}
                    </span>
                    <span style={{ display: "block", fontSize: "0.68rem", color: "var(--text-secondary)" }}>
                      Cargadas
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "#059669" }}>
                      {fmt(item.creditos)}
                    </span>
                    <span style={{ display: "block", fontSize: "0.68rem", color: "var(--text-secondary)" }}>
                      Entregados
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
