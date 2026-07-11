"use client";

// ── Centro de avisos (campana) ──────────────────────────────────────────────
// UN solo lugar con DOS secciones: "Avisos" (notificaciones) y "Nuevos afectados"
// (registros recientes, leídos directo del censo — sin crear filas). Flujo real:
//  · Avisos: clic → modal con el detalle completo + su botón de acción, que NAVEGA
//    a la ficha concreta (Traslado→ficha de la persona; Usuario nuevo→ficha del
//    usuario; Bienvenida→Configuración). Master cambia su "campamento en vista".
//  · Nuevos afectados: clic en la fila → abre la ficha de esa persona (Master cambia
//    de campamento). La lista se carga SOLO al abrir la sección (egress mínimo).
// Panel por PORTAL con posición adaptable (cabecera y sidebar). Sin polling.

import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/apiFetch";
import { useAppContext } from "@/context/AppContext";
import { canManageUsers, isMedico, isMaster } from "@/lib/permissions";
import SwipeableNotifRow from "@/components/SwipeableNotifRow";
import WaText from "@/components/WaText";
import { loadHidden, hideNotif, isHiddenNow } from "@/lib/notifHidden";

interface Notif { id: string; tipo: string; titulo: string; cuerpo: string; refugio: string | null; entidadId: string | null; readAt: string | null; createdAt: string; }
interface Afectado { id: string; nombreApellido: string; cedula: string; refugio: string; parroquia: string; retirado: string; createdAt: string; }
type Pos = { left: number; width: number; top?: number; bottom?: number };

const SEEN_KEY = "nuevos_afectados_seen";
let cacheAvisos: { at: number; items: Notif[]; unread: number; nuevos: number } | null = null;

const TIPO_COLOR: Record<string, string> = { AVISO: "#2563eb", USUARIO_NUEVO: "#10b981", TRASLADO: "#d97706", BIENVENIDA: "#0d9488" };
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

// Acción de un aviso: a dónde navega + si el usuario puede.
function accionDe(n: Notif, role: string): { label: string; can: boolean } | null {
  if (n.tipo === "TRASLADO" && n.entidadId) return { label: "Ver ficha", can: !isMedico(role) };
  if (n.tipo === "USUARIO_NUEVO" && n.entidadId) return { label: "Ver usuario", can: canManageUsers(role) };
  if (n.tipo === "BIENVENIDA") return { label: "Ir a Configuración", can: !isMedico(role) && role !== "VISUALIZADOR" };
  return null;
}

const fechaLarga = (s: string) => new Date(s).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fechaCorta = (s: string) => new Date(s).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const iniciales = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

