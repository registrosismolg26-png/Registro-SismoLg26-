"use client";

// ── Reporte público (sin login) ─────────────────────────────────────────────
// Muestra SOLO estadísticas agregadas (sin datos personales) de un refugio.
// La ubicación e IP NO son obligatorias para ver el reporte: se muestra de una.
// Aun así se PIDE la geolocalización y, en 2do plano, se espera su respuesta y se
// AUDITA la apertura (navegador + IP —del servidor— + ubicación si la conceden).

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import PublicReportView from "@/components/PublicReportView";

type Phase = "loading" | "notfound" | "ready" | "error";

interface Meta { refugioLabel: string; creadoPorNombre: string; ubicacionRefugio: string | null; refugioTipo: string | null; }
interface Stats { [k: string]: any; }

export default function ReportePublicoPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [phase, setPhase] = useState<Phase>("loading");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [refugioLabel, setRefugioLabel] = useState("");
  // Público → tema CLARO por defecto. Botón discreto para cambiar (persistido).
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    try { const s = localStorage.getItem("reporte_theme"); if (s === "dark" || s === "light") setTheme(s); } catch { /* noop */ }
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.getAttribute("data-theme");
    el.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    return () => { if (prev) el.setAttribute("data-theme", prev); else el.removeAttribute("data-theme"); };
  }, [theme]);
  const toggleTheme = () => setTheme((t) => {
    const next = t === "dark" ? "light" : "dark";
    try { localStorage.setItem("reporte_theme", next); } catch { /* noop */ }
    return next;
  });

  // Registrar apertura (auditoría) — SOLO una vez por carga. En 2do plano: pide la
  // ubicación y, cuando responda (o falle/expire), envía IP+navegador+ubicación.
  const audited = useRef(false);
  const registrarAcceso = useCallback(() => {
    if (audited.current) return;
    audited.current = true;
    const send = (coords: { lat?: number; lng?: number; precision?: number }) => {
      fetch(`/api/reporte/${token}/acceso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coords),
      }).catch(() => { /* auditoría best-effort */ });
    };
    if (typeof navigator === "undefined" || !navigator.geolocation) { send({}); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => send({ lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy }),
      () => send({}), // denegada / error / expira → se audita igual (sin ubicación)
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, [token]);

  // Cargar reporte (metadatos + estadísticas) y mostrarlo de una. La ubicación/IP
  // NO bloquean: se auditan aparte en 2do plano.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/reporte/${token}`, { cache: "no-store" });
        if (!alive) return;
        if (r.status === 404) { setPhase("notfound"); return; }
        if (!r.ok) { setPhase("error"); return; }
        const d = await r.json();
        setMeta({ refugioLabel: d.refugioLabel, creadoPorNombre: d.creadoPorNombre, ubicacionRefugio: d.ubicacionRefugio, refugioTipo: d.refugioTipo ?? null });
        setRefugioLabel(d.refugioLabel);
        setStats(d.stats || null);
        setPhase("ready");
        registrarAcceso(); // 2do plano
      } catch { if (alive) setPhase("error"); }
    })();
    return () => { alive = false; };
  }, [token, registrarAcceso]);

  // ── Pantallas ──────────────────────────────────────────────────────────────
  let screen: ReactNode;
  if (phase === "loading") {
    screen = <RepShell><div className="rep-spin" /></RepShell>;
  } else if (phase === "notfound") {
    screen = <RepGate icon={IC.lockx} title="Reporte no disponible" text="Este enlace no existe o fue revocado por quien lo compartió." tone="bad" />;
  } else if (phase === "error") {
    screen = <RepGate icon={IC.warn} title="No se pudo cargar" text="Ocurrió un problema al abrir el reporte. Intenta de nuevo más tarde." tone="bad" />;
  } else {
    screen = (
      <div className="rep-page rep-page--report">
        <PublicReportView stats={stats!} refugioLabel={refugioLabel} sharedBy={meta?.creadoPorNombre || ""} ubicacion={meta?.ubicacionRefugio || null} refugioTipo={meta?.refugioTipo || null} />
      </div>
    );
  }

  return (
    <>
      {screen}
      <button
        type="button"
        className="rep-theme-toggle"
        onClick={toggleTheme}
        title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
        aria-label="Cambiar tema"
      >
        {theme === "dark"
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>}
      </button>
    </>
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
  lockx: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/><line x1="15" y1="16" x2="19" y2="20"/><line x1="19" y1="16" x2="15" y2="20"/></svg>,
  warn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
};
