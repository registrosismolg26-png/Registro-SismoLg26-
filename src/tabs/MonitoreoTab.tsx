"use client";

// ── Pestaña Monitoreo de campamentos (SOLO Master) ──────────────────────────
// Números generales por campamento para comparar de un vistazo. Se alimenta de
// /api/monitoreo (agregados SQL, egress mínimo). SIN auto-refresh: carga al abrir
// + botón "Actualizar". ETag/304 + cache local para no re-descargar si nada cambió.

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/apiFetch";
import type { MonitoreoRow } from "@/types";

interface Data { campamentos: MonitoreoRow[]; totales: MonitoreoRow; generadoEn: string; }

const COLS: { key: keyof MonitoreoRow; label: string }[] = [
  { key: "registrados", label: "Registrados" },
  { key: "presentes", label: "Presentes" },
  { key: "intermitentes", label: "Intermit." },
  { key: "nucleos", label: "Núcleos" },
  { key: "lesionados", label: "Lesionados" },
  { key: "conPatologia", label: "Patología" },
  { key: "embarazadas", label: "Embaraz." },
  { key: "consultas", label: "Consultas" },
  { key: "fichas", label: "Fichas" },
  { key: "retirados", label: "Retirados" },
];

export default function MonitoreoTab() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const etagRef = useRef<string | null>(null);

  const fetchMonitoreo = async (force = false) => {
    if (!force && typeof window !== "undefined") {
      const cached = localStorage.getItem("cached_monitoreo_v2");
      if (cached) { try { setData(JSON.parse(cached)); } catch (e) { console.error(e); } }
    }
    if (!navigator.onLine) return;
    setLoading(true);
    try {
      const prev = etagRef.current;
      const res = await apiFetch("/api/monitoreo", prev && !force ? { headers: { "If-None-Match": prev } } : {});
      if (res.status === 304) return; // sin cambios → conservar lo mostrado
      if (res.ok) {
        const etag = res.headers.get("ETag"); if (etag) etagRef.current = etag;
        const d = await res.json();
        if (d.success) { setData(d); localStorage.setItem("cached_monitoreo_v2", JSON.stringify(d)); }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMonitoreo(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const ocup = (r: MonitoreoRow) => r.capacidad > 0 ? Math.round((r.asignados / r.capacidad) * 100) : 0;
  const hora = data?.generadoEn ? new Date(data.generadoEn).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="tab-view monit-view">
      <div className="monit-head">
        <div>
          <h2 className="monit-title">Monitoreo de campamentos</h2>
          <p className="monit-sub">Números generales por campamento (agregados, sin traer censo). {hora && <>Actualizado {hora}.</>}</p>
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
          {/* Resumen total */}
          <div className="monit-totals">
            <div className="monit-tot"><span>{data.totales.registrados}</span><small>Registrados</small></div>
            <div className="monit-tot"><span>{data.totales.presentes}</span><small>Presentes</small></div>
            <div className="monit-tot"><span>{data.totales.nucleos}</span><small>Núcleos</small></div>
            <div className="monit-tot"><span>{data.totales.lesionados}</span><small>Lesionados</small></div>
            <div className="monit-tot"><span>{data.totales.embarazadas}</span><small>Embarazadas</small></div>
            <div className="monit-tot"><span>{data.totales.consultas}</span><small>Consultas</small></div>
            <div className="monit-tot"><span>{data.campamentos.length}</span><small>Campamentos</small></div>
          </div>

          <div className="monit-table-wrap">
            <table className="monit-table">
              <thead>
                <tr>
                  <th className="monit-th-name">Campamento</th>
                  {COLS.map((c) => <th key={c.key}>{c.label}</th>)}
                  <th>Ocupación</th>
                </tr>
              </thead>
              <tbody>
                {data.campamentos.map((r) => (
                  <tr key={r.refugio}>
                    <td className="monit-td-name" data-label="Campamento">{r.refugio}</td>
                    {COLS.map((c) => <td key={c.key} data-label={c.label}>{r[c.key] as number}</td>)}
                    <td data-label="Ocupación">
                      <span className={`monit-ocup${ocup(r) >= 90 ? " monit-ocup--full" : ocup(r) >= 70 ? " monit-ocup--mid" : ""}`}>
                        {r.asignados}/{r.capacidad || "—"}{r.capacidad > 0 && <b> · {ocup(r)}%</b>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="monit-td-name" data-label="Campamento">TOTAL</td>
                  {COLS.map((c) => <td key={c.key} data-label={c.label}>{data.totales[c.key] as number}</td>)}
                  <td data-label="Ocupación">{data.totales.asignados}/{data.totales.capacidad || "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="monit-note">Se actualiza al abrir la pestaña y con el botón. No refresca solo, para no consumir base de datos.</p>
        </>
      )}
    </div>
  );
}
