"use client";

// ── Pantalla de inicio de sesión ────────────────────────────────────────────
// EXCEPCIÓN AL PATRÓN: el login se renderiza ANTES del <AppContext.Provider>,
// por lo que NO puede usar useAppContext(). Recibe por props lo que necesita de
// Home: setCurrentUser, setActiveTab, showToast. El estado del formulario 
// (email, password, error, loading, mostrar contraseña, recordarme) y 
// handleLogin viven aquí.

import { useState } from "react";
import { sha256 } from "@/lib/helpers";
import type { CurrentUser, ActiveTab, ToastType } from "@/types";

interface LoginFormProps {
  setCurrentUser: React.Dispatch<React.SetStateAction<CurrentUser | null>>;
  setActiveTab: (tab: ActiveTab) => void;
  showToast: (message: string, type: ToastType) => void;
}

export default function LoginForm({ setCurrentUser, setActiveTab, showToast }: LoginFormProps) {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

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

        showToast(`Sesión iniciada: ${data.user.nombre}`, "success");
      }
    } catch (err) {
      console.error(err);
      setLoginError("Error de conexión al servidor.");
    } finally {
      setLoadingAuth(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ display: "inline-flex", padding: "0.75rem", borderRadius: "1rem", background: "rgba(59, 130, 246, 0.1)", color: "var(--color-primary)", marginBottom: "1rem" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "800", color: "var(--text-primary)" }}>Sistema SismoLg26</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.5rem" }}>Registro y Censo de Personas Refugiadas</p>
        </div>

        {loginError && (
          <div className="login-error-banner" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ fontSize: "0.85rem", fontWeight: "500" }}>{loginError}</span>
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="form-group">
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Correo Electrónico</label>
            <input
              type="email"
              placeholder="operador@sismolg26.gob.ve"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              disabled={loadingAuth}
              style={{ width: "100%" }}
            />
          </div>

          <div className="form-group">
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Contraseña</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                disabled={loadingAuth}
                style={{ width: "100%", paddingRight: "2.75rem" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-secondary)", padding: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.25rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)", cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: "auto", margin: 0 }}
              />
              Recordarme en este dispositivo
            </label>
          </div>

          <button
            type="submit"
            className="btn-submit"
            disabled={loadingAuth}
            style={{ marginTop: "0.5rem", height: "42px", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
          >
            {loadingAuth ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "0.25rem" }}><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.59"/><line x1="16.24" y1="16.24" x2="19.07" y2="18.91"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
                Iniciando sesión...
              </>
            ) : "Iniciar Sesión"}
          </button>
        </form>

        <div style={{ borderTop: "1px solid var(--border-color)", marginTop: "2rem", paddingTop: "1.25rem", textAlign: "center" }}>
          <a
            href="/buscar"
            className="btn-secondary"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", textDecoration: "none" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Buscar Familiar Afectado
          </a>
        </div>
      </div>
    </div>
  );
}
