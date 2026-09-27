"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import { apiFetch } from "@/lib/apiFetch";
import jsQR from "jsqr";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: any) => void;
  showToast: (msg: string, type: "success" | "error" | "info" | "warning") => void;
}

export default function PlanteamientoSalaQrScannerModal({
  isOpen,
  onClose,
  onSuccess,
  showToast,
}: Props) {
  const modal = useAnimatedModal(isOpen);
  const [mode, setMode] = useState<"camera" | "upload" | "manual">("camera");
  const [manualInput, setManualInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Detener la cámara
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

  // Procesa el texto/URL del QR contra el backend
  const processQrText = useCallback(
    async (qrText: string) => {
      stopCamera();
      setLoading(true);
      try {
        let userId = "";
        try {
          const saved =
            localStorage.getItem("sismo_operator") ||
            sessionStorage.getItem("sismo_operator");
          if (saved) userId = JSON.parse(saved)?.id || "";
        } catch {
          // ignore
        }

        const res = await apiFetch("/api/planteamiento-sala/qr-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrInput: qrText.trim(), userId }),
          timeoutMs: 25000,
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          throw new Error(json.error || "No se pudo extraer la información del QR.");
        }

        showToast("Datos de vivienda censada obtenidos con éxito", "success");
        onSuccess(json.data);
        onClose();
      } catch (err: any) {
        console.error("Error al procesar QR:", err);
        showToast(err.message || "Error al procesar el código QR", "error");
      } finally {
        setLoading(false);
      }
    },
    [stopCamera, onSuccess, onClose, showToast]
  );

  // Escaneo en vivo con la cámara
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

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        processQrText(code.data);
        return;
      }
    } catch (e) {
      // Ignorar fallas momentáneas de frame
    }

    animFrameRef.current = requestAnimationFrame(scanFrame);
  }, [processQrText]);

  // Iniciar la cámara
  const startCamera = useCallback(async () => {
    setCameraError("");
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Su navegador o dispositivo no soporta acceso a la cámara.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        animFrameRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err: any) {
      console.warn("Fallo al iniciar cámara:", err);
      let msg = "No se pudo acceder a la cámara.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        msg = "Permiso de cámara denegado. Conceda permiso o pegue el enlace manualmente.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        msg = "No se detectó ninguna cámara disponible.";
      }
      setCameraError(msg);
      setMode("manual");
    }
  }, [stopCamera, scanFrame]);

  // Manejo de cambio de archivo de imagen
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setLoading(false);
          showToast("Error al inicializar canvas para lectura", "error");
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, img.width, img.height);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code && code.data) {
          processQrText(code.data);
        } else {
          setLoading(false);
          showToast("No se detectó ningún código QR en la imagen seleccionada.", "warning");
        }
      };
      img.onerror = () => {
        setLoading(false);
        showToast("Error al cargar la imagen seleccionada.", "error");
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  useEffect(() => {
    if (isOpen && mode === "camera") {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, mode, startCamera, stopCamera]);

  if (!modal.mounted || typeof document === "undefined") return null;


  return createPortal(
    <div
      className={`modal-overlay modal-overlay--sala${modal.closing ? " modal-overlay--closing" : ""}`}
      onClick={() => {
        stopCamera();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 9000 }}
    >
      <div
        className={`modal-content pill-form sala-qr-modal${modal.closing ? " modal-content--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sala-modal__head">
          <div className="msheet__grip" aria-hidden />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", width: "100%" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 800, fontSize: "1.15rem", color: "var(--text-primary)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
                <span>Escanear QR de Vivienda Censada</span>
              </span>
              <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                Extrae automáticamente tipo, edificación, piso/apto, dirección, circuito y GPS.
              </p>
            </div>
            <button
              type="button"
              className="modal-close"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              aria-label="Cerrar modal"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="sala-modal__body">
          {/* Selector de Modo: Cámara / Imagen / Manual */}
          <div className="btn-seg-group" style={{ display: "flex", width: "100%", marginBottom: "1rem" }}>
            <button
              type="button"
              className={`toolbar-btn ${mode === "camera" ? "toolbar-btn--active" : ""}`}
              style={{
                flex: 1,
                justifyContent: "center",
                fontWeight: mode === "camera" ? 800 : 600,
                background: mode === "camera" ? "#2563eb" : undefined,
                color: mode === "camera" ? "#ffffff" : undefined,
              }}
              onClick={() => setMode("camera")}
            >
              📷 Cámara
            </button>
            <button
              type="button"
              className={`toolbar-btn ${mode === "upload" ? "toolbar-btn--active" : ""}`}
              style={{
                flex: 1,
                justifyContent: "center",
                fontWeight: mode === "upload" ? 800 : 600,
                background: mode === "upload" ? "#2563eb" : undefined,
                color: mode === "upload" ? "#ffffff" : undefined,
              }}
              onClick={() => {
                stopCamera();
                setMode("upload");
              }}
            >
              🖼️ Imagen
            </button>
            <button
              type="button"
              className={`toolbar-btn ${mode === "manual" ? "toolbar-btn--active" : ""}`}
              style={{
                flex: 1,
                justifyContent: "center",
                fontWeight: mode === "manual" ? 800 : 600,
                background: mode === "manual" ? "#2563eb" : undefined,
                color: mode === "manual" ? "#ffffff" : undefined,
              }}
              onClick={() => {
                stopCamera();
                setMode("manual");
              }}
            >
              🔗 Enlace
            </button>
          </div>

          {/* MODO 1: CÁMARA EN VIVO */}
          {mode === "camera" && (
            <div>
              {cameraError ? (
                <div
                  style={{
                    padding: "1.2rem",
                    background: "rgba(220,38,38,0.06)",
                    border: "1px solid rgba(220,38,38,0.2)",
                    borderRadius: "14px",
                    color: "#dc2626",
                    fontSize: "0.85rem",
                    textAlign: "center",
                  }}
                >
                  <p style={{ margin: "0 0 0.75rem", fontWeight: 700 }}>{cameraError}</p>
                  <button
                    type="button"
                    className="btn-submit"
                    style={{ width: "auto", margin: "0 auto" }}
                    onClick={() => setMode("manual")}
                  >
                    Pegar enlace o URL manualmente
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "280px",
                    background: "#000",
                    borderRadius: "16px",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <video
                    ref={videoRef}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    muted
                    playsInline
                  />
                  <canvas ref={canvasRef} style={{ display: "none" }} />

                  {/* Marco de enfoque / Viewfinder */}
                  <div
                    style={{
                      position: "absolute",
                      width: "200px",
                      height: "200px",
                      border: "2px solid #3b82f6",
                      borderRadius: "18px",
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
                      pointerEvents: "none",
                    }}
                  />

                  <span
                    style={{
                      position: "absolute",
                      bottom: "12px",
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      fontSize: "0.74rem",
                      padding: "4px 12px",
                      borderRadius: "999px",
                      pointerEvents: "none",
                    }}
                  >
                    Apunte la cámara al código QR de la vivienda
                  </span>
                </div>
              )}
            </div>
          )}

          {/* MODO 2: SUBIR IMAGEN */}
          {mode === "upload" && (
            <div
              style={{
                padding: "2rem 1rem",
                border: "2px dashed var(--border-color)",
                borderRadius: "16px",
                textAlign: "center",
                background: "var(--bg-secondary)",
              }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 10px" }}>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <p style={{ margin: "0 0 0.4rem", fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)" }}>
                Seleccione una foto o captura del código QR
              </p>
              <p style={{ margin: "0 0 1.25rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Formatos soportados: JPG, PNG, WEBP
              </p>
              <label
                className="btn-submit"
                style={{
                  width: "auto",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                Examinar archivo
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleImageUpload}
                  disabled={loading}
                />
              </label>
            </div>
          )}

          {/* MODO 3: PEGAR ENLACE O TEXTO MANUALMENTE */}
          {mode === "manual" && (
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "6px", color: "var(--text-secondary)" }}>
                Enlace / URL o Texto de la Vivienda Censada
              </label>
              <textarea
                rows={4}
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Pegue aquí el enlace del QR (ej. https://...) o copie y pegue directamente el texto de la página del censo..."
                style={{
                  width: "100%",
                  padding: "0.75rem 0.9rem",
                  borderRadius: "14px",
                  border: "1.5px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  fontSize: "0.85rem",
                  resize: "none",
                  fontFamily: "inherit",
                }}
              />
              <p style={{ margin: "6px 0 0", fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                Puede pegar la dirección web completa del QR o el texto copiado de las fichas de vivienda y grupo familiar.
              </p>
            </div>
          )}
        </div>

        {/* Acciones del Modal */}
        <div className="sala-modal__foot">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            disabled={loading}
            style={{ width: "auto" }}
          >
            Cancelar
          </button>

          {mode === "manual" && (
            <button
              type="button"
              className="btn-submit"
              onClick={() => processQrText(manualInput)}
              disabled={loading || !manualInput.trim()}
              style={{ width: "auto", minWidth: "140px" }}
            >
              {loading ? "Obteniendo datos…" : "Consultar Enlace"}
            </button>
          )}
        </div>

        {/* Overlay de carga */}
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.88)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "20px",
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                border: "3px solid #2563eb",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <p style={{ marginTop: "10px", fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }}>
              Extrayendo datos de la página…
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
