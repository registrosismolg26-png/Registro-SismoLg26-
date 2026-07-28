"use client";

// ── Select estilizado (sin buscador) ────────────────────────────────────────
// Dropdown personalizado que reemplaza a los <select> nativos con el reformat
// visual del tema. Para pocas opciones (género, período, etc.).
//
// ESCRITORIO: desplegable anclado en un PORTAL (no lo recorta ningún overflow).
// TÁCTIL (teléfono/tablet): se abre como MODAL nativo-like (hoja inferior) vía
// MobileSheet, igual que el selector nativo del móvil pero con nuestros estilos.

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAnchoredRect } from "./useAnchoredRect";
import { useIsMobile } from "./useIsMobile";
import { useBodyScrollLock } from "./useBodyScrollLock";
import MobileSheet from "./MobileSheet";

// `shortLabel` (opcional): etiqueta COMPACTA que se ve solo en el trigger/chip
// cerrado; el menú desplegable siempre muestra `label` (texto completo). Útil para
// abreviar valores largos sin perder claridad al elegir (p. ej. período: "C/12H").
export interface StyledOption { value: string; label: string; shortLabel?: string; }

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: StyledOption[];
  placeholder?: string;
  disabled?: boolean;
  dense?: boolean;
  ariaLabel?: string;
  error?: boolean;
}

const MENU_MARGIN = 6;
const MENU_MAX_H = 300;

export default function StyledSelect({ value, onChange, options, placeholder = "Seleccionar…", disabled = false, dense = false, ariaLabel, error = false }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const isMobile = useIsMobile();
  const rect = useAnchoredRect(open && !isMobile, ref);
  useBodyScrollLock(open && !isMobile && !disabled); // en móvil lo bloquea MobileSheet

  useEffect(() => {
    if (isMobile) return; // en móvil el cierre lo maneja el overlay del MobileSheet
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [isMobile]);

  const current = options.find((o) => o.value === value);

  const choose = (v: string) => { onChange(v); setOpen(false); };

  // ── Escritorio: desplegable anclado ──
  const menuStyle: React.CSSProperties | null = (() => {
    if (!rect || typeof window === "undefined") return null;
    const spaceBelow = window.innerHeight - rect.bottom - MENU_MARGIN;
    const spaceAbove = rect.top - MENU_MARGIN;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(MENU_MAX_H, openUp ? spaceAbove : spaceBelow));
    return {
      position: "fixed",
      left: rect.left,
      width: rect.width,
      right: "auto",
      maxHeight,
      overflowY: "auto",
      zIndex: 4000,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + MENU_MARGIN, top: "auto" }
        : { top: rect.bottom + MENU_MARGIN }),
    };
  })();

  const desktopMenu = open && !isMobile && !disabled && menuStyle ? (
    <ul className="combo-menu" role="listbox" ref={menuRef} style={menuStyle}>
      {options.map((o) => (
        <li
          key={o.value}
          role="option"
          aria-selected={o.value === value}
          className={`combo-menu__item${o.value === value ? " is-active is-selected" : ""}`}
          onMouseDown={(e) => { e.preventDefault(); choose(o.value); }}
        >
          {o.label}
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div className="morb-select" ref={ref}>
      <button
        type="button"
        className={`morb-control morb-select__trigger${dense ? " morb-select__trigger--dense" : ""}${open ? " is-open" : ""}${error ? " has-error" : ""}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      >
        <span className={current ? "" : "morb-select__ph"}>{current ? (current.shortLabel || current.label) : placeholder}</span>
        <span className="morb-select__arrow" aria-hidden>
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" ><path d="m6 9 6 6 6-6"/></svg>
        </span>
      </button>

      {desktopMenu && typeof document !== "undefined" ? createPortal(desktopMenu, document.body) : null}

      {isMobile && (
        <MobileSheet open={open && !disabled} onClose={() => setOpen(false)} title={ariaLabel || placeholder}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`msheet__opt${o.value === value ? " is-selected" : ""}`}
              onClick={() => choose(o.value)}
            >
              <span>{o.label}</span>
              {o.value === value && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginLeft: "auto", color: "var(--color-primary)", flexShrink: 0 }}
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </MobileSheet>
      )}
    </div>
  );
}
