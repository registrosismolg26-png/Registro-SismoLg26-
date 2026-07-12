"use client";

// ── Selector ÚNICO con buscador (single-value) ──────────────────────────────
// A diferencia de SearchableSelect (estilo "agregar" para listas), este muestra
// el valor ELEGIDO dentro del propio control (no como píldora aparte) y permite
// cambiarlo buscando. Pensado para campos de una sola opción con catálogo largo
// (p. ej. la habitación/cuarto del refugio). Incluye una opción para limpiar.
//
// ESCRITORIO: panel anclado (portal) con buscador arriba + lista.
// TÁCTIL: MODAL nativo-like (hoja) con buscador pegado arriba + lista.

import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAnchoredRect } from "./useAnchoredRect";
import { useIsMobile } from "./useIsMobile";
import { useBodyScrollLock } from "./useBodyScrollLock";
import MobileSheet from "./MobileSheet";
import { normalizeText } from "@/lib/helpers";

export interface SingleOption { value: string; label: string; }

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SingleOption[];
  placeholder?: string;      // texto del trigger cuando no hay selección
  searchPlaceholder?: string;
  clearLabel?: string;       // fila para limpiar la selección ("" ). null = sin fila
  emptyText?: string;
  disabled?: boolean;
  ariaLabel?: string;
  error?: boolean;
  maxRender?: number;
}

const MENU_MARGIN = 6;
const PANEL_MAX_H = 340;

export default function SearchableSingleSelect({
  value,
  onChange,
  options,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  clearLabel = "— Sin selección —",
  emptyText = "Sin resultados",
  disabled = false,
  ariaLabel,
  error = false,
  maxRender = 80,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const rect = useAnchoredRect(open && !isMobile, ref);
  useBodyScrollLock(open && !isMobile);

  useEffect(() => {
    if (isMobile) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [isMobile]);

  // Autofoco del buscador SOLO en escritorio. En MÓVIL no se enfoca al abrir: así no
  // salta el teclado tapando la lista — el teclado abre solo si el usuario toca el input.
  useEffect(() => {
    if (!open || isMobile) return;
    const t = setTimeout(() => searchRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open, isMobile]);

  const current = options.find((o) => o.value === value) || null;

  const filtered = useMemo(() => {
    const q = normalizeText(query.trim());
    const list = q ? options.filter(o => normalizeText(o.label).includes(q)) : options;
    return { items: list.slice(0, maxRender), total: list.length };
  }, [options, query, maxRender]);

  const openMenu = () => { if (!disabled) { setOpen(true); setQuery(""); setHighlight(0); } };
  const choose = (v: string) => { onChange(v); setOpen(false); setQuery(""); };
  const clear = () => { onChange(""); setOpen(false); setQuery(""); };

  const rows = (variant: "desk" | "sheet") => {
    const itemClass = variant === "desk" ? "combo-menu__item combo-row-btn" : "msheet__opt";
    return (
      <>
        {clearLabel !== null && (
          <button
            type="button"
            className={`${itemClass} ${variant === "desk" ? "combo-menu__item--muted" : "msheet__opt--clear"}`}
            onMouseDown={variant === "desk" ? (e) => { e.preventDefault(); clear(); } : undefined}
            onClick={variant === "sheet" ? clear : undefined}
          >
            {clearLabel}
          </button>
        )}
        {filtered.items.length === 0 ? (
          <div className={`${variant === "desk" ? "combo-menu__item combo-menu__item--muted" : "msheet__opt msheet__opt--muted"}`}>{emptyText}</div>
        ) : (
          <>
            {filtered.items.map((o, i) => {
              const selected = o.value === value;
              const active = variant === "desk" && i === highlight;
              return (
                <button
                  key={o.value}
                  type="button"
                  className={`${itemClass}${selected ? " is-selected" : ""}${(selected || active) ? " is-active" : ""}`}
                  onMouseEnter={variant === "desk" ? () => setHighlight(i) : undefined}
                  onMouseDown={variant === "desk" ? (e) => { e.preventDefault(); choose(o.value); } : undefined}
                  onClick={variant === "sheet" ? () => choose(o.value) : undefined}
                >
                  <span>{o.label}</span>
                  {variant === "sheet" && selected && (
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
              );
            })}
            {filtered.total > filtered.items.length && (
              <div className={`${variant === "desk" ? "combo-menu__item combo-menu__item--muted" : "msheet__opt msheet__opt--muted"}`}>
                +{filtered.total - filtered.items.length} más… escribe para filtrar
              </div>
            )}
          </>
        )}
      </>
    );
  };

  // ── Escritorio: panel anclado (portal) ──
  const panelStyle: React.CSSProperties | null = (() => {
    if (!rect || typeof window === "undefined") return null;
    const spaceBelow = window.innerHeight - rect.bottom - MENU_MARGIN;
    const spaceAbove = rect.top - MENU_MARGIN;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(PANEL_MAX_H, openUp ? spaceAbove : spaceBelow));
    return {
      position: "fixed",
      left: rect.left,
      width: rect.width,
      right: "auto",
      maxHeight,
      zIndex: 4000,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + MENU_MARGIN, top: "auto" }
        : { top: rect.bottom + MENU_MARGIN }),
    };
  })();

  const desktopPanel = open && !isMobile && !disabled && panelStyle ? (
    <div className="combo-panel" ref={panelRef} style={panelStyle} role="dialog">
      <div className="combo-panel__search">
        <input
          ref={searchRef}
          type="text"
          value={query}
          placeholder={searchPlaceholder}
          onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.items.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); const it = filtered.items[highlight]; if (it) choose(it.value); }
            else if (e.key === "Escape") { setOpen(false); }
          }}
        />
      </div>
      <div className="combo-panel__list">{rows("desk")}</div>
    </div>
  ) : null;

  return (
    <div className="morb-select" ref={ref}>
      <button
        type="button"
        className={`morb-control morb-select__trigger${open ? " is-open" : ""}${error ? " has-error" : ""}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      >
        <span className={current ? "" : "morb-select__ph"}>{current ? current.label : placeholder}</span>
        <span className="morb-select__arrow" aria-hidden>
<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" ><path d="m6 9 6 6 6-6"/></svg>
        </span>
      </button>

      {desktopPanel && typeof document !== "undefined" ? createPortal(desktopPanel, document.body) : null}

      {isMobile && (
        <MobileSheet
          open={open && !disabled}
          onClose={() => { setOpen(false); setQuery(""); }}
          title={ariaLabel || placeholder}
          fullHeight
          search={
            <input
              ref={sheetInputRef}
              type="text"
              inputMode="search"
              value={query}
              placeholder={searchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
            />
          }
        >
          {rows("sheet")}
        </MobileSheet>
      )}
    </div>
  );
}
