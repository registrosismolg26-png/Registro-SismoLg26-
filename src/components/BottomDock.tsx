"use client";

// ── Dock de navegación inferior flotante ─────────────────────────────────────
// Píldora principal con scroll horizontal: icono arriba, label abajo.
// El ítem "Buscar" (href) se separa como botón redondo flotante independiente
// a la derecha del dock.
// Solo visible en móvil (≤768px). AppHeader sigue funcionando en escritorio.

import { useRef, useLayoutEffect, useState } from "react";
import { useAppContext } from "@/context/AppContext";
import { NAV_ITEMS } from "@/components/navItems";

export default function BottomDock() {
  const { currentUser, activeTab, setActiveTab } = useAppContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });
  const [pillReady, setPillReady] = useState(false);

  if (!currentUser) return null;

  // Separar "Buscar" (href) del resto de los ítems de navegación
  const allItems = NAV_ITEMS.filter((it) => it.show(currentUser.role));
  const navItems = allItems.filter((it) => !it.href);
  const searchItem = allItems.find((it) => it.href);

  // Mueve la píldora al botón activo y lo centra en el scroll
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const activeEl = activeRef.current;
    if (!scroll || !activeEl) return;

    setPillStyle({ left: activeEl.offsetLeft, width: activeEl.offsetWidth });
    setPillReady(true);

    // Centra el ítem activo horizontalmente en el scroll
    const scrollLeft =
      activeEl.offsetLeft - scroll.clientWidth / 2 + activeEl.offsetWidth / 2;
    scroll.scrollTo({ left: scrollLeft, behavior: "smooth" });
  }, [activeTab, currentUser]);

  return (
    <div className="bottom-dock-wrapper">
      {/* Píldora principal de navegación con scroll horizontal */}
      <nav className="bottom-dock" aria-label="Navegación principal">
        <div className="bottom-dock__track" ref={scrollRef}>
          {/* Indicador deslizante de pestaña activa */}
          <div
            className="bottom-dock__pill"
            style={{
              left: pillStyle.left,
              width: pillStyle.width,
              transition: pillReady
                ? "left 0.32s cubic-bezier(0.4,0,0.2,1), width 0.32s cubic-bezier(0.4,0,0.2,1)"
                : "none",
            }}
          />

          {navItems.map((it) => {
            const isActive = it.tab === activeTab;
            return (
              <button
                key={it.tab}
                type="button"
                ref={isActive ? activeRef : null}
                className={`bottom-dock__btn${isActive ? " active" : ""}`}
                onClick={() => setActiveTab(it.tab!)}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="bottom-dock__icon">{it.icon}</span>
                <span className="bottom-dock__label">{it.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Botón redondo separado para Buscar */}
      {searchItem && (
        <a
          href={searchItem.href}
          className="bottom-dock-search"
          aria-label={searchItem.label}
          title={searchItem.label}
        >
          {searchItem.icon}
        </a>
      )}
    </div>
  );
}
