"use client";

// ── Selector con buscador (combobox) ────────────────────────────────────────
// Input que filtra opciones al escribir + lista desplegable. Pensado para
// catálogos largos (cientos de patologías/medicamentos), responsive (ordenador
// y teléfono) y táctil. Es un control de "agregar": al elegir, dispara onSelect
// y limpia el texto para permitir agregar varios seguidos.
//
// El menú se renderiza en un PORTAL (document.body) con posición `fixed` calculada
// desde el rect del input, para que NUNCA lo recorte un contenedor con
// overflow:hidden/auto (p. ej. el `.conditional-wrapper` del censo o un modal con
// scroll). Se reubica solo con voltear arriba/abajo según el espacio disponible.

import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAnchoredRect } from "./useAnchoredRect";

export interface SearchableOption {
  value: string;
  label: string;
}

interface Props {
  options: SearchableOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
  maxRender?: number; // tope de opciones renderizadas (perf con listas enormes)
  inputClassName?: string; // clase del input (p.ej. "morb-control" para sincronizar tamaño)
  error?: boolean; // marca el input con borde de error
}

const MENU_MARGIN = 6;
const MENU_MAX_H = 320;

export default function SearchableSelect({
  options,
  onSelect,
  placeholder = "Buscar…",
  disabled = false,
  emptyText = "Sin resultados",
  maxRender = 80,
  inputClassName = "",
  error = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const rect = useAnchoredRect(open, ref);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      // El menú vive en un portal fuera de `ref`: hay que excluirlo también.
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
    return { items: list.slice(0, maxRender), total: list.length };
  }, [options, query, maxRender]);

  const choose = (value: string) => {
    onSelect(value);
    setQuery("");
    setHighlight(0);
    setOpen(false); // se cierra al elegir; para agregar otro, se enfoca de nuevo (reabre al escribir/enfocar)
    inputRef.current?.blur();
  };

  // Posición del menú (fixed) con volteo arriba/abajo según espacio disponible.
  const menuStyle: React.CSSProperties | null = (() => {
    if (!rect || typeof window === "undefined") return null;
    const spaceBelow = window.innerHeight - rect.bottom - MENU_MARGIN;
    const spaceAbove = rect.top - MENU_MARGIN;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
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
      {filtered.items.length === 0 ? (
        <li className="combo-menu__item combo-menu__item--muted">{emptyText}</li>
      ) : (
        <>
          {filtered.items.map((o, i) => (
            <li
              key={o.value}
              className={`combo-menu__item ${i === highlight ? "is-active" : ""}`}
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              // onMouseDown evita que el blur del input cierre el menú antes del click
              onMouseDown={(e) => { e.preventDefault(); choose(o.value); }}
            >
              {o.label}
            </li>
          ))}
          {filtered.total > filtered.items.length && (
            <li className="combo-menu__item combo-menu__item--muted">
              +{filtered.total - filtered.items.length} más… escribe para filtrar
            </li>
          )}
        </>
      )}
    </ul>
  ) : null;

  return (
    <div className="searchable-select" ref={ref} style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        type="text"
        className={`${inputClassName}${error ? " has-error" : ""}`.trim()}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlight(h => Math.min(h + 1, filtered.items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); const it = filtered.items[highlight]; if (open && it) choose(it.value); }
          else if (e.key === "Escape") { setOpen(false); }
        }}
        style={{ width: "100%" }}
      />
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}
