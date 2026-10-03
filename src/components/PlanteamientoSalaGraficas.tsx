"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { apiFetch } from "@/lib/apiFetch";
import SearchableSingleSelect from "@/components/SearchableSingleSelect";
import PlanteamientoSalaPresentationView from "@/components/PlanteamientoSalaPresentationView";
import { ESTATUS_SALA_OPTIONS } from "@/lib/constants";
import type { PlanteamientoSalaStats, TipoOpcionPlanteamiento, PlanteamientoSalaEstatus } from "@/types";

interface Props {
  campamentosList: { id: string; nombre: string }[];
  showToast: (msg: string, type: "success" | "error" | "info" | "warning") => void;
}

const MODALIDADES_LIST: { key: TipoOpcionPlanteamiento; label: string; short: string; color: string }[] = [
  { key: "MERCADO_SECUNDARIO", label: "Compra de Vivienda (Mercado Secundario)", short: "M. Secundario", color: "#2563eb" },
  { key: "ALQUILER", label: "Alquiler de Vivienda", short: "Alquiler", color: "#059669" },
  { key: "PLAN_VENEZUELA_RENACE", label: "Plan Venezuela Renace", short: "Vzla Renace", color: "#7c3aed" },
  { key: "CAMPAMENTO_MAYOR_PERMANENCIA", label: "Campamento Mayor Permanencia", short: "Mayor Perm.", color: "#ea580c" },
  { key: "ASIGNACION_GMVV", label: "Asignación GMVV", short: "Asig. GMVV", color: "#0891b2" },
];

