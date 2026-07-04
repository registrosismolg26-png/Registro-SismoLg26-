"use client";

// ── Selector con buscador (combobox) ────────────────────────────────────────
// Input que filtra opciones al escribir + lista desplegable. Pensado para
// catálogos largos (cientos de patologías/medicamentos), responsive (ordenador
// y teléfono) y táctil. Es un control de "agregar": al elegir, dispara onSelect
// y limpia el texto para permitir agregar varios seguidos. Reutiliza las clases
// de tema `custom-select-options` / `custom-select-option` de globals.css.

import { useState, useRef, useEffect, useMemo } from "react";

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
}

export default function SearchableSelect({
  options,
  onSelect,
  placeholder = "Buscar…",
  disabled = false,
  emptyText = "Sin resultados",
  maxRender = 80,
  inputClassName = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
    setOpen(true); // permanece abierto para agregar varios
    inputRef.current?.focus();
  };

  return (
    <div className="searchable-select" ref={ref} style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        type="text"
        className={inputClassName}
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
      {open && !disabled && (
        <ul className="custom-select-options" role="listbox">
          {filtered.items.length === 0 ? (
            <li className="custom-select-option" style={{ opacity: 0.6, cursor: "default" }}>{emptyText}</li>
          ) : (
            <>
              {filtered.items.map((o, i) => (
                <li
                  key={o.value}
                  className={`custom-select-option ${i === highlight ? "selected" : ""}`}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(o.value)}
                >
                  {o.label}
                </li>
              ))}
              {filtered.total > filtered.items.length && (
                <li className="custom-select-option" style={{ opacity: 0.6, cursor: "default", fontStyle: "italic" }}>
                  +{filtered.total - filtered.items.length} más… escribe para filtrar
                </li>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
