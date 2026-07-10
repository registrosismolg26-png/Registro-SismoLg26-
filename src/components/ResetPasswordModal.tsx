"use client";

// ── Modal "¿Olvidaste tu contraseña?" (recuperación SIN sesión) ─────────────
// Dos pasos: (1) el usuario ingresa su correo → se le envía un código; (2) ingresa
// el código + nueva contraseña → se restablece. No pide la contraseña actual (la
// olvidó). El correo se verifica CONTRA el código en el backend (sin challengeId),
// por lo que la respuesta del paso 1 nunca revela si el correo existe. Todo pill.

import { useState, useEffect, useRef } from "react";
import PasswordInput from "@/components/PasswordInput";
import type { ToastType } from "@/types";

interface Props {
  initialEmail?: string;
  onClose: () => void;
  onDone: (email: string) => void;                 // éxito: prefill del login + toast
  showToast: (message: string, type: ToastType) => void;
}

export default function ResetPasswordModal({ initialEmail = "", onClose, onDone, showToast }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const t = setTimeout(() => firstRef.current?.focus(), 80); return () => clearTimeout(t); }, [step]);

  // Paso 1 (también sirve de "reenviar"): pide/reenvía el código al correo.
  const requestCode = async () => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setError("Ingresa un correo electrónico válido."); return; }
    setError(null); setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: clean }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.available === false) {
        setError("La recuperación por correo no está disponible. Contacta al administrador.");
        return;
      }
      if (res.ok) {
        setInfo(`Si ${clean} está registrado, te enviamos un código de 6 dígitos. Revisa tu correo (y la carpeta de spam).`);
        if (step === 1) setStep(2); else { setCode(""); showToast("Te enviamos un código nuevo.", "success"); }
      } else {
        setError(d.error || "No se pudo enviar el código.");
      }
    } catch { setError("Error de red. Intenta de nuevo."); }
    finally { setLoading(false); }
  };

  // Paso 2: confirma el código y fija la nueva contraseña.
  const confirm = async () => {
    if (!/^\d{6}$/.test(code)) { setError("Ingresa el código de 6 dígitos."); return; }
    if (pwd.length < 6) { setError("La nueva contraseña debe tener al menos 6 caracteres."); return; }
    if (pwd !== pwd2) { setError("Las contraseñas no coinciden."); return; }
    setError(null); setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code, newPassword: pwd }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) { onDone(email.trim().toLowerCase()); return; }
      if (d.code === "CODE_INVALID") setError("Código inválido o vencido. Reenvía uno nuevo.");
      else setError(d.error || "No se pudo restablecer la contraseña.");
    } catch { setError("Error de red. Intenta de nuevo."); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content pill-form otp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="otp-modal__ico">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>
        </div>
        <h3 className="otp-modal__title">Recuperar contraseña</h3>
        <p className="otp-modal__sub">
          {step === 1
            ? "Ingresa tu correo y te enviaremos un código para restablecer tu contraseña."
            : info}
        </p>

        {step === 1 ? (
          <>
            <input
              ref={firstRef}
              className="morb-control"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="tu.correo@ejemplo.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") requestCode(); }}
              disabled={loading}
            />
            {error && <p className="otp-modal__err">{error}</p>}
            <div className="otp-modal__actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
              <button type="button" className="btn-submit" onClick={requestCode} disabled={loading}>{loading ? "Enviando…" : "Enviar código"}</button>
            </div>
          </>
        ) : (
          <>
            <input
              ref={firstRef}
              className="morb-control otp-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
              disabled={loading}
            />
            <div className="otp-reset__fields">
              <PasswordInput value={pwd} onChange={(v) => { setPwd(v); setError(null); }} placeholder="Nueva contraseña" autoComplete="new-password" ariaLabel="Nueva contraseña" disabled={loading} />
              <PasswordInput value={pwd2} onChange={(v) => { setPwd2(v); setError(null); }} placeholder="Confirmar contraseña" autoComplete="new-password" ariaLabel="Confirmar contraseña" disabled={loading} />
            </div>
            {error && <p className="otp-modal__err">{error}</p>}
            <div className="otp-modal__actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
              <button type="button" className="btn-submit" onClick={confirm} disabled={loading}>{loading ? "Guardando…" : "Cambiar contraseña"}</button>
            </div>
            <button type="button" className="otp-modal__resend" onClick={requestCode} disabled={loading}>¿No llegó? Reenviar código</button>
          </>
        )}
      </div>
    </div>
  );
}
