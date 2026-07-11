"use client";

// ── Cabecera institucional + barra de navegación ────────────────────────────
// Franja institucional (logo, título, toggle de tema), franja de operación
// (estado de conexión, cola de sync, usuario/logout) y la barra de navegación
// (menú desktop con píldora deslizante + menú móvil con dropdown).
//
// Del context global consume: currentUser, isPowerAdmin, activeTab,
// setActiveTab, theme, toggleTheme, isOnline, isSyncing, syncQueueProgress,
// pendingCount, handleLogout.

import { useState, useLayoutEffect, useRef } from "react";
import { useAppContext } from "@/context/AppContext";
import { canManageUsers, canViewDashboard, isMaster, canManageMorbilidad, canRegister, isMedico } from "@/lib/permissions";
import SearchableSingleSelect from "@/components/SearchableSingleSelect";
import NotificationBell from "@/components/NotificationBell";

export default function AppHeader() {
  const {
    currentUser,
    activeTab,
    setActiveTab,
    theme,
    toggleTheme,
    isOnline,
    isSyncing,
    syncQueueProgress,
    pendingCount,
    handleLogout,
    viewRefugio,
    setViewRefugio,
    refugiosList,
  } = useAppContext();

  const [menuOpen, setMenuOpen] = useState(false);
  const navDesktopRef = useRef<HTMLDivElement>(null);
  const [pillReady, setPillReady] = useState(false);
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });

  // Posiciona la píldora deslizante bajo la pestaña activa del menú desktop.
  useLayoutEffect(() => {
    const nav = navDesktopRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    if (!active) return;
    setPillStyle({ left: active.offsetLeft, width: active.offsetWidth });
    setPillReady(true);
  }, [activeTab, currentUser]);

  // Guarda de tipos: la cabecera solo se renderiza autenticado.
  if (!currentUser) return null;

  // Presentación del usuario en la franja: clase de color por rol, rótulo legible e
  // iniciales para el avatar.
  const roleClass =
    currentUser.role === "MASTER" ? "master" :
    currentUser.role === "ADMIN" ? "admin" :
    isMedico(currentUser.role) ? "medico" :
    currentUser.role === "VISUALIZADOR" ? "visual" : "";
  const roleLabels: Record<string, string> = {
    MASTER: "Master", ADMIN: "Admin", REGISTRADOR: "Registrador", VISUALIZADOR: "Visualizador",
    AdminMedico: "Admin Médico", OperadorMedico: "Op. Médico", AsistenteMedico: "Asist. Médico",
  };
  const roleLabel = roleLabels[currentUser.role] || currentUser.role;
  const initials = currentUser.nombre.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "U";

  return (
    <>
      {/* Unified App Header */}
      <header className="app-header">

        {/* ── Franja institucional ── */}
        <div className="header-main">
          <div className="header-identity">
            <div className="header-seal" aria-hidden="true">
              <img src="/logo_gob.webp" alt="Escudo Gobernación La Guaira" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div className="header-title-group">
              <span className="header-org-name">GOBERNACIÓN DEL ESTADO LA GUAIRA</span>
              <h1>CAMPAMENTOS TRANSITORIOS</h1>
              <p className="header-tagline">Sistema de Gestión · La Guaira 2026</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="theme-toggle-btn"
            aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {theme === "dark" ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
        </div>

        {/* ── Franja de operación (chips a color, coherente con el reformat) ── */}
        <div className="header-ops">
          <div className="hops-cluster">
            {/* Estado de conexión */}
            <div className={`hops-conn ${isOnline ? "is-online" : "is-offline"}`}>
              <span className="hops-conn__dot" aria-hidden />
              <span className="hops-conn__txt">{isOnline ? "En línea" : "Sin señal"}</span>
              {(pendingCount > 0 || isSyncing) && (
                <span className="hops-conn__pend" title="Registros pendientes por sincronizar">
                  {isSyncing && syncQueueProgress
                    ? <><span className="spinner spinner-sm" /> {syncQueueProgress.done}/{syncQueueProgress.total}</>
                    : <>{pendingCount} pend.</>}
                </span>
              )}
            </div>
            {/* Refugio en vista (solo Master) — nuevo select buscable */}
            {isMaster(currentUser.role) && refugiosList.length > 0 && (
              <div className="hops-refugio" title="Campamento que estás viendo en todo el sistema">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                <SearchableSingleSelect
                  value={viewRefugio}
                  onChange={setViewRefugio}
                  options={refugiosList.map(rf => ({ value: rf.nombre, label: rf.nombre }))}
                  ariaLabel="Campamento activo"
                  placeholder="Campamento…"
                />
              </div>
            )}
          </div>

          {/* Usuario: avatar + nombre + rol + salir */}
          <div className="hops-user">
            <NotificationBell />
            <span className={`hops-avatar hops-avatar--${roleClass || "reg"}`} aria-hidden>{initials}</span>
            <span className="hops-user__meta">
              <span className="hops-user__name">{currentUser.nombre}</span>
              <span className={`hops-role hops-role--${roleClass || "reg"}`}>{roleLabel}</span>
            </span>
            <button type="button" onClick={handleLogout} className="hops-logout" title="Cerrar sesión" aria-label="Cerrar sesión">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span className="hops-logout__txt">Salir</span>
            </button>
          </div>
        </div>

      </header>

      {/* Navigation — Floating Sticky Bubble */}
      <div className="app-nav">
        <div className="nav-desktop-menu" ref={navDesktopRef}>
          {/* Píldora deslizante */}
          <div
            className="nav-pill"
            style={{
              left: pillStyle.left,
              width: pillStyle.width,
              transition: pillReady
                ? "left 0.32s cubic-bezier(0.4,0,0.2,1), width 0.32s cubic-bezier(0.4,0,0.2,1)"
                : "none",
            }}
          />
          {canRegister(currentUser.role) && (
            <button
              type="button"
              data-tab="censo"
              className={`nav-btn ${activeTab === "censo" ? "active" : ""}`}
              onClick={() => setActiveTab("censo")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <span>Registrar</span>
            </button>
          )}
          {canViewDashboard(currentUser.role) && (
            <button
              type="button"
              data-tab="dashboard"
              className={`nav-btn ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span>Estadísticas</span>
            </button>
          )}
          {!isMedico(currentUser.role) && (
            <button
              type="button"
              data-tab="asignaciones"
              className={`nav-btn ${activeTab === "asignaciones" ? "active" : ""}`}
              onClick={() => setActiveTab("asignaciones")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span>Registrados</span>
            </button>
          )}
          {isMaster(currentUser.role) && (
            <button
              type="button"
              data-tab="caracterizacion"
              className={`nav-btn ${activeTab === "caracterizacion" ? "active" : ""}`}
              onClick={() => setActiveTab("caracterizacion")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>
              <span>Caracterización</span>
            </button>
          )}
          {isMaster(currentUser.role) && (
            <button
              type="button"
              data-tab="monitoreo"
              className={`nav-btn ${activeTab === "monitoreo" ? "active" : ""}`}
              onClick={() => setActiveTab("monitoreo")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 9l-5 5-3-3-4 4"/></svg>
              <span>Monitoreo</span>
            </button>
          )}
          {isMaster(currentUser.role) && (
            <button
              type="button"
              data-tab="mapa"
              className={`nav-btn ${activeTab === "mapa" ? "active" : ""}`}
              onClick={() => setActiveTab("mapa")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
              <span>Mapa de calor</span>
            </button>
          )}
          {canManageMorbilidad(currentUser.role) && (
            <button
              type="button"
              data-tab="morbilidad"
              className={`nav-btn ${activeTab === "morbilidad" ? "active" : ""}`}
              onClick={() => setActiveTab("morbilidad")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              <span>Morbilidad</span>
            </button>
          )}
          {canManageMorbilidad(currentUser.role) && (
            <button
              type="button"
              data-tab="balance"
              className={`nav-btn ${activeTab === "balance" ? "active" : ""}`}
              onClick={() => setActiveTab("balance")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <span>Balance</span>
            </button>
          )}
          {canManageMorbilidad(currentUser.role) && (
            <button
              type="button"
              data-tab="historial"
              className={`nav-btn ${activeTab === "historial" ? "active" : ""}`}
              onClick={() => setActiveTab("historial")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 14h2l1-2 2 4 1-2h2"/></svg>
              <span>Historial</span>
            </button>
          )}
          {canManageUsers(currentUser.role) && (
            <button
              type="button"
              data-tab="usuarios"
              className={`nav-btn ${activeTab === "usuarios" ? "active" : ""}`}
              onClick={() => setActiveTab("usuarios")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>Usuarios</span>
            </button>
          )}
          {!isMedico(currentUser.role) && currentUser.role !== "VISUALIZADOR" && (
            <button
              type="button"
              data-tab="config"
              className={`nav-btn ${activeTab === "config" ? "active" : ""}`}
              onClick={() => setActiveTab("config")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M17.66 17.66l-1.41-1.41M6.34 17.66l1.41-1.41"/></svg>
              <span>Configuración</span>
            </button>
          )}
          {!isMedico(currentUser.role) && (
            <a href="/buscar" className="nav-btn nav-btn--buscar" style={{ textDecoration: "none" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>Buscar</span>
            </a>
          )}
        </div>

        <div className="nav-mobile-menu">
          <div className="nav-mobile-primary">
            <span className="nav-mobile-active-tab">
              {activeTab === "censo" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Registrar</>}
              {activeTab === "dashboard" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Estadísticas</>}
              {activeTab === "asignaciones" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> Registrados</>}
              {activeTab === "caracterizacion" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/></svg> Caracterización</>}
              {activeTab === "monitoreo" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 9l-5 5-3-3-4 4"/></svg> Monitoreo</>}
              {activeTab === "mapa" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg> Mapa de calor</>}
              {activeTab === "morbilidad" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> Morbilidad</>}
              {activeTab === "balance" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Balance</>}
              {activeTab === "historial" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 14h2l1-2 2 4 1-2h2"/></svg> Historial</>}
              {activeTab === "usuarios" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Usuarios</>}
              {activeTab === "config" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M17.66 17.66l-1.41-1.41M6.34 17.66l1.41-1.41"/></svg> Configuración</>}
            </span>
            <button
              type="button"
              className={`nav-hamburger ${menuOpen ? "open" : ""}`}
              onClick={() => setMenuOpen(m => !m)}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            >
              <span className="nav-hamburger-line" />
              <span className="nav-hamburger-line" />
              <span className="nav-hamburger-line" />
            </button>
          </div>
          {menuOpen && (
            <div className="nav-mobile-dropdown">
              {canRegister(currentUser.role) && activeTab !== "censo" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("censo"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  Registrar
                </button>
              )}
              {canViewDashboard(currentUser.role) && activeTab !== "dashboard" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("dashboard"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  Estadísticas
                </button>
              )}
              {!isMedico(currentUser.role) && activeTab !== "asignaciones" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("asignaciones"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Registrados
                </button>
              )}
              {isMaster(currentUser.role) && activeTab !== "caracterizacion" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("caracterizacion"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>
                  Caracterización
                </button>
              )}
              {isMaster(currentUser.role) && activeTab !== "monitoreo" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("monitoreo"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 9l-5 5-3-3-4 4"/></svg>
                  Monitoreo
                </button>
              )}
              {isMaster(currentUser.role) && activeTab !== "mapa" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("mapa"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                  Mapa de calor
                </button>
              )}
              {canManageMorbilidad(currentUser.role) && activeTab !== "morbilidad" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("morbilidad"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                  Morbilidad
                </button>
              )}
              {canManageMorbilidad(currentUser.role) && activeTab !== "balance" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("balance"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  Balance
                </button>
              )}
              {canManageMorbilidad(currentUser.role) && activeTab !== "historial" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("historial"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 14h2l1-2 2 4 1-2h2"/></svg>
                  Historial
                </button>
              )}
              {canManageUsers(currentUser.role) && activeTab !== "usuarios" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("usuarios"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Usuarios
                </button>
              )}
              {!isMedico(currentUser.role) && currentUser.role !== "VISUALIZADOR" && activeTab !== "config" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("config"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M17.66 17.66l-1.41-1.41M6.34 17.66l1.41-1.41"/></svg>
                  Configuración
                </button>
              )}
              {!isMedico(currentUser.role) && (
                <a href="/buscar" className="nav-dropdown-item" style={{ textDecoration: "none" }} onClick={() => setMenuOpen(false)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  Buscar Familiar
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
