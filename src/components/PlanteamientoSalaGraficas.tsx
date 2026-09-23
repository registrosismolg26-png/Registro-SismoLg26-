"use client";

import { useState, useEffect } from "react";
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

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <span className="spinner" style={{ width: "32px", height: "32px", margin: "0 auto 1rem" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Cargando gráficas y métricas…</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="reg-empty-state" style={{ padding: "3rem" }}>
        <p>No se pudieron cargar las estadísticas</p>
        <button type="button" className="toolbar-btn" onClick={loadStats} style={{ marginTop: "1rem" }}>
          Reintentar
        </button>
      </div>
    );
  }

  // Filtrar si seleccionó un campamento específico
  const campFiltered =
    selectedCampamento !== "TODOS"
      ? stats.campamentos.find((c) => c.refugio === selectedCampamento) || null
      : null;

  const currentTotal = campFiltered ? campFiltered.totalPersonas : stats.global.totalPersonas;
  const currentPromedio = campFiltered ? campFiltered.promedioProgreso : stats.global.promedioProgreso;
  const currentPorEstatus = campFiltered ? campFiltered.porEstatus : stats.global.porEstatus;
  const currentPorRequisito = campFiltered ? campFiltered.porRequisito : stats.global.porRequisito;
  const currentTitulosCasa = campFiltered ? campFiltered.titulosCasaDesglose : stats.global.titulosCasaDesglose;

  const maxCampPersonas = Math.max(1, ...stats.campamentos.map((c) => c.totalPersonas));

  const fmt = (n: number) => n.toLocaleString("es-VE");
  const pctStr = (n: number, total: number) => `${total ? Math.round((n / total) * 100) : 0}%`;

  return (
    <div className="sala-graficas" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Barra de Controles: Selector de Campamento y Actualizar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          background: "var(--bg-secondary)",
          padding: "0.85rem 1rem",
          borderRadius: "16px",
          border: "1px solid var(--border-color)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", flex: 1 }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>Filtrar Métricas por Campamento:</span>
          <div style={{ minWidth: "260px", flex: "1 1 280px" }}>
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
              style={{ fontSize: "0.78rem", padding: "0 8px", height: "30px" }}
            >
              Ver todos
            </button>
          )}
        </div>

        <button type="button" className="toolbar-btn" onClick={loadStats} disabled={loading}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginRight: "4px" }}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Actualizar Datos
        </button>
      </div>

      {/* Indicador de Filtro Activo */}
      {selectedCampamento !== "TODOS" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(37, 99, 235, 0.08)",
            border: "1px solid rgba(37, 99, 235, 0.2)",
            borderRadius: "12px",
            padding: "0.75rem 1rem",
            fontSize: "0.88rem",
          }}
        >
          <div>
            📍 <b>Campamento Seleccionado:</b> <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>{selectedCampamento}</span>
            <span style={{ marginLeft: "8px", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
              ({fmt(currentTotal)} persona{currentTotal === 1 ? "" : "s"} registrada{currentTotal === 1 ? "" : "s"})
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedCampamento("TODOS")}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-primary)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.8rem",
              textDecoration: "underline",
            }}
          >
            Volver al consolidado global
          </button>
        </div>
      )}

      {/* Tarjetas KPI (se ajustan automáticamente al campamento seleccionado o consolidado) */}
      <div className="bal-cards">
        <div className="bal-card" style={{ ["--accent" as any]: "#1e3a8a" } as React.CSSProperties}>
          <span className="bal-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <span className="bal-card__value stat-card-value-animate">{fmt(currentTotal)}</span>
          <span className="bal-card__label">
            {selectedCampamento === "TODOS" ? "Total Personas" : "Personas en Campamento"}
          </span>
        </div>

        <div className="bal-card" style={{ ["--accent" as any]: "#059669" } as React.CSSProperties}>
          <span className="bal-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span className="bal-card__value stat-card-value-animate">{fmt(currentPorEstatus["CREDITO ENTREGADO"] || 0)}</span>
          <span className="bal-card__label">
            Crédito Entregado <span className="bal-card__sub">· {pctStr(currentPorEstatus["CREDITO ENTREGADO"] || 0, currentTotal)}</span>
          </span>
        </div>

        <div className="bal-card" style={{ ["--accent" as any]: "#2563eb" } as React.CSSProperties}>
          <span className="bal-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
          </span>
          <span className="bal-card__value stat-card-value-animate">{fmt(currentPorEstatus["EN PROCESO"] || 0)}</span>
          <span className="bal-card__label">
            En Proceso <span className="bal-card__sub">· {pctStr(currentPorEstatus["EN PROCESO"] || 0, currentTotal)}</span>
          </span>
        </div>

        <div className="bal-card" style={{ ["--accent" as any]: "#d97706" } as React.CSSProperties}>
          <span className="bal-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7" /><path d="M14 2H6a2 2 0 0 0-2 2v3h16V4a2 2 0 0 0-2-2z" />
            </svg>
          </span>
          <span className="bal-card__value stat-card-value-animate">{fmt(currentPorEstatus["CARPETA RETORNADA"] || 0)}</span>
          <span className="bal-card__label">
            Carpeta Retornada <span className="bal-card__sub">· {pctStr(currentPorEstatus["CARPETA RETORNADA"] || 0, currentTotal)}</span>
          </span>
        </div>

        <div className="bal-card" style={{ ["--accent" as any]: "#dc2626" } as React.CSSProperties}>
          <span className="bal-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
          <span className="bal-card__value stat-card-value-animate">{fmt(currentPorEstatus["CON NOVEDAD EN LA SEDE"] || 0)}</span>
          <span className="bal-card__label">
            Con Novedad en Sede <span className="bal-card__sub">· {pctStr(currentPorEstatus["CON NOVEDAD EN LA SEDE"] || 0, currentTotal)}</span>
          </span>
        </div>

        <div className="bal-card" style={{ ["--accent" as any]: "#7c3aed" } as React.CSSProperties}>
          <span className="bal-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </span>
          <span className="bal-card__value stat-card-value-animate">{currentPromedio}%</span>
          <span className="bal-card__label">Avance Promedio Documental</span>
        </div>
      </div>

      {/* Gráfica Comparativa entre Campamentos (Solo en vista "TODOS") */}
      {selectedCampamento === "TODOS" && (
        <div
          className="dashboard-card"
          style={{
            background: "var(--card-bg, var(--bg-secondary))",
            border: "1px solid var(--border-color)",
            borderRadius: "16px",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
            <div>
              <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
                Carga de Personas por Campamento
              </h4>
              <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Distribución de los {stats.campamentos.length} campamentos con expedientes registrados (haz clic para filtrar).
              </p>
            </div>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-primary)" }}>
              Total: {fmt(stats.global.totalPersonas)} personas
            </span>
          </div>

          {stats.campamentos.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", textAlign: "center", padding: "1.5rem 0" }}>
              Aún no hay personas cargadas en ningún campamento.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {stats.campamentos.map((c) => {
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
                      padding: "4px 8px",
                      borderRadius: "8px",
                      transition: "background 0.15s ease",
                    }}
                    title={`Ver métricas detalladas de ${c.refugio}`}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {c.refugio} <span style={{ fontSize: "0.75rem", color: "var(--color-primary)" }}>🔍 ver</span>
                      </span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        <b>{c.totalPersonas}</b> {c.totalPersonas === 1 ? "persona" : "personas"} ({c.promedioProgreso}% requisitos)
                      </span>
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: "12px",
                        borderRadius: "999px",
                        background: "rgba(0,0,0,0.06)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${barWidth}%`,
                          height: "100%",
                          background: "linear-gradient(90deg, var(--color-primary), #3b82f6)",
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

      {/* Vista de Detalle cuando un campamento no tiene registros */}
      {selectedCampamento !== "TODOS" && currentTotal === 0 && (
        <div
          className="dashboard-card"
          style={{
            background: "var(--card-bg, var(--bg-secondary))",
            border: "1px solid var(--border-color)",
            borderRadius: "16px",
            padding: "2.5rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📋</div>
          <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
            Sin personas cargadas en {selectedCampamento}
          </h4>
          <p style={{ margin: "6px auto 1rem", fontSize: "0.88rem", color: "var(--text-secondary)", maxWidth: "450px" }}>
            Aún no se ha registrado ningún planteamiento para este campamento. Puedes cargarlo desde la pestaña <b>Información</b>.
          </p>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => setSelectedCampamento("TODOS")}
          >
            Ver consolidado general
          </button>
        </div>
      )}

      {/* Gráfica: Distribución de Estatus del Campamento Seleccionado */}
      {selectedCampamento !== "TODOS" && currentTotal > 0 && (
        <div
          className="dashboard-card"
          style={{
            background: "var(--card-bg, var(--bg-secondary))",
            border: "1px solid var(--border-color)",
            borderRadius: "16px",
            padding: "1.25rem",
          }}
        >
          <div style={{ marginBottom: "1rem" }}>
            <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
              Distribución de Estatus en {selectedCampamento}
            </h4>
            <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Estado actual de los {fmt(currentTotal)} expedientes de este campamento.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {ESTATUS_SALA_OPTIONS.map((st) => {
              const count = currentPorEstatus[st.value] || 0;
              const pct = currentTotal ? Math.round((count / currentTotal) * 100) : 0;
              return (
                <div key={st.value} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>{st.label}</span>
                    <span style={{ fontWeight: 700, color: st.color }}>
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div style={{ width: "100%", height: "9px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
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
      )}

      {/* Gráfica: Cumplimiento de Requisitos Documentales (Ajustado al campamento seleccionado o consolidado) */}
      {currentTotal > 0 && (
        <div
          className="dashboard-card"
          style={{
            background: "var(--card-bg, var(--bg-secondary))",
            border: "1px solid var(--border-color)",
            borderRadius: "16px",
            padding: "1.25rem",
          }}
        >
          <div style={{ marginBottom: "1rem" }}>
            <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
              {selectedCampamento === "TODOS"
                ? "Cumplimiento de Requisitos Documentales (Consolidado General)"
                : `Cumplimiento de Requisitos Documentales — ${selectedCampamento}`}
            </h4>
            <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Porcentaje y conteo de familias que cuentan con cada uno de los 9 recaudos en {selectedCampamento === "TODOS" ? "todos los campamentos" : selectedCampamento}.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            {[
              { label: "1. Planilla de Caracterización", val: currentPorRequisito.planillaCaracterizacion },
              { label: "2. Cédula Catastral", val: currentPorRequisito.cedulaCatastral },
              { label: "3. Título de Casa (Cualquiera)", val: currentPorRequisito.conTituloCasa },
              { label: "4. Referencia Bancaria del Vendedor", val: currentPorRequisito.referenciaBancariaVendedor },
              { label: "5. QR de Hábitat y Vivienda", val: currentPorRequisito.qrHabitatVivienda },
              { label: "6. Cédula de Identidad del Vendedor", val: currentPorRequisito.cedulaVendedor },
              { label: "7. Cédula de Identidad del Comprador", val: currentPorRequisito.cedulaComprador },
              { label: "8. Fotos Impresas de la Vivienda", val: currentPorRequisito.fotosVivienda },
              { label: "9. Vendedor Posee Patria", val: currentPorRequisito.vendedorPoseePatria },
            ].map((reqItem) => {
              const p = currentTotal ? Math.round((reqItem.val / currentTotal) * 100) : 0;
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
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                    <span style={{ fontWeight: 600 }}>{reqItem.label}</span>
                    <span style={{ fontWeight: 700, color: p >= 70 ? "#059669" : p >= 40 ? "#2563eb" : "#d97706" }}>
                      {p}% ({reqItem.val})
                    </span>
                  </div>
                  <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "var(--border-color)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${p}%`,
                        height: "100%",
                        background: p >= 70 ? "#059669" : p >= 40 ? "#2563eb" : "#d97706",
                        borderRadius: "999px",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desglose de Título de Casa */}
          <div style={{ marginTop: "1.25rem", padding: "0.9rem", background: "var(--bg-primary)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>
              Desglose por Tipo de Título de Casa ({selectedCampamento === "TODOS" ? "General" : selectedCampamento}):
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", fontSize: "0.85rem" }}>
              <span><b>Propiedad:</b> {currentTitulosCasa["TITULO_PROPIEDAD"] || 0}</span>
              <span><b>Supletorio:</b> {currentTitulosCasa["TITULO_SUPLETORIO"] || 0}</span>
              <span><b>Compra y Venta:</b> {currentTitulosCasa["COMPRA_VENTA"] || 0}</span>
              <span style={{ color: "var(--text-secondary)" }}><b>Sin título:</b> {currentTitulosCasa["NINGUNO"] || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
