"use client";

// ── Campana de avisos in-app (cabecera) ─────────────────────────────────────
// Muestra los avisos del propio usuario (/api/notifications) con contador de no
// leídos. Para NO consumir base de datos: carga al montar, al volver a la pestaña
// (visibilitychange) y al abrir el panel — SIN polling constante. Al abrir, marca
// leídos.

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/apiFetch";

interface Notif { id: string; tipo: string; titulo: string; cuerpo: string; readAt: string | null; createdAt: string; }

export default function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const lastLoad = useRef(0);

  // Throttle: evita repetir el GET al alternar de pestaña (ahorro de egress).
  const load = async (force = false) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (!force && Date.now() - lastLoad.current < 45_000) return;
    lastLoad.current = Date.now();
    try {
      const res = await apiFetch("/api/notifications");
      const d = await res.json().catch(() => ({}));
      if (d.success) { setItems(d.items || []); setUnread(d.unread || 0); }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    load(true);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      load(true); // refresca al abrir
      if (unread > 0) {
        setUnread(0);
        setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
        apiFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).catch(() => {});
      }
    }
  };

  const fecha = (s: string) => new Date(s).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="notif-bell" ref={ref}>
      <button type="button" className="notif-bell__btn" onClick={toggle} aria-label="Avisos" title="Avisos">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {unread > 0 && <span className="notif-bell__badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
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
        </div>
      )}
    </div>
  );
}
