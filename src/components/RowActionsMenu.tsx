"use client";

// ── Menú de acciones de fila (dropdown) ─────────────────────────────────────
// Un solo botón "⋮" por fila que abre un menú con las acciones contextuales, en vez
// de una botonera que se amontona cuando hay muchas. ESCRITORIO: portal anclado
// (useAnchoredRect) para que no lo recorte el overflow de la tabla, con volteo arriba
// si no cabe abajo + cierre por click-afuera/Esc. TÁCTIL: hoja inferior (MobileSheet).

import { useState, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAnchoredRect } from "./useAnchoredRect";
import { useIsMobile } from "./useIsMobile";
import MobileSheet from "./MobileSheet";

export interface RowAction {
  key: string;
  label: string;
  icon: ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger" | "neutral";
  onClick: () => void;
}

export default function RowActionsMenu({ actions, title = "Acciones" }: {
  actions: RowAction[];
  title?: string; // encabezado de la hoja móvil (p. ej. el nombre del jefe)
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const rect = useAnchoredRect(open && !isMobile, triggerRef);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open || isMobile) return;
    const onDown = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown, true); window.removeEventListener("keydown", onKey); };
  }, [open, isMobile]);

  const run = (a: RowAction) => { close(); a.onClick(); };

  const list = (
    <div className="rowmenu__list" role="menu">
      {actions.map((a) => (
        <button key={a.key} type="button" role="menuitem" className={`rowmenu__item rowmenu__item--${a.tone || "default"}`} onClick={() => run(a)}>
          <span className="rowmenu__icon">{a.icon}</span>
          <span className="rowmenu__label">{a.label}</span>
        </button>
      ))}
    </div>
  );

  // Posición del portal (escritorio): alineado a la derecha del disparador, volteando
  // arriba si no cabe abajo. Alto estimado por nº de ítems (evita medir en 2 pasos).
  let portal: ReactNode = null;
  if (open && !isMobile && rect) {
    const W = 216;
    const estH = actions.length * 42 + 12;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const openUp = rect.bottom + 6 + estH > vh && rect.top - estH - 6 > 8;
    const top = openUp ? Math.max(8, rect.top - 6 - estH) : rect.bottom + 6;
    const left = Math.max(8, rect.left + rect.width - W);
    portal = createPortal(
      <div ref={menuRef} className="rowmenu__portal" style={{ position: "fixed", top, left, width: W, zIndex: 5000 }}>
        {list}
      </div>,
      document.body,
    );
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="btn-ver rowmenu__trigger" aria-label="Acciones" aria-haspopup="menu" aria-expanded={open} data-tip="Acciones" onClick={() => setOpen((v) => !v)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
      </button>
      {isMobile ? (
        <MobileSheet open={open} onClose={close} title={title} className="rowmenu__sheet">{list}</MobileSheet>
      ) : portal}
    </>
  );
}
