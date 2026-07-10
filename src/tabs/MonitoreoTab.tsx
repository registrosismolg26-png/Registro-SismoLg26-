"use client";

// ── Pestaña Monitoreo de campamentos (SOLO Master) ──────────────────────────
// VISTA GENERAL para ojear todos los campamentos (no para detallar). Reutiliza
// EXACTAMENTE el sistema de diseño del Panel: tarjetas .bal-card con DASH_ICONS,
// mini-cards .bal-tipo para los números, y los colores del semáforo de ocupación
// (.dash-room verde/amarillo/rojo). Datos de /api/monitoreo (agregados SQL). SIN
// auto-refresh: al abrir + botón. ETag/304 + cache local.

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { DASH_ICONS } from "@/components/dashIcons";
import type { MonitoreoRow } from "@/types";

interface Data { campamentos: MonitoreoRow[]; totales: MonitoreoRow; generadoEn: string; }

// Consolidado: mismas etiquetas, acentos e ICONOS que el Panel de Estadísticas.
const KPIS: { key: keyof MonitoreoRow; label: string; accent: string; icon: string }[] = [
  { key: "registrados", label: "Total Registrados", accent: "#2563eb", icon: "users" },
  { key: "presentes", label: "Presentes", accent: "#0d9488", icon: "home" },
  { key: "retirados", label: "Retirados", accent: "#dc2626", icon: "userx" },
  { key: "intermitentes", label: "Intermitentes", accent: "#d97706", icon: "refresh" },
  { key: "nucleos", label: "Núcleos Familiares", accent: "#7c3aed", icon: "family" },
  { key: "individuos", label: "Individuos Solos", accent: "#64748b", icon: "user" },
  { key: "lesionados", label: "Lesionados", accent: "#e11d48", icon: "alert" },
  { key: "conPatologia", label: "Con Patología", accent: "#db2777", icon: "heart" },
  { key: "embarazadas", label: "Embarazadas", accent: "#be185d", icon: "pregnant" },
];

// Semáforo de ocupación (mismos colores que .dash-room del Panel).
const OCC_HEX: Record<string, string> = { green: "#10b981", yellow: "#f59e0b", red: "#ef4444", gray: "#94a3b8" };
const occNivel = (o: number) => (o >= 90 ? "red" : o >= 70 ? "yellow" : "green");

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
          <span className="monit-refresh__ico">{DASH_ICONS.refresh}</span>
          <span className="btn-txt-collapsible">{loading ? "Actualizando…" : "Actualizar"}</span>
        </button>
      </div>

      {!data ? (
        <div className="monit-empty">{loading ? "Cargando…" : "Sin datos."}</div>
      ) : (
        <>
          {/* Consolidado — tarjetas .bal-card idénticas al Panel */}
          <div className="dashboard-section monit-section">
            <div className="dash-sec-head" style={{ ["--accent" as any]: "#2563eb" } as React.CSSProperties}>
              <span className="dash-sec-head__ico">{DASH_ICONS.chart}</span>
              <h3 className="dashboard-section-title">Consolidado · {data.campamentos.length} campamentos</h3>
            </div>
            <div className="bal-cards">
              {KPIS.map((k) => (
                <div key={k.key} className="bal-card" style={{ ["--accent" as any]: k.accent } as React.CSSProperties}>
                  <span className="bal-card__icon">{DASH_ICONS[k.icon]}</span>
                  <span className="bal-card__value">{data.totales[k.key] as number}</span>
                  <span className="bal-card__label">{k.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Por campamento — población (.bal-tipo) + ocupación (semáforo) */}
          <div className="dashboard-section monit-section">
            <div className="dash-sec-head" style={{ ["--accent" as any]: "#0d9488" } as React.CSSProperties}>
              <span className="dash-sec-head__ico">{DASH_ICONS.home}</span>
              <h3 className="dashboard-section-title">Por campamento</h3>
            </div>
            <div className="monit-camps">
              {camps.map((c) => {
                const o = ocup(c);
                const lv = c.capacidad > 0 ? occNivel(o) : "gray";
                const hex = OCC_HEX[lv];
                return (
                  <div key={c.refugio} className="bal-card monit-camp" style={{ ["--accent" as any]: hex } as React.CSSProperties}>
                    <div className="monit-camp__head">
                      <span className="monit-camp__name" title={c.refugio}>{c.refugio}</span>
                      {c.capacidad > 0 && <span className="monit-occ-badge">{o}%</span>}
                    </div>

                    <div className="bal-tipos monit-camp__tipos">
                      <div className="bal-tipo" style={{ ["--accent" as any]: "#2563eb" } as React.CSSProperties}>
                        <span className="bal-tipo__count">{c.registrados}</span>
                        <span className="bal-tipo__label">Registrados</span>
                      </div>
                      <div className="bal-tipo" style={{ ["--accent" as any]: "#0d9488" } as React.CSSProperties}>
                        <span className="bal-tipo__count">{c.presentes}</span>
                        <span className="bal-tipo__label">Presentes</span>
                      </div>
                    </div>

                    {c.capacidad > 0 ? (
                      <div className="monit-occ">
                        <div className="monit-occ__track"><div className="monit-occ__fill" style={{ width: `${Math.min(100, o)}%`, background: hex }} /></div>
                        <span className="monit-occ__lbl">Ocupación · {c.asignados} de {c.capacidad} camas</span>
                      </div>
                    ) : (
                      <div className="monit-occ__none">Sin capacidad de salones configurada</div>
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
