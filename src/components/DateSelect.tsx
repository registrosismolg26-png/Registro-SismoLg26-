"use client";

// ── Selector de fecha (día / mes / año) ─────────────────────────────────────
// Reemplaza el <input type="date"> nativo por tres selectores estilizados
// (StyledSelect) que cumplen el mismo reformat. Emite/recibe yyyy-mm-dd.

import StyledSelect from "./StyledSelect";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

interface Props {
  value: string;                 // yyyy-mm-dd (o "")
  onChange: (ymd: string) => void;
  disabled?: boolean;
  maxYear?: number;              // año máximo seleccionable (por defecto: año actual pasado por prop)
  minYear?: number;              // año mínimo (por defecto 1915)
}

const pad2 = (n: number | string) => String(n).padStart(2, "0");
const daysInMonth = (y: string, m: string) => (y && m ? new Date(Number(y), Number(m), 0).getDate() : 31);

export default function DateSelect({ value, onChange, disabled = false, maxYear, minYear = 1915 }: Props) {
  const [y = "", m = "", d = ""] = value ? value.split("-") : [];
  const topYear = maxYear ?? 2100; // el padre pasa el año actual; fallback alto por si acaso
  const years: string[] = [];
  for (let yy = topYear; yy >= minYear; yy--) years.push(String(yy));
  const dim = daysInMonth(y, m);
  const days = Array.from({ length: dim }, (_, i) => pad2(i + 1));

  const emit = (ny: string, nm: string, nd: string) => {
    if (ny && nm && nd) {
      const dd = Math.min(Number(nd), daysInMonth(ny, nm)); // recorta el día al mes/año
      onChange(`${ny}-${nm}-${pad2(dd)}`);
    } else {
      onChange("");
    }
  };

  return (
    <div className="morb-date">
      <StyledSelect
        dense disabled={disabled} ariaLabel="Día" placeholder="Día"
        value={d}
        onChange={(nd) => emit(y, m, nd)}
        options={[{ value: "", label: "Día" }, ...days.map((dd) => ({ value: dd, label: String(Number(dd)) }))]}
      />
      <StyledSelect
        dense disabled={disabled} ariaLabel="Mes" placeholder="Mes"
        value={m}
        onChange={(nm) => emit(y, nm, d)}
        options={[{ value: "", label: "Mes" }, ...MESES.map((mn, i) => ({ value: pad2(i + 1), label: mn }))]}
      />
      <StyledSelect
        dense disabled={disabled} ariaLabel="Año" placeholder="Año"
        value={y}
        onChange={(ny) => emit(ny, m, d)}
        options={[{ value: "", label: "Año" }, ...years.map((yy) => ({ value: yy, label: yy }))]}
      />
    </div>
  );
}
