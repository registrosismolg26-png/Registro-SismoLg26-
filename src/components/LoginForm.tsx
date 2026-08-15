"use client";

// ── Pantalla de inicio de sesión ────────────────────────────────────────────
// EXCEPCIÓN AL PATRÓN: el login se renderiza ANTES del <AppContext.Provider>,
// por lo que NO puede usar useAppContext(). Recibe por props lo que necesita de
// Home: setCurrentUser, setActiveTab, showToast y el toast actual (para
// renderizar la notificación). El estado del formulario (email, password,
// error, loading, mostrar contraseña, recordarme) y handleLogin viven aquí.

import { useState } from "react";
import { sha256 } from "@/lib/helpers";
import type { CurrentUser, ActiveTab, ToastType } from "@/types";
import PasswordInput from "@/components/PasswordInput";
import ResetPasswordModal from "@/components/ResetPasswordModal";

interface LoginFormProps {
  setCurrentUser: React.Dispatch<React.SetStateAction<CurrentUser | null>>;
  setActiveTab: (tab: ActiveTab) => void;
  showToast: (message: string, type: ToastType) => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
}

export default function LoginForm({ setCurrentUser, setActiveTab, showToast, theme, toggleTheme }: LoginFormProps) {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showReset, setShowReset] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    
    if (!loginEmail.trim() || !loginPassword) {
      setLoginError("Por favor ingrese correo y contraseña.");
      return;
    }

    setLoadingAuth(true);

    try {
      const pHash = await sha256(loginPassword);

      if (!navigator.onLine) {
        // Offline Auth Fallback: Check local credentials cached in localStorage
        const cachedStr = localStorage.getItem("sismo_cached_operators") || "[]";
        const cachedList = JSON.parse(cachedStr);
        const match = cachedList.find(
          (u: any) => u.email === loginEmail.trim().toLowerCase() && u.passwordHash === pHash
        );

        if (match) {
          const userSession = {
            id: match.id,
            email: match.email,
            nombre: match.nombre,
            role: match.role,
            campamentoTransitorio: match.campamentoTransitorio || ""
          };
          setCurrentUser(userSession);
          if (userSession.role === "VISUALIZADOR") {
            setActiveTab("dashboard");
          } else if (userSession.role === "RENACE") {
            setActiveTab("vzlarenace");
          } else {
            setActiveTab("censo");
          }
          if (rememberMe) {
            localStorage.setItem("sismo_operator", JSON.stringify(userSession));
            sessionStorage.removeItem("sismo_operator");
          } else {
            sessionStorage.setItem("sismo_operator", JSON.stringify(userSession));
            localStorage.removeItem("sismo_operator");
          }
          showToast(`Sesión local iniciada: ${match.nombre}`, "success");
        } else {
          setLoginError("Credenciales inválidas sin conexión. Inicie sesión online primero.");
        }
        setLoadingAuth(false);
        return;
      }

      // Online Auth: API Call
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Fallo en la autenticación.");
        setLoadingAuth(false);
        return;
      }

      if (data.success && data.user) {
        setCurrentUser(data.user);
        if (data.user.role === "VISUALIZADOR") {
          setActiveTab("dashboard");
        } else if (data.user.role === "RENACE") {
          setActiveTab("vzlarenace");
        } else {
          setActiveTab("censo");
        }
        if (rememberMe) {
          localStorage.setItem("sismo_operator", JSON.stringify(data.user));
          sessionStorage.removeItem("sismo_operator");
        } else {
          sessionStorage.setItem("sismo_operator", JSON.stringify(data.user));
          localStorage.removeItem("sismo_operator");
        }

        // Save credential hash locally for offline fallback authentication
        const cachedStr = localStorage.getItem("sismo_cached_operators") || "[]";
        const cachedList = JSON.parse(cachedStr);
        const filtered = cachedList.filter((u: any) => u.email !== data.user.email);
        filtered.push({
          id: data.user.id,
          email: data.user.email,
          nombre: data.user.nombre,
          role: data.user.role,
          campamentoTransitorio: data.user.campamentoTransitorio || "",
          passwordHash: pHash
        });
        localStorage.setItem("sismo_cached_operators", JSON.stringify(filtered));

        showToast(`Sesión iniciada: ${data.user.nombre}.`, "success");
        setLoginEmail("");
        setLoginPassword("");
      }
    } catch (err) {
      console.error(err);
      setLoginError("Error de red al intentar iniciar sesión.");
    } finally {
      setLoadingAuth(false);
    }
  };

  return (
      <div className="login-page">
        <div className="login-shell">
          <form onSubmit={handleLogin} className="login-card pill-form">
            <button
              type="button"
              className="login-theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
              title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
            >
              {theme === "dark" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <div className="login-brand">
              <img src="/logo_gob.webp" alt="Logo Gobernación La Guaira" className="login-brand__logo" />
              <div>
                <span className="login-brand__org">Gobernación del Estado La Guaira</span>
                <h1 className="login-brand__title">Campamentos Transitorios</h1>
                <span className="login-brand__sub">Sistema de Gestión · 2026</span>
              </div>
            </div>

            <div className="login-head">
              <h2 className="login-title">Iniciar sesión</h2>
              <p className="login-subtitle">Ingrese sus credenciales de operador para continuar.</p>
            </div>

            {loginError && (
              <div className="login-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{loginError}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="login-email">Correo electrónico</label>
              <input
                type="email"
                id="login-email"
                placeholder="ej: operador@sismo.gob.ve"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Contraseña</label>
              <PasswordInput
                value={loginPassword}
                onChange={setLoginPassword}
                placeholder="Contraseña"
                autoComplete="current-password"
                ariaLabel="Contraseña"
              />
            </div>

            <div className="login-forgot-row">
              <button type="button" className="login-forgot" onClick={() => setShowReset(true)}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <button
              type="button"
              className={`pill-check pill-check--wrap${rememberMe ? " is-on" : ""}`}
              aria-pressed={rememberMe}
              onClick={() => setRememberMe((v) => !v)}
            >
              <span className="pill-check__box" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </span>
              <span className="pill-check__label">Recordarme en este dispositivo</span>
            </button>

            <button type="submit" className="btn-submit" disabled={loadingAuth}>
              {loadingAuth ? "Verificando..." : "Entrar al Sistema"}
            </button>

            <div className="login-alt">
              <p>¿Busca a un familiar afectado?</p>
              <a href="/buscar" className="btn-secondary" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", textDecoration: "none" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Buscar Familiar Afectado
              </a>
            </div>
          </form>
        </div>

        {showReset && (
          <ResetPasswordModal
            initialEmail={loginEmail}
            onClose={() => setShowReset(false)}
            onDone={(email) => {
              setShowReset(false);
              setLoginEmail(email);
              setLoginPassword("");
              showToast("Contraseña actualizada. Inicia sesión con tu nueva contraseña.", "success");
            }}
            showToast={showToast}
          />
        )}

      </div>
  );
}
