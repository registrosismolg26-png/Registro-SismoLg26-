"use client";

// ── Pestaña Monitoreo de campamentos (SOLO Master) ──────────────────────────
// Números generales por campamento con el MISMO cálculo que Estadísticas
// (src/lib/monitoreo.ts = mismas definiciones que stats.ts). Diseño con el
// lenguaje visual del Panel (.bal-card con acento por métrica). Se alimenta de
// /api/monitoreo (agregados SQL). SIN auto-refresh: al abrir + botón. ETag/304 +
// cache local para no consumir Supabase.

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/apiFetch";
import type { MonitoreoRow } from "@/types";

interface Data { campamentos: MonitoreoRow[]; totales: MonitoreoRow; generadoEn: string; }

// Métricas del consolidado (mismas etiquetas/acentos que el Panel de Estadísticas).
const METRICS: { key: keyof MonitoreoRow; label: string; accent: string }[] = [
  { key: "registrados", label: "Total Registrados", accent: "#2563eb" },
  { key: "presentes", label: "Presentes", accent: "#0d9488" },
  { key: "retirados", label: "Retirados", accent: "#dc2626" },
  { key: "intermitentes", label: "Intermitentes", accent: "#d97706" },
  { key: "nucleos", label: "Núcleos Familiares", accent: "#7c3aed" },
  { key: "individuos", label: "Individuos Solos", accent: "#64748b" },
  { key: "lesionados", label: "Lesionados", accent: "#e11d48" },
  { key: "conPatologia", label: "Con Patología", accent: "#db2777" },
  { key: "embarazadas", label: "Embarazadas", accent: "#be185d" },
];
// Mini-métricas por campamento (Registrados y Presentes van aparte, en grande).
const MINI: { key: keyof MonitoreoRow; label: string; accent: string }[] = [
  { key: "retirados", label: "Retirados", accent: "#dc2626" },
  { key: "intermitentes", label: "Intermit.", accent: "#d97706" },
  { key: "nucleos", label: "Núcleos", accent: "#7c3aed" },
  { key: "individuos", label: "Individuos", accent: "#64748b" },
  { key: "lesionados", label: "Lesionados", accent: "#e11d48" },
  { key: "conPatologia", label: "Patología", accent: "#db2777" },
  { key: "embarazadas", label: "Embaraz.", accent: "#be185d" },
];

export default function MonitoreoTab() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const etagRef = useRef<string | null>(null);

  const fetchMonitoreo = async (force = false) => {
    if (!force && typeof window !== "undefined") {
      const cached = localStorage.getItem("cached_monitoreo_v3");
      if (cached) { try { setData(JSON.parse(cached)); } catch (e) { console.error(e); } }
    }
    if (!navigator.onLine) return;
    setLoading(true);
    try {
      const prev = etagRef.current;
      const res = await apiFetch("/api/monitoreo", prev && !force ? { headers: { "If-None-Match": prev } } : {});
      if (res.status === 304) return;
      if (res.ok) {
        const etag = res.headers.get("ETag"); if (etag) etagRef.current = etag;
        const d = await res.json();
        if (d.success) { setData(d); localStorage.setItem("cached_monitoreo_v3", JSON.stringify(d)); }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMonitoreo(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const ocup = (r: MonitoreoRow) => (r.capacidad > 0 ? Math.round((r.asignados / r.capacidad) * 100) : 0);
  const hora = data?.generadoEn ? new Date(data.generadoEn).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }) : "";
  const camps = data ? [...data.campamentos].sort((a, b) => b.registrados - a.registrados) : [];

  return (
    <div className="tab-view monit-view">
      <div className="monit-head">
        <div>
          <h2 className="monit-title">Monitoreo de campamentos</h2>
          <p className="monit-sub">Mismos cálculos que el Panel de Estadísticas, por campamento.{hora && <> · Actualizado {hora}</>}</p>
        </div>
        <button type="button" className="btn-secondary monit-refresh" onClick={() => fetchMonitoreo(true)} disabled={loading}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {!data ? (
        <div className="monit-empty">{loading ? "Cargando…" : "Sin datos."}</div>
      ) : (
        <>
          {/* Consolidado (todos los campamentos) — tarjetas del Panel */}
          <div className="dashboard-section monit-section">
            <div className="dash-sec-head" style={{ ["--accent" as any]: "#2563eb" } as React.CSSProperties}>
              <span className="dash-sec-head__ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18 9l-5 5-3-3-4 4" /></svg></span>
              <h3 className="dashboard-section-title">Consolidado — {data.campamentos.length} campamentos</h3>
            </div>
            <div className="bal-cards dash-cards">
              {METRICS.map((m) => (
                <div key={m.key} className="bal-card" style={{ ["--accent" as any]: m.accent } as React.CSSProperties}>
                  <span className="bal-card__icon"><span className="monit-dot" style={{ background: m.accent }} /></span>
                  <span className="bal-card__value">{data.totales[m.key] as number}</span>
                  <span className="bal-card__label">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Por campamento */}
          <div className="dashboard-section monit-section">
            <div className="dash-sec-head" style={{ ["--accent" as any]: "#0d9488" } as React.CSSProperties}>
              <span className="dash-sec-head__ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg></span>
              <h3 className="dashboard-section-title">Por campamento</h3>
            </div>
            <div className="monit-camps">
              {camps.map((c) => {
                const o = ocup(c);
                return (
                  <div key={c.refugio} className="monit-camp">
                    <div className="monit-camp__head">
                      <h4 className="monit-camp__name">{c.refugio}</h4>
                      {c.capacidad > 0 && (
                        <span className={`monit-ocup-pill${o >= 90 ? " is-full" : o >= 70 ? " is-mid" : ""}`}>{c.asignados}/{c.capacidad} · {o}%</span>
                      )}
                    </div>
                    <div className="monit-camp__big">
                      <div className="monit-big"><span>{c.registrados}</span><small>Registrados</small></div>
                      <div className="monit-big monit-big--alt"><span>{c.presentes}</span><small>Presentes</small></div>
                    </div>
                    <div className="monit-mini-grid">
                      {MINI.map((m) => (
                        <div key={m.key} className="monit-mini" style={{ ["--accent" as any]: m.accent } as React.CSSProperties}>
                          <span className="monit-mini__v">{c[m.key] as number}</span>
                          <span className="monit-mini__l">{m.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="monit-note">Se actualiza al abrir la pestaña y con el botón “Actualizar”. No refresca solo, para no consumir base de datos.</p>
        </>
      )}
    </div>
  );
}
