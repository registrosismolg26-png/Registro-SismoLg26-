"use client";

// ── Select estilizado (sin buscador) ────────────────────────────────────────
// Dropdown personalizado que reemplaza a los <select> nativos para que cumplan
// el mismo reformat visual (trigger + lista con las clases del tema). Para pocas
// opciones (género, período). Variante `dense` para las filas de medicamento.
//
// El menú se renderiza en un PORTAL con posición `fixed` para que no lo recorte
// ningún contenedor con overflow:hidden/auto (modal de asignaciones, wrapper del
// censo, etc.). Ver `useAnchoredRect`.

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAnchoredRect } from "./useAnchoredRect";

export interface StyledOption { value: string; label: string; }

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: StyledOption[];
  placeholder?: string;
  disabled?: boolean;
  dense?: boolean;
  ariaLabel?: string;
}

const MENU_MARGIN = 6;
const MENU_MAX_H = 300;

export default function StyledSelect({ value, onChange, options, placeholder = "Seleccionar…", disabled = false, dense = false, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const rect = useAnchoredRect(open, ref);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = options.find((o) => o.value === value);

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

  const menu = open && !disabled && menuStyle ? (
    <ul className="combo-menu" role="listbox" ref={menuRef} style={menuStyle}>
      {options.map((o) => (
        <li
          key={o.value}
          role="option"
          aria-selected={o.value === value}
          className={`combo-menu__item${o.value === value ? " is-active is-selected" : ""}`}
          onMouseDown={(e) => { e.preventDefault(); onChange(o.value); setOpen(false); }}
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
        className={`morb-control morb-select__trigger${dense ? " morb-select__trigger--dense" : ""}${open ? " is-open" : ""}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      >
        <span className={current ? "" : "morb-select__ph"}>{current ? current.label : placeholder}</span>
        <span className="morb-select__arrow" aria-hidden>▾</span>
      </button>
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}
