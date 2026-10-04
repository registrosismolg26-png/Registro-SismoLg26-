"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { ComedorBeneficiario } from "@/types";
import { printHtml, generateSingleCarnetHtml } from "@/lib/comedorPrint";

interface Props {
  beneficiario: ComedorBeneficiario | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ComedorCarnetModal({ beneficiario, isOpen, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!beneficiario || !isOpen) {
      setQrDataUrl(null);
      return;
    }

    // El contenido del QR incluye el prefijo COMEDOR y la cédula para fácil parseo
    const payload = `COMEDOR|${beneficiario.cedula}|${beneficiario.refugio}|${beneficiario.raciones}`;
    QRCode.toDataURL(payload, {
      width: 260,
      margin: 2,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => {
        console.error("Error al generar código QR:", err);
      });
  }, [beneficiario, isOpen]);

  if (!isOpen || !beneficiario) return null;

  const handlePrint = () => {
    if (!qrDataUrl) return;
    const html = generateSingleCarnetHtml(beneficiario, qrDataUrl);
    printHtml(html, `Carnet Comedor - ${beneficiario.cedula}`);
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `QR_Comedor_${beneficiario.cedula.replace(/\D/g, "")}.png`;
    a.click();
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-content modal-content--detail"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "520px",
          width: "95%",
          padding: "1.25rem",
          borderRadius: "16px",
          background: "var(--card-bg, #ffffff)",
          boxShadow: "0 20px 40px -10px rgba(0,0,0,0.3)",
        }}
      >
        {/* Cabecera del modal */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
            paddingBottom: "0.75rem",
            borderBottom: "1px solid var(--border-color, #e2e8f0)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.3rem" }}>🪪</span>
            <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)" }}>
              Carnet Digital de Comedor
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "1.2rem",
              color: "var(--text-secondary)",
              lineHeight: 1,
              padding: "4px",
            }}
          >
            ✕
          </button>
        </div>

        {/* CONTENEDOR VISUAL DEL CARNET */}
        <div
          className="comedor-carnet-card"
          style={{
            background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
            color: "#ffffff",
            borderRadius: "14px",
            padding: "1.25rem",
            boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.4)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Adorno superior institucional */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
              borderBottom: "1px solid rgba(255, 255, 255, 0.15)",
              paddingBottom: "0.6rem",
            }}
          >
            <div>
              <div style={{ fontSize: "0.65rem", letterSpacing: "1px", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
                SISTEMA DE GESTIÓN DE CAMPAMENTOS
              </div>
              <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#38bdf8", letterSpacing: "0.5px" }}>
                COMEDOR COMUNITARIO
              </div>
            </div>
            <div
              style={{
                fontSize: "0.7rem",
                padding: "3px 8px",
                borderRadius: "999px",
                background: beneficiario.tipoBeneficiario === "JEFE" ? "#0284c7" : "#059669",
                color: "#ffffff",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {beneficiario.tipoBeneficiario === "JEFE" ? "Jefe de Familia" : "Persona Sola"}
            </div>
          </div>

          {/* Cuerpo principal del carnet: Datos a la izquierda, QR a la derecha */}
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.68rem", color: "#94a3b8", textTransform: "uppercase", display: "block" }}>
                  Beneficiario Autorizado
                </span>
                <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "#f8fafc", lineHeight: 1.2, display: "block" }}>
                  {beneficiario.nombreApellido}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.6rem" }}>
                <div>
                  <span style={{ fontSize: "0.68rem", color: "#94a3b8", display: "block" }}>Cédula:</span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f1f5f9" }}>{beneficiario.cedula}</span>
                </div>
                <div>
                  <span style={{ fontSize: "0.68rem", color: "#94a3b8", display: "block" }}>Teléfono:</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1" }}>{beneficiario.telefono || "No registrado"}</span>
                </div>
              </div>

              <div style={{ marginBottom: "0.6rem" }}>
                <span style={{ fontSize: "0.68rem", color: "#94a3b8", display: "block" }}>Campamento:</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                  {beneficiario.refugio}
                </span>
              </div>

              {beneficiario.cuarto && (
                <div style={{ marginBottom: "0.6rem" }}>
                  <span style={{ fontSize: "0.68rem", color: "#94a3b8", display: "block" }}>Alojamiento:</span>
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#e2e8f0" }}>{beneficiario.cuarto}</span>
                </div>
              )}

              {/* RACIONES AUTORIZADAS */}
              <div
                style={{
                  background: "rgba(56, 189, 248, 0.12)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  borderRadius: "8px",
                  padding: "0.4rem 0.6rem",
                  marginTop: "0.4rem",
                }}
              >
                <div style={{ fontSize: "0.68rem", color: "#38bdf8", fontWeight: 700, textTransform: "uppercase" }}>
                  Raciones Autorizadas por Servicio:
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#38bdf8" }}>
                  {beneficiario.raciones} {beneficiario.raciones === 1 ? "Comida" : "Comidas / Platos"}
                </div>
              </div>
            </div>

            {/* Código QR */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "#ffffff",
                padding: "8px",
                borderRadius: "12px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
              }}
            >
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR ${beneficiario.cedula}`}
                  style={{ width: "130px", height: "130px", display: "block", borderRadius: "6px" }}
                />
              ) : (
                <div
                  style={{
                    width: "130px",
                    height: "130px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#64748b",
                    fontSize: "0.75rem",
                  }}
                >
                  Generando QR...
                </div>
              )}
              <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
                {beneficiario.cedula}
              </span>
            </div>
          </div>

          {/* Desglose de carga familiar */}
          {beneficiario.integrantes && beneficiario.integrantes.length > 1 && (
            <div
              style={{
                marginTop: "0.85rem",
                paddingTop: "0.6rem",
                borderTop: "1px dashed rgba(255, 255, 255, 0.15)",
                fontSize: "0.75rem",
                color: "#cbd5e1",
              }}
            >
              <span style={{ fontWeight: 700, color: "#94a3b8" }}>Núcleo Familiar ({beneficiario.integrantes.length} personas): </span>
              {beneficiario.integrantes.map((m, idx) => (
                <span key={m.id || idx}>
                  {m.nombreApellido} ({m.cedula}){idx < beneficiario.integrantes!.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="toolbar-btn"
            onClick={handleDownloadQr}
            disabled={!qrDataUrl}
            style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Descargar QR
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={handlePrint}
            disabled={!qrDataUrl}
            style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Imprimir Carnet
          </button>
          <button
            type="button"
            className="btn-submit"
            onClick={onClose}
            style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
