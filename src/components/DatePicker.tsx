"use client";

// ── Date picker (un solo control) ───────────────────────────────────────────
// Un único campo estilizado que abre un calendario emergente moderno. Reemplaza
// al <input type="date"> nativo. Emite/recibe yyyy-mm-dd. Pensado para fecha de
// nacimiento: permite saltar de año rápido y no deja elegir fechas futuras.

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAnchoredRect } from "./useAnchoredRect";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DOW = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const DP_W = 300;      // ancho del calendario (coincide con globals.css)
const DP_MARGIN = 6;

interface Props {
  value: string;                 // yyyy-mm-dd (o "")
  onChange: (ymd: string) => void;
  disabled?: boolean;
  minYear?: number;
  placeholder?: string;
  error?: boolean;
}

export default function DatePicker({ value, onChange, disabled = false, minYear = 1915, placeholder = "Seleccionar fecha…", error = false }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "years">("days");
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const rect = useAnchoredRect(open, ref);

  const today = new Date();
  const maxYear = today.getFullYear();
  const sel = value ? { y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) - 1, d: Number(value.slice(8, 10)) } : null;

  const [viewY, setViewY] = useState(sel ? sel.y : maxYear - 20);
  const [viewM, setViewM] = useState(sel ? sel.m : 0);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false); setView("days");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Al abrir, posiciona la vista en la fecha seleccionada (o ~20 años atrás).
  const openPicker = () => {
    if (disabled) return;
    if (sel) { setViewY(sel.y); setViewM(sel.m); }
    setView("days");
    setOpen((o) => !o);
  };

  const label = sel ? `${pad2(sel.d)}/${pad2(sel.m + 1)}/${sel.y}` : "";

  const stepMonth = (delta: number) => {
    let m = viewM + delta, y = viewY;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    if (y < minYear) { y = minYear; m = 0; }
    if (y > maxYear) { y = maxYear; m = 11; }
    setViewM(m); setViewY(y);
  };

  const pick = (day: number) => {
    onChange(`${viewY}-${pad2(viewM + 1)}-${pad2(day)}`);
    setOpen(false);
    setView("days");
  };

  const firstDow = (new Date(viewY, viewM, 1).getDay() + 6) % 7; // 0 = lunes
  const dim = new Date(viewY, viewM + 1, 0).getDate();           // días del mes
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  const isFuture = (day: number) => new Date(viewY, viewM, day) > today;

  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);

  // Posición del calendario (fixed, en portal) con volteo y clamping horizontal.
  const popStyle: React.CSSProperties | null = (() => {
    if (!rect || typeof window === "undefined") return null;
    const w = Math.min(DP_W, window.innerWidth * 0.92);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    const spaceBelow = window.innerHeight - rect.bottom - DP_MARGIN;
    const spaceAbove = rect.top - DP_MARGIN;
    const openUp = spaceBelow < 320 && spaceAbove > spaceBelow;
    return {
      position: "fixed",
      left,
      width: w,
      zIndex: 4000,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + DP_MARGIN, top: "auto" }
        : { top: rect.bottom + DP_MARGIN }),
    };
  })();

  const popup = open && !disabled && popStyle ? (
    <div className="morb-datepicker" role="dialog" ref={popRef} style={popStyle}>
      <div className="morb-dp__head">
            <button type="button" className="morb-dp__nav" aria-label="Mes anterior" onClick={() => stepMonth(-1)}>‹</button>
            <button type="button" className="morb-dp__title" onClick={() => setView((v) => (v === "days" ? "years" : "days"))}>
              {view === "days" ? `${MESES[viewM]} ${viewY}` : "Elegir año"}
            </button>
            <button type="button" className="morb-dp__nav" aria-label="Mes siguiente" onClick={() => stepMonth(1)}>›</button>
          </div>

          {view === "days" ? (
            <>
              <div className="morb-dp__grid">
                {DOW.map((d) => <div key={d} className="morb-dp__dow">{d}</div>)}
                {cells.map((c, i) => c === null ? (
                  <span key={`e${i}`} className="morb-dp__day morb-dp__day--empty" />
                ) : (
                  <button
                    key={c}
                    type="button"
                    disabled={isFuture(c)}
                    className={`morb-dp__day${sel && sel.y === viewY && sel.m === viewM && sel.d === c ? " is-selected" : ""}`}
                    onClick={() => pick(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="morb-dp__years">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={`morb-dp__year${sel && sel.y === y ? " is-selected" : ""}`}
                  onClick={() => { setViewY(y); setView("days"); }}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
    </div>
  ) : null;

  return (
    <div className="morb-select" ref={ref}>
      <button
        type="button"
        className={`morb-control morb-select__trigger${open ? " is-open" : ""}${error ? " has-error" : ""}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
      >
        <span className={label ? "" : "morb-select__ph"}>{label || placeholder}</span>
        <span className="morb-select__arrow" aria-hidden>▾</span>
      </button>
      {popup && typeof document !== "undefined" ? createPortal(popup, document.body) : null}
    </div>
  );
}
