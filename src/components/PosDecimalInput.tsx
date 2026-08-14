"use client";

import React from "react";

interface Props {
  value: string;                        // valor numérico como string ("1.8", "37.5", "" = vacío)
  onChange: (value: string) => void;    // emite "1.80" (fijo a `decimals`) o "" si vacío
  decimals?: number;                    // decimales FIJOS (talla=2, temperatura=1)
  readOnly?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  maxDigits?: number;                   // tope de dígitos (evita valores absurdos)
}

// ── Entrada estilo "POS / cajero bancario" ──────────────────────────────────
// Los dígitos entran por la DERECHA y el punto decimal queda FIJO: teclear
// 1,8,0 con decimals=2 → "1.80". Imposible poner la coma en el lugar equivocado
// (p. ej. escribir 180 en vez de 1.80). Funciona en desktop y móvil porque se
// basa en el evento `input` (no en keydown): en cada cambio se extraen SOLO los
// dígitos y se reformatea. El valor guardado sigue siendo numérico ("1.80").
export function PosDecimalInput({
  value, onChange, decimals = 2, readOnly = false, disabled = false,
  placeholder, className, ariaLabel, maxDigits = 9,
}: Props) {
  const factor = 10 ** decimals;

  // "unidades" = el número SIN punto (1.80 → 180). Vacío/no numérico → 0.
  const unitsFromValue = (): number => {
    const n = parseFloat(String(value ?? "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * factor) : 0;
  };
  const units = unitsFromValue();
  const display = value === "" || value == null ? "" : (units / factor).toFixed(decimals);

  const emit = (u: number) => {
    const capped = Math.min(u, 10 ** maxDigits - 1);
    onChange(capped <= 0 ? "" : (capped / factor).toFixed(decimals));
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly || disabled) return;
    const digits = e.target.value.replace(/\D/g, "").slice(0, maxDigits);
    emit(parseInt(digits || "0", 10));
  };

  return (
    <input
      className={className}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={display}
      placeholder={placeholder ?? (0).toFixed(decimals)}
      readOnly={readOnly}
      disabled={disabled}
      onChange={handleInput}
      aria-label={ariaLabel}
    />
  );
}
