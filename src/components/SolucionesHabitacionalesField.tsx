"use client";

import { SOLUCIONES_HABITACIONALES } from "@/lib/constants";

// Selector MÚLTIPLE de solución habitacional (una o varias, mín. 1): chips pill con el patrón
// `.pill-check` del sistema. Lo usan el Censo y la edición en Registrados. La validación del
// mínimo la hace cada formulario (muestra `error`).

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  error?: string;
}

export default function SolucionesHabitacionalesField({ value, onChange, disabled = false, error }: Props) {
  const toggle = (opt: string) => {
    if (disabled) return;
    onChange(
      // Conserva el orden del catálogo (mismo que se guarda y exporta).
      SOLUCIONES_HABITACIONALES.filter((s) => (s === opt ? !value.includes(s) : value.includes(s))),
    );
  };
  return (
    <div className={`soluciones-chips${error ? " has-error" : ""}`} role="group" aria-label="Solución habitacional">
      {SOLUCIONES_HABITACIONALES.map((opt) => {
        const on = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            className={`pill-check pill-check--wrap${on ? " is-on" : ""}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(opt)}
          >
            <span className="pill-check__box" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </span>
            <span className="pill-check__label">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}
