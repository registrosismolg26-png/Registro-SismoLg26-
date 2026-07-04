"use client";

// ── Select estilizado (sin buscador) ────────────────────────────────────────
// Dropdown personalizado que reemplaza a los <select> nativos para que cumplan
// el mismo reformat visual (trigger + lista con las clases del tema). Para pocas
// opciones (género, período). Variante `dense` para las filas de medicamento.

import { useState, useRef, useEffect } from "react";

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

export default function StyledSelect({ value, onChange, options, placeholder = "Seleccionar…", disabled = false, dense = false, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = options.find((o) => o.value === value);

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
      {open && !disabled && (
        <ul className="combo-menu" role="listbox">
          {options.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`combo-menu__item${o.value === value ? " is-active is-selected" : ""}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
