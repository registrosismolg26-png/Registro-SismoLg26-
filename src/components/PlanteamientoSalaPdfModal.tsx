"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import { apiFetch } from "@/lib/apiFetch";
import type { PlanteamientoSalaItem } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  item: PlanteamientoSalaItem | null;
  canManage?: boolean;
  showToast: (msg: string, type: "success" | "error" | "info" | "warning") => void;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDateDisplay(dStr?: string | null): string {
  if (!dStr) return "—";
  try {
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr.slice(0, 10);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return dStr.slice(0, 10);
  }
}

export default function PlanteamientoSalaPdfModal({
  isOpen,
  onClose,
  onUpdated,
  item,
  canManage = true,
  showToast,
}: Props) {
  const modal = useAnimatedModal(isOpen && item ? item : null);
  const activeItem = modal.data;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showReplaceForm, setShowReplaceForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reiniciar estado al abrir
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setIsDragging(false);
      setShowReplaceForm(false);
    }
  }, [isOpen, item]);

  if (!modal.mounted || !activeItem || typeof document === "undefined") return null;

  const hasDoc = Boolean(activeItem.tieneDocumentoPdf);
  const docName = activeItem.documentoPdfNombre || "Documento.pdf";
  const docSize = activeItem.documentoPdfSize || 0;
  const docFecha = activeItem.documentoPdfFecha;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Solo se admiten documentos en formato PDF (.pdf).", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      showToast("El archivo supera el límite de 20MB.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Solo se admiten documentos en formato PDF (.pdf).", "error");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      showToast("El archivo supera el límite de 20MB.", "error");
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showToast("Seleccione un archivo PDF para subir.", "warning");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await apiFetch(`/api/planteamiento-sala/${encodeURIComponent(activeItem.id)}/documento`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.success) {
        showToast("Documento PDF guardado exitosamente.", "success");
        onUpdated();
        onClose();
      } else {
        showToast(data?.error || "Error al subir el documento PDF.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error de conexión al subir el documento.", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`¿Está seguro de eliminar el documento PDF "${docName}"?`)) return;

    setDeleting(true);
    try {
      const res = await apiFetch(`/api/planteamiento-sala/${encodeURIComponent(activeItem.id)}/documento`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.success) {
        showToast("Documento PDF eliminado exitosamente.", "success");
        onUpdated();
        onClose();
      } else {
        showToast(data?.error || "Error al eliminar el documento.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error de conexión al eliminar el documento.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const pdfUrl = `/api/planteamiento-sala/${encodeURIComponent(activeItem.id)}/documento`;

  return createPortal(
    <div
      className={`modal-overlay modal-overlay--sala${modal.closing ? " modal-overlay--closing" : ""}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`modal-content pill-form sala-status-modal${modal.closing ? " modal-content--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "540px" }}
      >
        {/* Encabezado */}
        <div className="sala-modal__head">
          <div className="msheet__grip" aria-hidden />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "rgba(239, 68, 68, 0.12)",
                  color: "#dc2626",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M10 13h4" />
                  <path d="M10 17h4" />
                  <path d="M10 9h1" />
                </svg>
              </div>
              <div>
                <span className="modal-title" style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                  Documento PDF del Expediente
                </span>
                <p className="sala-modal__sub" style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  {activeItem.nombreApellido} · C.I. {activeItem.cedula}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Cerrar modal"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="sala-modal__body" style={{ display: "flex", flexDirection: "column", gap: "1.2rem", padding: "1.2rem" }}>
          {/* Tarjeta de Documento Existente */}
          {hasDoc && (
            <div
              style={{
                border: "1px solid rgba(220, 38, 38, 0.25)",
                background: "linear-gradient(135deg, rgba(239, 68, 68, 0.04) 0%, rgba(239, 68, 68, 0.08) 100%)",
                borderRadius: "12px",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "8px",
                    background: "#dc2626",
                    color: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: "0.68rem",
                    letterSpacing: "0.5px",
                    flexShrink: 0,
                    boxShadow: "0 2px 6px rgba(220, 38, 38, 0.3)",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>PDF</span>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "0.95rem",
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={docName}
                  >
                    {docName}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                    <span>📦 {formatBytes(docSize)}</span>
                    {docFecha && <span>📅 {formatDateDisplay(docFecha)}</span>}
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Guardado</span>
                  </div>
                </div>
              </div>

              {/* Botones de acción del documento */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", paddingTop: "6px", borderTop: "1px dashed rgba(220, 38, 38, 0.2)" }}>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{
                    textDecoration: "none",
                    padding: "0.45rem 0.85rem",
                    fontSize: "0.82rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    borderRadius: "8px",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  <span>Abrir / Ver PDF</span>
                </a>

                <a
                  href={`${pdfUrl}?download=true`}
                  className="btn-secondary"
                  style={{
                    textDecoration: "none",
                    padding: "0.45rem 0.85rem",
                    fontSize: "0.82rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    borderRadius: "8px",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Descargar</span>
                </a>

                {canManage && (
                  <>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowReplaceForm((prev) => !prev)}
                      style={{
                        padding: "0.45rem 0.85rem",
                        fontSize: "0.82rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        borderRadius: "8px",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                      </svg>
                      <span>{showReplaceForm ? "Cancelar reemplazo" : "Reemplazar PDF"}</span>
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleDelete}
                      disabled={deleting}
                      style={{
                        padding: "0.45rem 0.85rem",
                        fontSize: "0.82rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        borderRadius: "8px",
                        color: "#dc2626",
                        borderColor: "rgba(220, 38, 38, 0.3)",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      <span>{deleting ? "Eliminando..." : "Eliminar"}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Formulario de Carga (visible si no tiene documento o si seleccionó reemplazar) */}
          {canManage && (!hasDoc || showReplaceForm) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {hasDoc ? "Subir nuevo documento (reemplazará el actual):" : "Seleccionar documento PDF a subir:"}
              </div>

              {/* Zona de arrastrar y soltar */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: isDragging ? "2px dashed #dc2626" : "2px dashed var(--border-color)",
                  borderRadius: "12px",
                  padding: "1.75rem 1rem",
                  textAlign: "center",
                  background: isDragging ? "rgba(239, 68, 68, 0.05)" : "var(--bg-secondary)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />

                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "#dc2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 10px",
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>

                <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                  {selectedFile ? (
                    <span style={{ color: "#dc2626" }}>{selectedFile.name}</span>
                  ) : (
                    <span>Haz clic aquí o arrastra un archivo PDF</span>
                  )}
                </div>

                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                  {selectedFile
                    ? `Tamaño: ${formatBytes(selectedFile.size)}`
                    : "Formato admitido: .pdf (máx. 20MB)"}
                </div>
              </div>

              {selectedFile && (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    style={{ fontSize: "0.82rem", padding: "0.45rem 0.85rem" }}
                  >
                    Descartar
                  </button>

                  <button
                    type="button"
                    className="btn-submit"
                    onClick={handleUpload}
                    disabled={uploading}
                    style={{
                      fontSize: "0.82rem",
                      padding: "0.45rem 1.1rem",
                      background: "#dc2626",
                      color: "#fff",
                      borderColor: "#dc2626",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      width: "auto",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>{uploading ? "Subiendo PDF..." : "Guardar Documento PDF"}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {!hasDoc && !canManage && (
            <div
              style={{
                padding: "1rem",
                borderRadius: "10px",
                background: "var(--bg-secondary)",
                textAlign: "center",
                color: "var(--text-secondary)",
                fontSize: "0.88rem",
              }}
            >
              Este expediente aún no cuenta con un documento PDF cargado.
            </div>
          )}
        </div>

        {/* Pie de modal */}
        <div className="sala-modal__foot" style={{ display: "flex", justifyContent: "flex-end", padding: "0.85rem 1.2rem" }}>
          <button
            type="button"
            className="btn-submit"
            onClick={onClose}
            style={{ width: "auto", minWidth: "100px" }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
