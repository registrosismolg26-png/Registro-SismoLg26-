"use client";

// ── Modal de código de verificación (OTP por correo) ────────────────────────
// El padre lo renderiza cuando el backend responde 403 CODE_REQUIRED. El usuario
// ingresa los 6 dígitos que llegaron a su correo; al "Verificar", el padre reenvía
// la MISMA acción con { challengeId, code }. "Reenviar" pide un código nuevo.
// Todo pill (dentro de .pill-form). El padre controla el montaje (render condicional).

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/apiFetch";

interface Props {
  email: string;                              // a quién se envió (el propio usuario)
  purpose: "USER_MUTATION" | "PASSWORD_CHANGE";
  verifying?: boolean;                        // el padre está verificando
  error?: string | null;                      // error a mostrar (código inválido…)
  onVerify: (code: string) => void;           // el padre reenvía la acción con el código
  onCancel: () => void;
  onResent?: (challengeId: string) => void;   // tras reenviar, el padre actualiza el challengeId
  showToast?: (m: string, t: "success" | "error" | "info" | "warning") => void;
}

export default function OtpModal({ email, purpose, verifying, error, onVerify, onCancel, onResent, showToast }: Props) {
  const [code, setCode] = useState("");
  const [resending, setResending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 80); return () => clearTimeout(t); }, []);

  const submit = () => { if (/^\d{6}$/.test(code) && !verifying) onVerify(code); };

  const resend = async () => {
    if (resending || verifying) return;
    setResending(true);
    try {
      const res = await apiFetch("/api/auth/otp/request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.challengeId) { onResent?.(d.challengeId); setCode(""); showToast?.("Te enviamos un código nuevo.", "success"); }
      else showToast?.(d.error || "No se pudo reenviar el código.", "error");
    } catch { showToast?.("Error de red al reenviar.", "error"); }
    finally { setResending(false); }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content pill-form otp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="otp-modal__ico">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        </div>
        <h3 className="otp-modal__title">Verificación por correo</h3>
        <p className="otp-modal__sub">Enviamos un código de 6 dígitos a <b>{email}</b>. Ingrésalo para confirmar la acción.</p>

        <input
          ref={inputRef}
          className="morb-control otp-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          disabled={verifying}
        />
        {error && <p className="otp-modal__err">{error}</p>}

        <div className="otp-modal__actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={verifying}>Cancelar</button>
          <button type="button" className="btn-submit" onClick={submit} disabled={verifying || code.length !== 6}>{verifying ? "Verificando…" : "Verificar"}</button>
        </div>
        <button type="button" className="otp-modal__resend" onClick={resend} disabled={resending || verifying}>{resending ? "Reenviando…" : "¿No llegó? Reenviar código"}</button>
      </div>
    </div>
  );
}
