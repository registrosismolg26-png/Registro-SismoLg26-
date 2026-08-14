"use client";

import React from "react";

interface Props {
  value: string;                        // string YA formateado ("52.000.055,55") o "" (vacío)
  onChange: (value: string) => void;    // emite el string formateado (o "" si vacío)
  readOnly?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  maxDigits?: number;                   // tope de dígitos totales (incluye los 2 decimales)
}

// Inserta el punto de miles cada 3 dígitos desde la derecha: "52000055" → "52.000.055".
const groupThousands = (intStr: string) => intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
function formatUnits(units: number): string {
  const whole = Math.floor(units / 100);
  const cents = units % 100;
  return `${groupThousands(String(whole))},${String(cents).padStart(2, "0")}`;
}

// ── Entrada POS de MONTO (formato bancario venezolano ##.###,##) ─────────────
// PUNTO = separador de miles, COMA = separador decimal. Estilo cajero/POS: los
// dígitos entran por la DERECHA con 2 decimales FIJOS (teclear 1,0,0,0,0 → "100,00";
// 5,2,0,0,0,0,0,5,5,5 → "52.000.055,55"). Imposible poner la coma en el lugar
// equivocado. Se basa en el evento `input` (no keydown) → funciona en móvil.
// Emite el string YA formateado; para operar numéricamente, quitar puntos y cambiar
// la coma por punto (ver parseMoneyVE en el consumidor).
export function PosMoneyInput({
  value, onChange, readOnly = false, disabled = false,
  placeholder = "0,00", className, ariaLabel, maxDigits = 13,
}: Props) {
  const units = parseInt(String(value ?? "").replace(/\D/g, "") || "0", 10); // total en céntimos
  const display = value ? formatUnits(units) : "";

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly || disabled) return;
    const digits = e.target.value.replace(/\D/g, "").slice(0, maxDigits);
    const u = parseInt(digits || "0", 10);
    onChange(u <= 0 ? "" : formatUnits(u));
  };

  return (
    <input
      className={className}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={display}
      placeholder={placeholder}
      readOnly={readOnly}
      disabled={disabled}
      onChange={handleInput}
      aria-label={ariaLabel}
    />
  );
}
