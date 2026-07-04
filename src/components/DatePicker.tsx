"use client";

// ── Date picker (un solo control) ───────────────────────────────────────────
// Un único campo estilizado que abre un calendario emergente moderno. Reemplaza
// al <input type="date"> nativo. Emite/recibe yyyy-mm-dd. Pensado para fecha de
// nacimiento: permite saltar de año rápido y no deja elegir fechas futuras.

import { useState, useRef, useEffect } from "react";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DOW = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
const pad2 = (n: number) => String(n).padStart(2, "0");

interface Props {
  value: string;                 // yyyy-mm-dd (o "")
  onChange: (ymd: string) => void;
  disabled?: boolean;
  minYear?: number;
  placeholder?: string;
}

export default function DatePicker({ value, onChange, disabled = false, minYear = 1915, placeholder = "Seleccionar fecha…" }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "years">("days");
  const ref = useRef<HTMLDivElement>(null);

  const today = new Date();
  const maxYear = today.getFullYear();
  const sel = value ? { y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) - 1, d: Number(value.slice(8, 10)) } : null;

  const [viewY, setViewY] = useState(sel ? sel.y : maxYear - 20);
  const [viewM, setViewM] = useState(sel ? sel.m : 0);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setView("days"); } };
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

  return (
    <div className="morb-select" ref={ref}>
      <button
        type="button"
        className={`morb-control morb-select__trigger${open ? " is-open" : ""}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
      >
        <span className={label ? "" : "morb-select__ph"}>{label || placeholder}</span>
        <span className="morb-select__arrow" aria-hidden>▾</span>
      </button>

      {open && !disabled && (
        <div className="morb-datepicker" role="dialog">
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
      )}
    </div>
  );
}
