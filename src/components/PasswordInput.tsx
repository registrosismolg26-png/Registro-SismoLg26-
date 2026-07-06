"use client";

// ── Input de contraseña con "ojito" (mostrar/ocultar) ───────────────────────
// Reutilizable. Usa la clase pill del sistema (por defecto `morb-control`) para
// integrarse al reformat; el botón del ojo va dentro del control, a la derecha.

import { useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  className?: string;   // clase del input (por defecto morb-control → pill)
  ariaLabel?: string;
  disabled?: boolean;
}

export default function PasswordInput({ value, onChange, placeholder, autoComplete, className = "morb-control", ariaLabel, disabled }: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="pwd-input">
      <input
        type={show ? "text" : "password"}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        disabled={disabled}
      />
      <button
        type="button"
        className="pwd-input__toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        title={show ? "Ocultar" : "Mostrar"}
        tabIndex={-1}
        disabled={disabled}
      >
        {show ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        )}
      </button>
    </div>
  );
}
