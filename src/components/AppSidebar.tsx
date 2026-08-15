"use client";

// ── Sidebar lateral izquierdo flotante (variante de AppHeader para PANTALLAS GRANDES) ──
// Solo se muestra en ≥1024px (CSS); por debajo sigue la cabecera clásica (AppHeader).
// Reúne la MISMA información que el header —identidad institucional (logo + título),
// navegación (ítems compartidos en navItems), y la franja de operación (conexión,
// selector de campamento del Master, usuario, tema, salir)— pero en columna.
// Es COLAPSABLE: al colapsar se queda "solo iconos". El bloque de identidad y el de
// operación quedan siempre visibles; solo la lista de navegación hace scroll.
// El estado colapsado se persiste y se refleja en <html data-sidebar> para que el
// contenido (padding del body, solo en CSS ≥1024px) se recorra en consecuencia.

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAppContext } from "@/context/AppContext";
import { isMaster, isMedico } from "@/lib/permissions";
import SearchableSingleSelect from "@/components/SearchableSingleSelect";
import NotificationBell from "@/components/NotificationBell";
import { NAV_ITEMS } from "@/components/navItems";

export default function AppSidebar() {
  const {
    currentUser, activeTab, setActiveTab, theme, toggleTheme,
    isOnline, isSyncing, syncQueueProgress, pendingCount, handleLogout,
    viewRefugio, setViewRefugio, refugiosList,
  } = useAppContext();

  const [collapsed, setCollapsed] = useState(false);

  // Popover del selector de campamento cuando el sidebar está COLAPSADO: permite
  // cambiar de campamento SIN expandir. Flota a la derecha del rail (portal a body,
  // para escapar el overflow:hidden del sidebar).
  const [refPop, setRefPop] = useState(false);
  const [popPos, setPopPos] = useState<{ left: number; bottom: number } | null>(null);
  const refBtnRef = useRef<HTMLButtonElement>(null);
  const openRefPop = () => {
    const r = refBtnRef.current?.getBoundingClientRect();
    if (r) setPopPos({ left: r.right + 10, bottom: window.innerHeight - r.bottom });
    setRefPop(true);
  };
  useEffect(() => {
    if (!refPop) return;
    const onDoc = (e: MouseEvent) => {
      // No cerrar si el clic cae en el popover, el botón, o el menú del propio select.
      if ((e.target as HTMLElement).closest?.(".sb-refugio-pop, .sb-refugio-mini, .combo-panel")) return;
      setRefPop(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setRefPop(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [refPop]);
  // Al expandir, cerrar el popover (ya se ve el selector completo).
  useEffect(() => { if (!collapsed) setRefPop(false); }, [collapsed]);

  // Cargar preferencia persistida (una vez).
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("sidebar_collapsed") === "1") setCollapsed(true);
  }, []);

  // Reflejar el estado en <html> (el contenido reacciona vía CSS) y persistir.
  useEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? "collapsed" : "expanded";
    try { localStorage.setItem("sidebar_collapsed", collapsed ? "1" : "0"); } catch { /* noop */ }
  }, [collapsed]);

  // Al desmontar (p. ej. logout), limpiar el atributo para que el body recupere su padding.
  useEffect(() => () => { delete document.documentElement.dataset.sidebar; }, []);

  if (!currentUser) return null;

  const role = currentUser.role;
  const roleClass =
    role === "MASTER" ? "master" :
    role === "ADMIN" ? "admin" :
    isMedico(role) ? "medico" :
    role === "VISUALIZADOR" ? "visual" : "reg";
  const roleLabels: Record<string, string> = {
    MASTER: "Master", ADMIN: "Admin", REGISTRADOR: "Registrador", VISUALIZADOR: "Visualizador",
    RENACE: "VZLA Renace", RENACE_MASTER: "Master Renace",
    AdminMedico: "Admin Médico", OperadorMedico: "Op. Médico", AsistenteMedico: "Asist. Médico",
  };
  const roleLabel = roleLabels[role] || role;
  const initials = currentUser.nombre.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "U";

  const items = NAV_ITEMS.filter((it) => it.show(role));

  return (
    <aside className={`app-sidebar${collapsed ? " is-collapsed" : ""}`} aria-label="Navegación principal">

      {/* ── Identidad institucional (siempre visible) ── */}
      <div className="sb-identity">
        <div className="sb-seal" aria-hidden="true">
          <img src="/logo_gob.webp" alt="Escudo Gobernación La Guaira" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <div className="sb-title-group">
          <span className="sb-org">GOBERNACIÓN DEL ESTADO LA GUAIRA</span>
          <h2 className="sb-appname">CAMPAMENTOS TRANSITORIOS</h2>
          <span className="sb-tagline">Sistema de Gestión · La Guaira 2026</span>
        </div>
        <button
          type="button"
          className="sb-collapse"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expandir menú" : "Colapsar menú"}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* ── Navegación (hace scroll si no cabe) ── */}
      <nav className="sb-nav">
        {items.map((it) =>
          it.href ? (
            <a key={it.href} href={it.href} className="sb-nav-btn" title={it.label} style={{ textDecoration: "none" }}>
              <span className="sb-nav-ico">{it.icon}</span>
              <span className="sb-nav-label">{it.label}</span>
            </a>
          ) : (
            <button
              key={it.tab}
              type="button"
              data-tab={it.tab}
              className={`sb-nav-btn${activeTab === it.tab ? " active" : ""}`}
              onClick={() => setActiveTab(it.tab!)}
              title={it.label}
            >
              <span className="sb-nav-ico">{it.icon}</span>
              <span className="sb-nav-label">{it.label}</span>
            </button>
          )
        )}
      </nav>

      {/* ── Franja de operación (siempre visible al pie) ── */}
      <div className="sb-ops">
        {/* Estado de conexión + pendientes de sync */}
        <div className={`sb-conn ${isOnline ? "is-online" : "is-offline"}`} title={isOnline ? "Conectado" : "Sin señal — trabajando offline"}>
          <span className="sb-conn__dot" aria-hidden />
          <span className="sb-conn__txt">
            {isOnline ? "En línea" : "Sin señal"}
            {(pendingCount > 0 || isSyncing) && (
              <span className="sb-conn__pend">
                {isSyncing && syncQueueProgress
                  ? <><span className="spinner spinner-sm" /> {syncQueueProgress.done}/{syncQueueProgress.total}</>
                  : ` · ${pendingCount} pend.`}
              </span>
            )}
          </span>
        </div>

        {/* Selector de campamento (solo Master). Colapsado → popover flotante (cambiar sin expandir). */}
        {isMaster(role) && refugiosList.length > 0 && (
          collapsed ? (
            <div className="sb-refugio-mini">
              <button
                ref={refBtnRef}
                type="button"
                className={`sb-icon-btn${refPop ? " is-active" : ""}`}
                title="Cambiar campamento en vista"
                aria-label="Cambiar campamento en vista"
                onClick={() => (refPop ? setRefPop(false) : openRefPop())}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
              </button>
              {refPop && popPos && typeof document !== "undefined" && createPortal(
                <div className="sb-refugio-pop pill-form" style={{ position: "fixed", left: popPos.left, bottom: popPos.bottom, width: 244, zIndex: 4000 }}>
                  <span className="sb-refugio-pop__label">Campamento en vista</span>
                  <SearchableSingleSelect
                    value={viewRefugio}
                    onChange={(v) => { setViewRefugio(v); setRefPop(false); }}
                    options={refugiosList.map((rf) => ({ value: rf.nombre, label: rf.nombre }))}
                    ariaLabel="Campamento activo"
                    placeholder="Campamento…"
                  />
                </div>,
                document.body
              )}
            </div>
          ) : (
            <div className="sb-refugio pill-form" title="Campamento que estás viendo en todo el sistema">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
              <SearchableSingleSelect
                value={viewRefugio}
                onChange={setViewRefugio}
                options={refugiosList.map((rf) => ({ value: rf.nombre, label: rf.nombre }))}
                ariaLabel="Campamento activo"
                placeholder="Campamento…"
              />
            </div>
          )
        )}

        {/* Usuario. En colapsado, el estado de conexión se muestra como punto sobre el avatar. */}
        <div className="sb-user">
          <span className={`sb-avatar sb-avatar--${roleClass}`} aria-hidden>
            {initials}
            {!isOnline && <span className="sb-avatar-status is-offline" />}
          </span>
          <span className="sb-user__meta">
            <span className="sb-user__name">{currentUser.nombre}</span>
            <span className={`sb-role sb-role--${roleClass}`}>{roleLabel}</span>
          </span>
        </div>

        {/* Acciones: avisos + tema + salir */}
        <div className="sb-actions">
          <NotificationBell />
          <button type="button" className="sb-icon-btn" onClick={toggleTheme} title={theme === "dark" ? "Modo claro" : "Modo oscuro"} aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}>
            {theme === "dark" ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
          </button>
          <button type="button" className="sb-icon-btn sb-logout" onClick={handleLogout} title="Cerrar sesión" aria-label="Cerrar sesión">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            <span className="sb-logout__txt">Salir</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
