"use client";

// ── Pestaña Monitoreo de campamentos (SOLO Master) ──────────────────────────
// VISTA GENERAL para ojear todos los campamentos (no para detallar). Mismos
// cálculos que Estadísticas (src/lib/monitoreo.ts). Por campamento se muestra lo
// esencial: población + OCUPACIÓN (barra) + un resalte de salud. El detalle fino
// vive en el Panel de Estadísticas. Egress mínimo: agregados SQL + ETag/304 +
// cache local, sin auto-refresh (al abrir + botón).

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/apiFetch";
import type { MonitoreoRow } from "@/types";

interface Data { campamentos: MonitoreoRow[]; totales: MonitoreoRow; generadoEn: string; }

// Consolidado (totales de todos los campamentos). Acentos como el Panel.
const KPIS: { key: keyof MonitoreoRow; label: string; accent: string }[] = [
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

const nivel = (o: number) => (o >= 90 ? "full" : o >= 70 ? "mid" : "ok");

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
    <div className="tab-view monit-view pill-form">
      <div className="monit-head">
        <div className="monit-head__txt">
          <h2 className="monit-title">Monitoreo de campamentos</h2>
          <p className="monit-sub">Vista general de todos los campamentos.{hora && <> · Actualizado {hora}</>}</p>
        </div>
        <button type="button" className="btn-secondary monit-refresh" onClick={() => fetchMonitoreo(true)} disabled={loading}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
          <span className="btn-txt-collapsible">{loading ? "Actualizando…" : "Actualizar"}</span>
        </button>
      </div>

      {!data ? (
        <div className="monit-empty">{loading ? "Cargando…" : "Sin datos."}</div>
      ) : (
        <>
          {/* Consolidado — números grandes de todos los campamentos */}
          <div className="dashboard-section monit-section">
            <div className="dash-sec-head" style={{ ["--accent" as any]: "#2563eb" } as React.CSSProperties}>
              <span className="dash-sec-head__ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18 9l-5 5-3-3-4 4" /></svg></span>
              <h3 className="dashboard-section-title">Consolidado · {data.campamentos.length} campamentos</h3>
            </div>
            <div className="monit-kpis">
              {KPIS.map((k) => (
                <div key={k.key} className="monit-kpi" style={{ ["--accent" as any]: k.accent } as React.CSSProperties}>
                  <span className="monit-kpi__v">{data.totales[k.key] as number}</span>
                  <span className="monit-kpi__l">{k.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Por campamento — población + ocupación (lo esencial para ojear) */}
          <div className="dashboard-section monit-section">
            <div className="dash-sec-head" style={{ ["--accent" as any]: "#0d9488" } as React.CSSProperties}>
              <span className="dash-sec-head__ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg></span>
              <h3 className="dashboard-section-title">Por campamento</h3>
            </div>
            <div className="monit-camps">
              {camps.map((c) => {
                const o = ocup(c);
                const lv = nivel(o);
                const hay = c.lesionados > 0 || c.conPatologia > 0 || c.embarazadas > 0;
                return (
                  <div key={c.refugio} className="monit-camp">
                    <div className="monit-camp__head">
                      <h4 className="monit-camp__name" title={c.refugio}>{c.refugio}</h4>
                      {c.capacidad > 0 && <span className={`monit-occ-badge is-${lv}`}>{o}%</span>}
                    </div>

                    <div className="monit-camp__nums">
                      <div className="monit-num"><span className="monit-num__v">{c.registrados}</span><span className="monit-num__l">Registrados</span></div>
                      <div className="monit-num monit-num--alt"><span className="monit-num__v">{c.presentes}</span><span className="monit-num__l">Presentes</span></div>
                    </div>

                    {c.capacidad > 0 ? (
                      <div className="monit-occ">
                        <div className="monit-occ__track"><div className={`monit-occ__fill is-${lv}`} style={{ width: `${Math.min(100, o)}%` }} /></div>
                        <span className="monit-occ__lbl">Ocupación · {c.asignados} de {c.capacidad} camas</span>
                      </div>
                    ) : (
                      <div className="monit-occ__none">Sin capacidad de salones configurada</div>
                    )}

                    {hay && (
                      <div className="monit-camp__health">
                        {c.lesionados > 0 && <span className="monit-tag monit-tag--les"><b>{c.lesionados}</b> lesionados</span>}
                        {c.conPatologia > 0 && <span className="monit-tag monit-tag--pat"><b>{c.conPatologia}</b> con patología</span>}
                        {c.embarazadas > 0 && <span className="monit-tag monit-tag--emb"><b>{c.embarazadas}</b> embarazadas</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="monit-note">Vista general (no detallada). El detalle por campamento está en el Panel de Estadísticas. Se actualiza al abrir y con el botón — no refresca solo, para no consumir base de datos.</p>
        </>
      )}
    </div>
  );
}