export default function NotificationBell() {
  const { currentUser, setActiveTab, setViewRefugio, setPendingSelectId, setPendingUserId } = useAppContext();
  const role = currentUser?.role ?? "";
  const esAdminCenso = role === "MASTER" || role === "ADMIN";
  const master = isMaster(role);

  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [nuevos, setNuevos] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [detail, setDetail] = useState<Notif | null>(null);
  const [section, setSection] = useState<"avisos" | "afectados">("avisos");
  const [afectados, setAfectados] = useState<Afectado[]>([]);
  const [afectadosLoading, setAfectadosLoading] = useState(false);
  const afectadosPrevSeen = useRef<string | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Descartadas / pospuestas — 100% cliente (localStorage), offline y sin egress.
  const [hidden, setHidden] = useState<Record<string, number>>(() => loadHidden());
  const doHide = (id: string, mode: "dismiss" | "snooze") => setHidden((h) => hideNotif(h, id, mode));

  const seenSince = () => {
    if (typeof window === "undefined") return null;
    let v = localStorage.getItem(SEEN_KEY);
    if (!v) { v = new Date().toISOString(); localStorage.setItem(SEEN_KEY, v); }
    return v;
  };

  const loadAvisos = async (force = false) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (cacheAvisos && Date.now() - cacheAvisos.at < (force ? 2_000 : 45_000)) {
      setItems(cacheAvisos.items); setUnread(cacheAvisos.unread); setNuevos(cacheAvisos.nuevos); return;
    }
    try {
      const q = esAdminCenso ? `?afectadosSince=${encodeURIComponent(seenSince() || "")}` : "";
      const res = await apiFetch(`/api/notifications${q}`);
      const d = await res.json().catch(() => ({}));
      if (d.success) {
        cacheAvisos = { at: Date.now(), items: d.items || [], unread: d.unread || 0, nuevos: d.nuevosAfectados || 0 };
        setItems(cacheAvisos.items); setUnread(cacheAvisos.unread); setNuevos(cacheAvisos.nuevos);
      }
    } catch (e) { console.error(e); }
  };

  const loadAfectados = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setAfectadosLoading(true);
    try {
      const prev = typeof window !== "undefined" ? localStorage.getItem(SEEN_KEY) : null;
      afectadosPrevSeen.current = prev;
      const res = await apiFetch(`/api/nuevos-afectados${prev ? `?since=${encodeURIComponent(prev)}` : ""}`);
      const d = await res.json().catch(() => ({}));
      if (d.success) setAfectados(d.items || []);
    } catch (e) { console.error(e); }
    finally { setAfectadosLoading(false); }
  };

  useEffect(() => {
    loadAvisos(true);
    const onVis = () => { if (document.visibilityState === "visible") loadAvisos(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const computePos = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(340, window.innerWidth - 16);
    let left = r.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - 8 - width));
    const openUp = r.bottom > window.innerHeight * 0.55;
    setPos(openUp ? { left, width, bottom: window.innerHeight - r.top + 8 } : { left, width, top: r.bottom + 8 });
  };

  const toggle = () => {
    const next = !open;
    if (next) {
      computePos();
      loadAvisos(true);
      setHidden(loadHidden());   // reincorpora las pospuestas ya vencidas
      if (unread > 0) {
        setUnread(0);
        const marcados = items.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }));
        setItems(marcados);
        if (cacheAvisos) cacheAvisos = { ...cacheAvisos, at: Date.now(), items: marcados, unread: 0 };
        apiFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).catch(() => {});
      }
    }
    setOpen(next);
  };

  const irASeccion = (s: "avisos" | "afectados") => {
    setSection(s);
    if (s === "afectados") {
      loadAfectados();
      // Marca "visto" → resetea el contador de nuevos afectados.
      if (typeof window !== "undefined") localStorage.setItem(SEEN_KEY, new Date().toISOString());
      setNuevos(0);
      if (cacheAvisos) cacheAvisos = { ...cacheAvisos, nuevos: 0 };
    }
  };

  useEffect(() => {
    // Con el detalle abierto (modal por encima) NO enganchamos los cierres: así
    // interactuar con el modal no colapsa el panel de fondo.
    if (!open || detail) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Cerrar si se hace scroll de la PÁGINA, pero NO al scrollear DENTRO del panel.
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onResize); };
  }, [open, detail]);

  // ── Navegación real a la ficha ──
  const irAPersona = (id: string | null, refugio: string | null) => {
    if (!id) return;
    if (master && refugio) setViewRefugio(refugio);
    setPendingSelectId(id);
    setActiveTab("asignaciones");
    setDetail(null); setOpen(false);
  };
  const irAUsuario = (id: string | null) => {
    if (!id) return;
    setPendingUserId(id);
    setActiveTab("usuarios");
    setDetail(null); setOpen(false);
  };
  const ejecutarAccion = (n: Notif) => {
    if (n.tipo === "TRASLADO") irAPersona(n.entidadId, n.refugio);
    else if (n.tipo === "USUARIO_NUEVO") irAUsuario(n.entidadId);
    else if (n.tipo === "BIENVENIDA") { setActiveTab("config"); setDetail(null); setOpen(false); }
  };
  const esNuevoAfectado = (r: Afectado) => {
    const prev = afectadosPrevSeen.current;
    return prev ? new Date(r.createdAt).getTime() > new Date(prev).getTime() : false;
  };

  const badge = unread + (esAdminCenso ? nuevos : 0);
  const accion = detail ? accionDe(detail, role) : null;
  // Oculta (descartadas / pospuestas vigentes) sin tocar el servidor.
  const visibleItems = items.filter((n) => !isHiddenNow(hidden, n.id));
  const visibleAfectados = afectados.filter((r) => !isHiddenNow(hidden, "afec:" + r.id));

  return (
    <div className="notif-bell">
      <button ref={btnRef} type="button" className="notif-bell__btn" onClick={toggle} aria-label="Avisos" title="Avisos">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {badge > 0 && <span className="notif-bell__badge">{badge > 9 ? "9+" : badge}</span>}
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} className="notif-panel" style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 4000 }}>
          {esAdminCenso ? (
            <div className="notif-seg">
              <button type="button" className={`notif-seg__btn${section === "avisos" ? " is-active" : ""}`} onClick={() => irASeccion("avisos")}>
                Avisos{unread > 0 && <span className="notif-seg__badge">{unread > 9 ? "9+" : unread}</span>}
              </button>
              <button type="button" className={`notif-seg__btn${section === "afectados" ? " is-active" : ""}`} onClick={() => irASeccion("afectados")}>
                Nuevos afectados{nuevos > 0 && <span className="notif-seg__badge">{nuevos > 9 ? "9+" : nuevos}</span>}
              </button>
            </div>
          ) : (
            <div className="notif-panel__head">Avisos</div>
          )}

          {section === "avisos" ? (
            visibleItems.length === 0 ? (
              <div className="notif-panel__empty">No tienes avisos.</div>
            ) : (
              <ul className="notif-list">
                {visibleItems.map((n) => (
                  <li key={n.id}>
                    <SwipeableNotifRow
                      className={`notif-item${n.readAt ? "" : " notif-item--unread"}`}
                      onOpen={() => setDetail(n)}
                      onDismiss={() => doHide(n.id, "dismiss")}
                      onSnooze={() => doHide(n.id, "snooze")}
                    >
                      <span className="notif-item__ico" style={{ color: tipoColor(n.tipo), background: `${tipoColor(n.tipo)}22` }}><TipoIcon tipo={n.tipo} /></span>
                      <span className="notif-item__main">
                        <span className="notif-item__title">{n.titulo}{!n.readAt && <span className="notif-item__dot" style={{ background: tipoColor(n.tipo) }} />}</span>
                        <span className="notif-item__body"><WaText text={n.cuerpo} /></span>
                        <span className="notif-item__time">{fechaCorta(n.createdAt)}</span>
                      </span>
                    </SwipeableNotifRow>
                  </li>
                ))}
              </ul>
            )
          ) : (
            afectadosLoading && afectados.length === 0 ? (
              <div className="notif-panel__empty">Cargando…</div>
            ) : visibleAfectados.length === 0 ? (
              <div className="notif-panel__empty">No hay registros recientes.</div>
            ) : (
              <ul className="notif-list">
                {visibleAfectados.map((r) => (
                  <li key={r.id}>
                    <SwipeableNotifRow
                      className={`notif-item${esNuevoAfectado(r) ? " notif-item--unread" : ""}`}
                      onOpen={() => irAPersona(r.id, r.refugio)}
                      onDismiss={() => doHide("afec:" + r.id, "dismiss")}
                      onSnooze={() => doHide("afec:" + r.id, "snooze")}
                    >
                      <span className="afec-mini-ava">{iniciales(r.nombreApellido)}</span>
                      <span className="notif-item__main">
                        <span className="notif-item__title">{r.nombreApellido}{esNuevoAfectado(r) && <span className="afec-badge">Nuevo</span>}{r.retirado === "SI" && <span className="afec-badge afec-badge--out">Retirado</span>}</span>
                        <span className="notif-item__body">C.I. {r.cedula} · {r.refugio}{r.parroquia ? ` · ${r.parroquia}` : ""}</span>
                        <span className="notif-item__time">{fechaCorta(r.createdAt)} · Ver ficha →</span>
                      </span>
                    </SwipeableNotifRow>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>,
        document.body
      )}

      {detail && typeof document !== "undefined" && createPortal(
        <div className="modal-overlay" style={{ zIndex: 4200 }} onClick={() => setDetail(null)}>
          <div className="modal-content notif-detail" onClick={(e) => e.stopPropagation()}>
            <div className="notif-detail__head">
              <span className="notif-item__ico" style={{ color: tipoColor(detail.tipo), background: `${tipoColor(detail.tipo)}22` }}><TipoIcon tipo={detail.tipo} /></span>
              <h3 className="notif-detail__title">{detail.titulo}</h3>
              <button className="modal-close" onClick={() => setDetail(null)} aria-label="Cerrar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <p className="notif-detail__body" style={{ whiteSpace: "normal" }}><WaText text={detail.cuerpo} /></p>
            <p className="notif-detail__time">{fechaLarga(detail.createdAt)}</p>
            {accion && accion.can && (
              <div className="notif-detail__actions">
                <button type="button" className="btn-submit" style={{ width: "auto" }} onClick={() => ejecutarAccion(detail)}>{accion.label} →</button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
