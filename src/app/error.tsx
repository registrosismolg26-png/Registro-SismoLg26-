"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Si el error es por cambio de versión de chunks tras un nuevo deploy,
    // recarga automáticamente una sola vez para traer la nueva versión.
    const msg = (error?.message || "").toLowerCase();
    const isChunkOrDeployError =
      msg.includes("loading chunk") ||
      msg.includes("failed to fetch dynamically imported module") ||
      msg.includes("minified react error #412") ||
      msg.includes("connection closed");

    if (isChunkOrDeployError && typeof window !== "undefined") {
      const last = sessionStorage.getItem("last_chunk_reload");
      const now = Date.now();
      if (!last || now - Number(last) > 10000) {
        sessionStorage.setItem("last_chunk_reload", String(now));
        window.location.reload();
        return;
      }
    }
    console.error("[Root ErrorBoundary]", error);
  }, [error]);

  const handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
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
        backgroundColor: "var(--bg-primary, #0f172a)",
        color: "var(--text-primary, #f8fafc)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          backgroundColor: "rgba(220, 38, 38, 0.12)",
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

      <h1 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 0.5rem" }}>
        Actualización o Interrupción del Sistema
      </h1>
      <p
        style={{
          fontSize: "0.9rem",
          maxWidth: "460px",
          color: "var(--text-secondary, #94a3b8)",
          margin: "0 0 1.5rem",
          lineHeight: 1.5,
        }}
      >
        Se ha desplegado una nueva versión del sistema o se interrumpió la conexión.
        Haz clic en el botón para recargar y sincronizar con la última versión.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          type="button"
          onClick={handleReload}
          style={{
            padding: "0.65rem 1.4rem",
            backgroundColor: "#2563eb",
            color: "#ffffff",
            border: "none",
            borderRadius: "999px",
            fontWeight: 700,
            fontSize: "0.9rem",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(37, 99, 235, 0.3)",
          }}
        >
          Recargar Sistema
        </button>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.history.back();
          }}
          style={{
            padding: "0.65rem 1.4rem",
            backgroundColor: "transparent",
            color: "var(--text-secondary, #94a3b8)",
            border: "1px solid var(--border-color, rgba(148, 163, 184, 0.3))",
            borderRadius: "999px",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: "pointer",
          }}
        >
          Regresar
        </button>
      </div>
    </div>
  );
}