export default function PlanteamientoSalaGraficas({ campamentosList, showToast }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<PlanteamientoSalaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCampamento, setSelectedCampamento] = useState<string>("TODOS");
  const [requisitosTab, setRequisitosTab] = useState<"MERCADO_SECUNDARIO" | "ALQUILER" | "PLAN_VENEZUELA_RENACE" | "CAMPAMENTO_MAYOR_PERMANENCIA" | "ASIGNACION_GMVV">("MERCADO_SECUNDARIO");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cuadrosView, setCuadrosView] = useState<"ESTATUS" | "MODALIDAD">("ESTATUS");

  // Sincronizar estado con eventos del navegador de pantalla completa
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    document.addEventListener("mozfullscreenchange", handleFsChange);
    document.addEventListener("MSFullscreenChange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
      document.removeEventListener("mozfullscreenchange", handleFsChange);
      document.removeEventListener("MSFullscreenChange", handleFsChange);
    };
  }, []);

  const campamentoOptions = useMemo(() => [
    { value: "TODOS", label: "Consolidado Global (Todos los Campamentos)" },
    ...campamentosList.map((c) => ({ value: c.nombre, label: c.nombre })),
  ], [campamentosList]);

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

  // Auto-refresco en modo pantalla completa cada 30s
  useEffect(() => {
    if (isFullscreen) {
      const t = setInterval(() => {
        loadStats();
      }, 30000);
      return () => clearInterval(t);
    }
  }, [isFullscreen]);

  const handlePrint = () => {
    window.print();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      try {
        document.exitFullscreen?.();
      } catch {}
    } else {
      containerRef.current?.requestFullscreen?.();
    }
  };

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

  if (isFullscreen) {
    return (
      <div ref={containerRef} className="sala-graficas" style={{ width: "100%", height: "100%" }}>
        <PlanteamientoSalaPresentationView
          stats={stats}
          selectedCampamento={selectedCampamento}
          onExit={() => {
            try {
              if (document.fullscreenElement) document.exitFullscreen();
            } catch {}
          }}
          onRefresh={loadStats}
          isUpdating={loading}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="sala-graficas">
      {/* ── INTERFAZ INTERACTIVA EN PANTALLA (OCULTA AL IMPRIMIR) ─────────── */}
      <div className="sala-graficas-screen" style={{ display: "flex", flexDirection: "column", gap: "1.35rem" }}>
        {/* ── BARRA DE CONTROLES: Selector de Campamento, Imprimir, Presentación y Actualizar ── */}
        <div className="sala-graficas-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#2563eb" }}>
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span style={{ fontSize: "0.86rem", fontWeight: 700 }}>Ámbito de Análisis:</span>
          </div>

          <div style={{ minWidth: "280px", flex: "1 1 300px" }}>
            <SearchableSingleSelect
              value={selectedCampamento}
              onChange={setSelectedCampamento}
              ariaLabel="Filtrar métricas por campamento"
              placeholder="Buscar campamento..."
              options={campamentoOptions}
            />
          </div>

          {selectedCampamento !== "TODOS" && (
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => setSelectedCampamento("TODOS")}
              style={{ fontSize: "0.8rem", padding: "0 1rem", height: "42px", borderRadius: "999px", fontWeight: 600 }}
            >
              Ver Consolidado General
            </button>
          )}
        </div>

        {/* Grupo de Acciones */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          {/* Botón Actualizar */}
          <button
            type="button"
            className="toolbar-btn"
            onClick={loadStats}
            disabled={loading}
            style={{ height: "42px", padding: "0 1.15rem", borderRadius: "999px", fontWeight: 700, gap: "6px" }}
            title="Refrescar analítica desde el servidor"
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
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>Actualizar</span>
          </button>

          {/* Botón Sacar Copia / Imprimir */}
          <button
            type="button"
            className="toolbar-btn"
            onClick={handlePrint}
            style={{ height: "42px", padding: "0 1.15rem", borderRadius: "999px", fontWeight: 700, gap: "6px" }}
            title="Sacar copia / Imprimir reporte gráfico en PDF"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Sacar Copia de Gráficas</span>
          </button>

          {/* Botón Modo Presentación (Pantalla Completa) */}
          <button
            type="button"
            className="toolbar-btn"
            onClick={toggleFullscreen}
            style={{
              height: "42px",
              padding: "0 1.25rem",
              borderRadius: "999px",
              fontWeight: 700,
              gap: "6px",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color: "#fff",
              border: "none",
              boxShadow: "0 2px 10px rgba(37, 99, 235, 0.3)",
            }}
            title="Activar pantalla completa / modo presentación para pantallas y televisores de sala"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
            <span>Modo Presentación</span>
          </button>
        </div>
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
            borderRadius: "999px",
            padding: "0.65rem 1.25rem",
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

        {/* 5. Sin Estatus */}
        <div className="bal-card" style={{ ["--accent" as any]: "#64748b" } as React.CSSProperties}>
          <span className="bal-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </span>
          <span className="bal-card__value stat-card-value-animate">{fmt(porEstatus?.["SIN ESTATUS"] || 0)}</span>
          <span className="bal-card__label">
            Sin Estatus <span className="bal-card__sub">· {pctStr(porEstatus?.["SIN ESTATUS"] || 0, totalPersonas)}</span>
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
                5 modalidades
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
                { key: "CAMPAMENTO_MAYOR_PERMANENCIA", color: "#ea580c", val: porTipoOpcion?.["CAMPAMENTO_MAYOR_PERMANENCIA"] || 0 },
                { key: "ASIGNACION_GMVV", color: "#0891b2", val: porTipoOpcion?.["ASIGNACION_GMVV"] || 0 },
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

              {/* Campamento Mayor Permanencia */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  borderRadius: "12px",
                  background: "rgba(234, 88, 12, 0.06)",
                  border: "1px solid rgba(234, 88, 12, 0.2)",
                  cursor: "pointer",
                }}
                onClick={() => setRequisitosTab("CAMPAMENTO_MAYOR_PERMANENCIA")}
                title="Ver información de Campamento de Mayor Permanencia"
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#ea580c" }} />
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#9a3412" }}>
                      Campamento Mayor Permanencia
                    </span>
                  </div>
                  <span style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginLeft: "15px" }}>
                    Permanencia y reubicación en campamentos oficiales
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#9a3412" }}>
                    {fmt(porTipoOpcion?.["CAMPAMENTO_MAYOR_PERMANENCIA"] || 0)}
                  </div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                    {pctStr(porTipoOpcion?.["CAMPAMENTO_MAYOR_PERMANENCIA"] || 0, totalPersonas)}
                  </span>
                </div>
              </div>

              {/* Asignación GMVV */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  borderRadius: "12px",
                  background: "rgba(8, 145, 178, 0.06)",
                  border: "1px solid rgba(8, 145, 178, 0.2)",
                  cursor: "pointer",
                }}
                onClick={() => setRequisitosTab("ASIGNACION_GMVV")}
                title="Ver información de Asignación GMVV"
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#0891b2" }} />
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0e7490" }}>
                      Asignación GMVV
                    </span>
                  </div>
                  <span style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginLeft: "15px" }}>
                    Gran Misión Vivienda Venezuela
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#0e7490" }}>
                    {fmt(porTipoOpcion?.["ASIGNACION_GMVV"] || 0)}
                  </div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                    {pctStr(porTipoOpcion?.["ASIGNACION_GMVV"] || 0, totalPersonas)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECCIÓN 2.5: CUADROS DE CONTROL OPERATIVO: ESTATUS × MODALIDAD ──── */}
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
              <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#2563eb" }} />
                Cuadros de Control Operativo: Estatus × Modalidad Habitacional
              </h4>
              <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                Cruce operativo detallado entre el estatus del expediente y la alternativa habitacional asignada.
              </p>
            </div>

            {/* Alternador de perspectiva */}
            <div className="btn-seg-group" style={{ display: "inline-flex" }}>
              <button
                type="button"
                className={`toolbar-btn${cuadrosView === "ESTATUS" ? " is-active" : ""}`}
                onClick={() => setCuadrosView("ESTATUS")}
                style={{ fontSize: "0.8rem", padding: "0 0.85rem", height: "34px", borderRadius: "999px" }}
              >
                Ver por Estatus (5 Cuadros)
              </button>
              <button
                type="button"
                className={`toolbar-btn${cuadrosView === "MODALIDAD" ? " is-active" : ""}`}
                onClick={() => setCuadrosView("MODALIDAD")}
                style={{ fontSize: "0.8rem", padding: "0 0.85rem", height: "34px", borderRadius: "999px" }}
              >
                Ver por Modalidad (5 Cuadros)
              </button>
            </div>
          </div>

          {cuadrosView === "ESTATUS" ? (
            /* Vista 5 Cuadros de Estatus */
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              {/* Cuadro 1: Crédito Entregado */}
              <div
                style={{
                  background: "rgba(5, 150, 105, 0.05)",
                  border: "1.5px solid rgba(5, 150, 105, 0.3)",
                  borderRadius: "14px",
                  padding: "1.1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "50%",
                        background: "#059669",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </span>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#065f46" }}>CRÉDITOS ENTREGADOS</span>
                      <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)" }}>Beneficio consolidado</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#059669" }}>
                      {fmt(porEstatus?.["CREDITO ENTREGADO"] || 0)}
                    </div>
                    <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                      {pctStr(porEstatus?.["CREDITO ENTREGADO"] || 0, totalPersonas)}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  {MODALIDADES_LIST.map((m) => {
                    const cnt = currentScope?.estatusPorModalidad?.["CREDITO ENTREGADO"]?.[m.key] || 0;
                    const totEst = porEstatus?.["CREDITO ENTREGADO"] || 0;
                    const pctOfStatus = totEst > 0 ? Math.round((cnt / totEst) * 100) : 0;
                    return (
                      <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: m.color }} />
                            <span>{m.short}</span>
                          </span>
                          <span style={{ fontWeight: 700, color: cnt > 0 ? "#059669" : "var(--text-secondary)" }}>
                            {fmt(cnt)} <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "var(--text-secondary)" }}>({pctOfStatus}%)</span>
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "4px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                          <div style={{ width: `${pctOfStatus}%`, height: "100%", background: m.color, borderRadius: "999px" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cuadro 2: En Proceso */}
              <div
                style={{
                  background: "rgba(37, 99, 235, 0.05)",
                  border: "1.5px solid rgba(37, 99, 235, 0.3)",
                  borderRadius: "14px",
                  padding: "1.1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "50%",
                        background: "#2563eb",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </span>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#1e40af" }}>EN PROCESO</span>
                      <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)" }}>Gestión activa</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#2563eb" }}>
                      {fmt(porEstatus?.["EN PROCESO"] || 0)}
                    </div>
                    <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                      {pctStr(porEstatus?.["EN PROCESO"] || 0, totalPersonas)}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  {MODALIDADES_LIST.map((m) => {
                    const cnt = currentScope?.estatusPorModalidad?.["EN PROCESO"]?.[m.key] || 0;
                    const totEst = porEstatus?.["EN PROCESO"] || 0;
                    const pctOfStatus = totEst > 0 ? Math.round((cnt / totEst) * 100) : 0;
                    return (
                      <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: m.color }} />
                            <span>{m.short}</span>
                          </span>
                          <span style={{ fontWeight: 700, color: cnt > 0 ? "#2563eb" : "var(--text-secondary)" }}>
                            {fmt(cnt)} <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "var(--text-secondary)" }}>({pctOfStatus}%)</span>
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "4px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                          <div style={{ width: `${pctOfStatus}%`, height: "100%", background: m.color, borderRadius: "999px" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cuadro 3: Sin Estatus */}
              <div
                style={{
                  background: "rgba(100, 116, 139, 0.05)",
                  border: "1.5px solid rgba(100, 116, 139, 0.3)",
                  borderRadius: "14px",
                  padding: "1.1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "50%",
                        background: "#64748b",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                    </span>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#334155" }}>SIN ESTATUS</span>
                      <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)" }}>Sin categorizar</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#64748b" }}>
                      {fmt(porEstatus?.["SIN ESTATUS"] || 0)}
                    </div>
                    <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                      {pctStr(porEstatus?.["SIN ESTATUS"] || 0, totalPersonas)}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  {MODALIDADES_LIST.map((m) => {
                    const cnt = currentScope?.estatusPorModalidad?.["SIN ESTATUS"]?.[m.key] || 0;
                    const totEst = porEstatus?.["SIN ESTATUS"] || 0;
                    const pctOfStatus = totEst > 0 ? Math.round((cnt / totEst) * 100) : 0;
                    return (
                      <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: m.color }} />
                            <span>{m.short}</span>
                          </span>
                          <span style={{ fontWeight: 700, color: cnt > 0 ? "#64748b" : "var(--text-secondary)" }}>
                            {fmt(cnt)} <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "var(--text-secondary)" }}>({pctOfStatus}%)</span>
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "4px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                          <div style={{ width: `${pctOfStatus}%`, height: "100%", background: m.color, borderRadius: "999px" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cuadro 4: Carpeta Retornada */}
              <div
                style={{
                  background: "rgba(217, 119, 6, 0.05)",
                  border: "1.5px solid rgba(217, 119, 6, 0.3)",
                  borderRadius: "14px",
                  padding: "1.1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "50%",
                        background: "#d97706",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </span>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#b45309" }}>CARPETAS RETORNADAS</span>
                      <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)" }}>Pendientes por recaudos</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#d97706" }}>
                      {fmt(porEstatus?.["CARPETA RETORNADA"] || 0)}
                    </div>
                    <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                      {pctStr(porEstatus?.["CARPETA RETORNADA"] || 0, totalPersonas)}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  {MODALIDADES_LIST.map((m) => {
                    const cnt = currentScope?.estatusPorModalidad?.["CARPETA RETORNADA"]?.[m.key] || 0;
                    const totEst = porEstatus?.["CARPETA RETORNADA"] || 0;
                    const pctOfStatus = totEst > 0 ? Math.round((cnt / totEst) * 100) : 0;
                    return (
                      <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: m.color }} />
                            <span>{m.short}</span>
                          </span>
                          <span style={{ fontWeight: 700, color: cnt > 0 ? "#d97706" : "var(--text-secondary)" }}>
                            {fmt(cnt)} <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "var(--text-secondary)" }}>({pctOfStatus}%)</span>
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "4px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                          <div style={{ width: `${pctOfStatus}%`, height: "100%", background: m.color, borderRadius: "999px" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cuadro 4: Con Novedad en la Sede */}
              <div
                style={{
                  background: "rgba(220, 38, 38, 0.05)",
                  border: "1.5px solid rgba(220, 38, 38, 0.3)",
                  borderRadius: "14px",
                  padding: "1.1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "50%",
                        background: "#dc2626",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </span>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#991b1b" }}>CON NOVEDAD EN SEDE</span>
                      <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)" }}>Observación legal/técnica</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#dc2626" }}>
                      {fmt(porEstatus?.["CON NOVEDAD EN LA SEDE"] || 0)}
                    </div>
                    <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                      {pctStr(porEstatus?.["CON NOVEDAD EN LA SEDE"] || 0, totalPersonas)}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  {MODALIDADES_LIST.map((m) => {
                    const cnt = currentScope?.estatusPorModalidad?.["CON NOVEDAD EN LA SEDE"]?.[m.key] || 0;
                    const totEst = porEstatus?.["CON NOVEDAD EN LA SEDE"] || 0;
                    const pctOfStatus = totEst > 0 ? Math.round((cnt / totEst) * 100) : 0;
                    return (
                      <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: m.color }} />
                            <span>{m.short}</span>
                          </span>
                          <span style={{ fontWeight: 700, color: cnt > 0 ? "#dc2626" : "var(--text-secondary)" }}>
                            {fmt(cnt)} <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "var(--text-secondary)" }}>({pctOfStatus}%)</span>
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "4px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                          <div style={{ width: `${pctOfStatus}%`, height: "100%", background: m.color, borderRadius: "999px" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Vista 5 Cuadros de Modalidad */
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
              {MODALIDADES_LIST.map((m) => {
                const totalMod = porTipoOpcion?.[m.key] || 0;
                const stMap = currentScope?.modalidadPorEstatus?.[m.key] || {
                  "SIN ESTATUS": 0,
                  "CREDITO ENTREGADO": 0,
                  "EN PROCESO": 0,
                  "CARPETA RETORNADA": 0,
                  "CON NOVEDAD EN LA SEDE": 0,
                };
                return (
                  <div
                    key={m.key}
                    style={{
                      background: "var(--bg-primary)",
                      border: `1.5px solid ${m.color}35`,
                      borderRadius: "14px",
                      padding: "1.1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: m.color }} />
                          <span style={{ fontWeight: 700, fontSize: "0.92rem", color: m.color }}>{m.label}</span>
                        </div>
                        <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)", marginLeft: "15px" }}>
                          {pctStr(totalMod, totalPersonas)} del total de expedientes
                        </span>
                      </div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 800, color: m.color }}>
                        {fmt(totalMod)}
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {ESTATUS_SALA_OPTIONS.map((st) => {
                        const cnt = stMap[st.value as PlanteamientoSalaEstatus] || 0;
                        const pctOfMod = totalMod > 0 ? Math.round((cnt / totalMod) * 100) : 0;
                        return (
                          <div key={st.value} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: st.color }} />
                                <span>{st.label}</span>
                              </span>
                              <span style={{ fontWeight: 700, color: cnt > 0 ? st.color : "var(--text-secondary)" }}>
                                {fmt(cnt)} ({pctOfMod}%)
                              </span>
                            </div>
                            <div style={{ width: "100%", height: "4px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                              <div style={{ width: `${pctOfMod}%`, height: "100%", background: st.color, borderRadius: "999px" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
              <button
                type="button"
                className={`toolbar-btn${requisitosTab === "CAMPAMENTO_MAYOR_PERMANENCIA" ? " is-active" : ""}`}
                onClick={() => setRequisitosTab("CAMPAMENTO_MAYOR_PERMANENCIA")}
              >
                <span>Mayor Permanencia</span>
              </button>
              <button
                type="button"
                className={`toolbar-btn${requisitosTab === "ASIGNACION_GMVV" ? " is-active" : ""}`}
                onClick={() => setRequisitosTab("ASIGNACION_GMVV")}
              >
                <span>Asignación GMVV</span>
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

          {/* TAB 4: CAMPAMENTO MAYOR PERMANENCIA */}
          {requisitosTab === "CAMPAMENTO_MAYOR_PERMANENCIA" && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(234, 88, 12, 0.07)",
                  border: "1px solid rgba(234, 88, 12, 0.2)",
                  borderRadius: "10px",
                  padding: "0.6rem 1rem",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                }}
              >
                <span>
                  Evaluando <b>{fmt(porTipoOpcion?.["CAMPAMENTO_MAYOR_PERMANENCIA"] || 0)}</b> expedientes de <b>Campamento Mayor Permanencia</b>.
                </span>
                <span style={{ fontWeight: 700, color: "#ea580c" }}>Sin recaudos comerciales</span>
              </div>

              <div
                style={{
                  padding: "1.5rem",
                  borderRadius: "12px",
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background: "rgba(234, 88, 12, 0.12)",
                    color: "#ea580c",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 12px",
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h5 style={{ margin: "0 0 6px", fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Asignación y Estadía en Campamento Oficial
                </h5>
                <p style={{ margin: "0 auto", maxWidth: "600px", fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Los expedientes clasificados en esta modalidad representan núcleos familiares atendidos de forma integral en campamentos transitorios de mayor permanencia. No requieren trámite de compraventa, arrendamiento comercial ni materiales del Plan Renace.
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: ASIGNACION GMVV */}
          {requisitosTab === "ASIGNACION_GMVV" && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(8, 145, 178, 0.07)",
                  border: "1px solid rgba(8, 145, 178, 0.2)",
                  borderRadius: "10px",
                  padding: "0.6rem 1rem",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                }}
              >
                <span>
                  Evaluando <b>{fmt(porTipoOpcion?.["ASIGNACION_GMVV"] || 0)}</b> expedientes de <b>Asignación GMVV</b>.
                </span>
                <span style={{ fontWeight: 700, color: "#0891b2" }}>Adjudicación directa GMVV</span>
              </div>

              <div
                style={{
                  padding: "1.5rem",
                  borderRadius: "12px",
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background: "rgba(8, 145, 178, 0.12)",
                    color: "#0891b2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 12px",
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
                <h5 style={{ margin: "0 0 6px", fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Adjudicación de Soluciones Habitacionales GMVV
                </h5>
                <p style={{ margin: "0 auto", maxWidth: "600px", fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Los expedientes clasificados en esta modalidad representan núcleos familiares seleccionados para adjudicación directa de viviendas por parte de la Gran Misión Vivienda Venezuela. No requieren trámite de compraventa privada, arrendamiento comercial ni materiales del Plan Renace.
                </p>
              </div>
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

      {/* ── SECCIÓN 7: AUDITORÍA DE CÓDIGOS QR & MADURACIÓN DOCUMENTAL ──────── */}
      {totalPersonas > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1.25rem" }}>
          {/* Card A: Auditoría de Códigos QR */}
          <div
            className="dashboard-card"
            style={{
              background: "var(--card-bg, var(--bg-secondary))",
              border: "1px solid var(--border-color)",
              borderRadius: "16px",
              padding: "1.35rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.85rem" }}>
              <div>
                <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#2563eb" }}>
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  Auditoría y Registro de Códigos QR
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Penetración de QR Hábitat y Vivienda vs QR Colapso de Vivienda en los {fmt(totalPersonas)} expedientes.
                </p>
              </div>
            </div>

            {/* Dos cuadros destacados de cada QR */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginBottom: "1rem" }}>
              <div
                style={{
                  padding: "0.85rem",
                  borderRadius: "12px",
                  background: "rgba(37, 99, 235, 0.06)",
                  border: "1px solid rgba(37, 99, 235, 0.2)",
                }}
              >
                <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--text-secondary)", display: "block" }}>
                  QR Hábitat y Vivienda
                </span>
                <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "#2563eb", display: "block", marginTop: "2px" }}>
                  {fmt(currentScope.qrCobertura?.habitatVivienda || 0)}
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  {pctStr(currentScope.qrCobertura?.habitatVivienda || 0, totalPersonas)} del total
                </span>
              </div>

              <div
                style={{
                  padding: "0.85rem",
                  borderRadius: "12px",
                  background: "rgba(124, 58, 237, 0.06)",
                  border: "1px solid rgba(124, 58, 237, 0.2)",
                }}
              >
                <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--text-secondary)", display: "block" }}>
                  QR Colapso de Vivienda
                </span>
                <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "#7c3aed", display: "block", marginTop: "2px" }}>
                  {fmt(currentScope.qrCobertura?.colapsoVivienda || 0)}
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  {pctStr(currentScope.qrCobertura?.colapsoVivienda || 0, totalPersonas)} del total
                </span>
              </div>
            </div>

            {/* Barras de estratificación de QR */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
              {/* Con Ambos QR */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "3px" }}>
                  <span style={{ fontWeight: 600, color: "#059669" }}>Con Ambos Códigos QR Registrados</span>
                  <span style={{ fontWeight: 700 }}>
                    {fmt(currentScope.qrCobertura?.ambosQr || 0)} ({pctStr(currentScope.qrCobertura?.ambosQr || 0, totalPersonas)})
                  </span>
                </div>
                <div style={{ width: "100%", height: "7px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pctNum(currentScope.qrCobertura?.ambosQr || 0, totalPersonas)}%`,
                      height: "100%",
                      background: "#059669",
                      borderRadius: "999px",
                    }}
                  />
                </div>
              </div>

              {/* Al menos un QR */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "3px" }}>
                  <span style={{ fontWeight: 600, color: "#2563eb" }}>Con Al Menos Un Código QR</span>
                  <span style={{ fontWeight: 700 }}>
                    {fmt(currentScope.qrCobertura?.alMenosUno || 0)} ({pctStr(currentScope.qrCobertura?.alMenosUno || 0, totalPersonas)})
                  </span>
                </div>
                <div style={{ width: "100%", height: "7px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pctNum(currentScope.qrCobertura?.alMenosUno || 0, totalPersonas)}%`,
                      height: "100%",
                      background: "#2563eb",
                      borderRadius: "999px",
                    }}
                  />
                </div>
              </div>

              {/* Sin QR */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "3px" }}>
                  <span style={{ fontWeight: 600, color: "#dc2626" }}>Pendientes por Código QR</span>
                  <span style={{ fontWeight: 700 }}>
                    {fmt(currentScope.qrCobertura?.sinQr || 0)} ({pctStr(currentScope.qrCobertura?.sinQr || 0, totalPersonas)})
                  </span>
                </div>
                <div style={{ width: "100%", height: "7px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pctNum(currentScope.qrCobertura?.sinQr || 0, totalPersonas)}%`,
                      height: "100%",
                      background: "#dc2626",
                      borderRadius: "999px",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card B: Nivel de Maduración Documental */}
          <div
            className="dashboard-card"
            style={{
              background: "var(--card-bg, var(--bg-secondary))",
              border: "1px solid var(--border-color)",
              borderRadius: "16px",
              padding: "1.35rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.85rem" }}>
              <div>
                <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#7c3aed" }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  Nivel de Maduración Documental
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Estratificación de carpetas por porcentaje de requisitos consignados.
                </p>
              </div>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#7c3aed" }}>
                {promedioProgreso}% prom.
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {/* 100% Completo */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "3px" }}>
                  <span style={{ fontWeight: 600, color: "#059669" }}>100% Expediente Completo (Listo para Adjudicación)</span>
                  <span style={{ fontWeight: 700 }}>
                    {fmt(currentScope.rangosProgreso?.completo100 || 0)} ({pctStr(currentScope.rangosProgreso?.completo100 || 0, totalPersonas)})
                  </span>
                </div>
                <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pctNum(currentScope.rangosProgreso?.completo100 || 0, totalPersonas)}%`,
                      height: "100%",
                      background: "#059669",
                      borderRadius: "999px",
                    }}
                  />
                </div>
              </div>

              {/* 70-99% */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "3px" }}>
                  <span style={{ fontWeight: 600, color: "#2563eb" }}>70% – 99% Avance Avanzado</span>
                  <span style={{ fontWeight: 700 }}>
                    {fmt(currentScope.rangosProgreso?.avanzado70_99 || 0)} ({pctStr(currentScope.rangosProgreso?.avanzado70_99 || 0, totalPersonas)})
                  </span>
                </div>
                <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pctNum(currentScope.rangosProgreso?.avanzado70_99 || 0, totalPersonas)}%`,
                      height: "100%",
                      background: "#2563eb",
                      borderRadius: "999px",
                    }}
                  />
                </div>
              </div>

              {/* 40-69% */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "3px" }}>
                  <span style={{ fontWeight: 600, color: "#f59e0b" }}>40% – 69% Avance Intermedio</span>
                  <span style={{ fontWeight: 700 }}>
                    {fmt(currentScope.rangosProgreso?.medio40_69 || 0)} ({pctStr(currentScope.rangosProgreso?.medio40_69 || 0, totalPersonas)})
                  </span>
                </div>
                <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pctNum(currentScope.rangosProgreso?.medio40_69 || 0, totalPersonas)}%`,
                      height: "100%",
                      background: "#f59e0b",
                      borderRadius: "999px",
                    }}
                  />
                </div>
              </div>

              {/* 0-39% */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "3px" }}>
                  <span style={{ fontWeight: 600, color: "#dc2626" }}>0% – 39% Recepción Inicial</span>
                  <span style={{ fontWeight: 700 }}>
                    {fmt(currentScope.rangosProgreso?.inicial0_39 || 0)} ({pctStr(currentScope.rangosProgreso?.inicial0_39 || 0, totalPersonas)})
                  </span>
                </div>
                <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pctNum(currentScope.rangosProgreso?.inicial0_39 || 0, totalPersonas)}%`,
                      height: "100%",
                      background: "#dc2626",
                      borderRadius: "999px",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECCIÓN 8: DESGLOSE Y RANKING POR CAMPAMENTO (GLOBAL) ───────────── */}
      {selectedCampamento === "TODOS" && totalPersonas > 0 && stats.campamentos.length > 0 && (
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
            <h4 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#2563eb" }}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Distribución y Comparativa por Campamento Transitorio
            </h4>
            <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Monitoreo operativo de carga de expedientes, entregas de créditos y observaciones por refugio.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {stats.campamentos
              .filter((c) => c.totalPersonas > 0)
              .map((c, i) => {
                const cred = c.porEstatus?.["CREDITO ENTREGADO"] || 0;
                const proc = c.porEstatus?.["EN PROCESO"] || 0;
                const sinEst = c.porEstatus?.["SIN ESTATUS"] || 0;
                const obs = (c.porEstatus?.["CARPETA RETORNADA"] || 0) + (c.porEstatus?.["CON NOVEDAD EN LA SEDE"] || 0);
                const pctBar = maxCampPersonas > 0 ? (c.totalPersonas / maxCampPersonas) * 100 : 0;
                return (
                  <div
                    key={c.refugio}
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "12px",
                      padding: "0.85rem 1.1rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "220px", flex: "1 1 240px" }}>
                      <span
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: i < 3 ? "#2563eb" : "var(--border-color)",
                          color: i < 3 ? "#fff" : "var(--text-secondary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                          fontWeight: 800,
                        }}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: "0.92rem", display: "block" }}>
                          {c.refugio}
                        </span>
                        <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                          {fmt(c.totalPersonas)} expediente{c.totalPersonas === 1 ? "" : "s"} · {fmt(c.totalPoblacion)} persona{c.totalPoblacion === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
                      {/* Pills de estatus */}
                      <div style={{ display: "flex", gap: "6px", fontSize: "0.75rem" }}>
                        <span style={{ padding: "2px 8px", borderRadius: "999px", background: "rgba(5, 150, 105, 0.1)", color: "#059669", fontWeight: 700 }}>
                          {cred} entregado{cred === 1 ? "" : "s"}
                        </span>
                        <span style={{ padding: "2px 8px", borderRadius: "999px", background: "rgba(37, 99, 235, 0.1)", color: "#2563eb", fontWeight: 700 }}>
                          {proc} en proceso
                        </span>
                        {sinEst > 0 && (
                          <span style={{ padding: "2px 8px", borderRadius: "999px", background: "rgba(100, 116, 139, 0.1)", color: "#64748b", fontWeight: 700 }}>
                            {sinEst} sin estatus
                          </span>
                        )}
                        {obs > 0 && (
                          <span style={{ padding: "2px 8px", borderRadius: "999px", background: "rgba(220, 38, 38, 0.1)", color: "#dc2626", fontWeight: 700 }}>
                            {obs} obs.
                          </span>
                        )}
                      </div>

                      {/* Botón para filtrar */}
                      <button
                        type="button"
                        className="toolbar-btn"
                        onClick={() => setSelectedCampamento(c.refugio)}
                        style={{ fontSize: "0.75rem", padding: "0 0.85rem", height: "30px", borderRadius: "999px" }}
                      >
                        Ver detalle
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
      </div>

      {/* ── REPORTE EJECUTIVO DE IMPRESIÓN (EXCLUSIVO PARA COPIA / PDF) ─────── */}
      <div className="sala-print-report">
        {/* ── HOJA 1: RESUMEN EJECUTIVO Y MATRIZ ESTATUS × MODALIDAD ──── */}
        <div className="sala-print-page sala-print-page--break" style={{ padding: "0 0 10px" }}>
          {/* Membrete Oficial Hoja 1 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #1e3a8a", paddingBottom: "6px", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <img src="/logo_gob.webp" alt="Gobernación del Estado La Guaira" style={{ width: "44px", height: "44px", objectFit: "contain" }} />
              <div>
                <span style={{ fontSize: "9px", fontWeight: 800, color: "#b45309", letterSpacing: "0.08em", textTransform: "uppercase", display: "block" }}>
                  GOBERNACIÓN DEL ESTADO LA GUAIRA · SALA SITUACIONAL
                </span>
                <h1 style={{ fontSize: "15px", fontWeight: 800, color: "#1e3a8a", margin: "1px 0", textTransform: "uppercase", lineHeight: 1.1 }}>
                  Planteamiento de Soluciones Habitacionales
                </h1>
                <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 600 }}>
                  Ámbito: <b>{selectedCampamento === "TODOS" ? "Consolidado General (26 Campamentos Transitorios)" : selectedCampamento}</b>
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: "8.5px", color: "#64748b", lineHeight: 1.3 }}>
              <span>Emisión: <b>{new Date().toLocaleString("es-VE")}</b></span>
              <br />
              <span style={{ fontWeight: 700, color: "#1e3a8a" }}>HOJA 1 DE 2 · PANORAMA OPERATIVO</span>
            </div>
          </div>

          {/* Fila de 7 KPIs Ejecutivos Compactos */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px", marginBottom: "9px" }}>
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 8px", background: "#f8fafc" }}>
              <span style={{ fontSize: "8px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block" }}>Expedientes Titulares</span>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "#1e3a8a" }}>{fmt(totalPersonas)}</span>
            </div>
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 8px", background: "#f8fafc" }}>
              <span style={{ fontSize: "8px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block" }}>Población Total</span>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "#4338ca" }}>{fmt(totalPoblacion)}</span>
              <span style={{ fontSize: "7.5px", color: "#64748b", marginLeft: "4px" }}>({fmt(totalCargaFamiliar)} fam.)</span>
            </div>
            <div style={{ border: "1px solid #a7f3d0", borderRadius: "6px", padding: "6px 8px", background: "#f0fdf4" }}>
              <span style={{ fontSize: "8px", fontWeight: 700, color: "#065f46", textTransform: "uppercase", display: "block" }}>Crédito Entregado</span>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "#059669" }}>{fmt(porEstatus?.["CREDITO ENTREGADO"] || 0)}</span>
              <span style={{ fontSize: "8px", fontWeight: 700, color: "#065f46", marginLeft: "4px" }}>({pctStr(porEstatus?.["CREDITO ENTREGADO"] || 0, totalPersonas)})</span>
            </div>
            <div style={{ border: "1px solid #bfdbfe", borderRadius: "6px", padding: "6px 8px", background: "#eff6ff" }}>
              <span style={{ fontSize: "8px", fontWeight: 700, color: "#1e40af", textTransform: "uppercase", display: "block" }}>En Proceso</span>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "#2563eb" }}>{fmt(porEstatus?.["EN PROCESO"] || 0)}</span>
              <span style={{ fontSize: "8px", fontWeight: 700, color: "#1e40af", marginLeft: "4px" }}>({pctStr(porEstatus?.["EN PROCESO"] || 0, totalPersonas)})</span>
            </div>
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 8px", background: "#f8fafc" }}>
              <span style={{ fontSize: "8px", fontWeight: 700, color: "#475569", textTransform: "uppercase", display: "block" }}>Sin Estatus</span>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "#64748b" }}>{fmt(porEstatus?.["SIN ESTATUS"] || 0)}</span>
              <span style={{ fontSize: "8px", fontWeight: 700, color: "#475569", marginLeft: "4px" }}>({pctStr(porEstatus?.["SIN ESTATUS"] || 0, totalPersonas)})</span>
            </div>
            <div style={{ border: "1px solid #fed7aa", borderRadius: "6px", padding: "6px 8px", background: "#fff7ed" }}>
              <span style={{ fontSize: "8px", fontWeight: 700, color: "#9a3412", textTransform: "uppercase", display: "block" }}>Observaciones</span>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "#ea580c" }}>{fmt((porEstatus?.["CARPETA RETORNADA"] || 0) + (porEstatus?.["CON NOVEDAD EN LA SEDE"] || 0))}</span>
              <span style={{ fontSize: "7.5px", color: "#9a3412", marginLeft: "3px" }}>({porEstatus?.["CARPETA RETORNADA"] || 0} ret / {porEstatus?.["CON NOVEDAD EN LA SEDE"] || 0} nov)</span>
            </div>
            <div style={{ border: "1px solid #ddd6fe", borderRadius: "6px", padding: "6px 8px", background: "#faf5ff" }}>
              <span style={{ fontSize: "8px", fontWeight: 700, color: "#6b21a8", textTransform: "uppercase", display: "block" }}>Avance Documental</span>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "#7c3aed" }}>{promedioProgreso}%</span>
              <span style={{ fontSize: "7.5px", color: "#6b21a8", marginLeft: "4px" }}>promedio</span>
            </div>
          </div>

          {/* Bloque: Los 5 Cuadros de Estatus × Modalidad */}
          <div style={{ marginBottom: "10px" }}>
            <div style={{ fontSize: "9.5px", fontWeight: 800, color: "#1e3a8a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "5px", borderBottom: "1px solid #cbd5e1", paddingBottom: "2px" }}>
              1. Cuadros de Control Operativo: Estatus del Trámite × Modalidad de Atención
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px" }}>
              {/* Cuadro 1: Créditos Entregados */}
              <div style={{ border: "1.5px solid #059669", borderRadius: "6px", padding: "6px 8px", background: "#ffffff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid #e2e8f0", paddingBottom: "3px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "8.5px", fontWeight: 800, color: "#065f46", textTransform: "uppercase" }}>🟢 Crédito Entregado</span>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: "#059669" }}>
                    {fmt(porEstatus?.["CREDITO ENTREGADO"] || 0)} <small style={{ fontSize: "7.5px", fontWeight: 600 }}>({pctStr(porEstatus?.["CREDITO ENTREGADO"] || 0, totalPersonas)})</small>
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2.5px" }}>
                  {MODALIDADES_LIST.map((m) => {
                    const c = currentScope.estatusPorModalidad?.["CREDITO ENTREGADO"]?.[m.key] || 0;
                    return (
                      <div key={m.key} style={{ display: "flex", justifyContent: "space-between", fontSize: "7.5px" }}>
                        <span style={{ color: "#334155" }}>• {m.short}:</span>
                        <b style={{ color: c > 0 ? "#059669" : "#94a3b8" }}>{c}</b>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cuadro 2: En Proceso */}
              <div style={{ border: "1.5px solid #2563eb", borderRadius: "6px", padding: "6px 8px", background: "#ffffff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid #e2e8f0", paddingBottom: "3px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "8.5px", fontWeight: 800, color: "#1e40af", textTransform: "uppercase" }}>🔵 En Proceso</span>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: "#2563eb" }}>
                    {fmt(porEstatus?.["EN PROCESO"] || 0)} <small style={{ fontSize: "7.5px", fontWeight: 600 }}>({pctStr(porEstatus?.["EN PROCESO"] || 0, totalPersonas)})</small>
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2.5px" }}>
                  {MODALIDADES_LIST.map((m) => {
                    const c = currentScope.estatusPorModalidad?.["EN PROCESO"]?.[m.key] || 0;
                    return (
                      <div key={m.key} style={{ display: "flex", justifyContent: "space-between", fontSize: "7.5px" }}>
                        <span style={{ color: "#334155" }}>• {m.short}:</span>
                        <b style={{ color: c > 0 ? "#2563eb" : "#94a3b8" }}>{c}</b>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cuadro 3: Sin Estatus */}
              <div style={{ border: "1.5px solid #64748b", borderRadius: "6px", padding: "6px 8px", background: "#ffffff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid #e2e8f0", paddingBottom: "3px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "8.5px", fontWeight: 800, color: "#334155", textTransform: "uppercase" }}>⚪ Sin Estatus</span>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: "#64748b" }}>
                    {fmt(porEstatus?.["SIN ESTATUS"] || 0)} <small style={{ fontSize: "7.5px", fontWeight: 600 }}>({pctStr(porEstatus?.["SIN ESTATUS"] || 0, totalPersonas)})</small>
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2.5px" }}>
                  {MODALIDADES_LIST.map((m) => {
                    const c = currentScope.estatusPorModalidad?.["SIN ESTATUS"]?.[m.key] || 0;
                    return (
                      <div key={m.key} style={{ display: "flex", justifyContent: "space-between", fontSize: "7.5px" }}>
                        <span style={{ color: "#334155" }}>• {m.short}:</span>
                        <b style={{ color: c > 0 ? "#64748b" : "#94a3b8" }}>{c}</b>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cuadro 4: Carpeta Retornada */}
              <div style={{ border: "1.5px solid #d97706", borderRadius: "6px", padding: "6px 8px", background: "#ffffff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid #e2e8f0", paddingBottom: "3px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "8.5px", fontWeight: 800, color: "#b45309", textTransform: "uppercase" }}>🟠 Carpeta Retornada</span>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: "#d97706" }}>
                    {fmt(porEstatus?.["CARPETA RETORNADA"] || 0)} <small style={{ fontSize: "7.5px", fontWeight: 600 }}>({pctStr(porEstatus?.["CARPETA RETORNADA"] || 0, totalPersonas)})</small>
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2.5px" }}>
                  {MODALIDADES_LIST.map((m) => {
                    const c = currentScope.estatusPorModalidad?.["CARPETA RETORNADA"]?.[m.key] || 0;
                    return (
                      <div key={m.key} style={{ display: "flex", justifyContent: "space-between", fontSize: "7.5px" }}>
                        <span style={{ color: "#334155" }}>• {m.short}:</span>
                        <b style={{ color: c > 0 ? "#d97706" : "#94a3b8" }}>{c}</b>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cuadro 4: Con Novedad en Sede */}
              <div style={{ border: "1.5px solid #dc2626", borderRadius: "6px", padding: "6px 8px", background: "#ffffff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid #e2e8f0", paddingBottom: "3px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "8.5px", fontWeight: 800, color: "#991b1b", textTransform: "uppercase" }}>🔴 Con Novedad en Sede</span>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: "#dc2626" }}>
                    {fmt(porEstatus?.["CON NOVEDAD EN LA SEDE"] || 0)} <small style={{ fontSize: "7.5px", fontWeight: 600 }}>({pctStr(porEstatus?.["CON NOVEDAD EN LA SEDE"] || 0, totalPersonas)})</small>
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2.5px" }}>
                  {MODALIDADES_LIST.map((m) => {
                    const c = currentScope.estatusPorModalidad?.["CON NOVEDAD EN LA SEDE"]?.[m.key] || 0;
                    return (
                      <div key={m.key} style={{ display: "flex", justifyContent: "space-between", fontSize: "7.5px" }}>
                        <span style={{ color: "#334155" }}>• {m.short}:</span>
                        <b style={{ color: c > 0 ? "#dc2626" : "#94a3b8" }}>{c}</b>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Bloque: Tabla Consolidada de las 5 Modalidades */}
          <div>
            <div style={{ fontSize: "9.5px", fontWeight: 800, color: "#1e3a8a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px", borderBottom: "1px solid #cbd5e1", paddingBottom: "2px" }}>
              2. Consolidado General de las 5 Modalidades Habitacionales
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8.5px" }}>
              <thead>
                <tr style={{ background: "#f1f5f9", borderBottom: "1.5px solid #cbd5e1", textAlign: "left" }}>
                  <th style={{ padding: "4px 6px" }}>Modalidad Habitacional</th>
                  <th style={{ padding: "4px 6px", textAlign: "center" }}>Expedientes</th>
                  <th style={{ padding: "4px 6px", textAlign: "center" }}>% Participación</th>
                  <th style={{ padding: "4px 6px", textAlign: "center", color: "#065f46" }}>Crédito Entregado</th>
                  <th style={{ padding: "4px 6px", textAlign: "center", color: "#1e40af" }}>En Proceso</th>
                  <th style={{ padding: "4px 6px", textAlign: "center", color: "#475569" }}>Sin Estatus</th>
                  <th style={{ padding: "4px 6px", textAlign: "center", color: "#b45309" }}>Carpeta Retornada</th>
                  <th style={{ padding: "4px 6px", textAlign: "center", color: "#991b1b" }}>Con Novedad</th>
                </tr>
              </thead>
              <tbody>
                {MODALIDADES_LIST.map((m) => {
                  const totMod = porTipoOpcion?.[m.key] || 0;
                  const st = currentScope.modalidadPorEstatus?.[m.key] || { "SIN ESTATUS": 0, "CREDITO ENTREGADO": 0, "EN PROCESO": 0, "CARPETA RETORNADA": 0, "CON NOVEDAD EN LA SEDE": 0 };
                  return (
                    <tr key={m.key} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "3.5px 6px", fontWeight: 700 }}>
                        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: m.color, marginRight: "5px" }} />
                        {m.label}
                      </td>
                      <td style={{ padding: "3.5px 6px", textAlign: "center", fontWeight: 800 }}>{fmt(totMod)}</td>
                      <td style={{ padding: "3.5px 6px", textAlign: "center", color: "#64748b" }}>{pctStr(totMod, totalPersonas)}</td>
                      <td style={{ padding: "3.5px 6px", textAlign: "center", fontWeight: 700, color: "#059669" }}>{st["CREDITO ENTREGADO"] || 0}</td>
                      <td style={{ padding: "3.5px 6px", textAlign: "center", fontWeight: 700, color: "#2563eb" }}>{st["EN PROCESO"] || 0}</td>
                      <td style={{ padding: "3.5px 6px", textAlign: "center", fontWeight: 700, color: "#64748b" }}>{st["SIN ESTATUS"] || 0}</td>
                      <td style={{ padding: "3.5px 6px", textAlign: "center", fontWeight: 700, color: "#d97706" }}>{st["CARPETA RETORNADA"] || 0}</td>
                      <td style={{ padding: "3.5px 6px", textAlign: "center", fontWeight: 700, color: "#dc2626" }}>{st["CON NOVEDAD EN LA SEDE"] || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── HOJA 2: AUDITORÍA DE CÓDIGOS QR, MADURACIÓN Y DEMOGRAFÍA ── */}
        <div className="sala-print-page" style={{ padding: "0 0 10px" }}>
          {/* Membrete Oficial Hoja 2 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #1e3a8a", paddingBottom: "5px", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <img src="/logo_gob.webp" alt="Gobernación del Estado La Guaira" style={{ width: "32px", height: "32px", objectFit: "contain" }} />
              <div>
                <span style={{ fontSize: "8.5px", fontWeight: 800, color: "#b45309", letterSpacing: "0.06em", textTransform: "uppercase", display: "block" }}>
                  GOBERNACIÓN DEL ESTADO LA GUAIRA · SALA SITUACIONAL
                </span>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "#1e3a8a", textTransform: "uppercase" }}>
                  Auditoría Documental, Códigos QR y Caracterización Social
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: "8.5px", color: "#64748b" }}>
              <span style={{ fontWeight: 700, color: "#1e3a8a" }}>HOJA 2 DE 2 · AUDITORÍA & DEMOGRAFÍA</span>
            </div>
          </div>

          {/* Grilla 2 Columnas: Superior (QR + Maduración) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "9px" }}>
            {/* Tarjeta Auditoría QR */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", padding: "7px 9px", background: "#ffffff" }}>
              <div style={{ fontSize: "9px", fontWeight: 800, color: "#1e3a8a", textTransform: "uppercase", marginBottom: "4px", borderBottom: "1px solid #e2e8f0", paddingBottom: "2px" }}>
                3. Cobertura de Códigos QR
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "6px" }}>
                <div style={{ border: "1px solid #bfdbfe", borderRadius: "4px", padding: "4px 6px", background: "#eff6ff" }}>
                  <span style={{ fontSize: "7.5px", fontWeight: 700, color: "#1e40af", display: "block" }}>QR Hábitat y Vivienda</span>
                  <b style={{ fontSize: "11px", color: "#1e40af" }}>{fmt(currentScope.qrCobertura?.habitatVivienda || 0)}</b>
                  <span style={{ fontSize: "7.5px", color: "#475569", marginLeft: "4px" }}>({pctStr(currentScope.qrCobertura?.habitatVivienda || 0, totalPersonas)})</span>
                </div>
                <div style={{ border: "1px solid #ddd6fe", borderRadius: "4px", padding: "4px 6px", background: "#faf5ff" }}>
                  <span style={{ fontSize: "7.5px", fontWeight: 700, color: "#6b21a8", display: "block" }}>QR Colapso de Vivienda</span>
                  <b style={{ fontSize: "11px", color: "#6b21a8" }}>{fmt(currentScope.qrCobertura?.colapsoVivienda || 0)}</b>
                  <span style={{ fontSize: "7.5px", color: "#475569", marginLeft: "4px" }}>({pctStr(currentScope.qrCobertura?.colapsoVivienda || 0, totalPersonas)})</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#065f46" }}>• Con Ambos Códigos QR:</span>
                  <b style={{ color: "#065f46" }}>{fmt(currentScope.qrCobertura?.ambosQr || 0)} ({pctStr(currentScope.qrCobertura?.ambosQr || 0, totalPersonas)})</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#1e40af" }}>• Con Al Menos Un QR:</span>
                  <b style={{ color: "#1e40af" }}>{fmt(currentScope.qrCobertura?.alMenosUno || 0)} ({pctStr(currentScope.qrCobertura?.alMenosUno || 0, totalPersonas)})</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#991b1b" }}>• Pendientes por Asignar QR:</span>
                  <b style={{ color: "#991b1b" }}>{fmt(currentScope.qrCobertura?.sinQr || 0)} ({pctStr(currentScope.qrCobertura?.sinQr || 0, totalPersonas)})</b>
                </div>
              </div>
            </div>

            {/* Tarjeta Nivel de Maduración Documental */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", padding: "7px 9px", background: "#ffffff" }}>
              <div style={{ fontSize: "9px", fontWeight: 800, color: "#1e3a8a", textTransform: "uppercase", marginBottom: "4px", borderBottom: "1px solid #e2e8f0", paddingBottom: "2px" }}>
                4. Nivel de Maduración Documental (Recaudos)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "3.5px", fontSize: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#065f46", fontWeight: 700 }}>• 100% Expediente Completo (Listo):</span>
                  <b>{fmt(currentScope.rangosProgreso?.completo100 || 0)} ({pctStr(currentScope.rangosProgreso?.completo100 || 0, totalPersonas)})</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#1e40af", fontWeight: 700 }}>• 70% – 99% Avance Avanzado:</span>
                  <b>{fmt(currentScope.rangosProgreso?.avanzado70_99 || 0)} ({pctStr(currentScope.rangosProgreso?.avanzado70_99 || 0, totalPersonas)})</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#b45309", fontWeight: 700 }}>• 40% – 69% Avance Intermedio:</span>
                  <b>{fmt(currentScope.rangosProgreso?.medio40_69 || 0)} ({pctStr(currentScope.rangosProgreso?.medio40_69 || 0, totalPersonas)})</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#991b1b", fontWeight: 700 }}>• 0% – 39% Recepción Inicial:</span>
                  <b>{fmt(currentScope.rangosProgreso?.inicial0_39 || 0)} ({pctStr(currentScope.rangosProgreso?.inicial0_39 || 0, totalPersonas)})</b>
                </div>
              </div>
            </div>
          </div>

          {/* Grilla 2 Columnas: Inferior (Demografía + Territorio / Ritmo) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "8px" }}>
            {/* Tarjeta Demografía */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", padding: "7px 9px", background: "#ffffff" }}>
              <div style={{ fontSize: "9px", fontWeight: 800, color: "#1e3a8a", textTransform: "uppercase", marginBottom: "4px", borderBottom: "1px solid #e2e8f0", paddingBottom: "2px" }}>
                5. Caracterización Demográfica
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "4px", fontSize: "8px" }}>
                <div>
                  <span style={{ color: "#64748b", display: "block" }}>Distribución Género Total:</span>
                  <span style={{ color: "#db2777" }}>• Femenino: <b>{fmt(demografia?.generoTotal.femenino || 0)}</b> ({pctStr(demografia?.generoTotal.femenino || 0, totalPoblacion)})</span>
                  <br />
                  <span style={{ color: "#2563eb" }}>• Masculino: <b>{fmt(demografia?.generoTotal.masculino || 0)}</b> ({pctStr(demografia?.generoTotal.masculino || 0, totalPoblacion)})</span>
                </div>
                <div>
                  <span style={{ color: "#64748b", display: "block" }}>Pirámide por Edad:</span>
                  <span>• 0–17 años: <b>{fmt(demografia?.gruposEdad.ninosAdolescentes || 0)}</b></span>
                  <br />
                  <span>• 18–29 años: <b>{fmt(demografia?.gruposEdad.jovenes || 0)}</b></span>
                  <br />
                  <span>• 30–59 años: <b>{fmt(demografia?.gruposEdad.adultos || 0)}</b></span>
                  <br />
                  <span>• ≥60 años: <b>{fmt(demografia?.gruposEdad.adultosMayores || 0)}</b></span>
                </div>
              </div>
            </div>

            {/* Tarjeta Territorial o Ritmo Temporal */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", padding: "7px 9px", background: "#ffffff" }}>
              <div style={{ fontSize: "9px", fontWeight: 800, color: "#1e3a8a", textTransform: "uppercase", marginBottom: "4px", borderBottom: "1px solid #e2e8f0", paddingBottom: "2px" }}>
                {selectedCampamento === "TODOS" ? "6. Distribución de Campamentos Activos" : "6. Ritmo de Recepción y Subsidios"}
              </div>
              {selectedCampamento === "TODOS" ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "7.5px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #cbd5e1" }}>
                      <th style={{ textAlign: "left", padding: "2px 4px" }}>Campamento</th>
                      <th style={{ textAlign: "center", padding: "2px 4px" }}>Exped.</th>
                      <th style={{ textAlign: "center", padding: "2px 4px", color: "#065f46" }}>Entregados</th>
                      <th style={{ textAlign: "center", padding: "2px 4px", color: "#1e40af" }}>En Proceso</th>
                      <th style={{ textAlign: "center", padding: "2px 4px", color: "#475569" }}>Sin Estatus</th>
                      <th style={{ textAlign: "center", padding: "2px 4px" }}>% Avance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.campamentos
                      .filter((c) => c.totalPersonas > 0)
                      .slice(0, 7)
                      .map((c) => (
                        <tr key={c.refugio} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "2px 4px", fontWeight: 600 }}>{c.refugio}</td>
                          <td style={{ padding: "2px 4px", textAlign: "center", fontWeight: 700 }}>{c.totalPersonas}</td>
                          <td style={{ padding: "2px 4px", textAlign: "center", color: "#059669" }}>{c.porEstatus?.["CREDITO ENTREGADO"] || 0}</td>
                          <td style={{ padding: "2px 4px", textAlign: "center", color: "#2563eb" }}>{c.porEstatus?.["EN PROCESO"] || 0}</td>
                          <td style={{ padding: "2px 4px", textAlign: "center", color: "#64748b" }}>{c.porEstatus?.["SIN ESTATUS"] || 0}</td>
                          <td style={{ padding: "2px 4px", textAlign: "center" }}>{c.promedioProgreso}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))", gap: "4px", fontSize: "7.5px", textAlign: "center" }}>
                  {(stats.avanceTemporal || []).slice(-6).map((item) => (
                    <div key={item.mes} style={{ border: "1px solid #e2e8f0", borderRadius: "4px", padding: "3px" }}>
                      <span style={{ color: "#64748b", display: "block" }}>{item.mes}</span>
                      <b style={{ color: "#2563eb", display: "block" }}>{item.carpetas} carg.</b>
                      <b style={{ color: "#059669", display: "block" }}>{item.creditos} ent.</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pie de Página Institucional */}
          <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: "5px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "7.5px", color: "#64748b" }}>
            <span>GOBERNACIÓN DEL ESTADO LA GUAIRA · SECRETARÍA GENERAL DE GOBIERNO · DIRECCIÓN DE VIVIENDA Y HÁBITAT</span>
            <span>Documento emitido con validez para control y supervisión operativa interna.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
