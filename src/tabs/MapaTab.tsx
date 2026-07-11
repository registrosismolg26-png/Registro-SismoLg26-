"use client";

// ── Pestaña Mapa de calor (SOLO Master) ─────────────────────────────────────
// Muestra la concentración de registros que guardaron GPS. Datos de /api/mapa-calor
// (densidades por celda agregadas en SQL → egress mínimo, sin coords exactas). El
// render usa Leaflet + tiles de OpenStreetMap (gratis) + una capa de calor;
// Leaflet se importa PEREZOSAMENTE (solo cuando Master abre esta pestaña, vía import
// dinámico + `dynamic(ssr:false)` en page.tsx) para no engordar el bundle ni tocar
// el offline del resto. SIN auto-refresh: al abrir + botón. ETag/304 + cache local.

import { useState, useEffect, useRef } from "react";
import type * as LType from "leaflet";
import { apiFetch } from "@/lib/apiFetch";
import "leaflet/dist/leaflet.css";

interface HeatCell { lat: number; lng: number; peso: number; }
interface Data { celdas: HeatCell[]; total: number; generadoEn: string; }

// Centro por defecto: La Guaira (hasta que los datos ajusten el encuadre).
const LA_GUAIRA: [number, number] = [10.6, -66.93];

export default function MapaTab() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const etagRef = useRef<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const heatRef = useRef<LType.Layer | null>(null);
  const LRef = useRef<any>(null); // instancia Leaflet (con heatLayer del plugin)

  const fetchMapa = async (force = false) => {
    if (!force && typeof window !== "undefined") {
      const cached = localStorage.getItem("cached_mapa_calor_v1");
      if (cached) { try { setData(JSON.parse(cached)); } catch (e) { console.error(e); } }
    }
    if (!navigator.onLine) return;
    setLoading(true);
    try {
      const prev = etagRef.current;
      const res = await apiFetch("/api/mapa-calor", prev && !force ? { headers: { "If-None-Match": prev } } : {});
      if (res.status === 304) return;
      if (res.ok) {
        const etag = res.headers.get("ETag"); if (etag) etagRef.current = etag;
        const d = await res.json();
        if (d.success) { setData(d); localStorage.setItem("cached_mapa_calor_v1", JSON.stringify(d)); }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMapa(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Inicializa Leaflet una sola vez (import perezoso). El interop UMD obliga a
  // tomar `.default` en runtime; los tipos vienen de @types/leaflet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!containerRef.current || mapRef.current) return;
      try {
        const Lmod = await import("leaflet");
        await import("leaflet.heat");
        if (cancelled || !containerRef.current || mapRef.current) return;
        const L: any = (Lmod as any).default ?? Lmod;
        LRef.current = L;
        const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(LA_GUAIRA, 11) as LType.Map;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap",
        }).addTo(map);
        mapRef.current = map;
        drawHeat();
      } catch (e) { console.error(e); setMapError("No se pudo cargar el mapa. Revisa tu conexión."); }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; heatRef.current = null; }
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  // Redibuja la capa de calor cuando cambian los datos (o al terminar de cargar el mapa).
  useEffect(() => { drawHeat(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [data]);

  function drawHeat() {
    const L = LRef.current; const map = mapRef.current;
    if (!L || !map || !data) return;
    if (heatRef.current) { map.removeLayer(heatRef.current); heatRef.current = null; }
    if (!data.celdas.length) return;
    const maxPeso = Math.max(...data.celdas.map((c) => c.peso), 1);
    const pts = data.celdas.map((c) => [c.lat, c.lng, c.peso / maxPeso]) as [number, number, number][];
    heatRef.current = L.heatLayer(pts, { radius: 25, blur: 18, minOpacity: 0.35, maxZoom: 17 }).addTo(map);
    try {
      const bounds = L.latLngBounds(data.celdas.map((c) => [c.lat, c.lng] as [number, number]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    } catch (e) { console.error(e); }
  }

  const hora = data?.generadoEn ? new Date(data.generadoEn).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="tab-view mapa-view pill-form">
      <div className="monit-head">
        <div className="monit-head__txt">
          <h2 className="monit-title">Mapa de calor</h2>
          <p className="monit-sub">
            Concentración de registros con GPS guardado.
            {data ? <> · {data.total} punto{data.total === 1 ? "" : "s"}</> : null}
            {hora && <> · Actualizado {hora}</>}
          </p>
        </div>
        <button type="button" className="btn-secondary monit-refresh" onClick={() => fetchMapa(true)} disabled={loading}>
          <span className="btn-txt-collapsible">{loading ? "Actualizando…" : "Actualizar"}</span>
        </button>
      </div>

      {mapError && <div className="monit-empty">{mapError}</div>}

      <div ref={containerRef} className="mapa-canvas" aria-label="Mapa de calor de registros" />

      {data && data.celdas.length === 0 && (
        <p className="monit-note">Aún no hay registros con GPS guardado.</p>
      )}
      <p className="monit-note">
        Densidades agregadas por zona (no puntos exactos). Se actualiza al abrir y con el botón — no refresca solo, para no consumir base de datos. Mapa © OpenStreetMap.
      </p>
    </div>
  );
}
