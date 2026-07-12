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
import { isMaster, isMedico } from "@/lib/permissions";
import SearchableSingleSelect from "@/components/SearchableSingleSelect";
import NotificationBell from "@/components/NotificationBell";
import { NAV_ITEMS } from "@/components/navItems";
import MobileSheet from "./MobileSheet";

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
  const [menuClosing, setMenuClosing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const closeMenu = () => {
    setMenuClosing(true);
    setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
    }, 180);
  };
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

  const items = NAV_ITEMS.filter((it) => it.show(currentUser.role));
  const activeItem = NAV_ITEMS.find((it) => it.tab === activeTab);

  // Presentación del usuario en la franja: clase de color por rol, rótulo legible e
  // iniciales para el avatar.
  const roleClass =
    currentUser.role === "MASTER"
      ? "master"
      : currentUser.role === "ADMIN"
        ? "admin"
        : isMedico(currentUser.role)
          ? "medico"
          : currentUser.role === "VISUALIZADOR"
            ? "visual"
            : "";
  const roleLabels: Record<string, string> = {
    MASTER: "Master",
    ADMIN: "Admin",
    REGISTRADOR: "Registrador",
    VISUALIZADOR: "Visualizador",
    AdminMedico: "Admin Médico",
    OperadorMedico: "Op. Médico",
    AsistenteMedico: "Asist. Médico",
  };
  const roleLabel = roleLabels[currentUser.role] || currentUser.role;
  const initials =
    currentUser.nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase() || "U";

  return (
    <>
      {/* Unified App Header */}
      <header className="app-header">
        {/* ── Franja institucional ── */}
        <div className="header-main">
          <div className="header-identity">
            <div className="header-seal" aria-hidden="true">
              <img
                src="/logo_gob.webp"
                alt="Escudo Gobernación La Guaira"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
            <div className="header-title-group">
              <span className="header-org-name">
                GOBERNACIÓN DEL ESTADO LA GUAIRA
              </span>
              <h1>CAMPAMENTOS TRANSITORIOS</h1>
              <p className="header-tagline">
                Sistema de Gestión · La Guaira 2026
              </p>
            </div>
          </div>

          {/* Split Pill Actions (Material Expressive) */}
          <div className="header-actions-group">
            <button
              type="button"
              className="action-btn action-btn--profile"
              onClick={() => setProfileOpen(true)}
              aria-label="Abrir perfil de usuario"
              title="Mi Perfil"
            >
              <span
                className={`small-avatar small-avatar--${roleClass || "reg"}`}
                aria-hidden
              >
                {initials}
              </span>
            </button>
            <NotificationBell />
          </div>
        </div>

        {/* ── Franja de operación (campamento en vista, solo Master) ── */}
        {isMaster(currentUser.role) && refugiosList.length > 0 && (
          <div className="header-ops">
            <div className="hops-cluster">
              <div
                className="hops-refugio"
                title="Campamento que estás viendo en todo el sistema"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M15 22a1 1 0 0 1-1-1v-4a1 1 0 0 1 .445-.832l3-2a1 1 0 0 1 1.11 0l3 2A1 1 0 0 1 22 17v4a1 1 0 0 1-1 1z" />
                  <path d="M18 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 .601.2" />
                  <path d="M18 22v-3" />
                  <circle cx="10" cy="10" r="3" />
                </svg>
                <SearchableSingleSelect
                  value={viewRefugio}
                  onChange={setViewRefugio}
                  options={refugiosList.map((rf) => ({
                    value: rf.nombre,
                    label: rf.nombre,
                  }))}
                  ariaLabel="Campamento activo"
                  placeholder="Campamento…"
                />
              </div>
            </div>
          </div>
        )}

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
          {items.map((it) =>
            it.href ? (
              <a
                key={it.href}
                href={it.href}
                className="nav-btn nav-btn--buscar"
                style={{ textDecoration: "none" }}
              >
                {it.icon}
                <span>{it.label}</span>
              </a>
            ) : (
              <button
                key={it.tab}
                type="button"
                data-tab={it.tab}
                className={`nav-btn ${activeTab === it.tab ? "active" : ""}`}
                onClick={() => setActiveTab(it.tab!)}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            ),
          )}
        </div>

        <div className="nav-mobile-menu">
          <div className="nav-mobile-primary">
            <span className="nav-mobile-active-tab">
              {activeItem && (
                <>
                  {activeItem.icon}
                  <span>{activeItem.label}</span>
                </>
              )}
            </span>
            <button
              type="button"
              className={`nav-hamburger ${menuOpen ? "open" : ""}`}
              onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            >
              <span className="nav-hamburger-line" />
              <span className="nav-hamburger-line" />
              <span className="nav-hamburger-line" />
            </button>
          </div>
          {(menuOpen || menuClosing) && (
            <div
              className={`nav-mobile-dropdown${menuClosing ? " is-closing" : ""}`}
            >
              {items.map((it) => {
                if (it.tab === activeTab) return null;
                return it.href ? (
                  <a
                    key={it.href}
                    href={it.href}
                    className="nav-dropdown-item"
                    style={{ textDecoration: "none" }}
                    onClick={() => closeMenu()}
                  >
                    {it.icon}
                    <span>{it.label}</span>
                  </a>
                ) : (
                  <button
                    key={it.tab}
                    type="button"
                    className="nav-dropdown-item"
                    onClick={() => {
                      setActiveTab(it.tab!);
                      closeMenu();
                    }}
                  >
                    {it.icon}
                    <span>{it.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Profile/Settings Sheet */}
      <MobileSheet
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Mi Perfil"
        className="profile-sheet-modal"
      >
        <div className="profile-sheet-content">
          {/* Header section: Avatar + User Info */}
          <div className="profile-sheet-header">
            <div
              className={`profile-sheet-avatar profile-sheet-avatar--${roleClass || "reg"}`}
            >
              {initials}
            </div>
            <div className="profile-sheet-info">
              <h3>{currentUser.nombre}</h3>
              <span className={`hops-role hops-role--${roleClass || "reg"}`}>
                {roleLabel}
              </span>
            </div>
          </div>

          {/* Middle Section: Settings / Theme Toggle */}
          <div className="profile-sheet-settings">
            <button
              type="button"
              className="profile-sheet-btn profile-sheet-btn--theme"
              onClick={() => {
                toggleTheme();
              }}
            >
              <div className="profile-sheet-btn-left">
                {theme === "dark" ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
                <span>Tema</span>
              </div>
              <span className="theme-status-text">
                {theme === "dark" ? "Oscuro" : "Claro"}
              </span>
            </button>
          </div>

          {/* Footer Section: Logout button */}
          <div className="profile-sheet-footer">
            <button
              type="button"
              className="profile-sheet-btn profile-sheet-btn--logout"
              onClick={() => {
                setProfileOpen(false);
                handleLogout();
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </MobileSheet>
    </>
  );
}
