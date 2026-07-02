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

export default function AppHeader() {
  const {
    currentUser,
    isPowerAdmin,
    activeTab,
    setActiveTab,
    theme,
    toggleTheme,
    isOnline,
    isSyncing,
    syncQueueProgress,
    pendingCount,
    handleLogout,
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
              <h1>REGISTRO DE AFECTADOS</h1>
              <p className="header-tagline">Sistema de Censo Sismológico · Venezuela 2026</p>
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

        {/* ── Franja de operación ── */}
        <div className="header-ops">
          <div className="header-ops-status">
            <span className={`status-dot ${isOnline ? "online" : "offline"}`}></span>
            <span className="header-conn">{isOnline ? "En línea" : "Sin señal"}</span>
            {(pendingCount > 0 || isSyncing) && (
              <span className="queue-badge">
                {isSyncing && syncQueueProgress
                  ? <><span className="spinner spinner-sm"></span> {syncQueueProgress.done}/{syncQueueProgress.total}</>
                  : `${pendingCount} pend.`
                }
              </span>
            )}
          </div>
          <div className="header-ops-user">
            <span className="header-operator">{currentUser.nombre}</span>
            <span className={`role-badge ${currentUser.role === "ADMIN" ? "admin" : ""}`}>{currentUser.role}</span>
            <button type="button" onClick={handleLogout} className="logout-btn" title="Cerrar sesión">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Salir
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
          {currentUser.role !== "VISUALIZADOR" && (
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
          {(currentUser.role === "ADMIN" || currentUser.role === "VISUALIZADOR") && (
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
          <button
            type="button"
            data-tab="asignaciones"
            className={`nav-btn ${activeTab === "asignaciones" ? "active" : ""}`}
            onClick={() => setActiveTab("asignaciones")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span>Registrados</span>
          </button>
          {isPowerAdmin && (
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
          {currentUser.role !== "VISUALIZADOR" && (
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
          <a href="/buscar" className="nav-btn nav-btn--buscar" style={{ textDecoration: "none" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Buscar</span>
          </a>
        </div>

        <div className="nav-mobile-menu">
          <div className="nav-mobile-primary">
            <span className="nav-mobile-active-tab">
              {activeTab === "censo" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Registrar</>}
              {activeTab === "dashboard" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Estadísticas</>}
              {activeTab === "asignaciones" && <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> Registrados</>}
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
              {currentUser.role !== "VISUALIZADOR" && activeTab !== "censo" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("censo"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  Registrar
                </button>
              )}
              {(currentUser.role === "ADMIN" || currentUser.role === "VISUALIZADOR") && activeTab !== "dashboard" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("dashboard"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  Estadísticas
                </button>
              )}
              {activeTab !== "asignaciones" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("asignaciones"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Registrados
                </button>
              )}
              {isPowerAdmin && activeTab !== "usuarios" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("usuarios"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Usuarios
                </button>
              )}
              {currentUser.role !== "VISUALIZADOR" && activeTab !== "config" && (
                <button type="button" className="nav-dropdown-item" onClick={() => { setActiveTab("config"); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M17.66 17.66l-1.41-1.41M6.34 17.66l1.41-1.41"/></svg>
                  Configuración
                </button>
              )}
              <a href="/buscar" className="nav-dropdown-item" style={{ textDecoration: "none" }} onClick={() => setMenuOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Buscar Familiar
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
