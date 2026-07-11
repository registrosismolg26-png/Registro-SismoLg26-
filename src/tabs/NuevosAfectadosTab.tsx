"use client";

// ── Pestaña "Nuevos afectados" (SOLO Master/Admin) ──────────────────────────
// LEE los registros recientes del censo directamente (NO crea filas de aviso) →
// egress mínimo. Marca los posteriores a tu última visita como "Nuevo" y, al tocar
// uno, salta a Registrados (Master cambia su "campamento en vista" al del afectado).
// Al abrir, actualiza la "última visita" (resetea el contador de la campana).

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useAppContext } from "@/context/AppContext";
import { isMaster } from "@/lib/permissions";

interface Row { id: string; nombreApellido: string; cedula: string; refugio: string; parroquia: string; jefeFamilia: string; retirado: string; createdAt: string; }

const SEEN_KEY = "nuevos_afectados_seen";

export default function NuevosAfectadosTab() {
  const { currentUser, setActiveTab, setViewRefugio } = useAppContext();
  const master = isMaster(currentUser?.role ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [nuevos, setNuevos] = useState(0);
  const [loading, setLoading] = useState(false);
  const prevSeenRef = useRef<string | null>(null);

  const load = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setLoading(true);
    try {
      const prev = typeof window !== "undefined" ? localStorage.getItem(SEEN_KEY) : null;
      prevSeenRef.current = prev;
      const res = await apiFetch(`/api/nuevos-afectados${prev ? `?since=${encodeURIComponent(prev)}` : ""}`);
      const d = await res.json().catch(() => ({}));
      if (d.success) { setRows(d.items || []); setNuevos(d.nuevos || 0); }
      if (typeof window !== "undefined") localStorage.setItem(SEEN_KEY, new Date().toISOString()); // marca visto
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const esNuevo = (r: Row) => {
    const prev = prevSeenRef.current;
    return prev ? new Date(r.createdAt).getTime() > new Date(prev).getTime() : false;
  };

  const irA = (r: Row) => {
    if (master && r.refugio) setViewRefugio(r.refugio);
    setActiveTab("asignaciones");
  };

  const fecha = (s: string) => new Date(s).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const iniciales = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

  return (
    <div className="tab-view mapa-view pill-form">
      <div className="monit-head">
        <div className="monit-head__txt">
          <h2 className="monit-title">Nuevos afectados</h2>
          <p className="monit-sub">
            Últimos registros del censo.
            {nuevos > 0 && <> · <b>{nuevos}</b> nuevo{nuevos === 1 ? "" : "s"} desde tu última visita</>}
          </p>
        </div>
        <button type="button" className="btn-secondary monit-refresh" onClick={load} disabled={loading}>
          <span className="btn-txt-collapsible">{loading ? "Actualizando…" : "Actualizar"}</span>
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="monit-empty">{loading ? "Cargando…" : "No hay registros recientes."}</div>
      ) : (
        <div className="afec-list">
          {rows.map((r) => (
            <button key={r.id} type="button" className={`afec-row${esNuevo(r) ? " afec-row--new" : ""}`} onClick={() => irA(r)}>
              <span className="afec-row__ava">{iniciales(r.nombreApellido)}</span>
              <span className="afec-row__main">
                <span className="afec-row__name">
                  {r.nombreApellido}
                  {esNuevo(r) && <span className="afec-badge">Nuevo</span>}
                  {r.retirado === "SI" && <span className="afec-badge afec-badge--out">Retirado</span>}
                </span>
                <span className="afec-row__meta">C.I. {r.cedula} · {r.refugio}{r.parroquia ? ` · ${r.parroquia}` : ""}</span>
              </span>
              <span className="afec-row__time">{fecha(r.createdAt)}<span className="afec-row__go">Ver →</span></span>
            </button>
          ))}
        </div>
      )}
      <p className="monit-note">
        Lee los registros recientes directamente (no crea avisos), para no consumir base de datos. Toca uno para ir a Registrados{master ? " — cambia tu campamento en vista al del afectado" : ""}.
      </p>
    </div>
  );
}
