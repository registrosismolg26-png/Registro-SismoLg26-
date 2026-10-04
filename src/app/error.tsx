"use client";

import { useEffect, useState } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Si ocurre un error de hidratación, router o desfase de despliegue,
    // intentamos auto-recargar automáticamente una sola vez (con throttle de 15s)
    const last = sessionStorage.getItem("last_auto_error_reload");
    const now = Date.now();
    if (!last || now - Number(last) > 15000) {
      sessionStorage.setItem("last_auto_error_reload", String(now));
      window.location.reload();
      return;
    }

    console.error("[Root ErrorBoundary]", error);
  }, [error]);

  const handleReload = () => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("last_auto_error_reload");
        sessionStorage.removeItem("last_chunk_reload");
        if ("caches" in window) {
          caches.keys().then((keys) => {
            keys.forEach((k) => caches.delete(k));
          });
        }
      } catch {
        /* noop */
      }
      window.location.href =
        window.location.origin + window.location.pathname + "?t=" + Date.now();
    } else {
      reset();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "1.5rem",
        backgroundColor: "var(--bg-primary, #ffffff)",
        color: "var(--text-primary, #0f172a)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          backgroundColor: "rgba(220, 38, 38, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1rem",
          color: "#dc2626",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>

      <h1
        style={{
          fontSize: "1.4rem",
          fontWeight: 800,
          margin: "0 0 0.5rem",
          color: "#0f172a",
        }}
      >
        ACTUALIZACIÓN O INTERRUPCIÓN DEL SISTEMA
      </h1>
      <p
        style={{
          fontSize: "0.92rem",
          maxWidth: "480px",
          color: "#64748b",
          margin: "0 0 1.5rem",
          lineHeight: 1.5,
        }}
      >
        Se ha desplegado una nueva versión del sistema o se interrumpió la
        conexión. Haz clic en el botón para recargar y sincronizar con la última
        versión.
      </p>

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          justifyContent: "center",
          marginBottom: "1.5rem",
        }}
      >
        <button
          type="button"
          onClick={handleReload}
          style={{
            padding: "0.7rem 1.6rem",
            backgroundColor: "#2563eb",
            color: "#ffffff",
            border: "none",
            borderRadius: "999px",
            fontWeight: 700,
            fontSize: "0.92rem",
            cursor: "pointer",
            boxShadow: "0 2px 10px rgba(37, 99, 235, 0.35)",
          }}
        >
          Recargar Sistema
        </button>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "0.7rem 1.4rem",
            backgroundColor: "transparent",
            color: "#475569",
            border: "1px solid #cbd5e1",
            borderRadius: "999px",
            fontWeight: 600,
            fontSize: "0.92rem",
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </div>

      {error?.message && (
        <div style={{ maxWidth: "480px", textAlign: "left", width: "100%" }}>
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              fontSize: "0.78rem",
              cursor: "pointer",
              padding: "4px 0",
              textDecoration: "underline",
            }}
          >
            {showDetails ? "Ocultar detalle" : "Detalle técnico"}
          </button>
          {showDetails && (
            <pre
              style={{
                fontSize: "0.72rem",
                background: "#f1f5f9",
                color: "#334155",
                padding: "0.75rem",
                borderRadius: "8px",
                overflowX: "auto",
                marginTop: "0.5rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {error.message}
              {error.digest ? `\nDigest: ${error.digest}` : ""}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
