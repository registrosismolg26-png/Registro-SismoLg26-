"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import jsQR from "jsqr";
import { apiFetch } from "@/lib/apiFetch";
import type { ComedorBeneficiario, ComedorServicio } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  refugio: string;
  fecha: string;
  servicio: ComedorServicio;
  onDeliverySuccess: (entrega: any) => void;
  showToast: (msg: string, type: "success" | "error" | "info" | "warning") => void;
}

// Sonido Web Audio para confirmar lectura
function playBeep(success = true) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = success ? 880 : 330; // La5 (880Hz) éxito, Mi4 (330Hz) error
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    /* ignore audio error */
  }
}

export default function ComedorQrScannerModal({
  isOpen,
  onClose,
  refugio,
  fecha,
  servicio,
  onDeliverySuccess,
  showToast,
}: Props) {
  const [mode, setMode] = useState<"camera" | "manual" | "file">("camera");
  const [manualInput, setManualInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scannedResult, setScannedResult] = useState<{
    beneficiario: ComedorBeneficiario;
    yaRetiro: boolean;
    entregaExistente?: any;
  } | null>(null);
  const [savingEntrega, setSavingEntrega] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const processQrInput = useCallback(
    async (rawText: string) => {
      if (!rawText.trim()) return;
      stopCamera();
      setLoading(true);
      try {
        const res = await apiFetch("/api/comedor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "lookup",
            qrInput: rawText.trim(),
            refugio,
            fecha,
            servicio,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          playBeep(false);
          throw new Error(data.error || "No se encontró ningún beneficiario con este código.");
        }

        playBeep(true);
        setScannedResult({
          beneficiario: data.beneficiario,
          yaRetiro: Boolean(data.yaRetiro),
          entregaExistente: data.entregaExistente,
        });

        if (data.yaRetiro) {
          showToast(`⚠️ Esta persona ya retiró ${servicio} el día de hoy (${fecha}).`, "warning");
        } else {
          showToast(`Beneficiario identificado: ${data.beneficiario.nombreApellido} (${data.beneficiario.raciones} raciones)`, "info");
        }
      } catch (err: any) {
        console.error("Error al procesar QR:", err);
        showToast(err.message || "Error al procesar código QR.", "error");
        setScannedResult(null);
      } finally {
        setLoading(false);
      }
    },
    [stopCamera, refugio, fecha, servicio, showToast]
  );

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imgData.data, imgData.width, imgData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code && code.data) {
      processQrInput(code.data);
      return;
    }

    animFrameRef.current = requestAnimationFrame(scanFrame);
  }, [processQrInput]);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError("");
    setScannedResult(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        animFrameRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err: any) {
      console.warn("No se pudo iniciar la cámara:", err);
      setCameraError(err.message || "No se pudo acceder a la cámara del dispositivo.");
      setMode("manual");
    }
  }, [stopCamera, scanFrame]);

  useEffect(() => {
    if (isOpen && mode === "camera" && !scannedResult) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, mode, scannedResult, startCamera, stopCamera]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code && code.data) {
          processQrInput(code.data);
        } else {
          showToast("No se detectó ningún código QR en la imagen.", "warning");
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmEntrega = async () => {
    if (!scannedResult || !scannedResult.beneficiario) return;
    const b = scannedResult.beneficiario;

    setSavingEntrega(true);
    try {
      const res = await apiFetch("/api/comedor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "entrega",
          cedula: b.cedula,
          nombre: b.nombreApellido,
          telefono: b.telefono,
          refugio: b.refugio,
          tipoBeneficiario: b.tipoBeneficiario,
          fecha,
          servicio,
          raciones: b.raciones,
          registroId: b.id,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || "No se pudo registrar la entrega.");
      }

      playBeep(true);
      showToast(`✅ Entrega registrada: ${b.nombreApellido} (${b.raciones} platos de ${servicio})`, "success");
      onDeliverySuccess(data.entrega);

      // Reiniciar para escanear el siguiente
      setScannedResult(null);
      setManualInput("");
      if (mode === "camera") {
        startCamera();
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Error al registrar entrega.", "error");
    } finally {
      setSavingEntrega(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-content modal-content--detail"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "540px",
          width: "95%",
          padding: "1.25rem",
          borderRadius: "16px",
          background: "var(--card-bg, #ffffff)",
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.85rem",
            paddingBottom: "0.75rem",
            borderBottom: "1px solid var(--border-color, #e2e8f0)",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text-primary)" }}>
              Escáner de Comedor
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Servicio: <strong>{servicio}</strong> · Fecha: <strong>{fecha}</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "1.2rem",
              color: "var(--text-secondary)",
            }}
          >
            ✕
          </button>
        </div>

        {/* Selector de modo */}
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem" }}>
          <button
            type="button"
            className={`toolbar-btn ${mode === "camera" ? "toolbar-btn--primary" : ""}`}
            style={{ flex: 1, padding: "0.4rem 0.5rem", fontSize: "0.8rem" }}
            onClick={() => {
              setMode("camera");
              setScannedResult(null);
              startCamera();
            }}
          >
            📷 Cámara QR
          </button>
          <button
            type="button"
            className={`toolbar-btn ${mode === "manual" ? "toolbar-btn--primary" : ""}`}
            style={{ flex: 1, padding: "0.4rem 0.5rem", fontSize: "0.8rem" }}
            onClick={() => {
              setMode("manual");
              stopCamera();
            }}
          >
            ⌨️ Ingreso Manual
          </button>
          <button
            type="button"
            className={`toolbar-btn ${mode === "file" ? "toolbar-btn--primary" : ""}`}
            style={{ flex: 1, padding: "0.4rem 0.5rem", fontSize: "0.8rem" }}
            onClick={() => {
              setMode("file");
              stopCamera();
            }}
          >
            🖼️ Subir Imagen
          </button>
        </div>

        {/* RESULTADO ESCANEADO O REVISIÓN */}
        {scannedResult ? (
          <div
            style={{
              background: scannedResult.yaRetiro ? "rgba(239, 68, 68, 0.08)" : "rgba(34, 197, 94, 0.08)",
              border: `2px solid ${scannedResult.yaRetiro ? "var(--color-danger, #ef4444)" : "var(--color-success, #22c55e)"}`,
              borderRadius: "14px",
              padding: "1rem",
              marginBottom: "1rem",
            }}
          >
            {scannedResult.yaRetiro ? (
              <div style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "#dc2626", fontWeight: 800, fontSize: "0.95rem" }}>
                <span>⚠️ YA RETIRÓ ESTE SERVICIO HOY</span>
              </div>
            ) : (
              <div style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "#16a34a", fontWeight: 800, fontSize: "0.95rem" }}>
                <span>✅ BENEFICIARIO AUTORIZADO</span>
              </div>
            )}

            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
              {scannedResult.beneficiario.nombreApellido}
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
              Cédula: <strong>{scannedResult.beneficiario.cedula}</strong>
              {scannedResult.beneficiario.telefono && <> · Tel: <strong>{scannedResult.beneficiario.telefono}</strong></>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.5rem" }}>
              <div style={{ background: "var(--bg-primary, #f1f5f9)", border: "1px solid var(--border-color)", padding: "0.5rem", borderRadius: "8px" }}>
                <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", display: "block" }}>Condición:</span>
                <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                  {scannedResult.beneficiario.tipoBeneficiario === "JEFE" ? "Jefe de Familia" : "Persona Sola"}
                </span>
              </div>
              <div style={{ background: "rgba(56, 189, 248, 0.15)", border: "1px solid rgba(56, 189, 248, 0.3)", padding: "0.5rem", borderRadius: "8px" }}>
                <span style={{ fontSize: "0.7rem", color: "#38bdf8", fontWeight: 700, display: "block" }}>Raciones a entregar:</span>
                <span style={{ fontWeight: 900, fontSize: "1.1rem", color: "#38bdf8" }}>
                  {scannedResult.beneficiario.raciones} {scannedResult.beneficiario.raciones === 1 ? "Plato" : "Platos"}
                </span>
              </div>
            </div>

            {scannedResult.yaRetiro && scannedResult.entregaExistente && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "#b91c1c", background: "rgba(239, 68, 68, 0.1)", padding: "0.5rem", borderRadius: "6px" }}>
                Registrado a las: <strong>{scannedResult.entregaExistente.hora}</strong> por: <strong>{scannedResult.entregaExistente.registradoPor || "Operador"}</strong>.
              </div>
            )}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              {!scannedResult.yaRetiro ? (
                <button
                  type="button"
                  className="btn-submit"
                  onClick={handleConfirmEntrega}
                  disabled={savingEntrega}
                  style={{ flex: 1, padding: "0.6rem" }}
                >
                  {savingEntrega ? "Guardando..." : `Confirmar Entrega (${scannedResult.beneficiario.raciones} Raciones)`}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-submit"
                  style={{ flex: 1, background: "var(--color-danger, #ef4444)" }}
                  onClick={() => {
                    setScannedResult(null);
                    if (mode === "camera") startCamera();
                  }}
                >
                  Entendido (Escanear siguiente)
                </button>
              )}
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => {
                  setScannedResult(null);
                  if (mode === "camera") startCamera();
                }}
              >
                Volver
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* MODO CÁMARA */}
            {mode === "camera" && (
              <div style={{ position: "relative", width: "100%", height: "280px", background: "#000000", borderRadius: "12px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {cameraError ? (
                  <div style={{ color: "#f87171", padding: "1rem", textAlign: "center", fontSize: "0.85rem" }}>
                    {cameraError}
                    <div style={{ marginTop: "0.5rem" }}>
                      <button type="button" className="toolbar-btn" onClick={startCamera}>Reintentar cámara</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <canvas ref={canvasRef} style={{ display: "none" }} />
                    {/* Cuadro de enfoque de escaneo */}
                    <div
                      style={{
                        position: "absolute",
                        width: "200px",
                        height: "200px",
                        border: "2px solid #38bdf8",
                        borderRadius: "16px",
                        boxShadow: "0 0 0 4000px rgba(0, 0, 0, 0.4)",
                        pointerEvents: "none",
                      }}
                    />
                    <div style={{ position: "absolute", bottom: "10px", color: "#ffffff", fontSize: "0.75rem", background: "rgba(0,0,0,0.6)", padding: "4px 10px", borderRadius: "999px" }}>
                      Apunta al código QR del carnet
                    </div>
                  </>
                )}
              </div>
            )}

            {/* MODO MANUAL */}
            {mode === "manual" && (
              <div style={{ padding: "1rem 0" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>
                  Número de Cédula del Beneficiario:
                </label>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    placeholder="Ej. V-12345678 o 12345678"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") processQrInput(manualInput);
                    }}
                    style={{
                      flex: "1 1 200px",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.95rem",
                      background: "var(--card-bg, var(--bg-secondary))",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                    }}
                  />
                  <button
                    type="button"
                    className="btn-submit"
                    onClick={() => processQrInput(manualInput)}
                    disabled={loading || !manualInput.trim()}
                    style={{ padding: "0.5rem 1rem", fontSize: "0.85rem", flex: "0 0 auto" }}
                  >
                    {loading ? "Buscando..." : "Buscar"}
                  </button>
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.4rem" }}>
                  También funciona con lectores de código de barras USB/Bluetooth conectados.
                </p>
              </div>
            )}

            {/* MODO SUBIR ARCHIVO */}
            {mode === "file" && (
              <div style={{ padding: "1.5rem 0", textAlign: "center" }}>
                <label
                  style={{
                    display: "inline-block",
                    padding: "0.75rem 1.5rem",
                    border: "2px dashed var(--border-color, #cbd5e1)",
                    borderRadius: "12px",
                    cursor: "pointer",
                    background: "var(--bg-secondary, #f8fafc)",
                  }}
                >
                  <span style={{ fontSize: "1.5rem", display: "block", marginBottom: "0.25rem" }}>📁</span>
                  <span style={{ fontWeight: 700, fontSize: "0.85rem", display: "block" }}>Seleccionar foto del carnet con QR</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Formatos PNG, JPG, JPEG</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: "none" }} />
                </label>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button type="button" className="toolbar-btn" onClick={onClose}>
            Cerrar Escáner
          </button>
        </div>
      </div>
    </div>
  );
}
