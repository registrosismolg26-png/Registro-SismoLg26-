"use client";

// ── Campana de avisos in-app ────────────────────────────────────────────────
// Avisos del propio usuario (/api/notifications) con contador de no leídos. Cada tipo
// tiene su ícono + color y un punto si está sin leer. El panel se rinde por PORTAL
// con posición adaptable (funciona en cabecera y en sidebar). Al hacer clic en un
// aviso se abre su DETALLE completo (para textos largos). Sin polling: carga al
// montar, al volver a la pestaña y al abrir; caché compartido entre instancias.

import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/apiFetch";

interface Notif { id: string; tipo: string; titulo: string; cuerpo: string; readAt: string | null; createdAt: string; }
type Pos = { left: number; width: number; top?: number; bottom?: number };

// Caché compartido: la campana está en cabecera Y sidebar (solo una visible), pero
// ambas montan → evita el 2º fetch (egress).
let sharedCache: { at: number; items: Notif[]; unread: number } | null = null;

const TIPO_COLOR: Record<string, string> = {
  AVISO: "#2563eb", USUARIO_NUEVO: "#10b981", TRASLADO: "#d97706", BIENVENIDA: "#0d9488",
};
const tipoColor = (t: string) => TIPO_COLOR[t] || "#64748b";

function TipoIcon({ tipo }: { tipo: string }) {
  const paths: Record<string, ReactNode> = {
    AVISO: <><path d="M3 11l16-5v12L3 14z" /><path d="M11 16.5a2.5 2.5 0 0 1-4.9-.5" /></>,
    USUARIO_NUEVO: <><path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></>,
    TRASLADO: <><path d="M17 4l4 4-4 4" /><path d="M21 8H8" /><path d="M7 20l-4-4 4-4" /><path d="M3 16h13" /></>,
    BIENVENIDA: <><rect x="3" y="8" width="18" height="4" /><path d="M12 8v13" /><path d="M5 12v9h14v-9" /></>,
  };
  const p = paths[tipo] || <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p}</svg>;
}

const fechaLarga = (s: string) => new Date(s).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fechaCorta = (s: string) => new Date(s).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [detail, setDetail] = useState<Notif | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  const computePos = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(320, window.innerWidth - 16);
    let left = r.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - 8 - width));
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
        sharedCache = { at: Date.now(), items: marcados, unread: 0 };
        apiFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).catch(() => {});
      }
    }
    setOpen(next);
  };

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
                <li key={n.id}>
                  <button type="button" className={`notif-item${n.readAt ? "" : " notif-item--unread"}`} onClick={() => setDetail(n)}>
                    <span className="notif-item__ico" style={{ color: tipoColor(n.tipo), background: `${tipoColor(n.tipo)}22` }}><TipoIcon tipo={n.tipo} /></span>
                    <span className="notif-item__main">
                      <span className="notif-item__title">{n.titulo}{!n.readAt && <span className="notif-item__dot" style={{ background: tipoColor(n.tipo) }} />}</span>
                      <span className="notif-item__body">{n.cuerpo}</span>
                      <span className="notif-item__time">{fechaCorta(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body
      )}

      {detail && typeof document !== "undefined" && createPortal(
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-content notif-detail" onClick={(e) => e.stopPropagation()}>
            <div className="notif-detail__head">
              <span className="notif-item__ico" style={{ color: tipoColor(detail.tipo), background: `${tipoColor(detail.tipo)}22` }}><TipoIcon tipo={detail.tipo} /></span>
              <h3 className="notif-detail__title">{detail.titulo}</h3>
              <button className="modal-close" onClick={() => setDetail(null)} aria-label="Cerrar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <p className="notif-detail__body">{detail.cuerpo}</p>
            <p className="notif-detail__time">{fechaLarga(detail.createdAt)}</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
