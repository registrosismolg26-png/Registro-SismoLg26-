"use client";

// ── Campana de avisos in-app ────────────────────────────────────────────────
// Muestra los avisos del propio usuario (/api/notifications) con contador de no
// leídos. Va en la cabecera (móvil) Y en el sidebar (escritorio) — como el sidebar
// tiene overflow:hidden y está abajo-izquierda, el PANEL se rinde por PORTAL a
// document.body con posición ADAPTABLE (abre hacia arriba/abajo y se ancla dentro
// de la pantalla según dónde esté el botón). Para NO consumir base de datos: carga
// al montar, al volver a la pestaña y al abrir — SIN polling. Al abrir, marca leídos.

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/apiFetch";

interface Notif { id: string; tipo: string; titulo: string; cuerpo: string; readAt: string | null; createdAt: string; }
type Pos = { left: number; width: number; top?: number; bottom?: number };

// Caché COMPARTIDO entre instancias: la campana está en cabecera Y sidebar; solo una
// es visible por breakpoint, pero ambas montan → esto evita el 2º fetch (egress).
let sharedCache: { at: number; items: Notif[]; unread: number } | null = null;

export default function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Reusa el caché compartido si es reciente (45s normal; 2s en `force`, para dedup de
  // los montajes casi-simultáneos de las dos instancias). Si no, hace UN fetch.
  const load = async (force = false) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (sharedCache && Date.now() - sharedCache.at < (force ? 2_000 : 45_000)) {
      setItems(sharedCache.items); setUnread(sharedCache.unread); return;
    }
    try {
      const res = await apiFetch("/api/notifications");
      const d = await res.json().catch(() => ({}));
      if (d.success) {
        sharedCache = { at: Date.now(), items: d.items || [], unread: d.unread || 0 };
        setItems(sharedCache.items); setUnread(sharedCache.unread);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    load(true);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Posiciona el panel (portal) según el botón: ancla dentro de la pantalla y abre
  // hacia arriba si el botón está en la mitad inferior (caso sidebar), o hacia abajo.
  const computePos = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(320, window.innerWidth - 16);
    let left = r.right - width;                              // por defecto alineado a la derecha del botón
    left = Math.max(8, Math.min(left, window.innerWidth - 8 - width)); // sin salirse por los lados
    const openUp = r.bottom > window.innerHeight * 0.55;
    setPos(openUp ? { left, width, bottom: window.innerHeight - r.top + 8 } : { left, width, top: r.bottom + 8 });
  };

  const toggle = () => {
    const next = !open;
    if (next) {
      computePos();
      load(true);
      if (unread > 0) {
        setUnread(0);
        const marcados = items.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }));
        setItems(marcados);
        sharedCache = { at: Date.now(), items: marcados, unread: 0 }; // refleja leído en la otra instancia
        apiFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).catch(() => {});
      }
    }
    setOpen(next);
  };

  // Cerrar al click fuera / scroll / resize (evita paneles con posición vieja).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onMove = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("scroll", onMove, true); window.removeEventListener("resize", onMove); };
  }, [open]);

  const fecha = (s: string) => new Date(s).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="notif-bell">
      <button ref={btnRef} type="button" className="notif-bell__btn" onClick={toggle} aria-label="Avisos" title="Avisos">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {unread > 0 && <span className="notif-bell__badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} className="notif-panel" style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 4000 }}>
          <div className="notif-panel__head">Avisos</div>
          {items.length === 0 ? (
            <div className="notif-panel__empty">No tienes avisos.</div>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id} className={`notif-item${n.readAt ? "" : " notif-item--unread"}`}>
                  <span className="notif-item__title">{n.titulo}</span>
                  <span className="notif-item__body">{n.cuerpo}</span>
                  <span className="notif-item__time">{fecha(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
