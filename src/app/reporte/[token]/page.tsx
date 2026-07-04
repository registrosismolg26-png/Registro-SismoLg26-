"use client";

// ── Reporte público (sin login) ─────────────────────────────────────────────
// Muestra SOLO estadísticas agregadas (sin datos personales) de un refugio.
// La UBICACIÓN es obligatoria: al abrir se pide geolocalización; sin ella, se
// audita el intento y se muestra una pantalla de bloqueo. Con ella, se audita
// (navegador + IP + ubicación) y se entregan las estadísticas.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import PublicReportView from "@/components/PublicReportView";

type Phase = "loading" | "notfound" | "intro" | "locating" | "blocked" | "ready" | "error";

interface Meta { refugioLabel: string; creadoPorNombre: string; ubicacionRefugio: string | null; }
interface Stats { [k: string]: any; }

export default function ReportePublicoPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [phase, setPhase] = useState<Phase>("loading");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [refugioLabel, setRefugioLabel] = useState("");

  // 1) Metadatos (sin estadísticas todavía).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/reporte/${token}`, { cache: "no-store" });
        if (!alive) return;
        if (r.status === 404) { setPhase("notfound"); return; }
        if (!r.ok) { setPhase("error"); return; }
        const d = await r.json();
        setMeta({ refugioLabel: d.refugioLabel, creadoPorNombre: d.creadoPorNombre, ubicacionRefugio: d.ubicacionRefugio });
        setRefugioLabel(d.refugioLabel);
        setPhase("intro");
      } catch { if (alive) setPhase("error"); }
    })();
    return () => { alive = false; };
  }, [token]);

  // 2) Registrar apertura (auditoría) — con o sin ubicación.
  const postAcceso = useCallback(async (coords: { lat?: number; lng?: number; precision?: number }) => {
    try {
      const r = await fetch(`/api/reporte/${token}/acceso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coords),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.granted) {
        setStats(d.stats);
        setRefugioLabel(d.refugioLabel || refugioLabel);
        setPhase("ready");
      } else {
        setPhase("blocked");
      }
    } catch {
      setPhase("blocked");
    }
  }, [token, refugioLabel]);

  // 3) Pedir ubicación (requiere gesto del usuario).
  const solicitarUbicacion = useCallback(() => {
    setPhase("locating");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      postAcceso({});
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => postAcceso({ lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy }),
      () => postAcceso({}), // denegada / error → auditar intento sin ubicación
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [postAcceso]);

  // ── Pantallas ──────────────────────────────────────────────────────────────
  if (phase === "loading") return <RepShell><div className="rep-spin" /></RepShell>;

  if (phase === "notfound")
    return <RepGate icon={IC.lockx} title="Reporte no disponible" text="Este enlace no existe o fue revocado por quien lo compartió." tone="bad" />;

  if (phase === "error")
    return <RepGate icon={IC.warn} title="No se pudo cargar" text="Ocurrió un problema al abrir el reporte. Intenta de nuevo más tarde." tone="bad" />;

  if (phase === "intro")
    return (
      <RepGate
        icon={IC.pin}
        title="Reporte de estadísticas"
        text={`${meta?.refugioLabel || ""} · compartido por ${meta?.creadoPorNombre || "—"}. Para abrirlo debes permitir el acceso a tu ubicación (queda registrado por seguridad).`}
        tone="ok"
        action={<button type="button" className="rep-btn" onClick={solicitarUbicacion}>{IC.pin} Permitir ubicación y ver reporte</button>}
      />
    );

  if (phase === "locating")
    return <RepGate icon={IC.pin} title="Solicitando ubicación…" text="Confirma el permiso de ubicación en tu navegador para continuar." tone="ok" action={<div className="rep-spin" />} />;

  if (phase === "blocked")
    return (
      <RepGate
        icon={IC.lockx}
        title="Ubicación requerida"
        text="No se pudo obtener tu ubicación, por lo que el reporte no puede mostrarse. Habilita la ubicación y vuelve a intentarlo."
        tone="bad"
        action={<button type="button" className="rep-btn" onClick={solicitarUbicacion}>{IC.retry} Reintentar</button>}
      />
    );

  // phase === "ready"
  return (
    <div className="rep-page rep-page--report">
      <PublicReportView stats={stats!} refugioLabel={refugioLabel} sharedBy={meta?.creadoPorNombre || ""} ubicacion={meta?.ubicacionRefugio || null} />
    </div>
  );
}

// ── Marco / pantallas de compuerta ──────────────────────────────────────────
function RepShell({ children }: { children: ReactNode }) {
  return <div className="rep-page"><div className="rep-gate">{children}</div></div>;
}
function RepGate({ icon, title, text, tone, action }: { icon: ReactNode; title: string; text: string; tone: "ok" | "bad"; action?: ReactNode }) {
  return (
    <div className="rep-page">
      <div className="rep-gate">
        <span className={`rep-gate__icon rep-gate__icon--${tone}`}>{icon}</span>
        <h1 className="rep-gate__title">{title}</h1>
        <p className="rep-gate__text">{text}</p>
        {action}
        <span className="rep-gate__brand">Gobernación del Estado La Guaira · Campamentos Transitorios</span>
      </div>
    </div>
  );
}

// ── Íconos ───────────────────────────────────────────────────────────────────
const IC = {
  pin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  lockx: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/><line x1="15" y1="16" x2="19" y2="20"/><line x1="19" y1="16" x2="15" y2="20"/></svg>,
  warn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  retry: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
};
