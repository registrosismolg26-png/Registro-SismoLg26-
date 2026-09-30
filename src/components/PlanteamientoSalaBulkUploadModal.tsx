"use client";

import { useState, useEffect, useRef, useMemo, ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import { apiFetch } from "@/lib/apiFetch";
import {
  descargarPlantillaPlanteamientoSala,
  parsePlanteamientoSalaXlsx,
  BulkTitularParsed,
} from "@/lib/plantillaPlanteamientoSala";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentRefugio: string;
  campamentosList: { id: string; nombre: string }[];
  onSuccess: () => void;
  showToast: (msg: string, type: "success" | "error" | "info" | "warning") => void;
}

export default function PlanteamientoSalaBulkUploadModal({
  isOpen,
  onClose,
  currentRefugio,
  campamentosList,
  onSuccess,
  showToast,
}: Props) {
  const modal = useAnimatedModal(isOpen);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedRefugio, setSelectedRefugio] = useState<string>(currentRefugio || "");
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Datos parseados
  const [parsedTitulares, setParsedTitulares] = useState<BulkTitularParsed[]>([]);
  const [totalFamiliares, setTotalFamiliares] = useState<number>(0);
  const [fileName, setFileName] = useState<string>("");
  const [fileWarnings, setFileWarnings] = useState<string[]>([]);
  const [previewFilter, setPreviewFilter] = useState<string>("");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [includeExtraTitulares, setIncludeExtraTitulares] = useState<boolean>(true);

  // Resultado tras procesar
  const [uploadResult, setUploadResult] = useState<{
    countTitulares: number;
    countFamiliares: number;
    countCreados: number;
    countActualizados: number;
    countCne: number;
    refugio: string;
  } | null>(null);

  // Si cambia currentRefugio y el selector local está vacío
  useMemo(() => {
    if (currentRefugio && !selectedRefugio) {
      setSelectedRefugio(currentRefugio);
    }
  }, [currentRefugio]);

  // Limpieza completa del estado y archivo
  const handleReset = () => {
    setParsedTitulares([]);
    setTotalFamiliares(0);
    setFileName("");
    setFileWarnings([]);
    setUploadResult(null);
    setExpandedRows({});
    setPreviewFilter("");
    setIncludeExtraTitulares(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Cada vez que se cierra el modal, reseteamos para que nunca queden datos pendientes
  useEffect(() => {
    if (!isOpen) {
      handleReset();
    }
  }, [isOpen]);

  const countTitularesHoja1 = useMemo(() => {
    return parsedTitulares.filter((t) => t.origen !== "HOJA_FAMILIA").length;
  }, [parsedTitulares]);

  const countTitularesExtra = useMemo(() => {
    return parsedTitulares.filter((t) => t.origen === "HOJA_FAMILIA").length;
  }, [parsedTitulares]);

  const effectiveTitulares = useMemo(() => {
    if (includeExtraTitulares) return parsedTitulares;
    return parsedTitulares.filter((t) => t.origen !== "HOJA_FAMILIA");
  }, [parsedTitulares, includeExtraTitulares]);

  const effectiveTotalFamiliares = useMemo(() => {
    return effectiveTitulares.reduce((acc, t) => acc + (t.cargaFamiliar?.length || 0), 0);
  }, [effectiveTitulares]);

  if (!modal.mounted) return null;

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      await descargarPlantillaPlanteamientoSala(selectedRefugio || undefined);
      showToast("Plantilla oficial descargada con éxito.", "success");
    } catch (err) {
      console.error(err);
      showToast("Error al descargar la plantilla.", "error");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setParsing(true);
    setFileName(file.name);
    try {
      const res = await parsePlanteamientoSalaXlsx(file);
      setParsedTitulares(res.titulares);
      setTotalFamiliares(res.totalFamiliares);
      setFileWarnings(res.warnings);

      if (res.titulares.length === 0) {
        showToast("No se encontraron registros de cédula válidos en el archivo.", "error");
      } else {
        showToast(
          `Archivo leído: ${res.titulares.length} titulares y ${res.totalFamiliares} familiares encontrados.`,
          "success"
        );
      }
    } catch (err) {
      console.error(err);
      showToast("Error al procesar el archivo Excel. Verifica el formato.", "error");
      setParsedTitulares([]);
    } finally {
      setParsing(false);
    }
  };

  const handleToggleExpand = (cedula: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [cedula]: !prev[cedula],
    }));
  };

  const handleStartUpload = async () => {
    if (!selectedRefugio) {
      showToast("Por favor selecciona el campamento de destino.", "warning");
      return;
    }
    if (effectiveTitulares.length === 0) {
      showToast("No hay registros válidos para cargar.", "warning");
      return;
    }

    setUploading(true);
    try {
      const res = await apiFetch("/api/planteamiento-sala/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refugio: selectedRefugio,
          items: effectiveTitulares,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setUploadResult({
          countTitulares: data.countTitulares || 0,
          countFamiliares: data.countFamiliares || 0,
          countCreados: data.countCreados || 0,
          countActualizados: data.countActualizados || 0,
          countCne: data.countCne || 0,
          refugio: data.refugio || selectedRefugio,
        });
        showToast(`Carga masiva completada: ${data.countTitulares} expedientes procesados.`, "success");
        onSuccess();
      } else {
        showToast(data?.error || "Error al procesar la carga masiva.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error de conexión durante la carga masiva.", "error");
    } finally {
      setUploading(false);
    }
  };

  // Filtrado de la vista previa
  const filteredPreview = useMemo(() => {
    return effectiveTitulares.filter((tit) => {
      if (!previewFilter.trim()) return true;
      const q = previewFilter.toLowerCase();
      const matchTit =
        tit.cedula.includes(q) ||
        tit.nombreApellido.toLowerCase().includes(q) ||
        (tit.telefono && tit.telefono.includes(q));
      const matchFam = tit.cargaFamiliar.some(
        (fam) =>
          fam.cedula.includes(q) ||
          fam.nombreApellido.toLowerCase().includes(q) ||
          fam.parentesco.toLowerCase().includes(q)
      );
      return matchTit || matchFam;
    });
  }, [effectiveTitulares, previewFilter]);

  if (!modal.mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`modal-overlay modal-overlay--sala${modal.closing ? " modal-overlay--closing" : ""}`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`modal-content pill-form${modal.closing ? " modal-content--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "880px",
          width: "95vw",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          padding: "1.4rem",
        }}
      >
        {/* Cabecera del Modal */}
        <div
          className="modal-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: "0.85rem",
            borderBottom: "1px solid var(--border-color)",
            marginBottom: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                background: "rgba(37, 99, 235, 0.12)",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Carga Masiva con Grupo Familiar
              </div>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                Planteamiento Sala • Carga de expedientes y familiares desde plantilla Excel
              </p>
            </div>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={handleClose}
            aria-label="Cerrar modal"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Contenido con scroll */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {/* Si ya terminó la carga con éxito */}
          {uploadResult ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                padding: "2rem 1.5rem",
                background: "rgba(22, 163, 74, 0.05)",
                borderRadius: "16px",
                border: "1px solid rgba(22, 163, 74, 0.2)",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "#16a34a",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "1rem",
                }}
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#16a34a", marginBottom: "0.4rem" }}>
                ¡Carga Masiva Exitosa!
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", maxWidth: "520px", marginBottom: "1.5rem" }}>
                Los expedientes y sus integrantes familiares han sido registrados correctamente en el campamento{" "}
                <b>{uploadResult.refugio}</b>.
              </p>

              {/* Tarjetas de Estadísticas */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "0.85rem",
                  width: "100%",
                  maxWidth: "600px",
                  marginBottom: "1.75rem",
                }}
              >
                <div style={{ background: "var(--bg-primary)", padding: "0.85rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--color-primary)" }}>{uploadResult.countTitulares}</div>
                  <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", fontWeight: 600 }}>Titulares Procesados</div>
                </div>
                <div style={{ background: "var(--bg-primary)", padding: "0.85rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#16a34a" }}>{uploadResult.countCreados}</div>
                  <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", fontWeight: 600 }}>Nuevos Expedientes</div>
                </div>
                <div style={{ background: "var(--bg-primary)", padding: "0.85rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#2563eb" }}>{uploadResult.countFamiliares}</div>
                  <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", fontWeight: 600 }}>Familiares Vinculados</div>
                </div>
                <div style={{ background: "var(--bg-primary)", padding: "0.85rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#d97706" }}>{uploadResult.countCne}</div>
                  <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", fontWeight: 600 }}>Identificados CNE</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={handleReset}
                  style={{ padding: "0.6rem 1.25rem", borderRadius: "9px" }}
                >
                  Cargar Otro Archivo
                </button>
                <button
                  type="button"
                  className="toolbar-btn toolbar-btn--primary"
                  onClick={handleClose}
                  style={{ padding: "0.6rem 1.5rem", borderRadius: "9px", fontWeight: 700 }}
                >
                  Aceptar y Ver Expedientes
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Selector de Campamento Destino */}
              <div
                style={{
                  background: "var(--bg-secondary)",
                  padding: "0.9rem 1.1rem",
                  borderRadius: "14px",
                  border: "1px solid var(--border-color)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)", display: "block" }}>
                    Campamento de Destino *
                  </label>
                  <p style={{ margin: "2px 0 0", fontSize: "0.76rem", color: "var(--text-secondary)" }}>
                    Los expedientes se registrarán anclados a este campamento.
                  </p>
                </div>
                <select
                  value={selectedRefugio}
                  onChange={(e) => setSelectedRefugio(e.target.value)}
                  disabled={uploading}
                  style={{
                    padding: "0.5rem 0.85rem",
                    borderRadius: "9px",
                    border: "1.5px solid var(--border-color)",
                    background: "var(--bg-primary)",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    minWidth: "260px",
                  }}
                >
                  <option value="">-- Selecciona un Campamento --</option>
                  {campamentosList.map((c) => (
                    <option key={c.id} value={c.nombre}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Guía y Descarga de Plantilla */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "0.85rem",
                }}
              >
                {/* Tarjeta de Instrucción y Descarga de Plantilla */}
                <div
                  style={{
                    background: "rgba(37, 99, 235, 0.05)",
                    border: "1px solid rgba(37, 99, 235, 0.2)",
                    borderRadius: "14px",
                    padding: "1rem 1.15rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "0.85rem",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.4rem" }}>
                      <span
                        style={{
                          background: "#2563eb",
                          color: "#ffffff",
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          padding: "2px 7px",
                          borderRadius: "999px",
                        }}
                      >
                        Paso 1
                      </span>
                      <span style={{ fontSize: "0.92rem", fontWeight: 700, color: "#1e3a8a" }}>
                        Descargar Plantilla Oficial
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                      Incluye la hoja de <b>Titulares</b>, la hoja de <b>Carga Familiar</b> y una guía detallada con los
                      parentescos y modalidades válidas. Si dejas los nombres vacíos, el sistema los consultará en CNE.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={handleDownloadTemplate}
                    disabled={downloadingTemplate}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      background: "#2563eb",
                      color: "#ffffff",
                      border: "none",
                      padding: "0.6rem 1rem",
                      borderRadius: "10px",
                      fontWeight: 700,
                      fontSize: "0.84rem",
                      cursor: "pointer",
                      boxShadow: "0 2px 4px rgba(37,99,235,0.25)",
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>{downloadingTemplate ? "Generando..." : "Descargar Plantilla Excel (.xlsx)"}</span>
                  </button>
                </div>

                {/* Dropzone para Subir Archivo Excel */}
                <div
                  style={{
                    background: fileName ? "rgba(16, 185, 129, 0.04)" : "var(--bg-primary)",
                    border: fileName ? "2px solid #10b981" : "2px dashed var(--border-color)",
                    borderRadius: "14px",
                    padding: "1rem 1.15rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    gap: "0.65rem",
                    cursor: "pointer",
                    position: "relative",
                    transition: "all 0.15s ease",
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    style={{ display: "none" }}
                    onChange={handleFileChange}
                  />

                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "50%",
                      background: fileName ? "#10b981" : "rgba(16, 185, 129, 0.12)",
                      color: fileName ? "#ffffff" : "#10b981",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <polyline points="12 11 12 17" />
                      <polyline points="9 14 12 11 15 14" />
                    </svg>
                  </div>

                  <div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: fileName ? "#047857" : "var(--text-primary)" }}>
                      {parsing ? "Leyendo archivo..." : fileName ? fileName : "Seleccionar o arrastrar archivo Excel"}
                    </div>
                    <p style={{ margin: "2px 0 0", fontSize: "0.76rem", color: "var(--text-secondary)" }}>
                      {fileName
                        ? "Archivo cargado. Haz clic para cambiarlo por otro archivo."
                        : "Haz clic para subir la plantilla completada (.xlsx)"}
                    </p>
                  </div>

                  {fileName && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReset();
                        showToast("Archivo y previsualización descartados.", "info");
                      }}
                      style={{
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        background: "rgba(239, 68, 68, 0.1)",
                        color: "#dc2626",
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                        borderRadius: "8px",
                        padding: "4px 9px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      title="Quitar y descartar este archivo"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      <span>Quitar</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Alertas / Advertencias de formato si existen */}
              {fileWarnings.length > 0 && (
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: "10px",
                    padding: "0.6rem 0.85rem",
                    fontSize: "0.8rem",
                    color: "#b91c1c",
                  }}
                >
                  {fileWarnings.map((w, idx) => (
                    <div key={idx}>⚠️ {w}</div>
                  ))}
                </div>
              )}

              {/* Vista Previa de Datos Cargados */}
              {parsedTitulares.length > 0 && (
                <div
                  style={{
                    background: "var(--bg-secondary)",
                    borderRadius: "14px",
                    border: "1px solid var(--border-color)",
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  {/* Barra de Estadísticas de la Vista Previa */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span
                        style={{
                          background: "#2563eb",
                          color: "#ffffff",
                          fontSize: "0.76rem",
                          fontWeight: 800,
                          padding: "3px 9px",
                          borderRadius: "7px",
                        }}
                      >
                        {effectiveTitulares.length} Titulares
                      </span>
                      <span
                        style={{
                          background: "rgba(37, 99, 235, 0.12)",
                          color: "#2563eb",
                          fontSize: "0.76rem",
                          fontWeight: 800,
                          padding: "3px 9px",
                          borderRadius: "7px",
                        }}
                      >
                        {effectiveTotalFamiliares} Familiares Vinculados
                      </span>

                      {/* Botón para borrar/descartar la carga masiva */}
                      <button
                        type="button"
                        onClick={() => {
                          handleReset();
                          showToast("Carga masiva descartada.", "info");
                        }}
                        title="Borrar y descartar este archivo para empezar de nuevo"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "rgba(239, 68, 68, 0.1)",
                          color: "#dc2626",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          borderRadius: "7px",
                          padding: "3px 9px",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                        <span>Descartar Carga</span>
                      </button>
                    </div>

                    <input
                      type="text"
                      placeholder="Filtrar por cédula, nombre o parentesco..."
                      value={previewFilter}
                      onChange={(e) => setPreviewFilter(e.target.value)}
                      style={{
                        padding: "0.35rem 0.75rem",
                        fontSize: "0.8rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-primary)",
                        width: "240px",
                      }}
                    />
                  </div>

                  {/* Panel de control si hay titulares adicionales detectados solo en la hoja familiar */}
                  {countTitularesExtra > 0 && (
                    <div
                      style={{
                        background: "rgba(245, 158, 11, 0.08)",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        borderRadius: "9px",
                        padding: "0.55rem 0.85rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "0.6rem",
                        fontSize: "0.78rem",
                      }}
                    >
                      <div style={{ color: "#92400e" }}>
                        ℹ️ La Hoja 1 tiene <b>{countTitularesHoja1}</b> titulares definidos. En la Hoja Familiar se detectaron <b>{countTitularesExtra}</b> cédulas de titulares adicionales.
                      </div>
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          cursor: "pointer",
                          fontWeight: 700,
                          color: "#78350f",
                          background: "var(--bg-primary)",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          border: "1px solid rgba(245, 158, 11, 0.3)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={includeExtraTitulares}
                          onChange={(e) => setIncludeExtraTitulares(e.target.checked)}
                          style={{ cursor: "pointer", width: "15px", height: "15px" }}
                        />
                        <span>Cargar los {countTitularesExtra} adicionales</span>
                      </label>
                    </div>
                  )}

                  {/* Tabla interactiva de Vista Previa */}
                  <div
                    style={{
                      maxHeight: "260px",
                      overflowY: "auto",
                      borderRadius: "10px",
                      border: "1px solid var(--border-color)",
                      background: "var(--bg-primary)",
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                      <thead>
                        <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                          <th style={{ padding: "8px 10px", fontWeight: 700 }}>#</th>
                          <th style={{ padding: "8px 10px", fontWeight: 700 }}>Cédula Titular</th>
                          <th style={{ padding: "8px 10px", fontWeight: 700 }}>Nombre / Estado CNE</th>
                          <th style={{ padding: "8px 10px", fontWeight: 700 }}>Teléfono</th>
                          <th style={{ padding: "8px 10px", fontWeight: 700 }}>Modalidad</th>
                          <th style={{ padding: "8px 10px", fontWeight: 700 }}>Carga Familiar</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700 }}>Detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPreview.map((tit, idx) => {
                          const isExpanded = Boolean(expandedRows[tit.cedula]);
                          return (
                            <tbody key={tit.cedula}>
                              <tr
                                style={{
                                  borderBottom: "1px solid var(--border-color)",
                                  background: idx % 2 === 1 ? "rgba(0,0,0,0.015)" : "transparent",
                                }}
                              >
                                <td style={{ padding: "7px 10px", color: "var(--text-secondary)" }}>{idx + 1}</td>
                                <td style={{ padding: "7px 10px", fontWeight: 700 }}>
                                  <span>V-{tit.cedula}</span>
                                  {tit.origen === "HOJA_FAMILIA" && (
                                    <span
                                      style={{
                                        display: "inline-block",
                                        marginLeft: "6px",
                                        fontSize: "0.68rem",
                                        fontWeight: 700,
                                        color: "#b45309",
                                        background: "rgba(245, 158, 11, 0.12)",
                                        padding: "1px 6px",
                                        borderRadius: "4px",
                                      }}
                                      title="Este titular se originó en la Hoja de Carga Familiar"
                                    >
                                      Hoja Familia
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: "7px 10px" }}>
                                  {tit.nombreApellido ? (
                                    <span>{tit.nombreApellido}</span>
                                  ) : (
                                    <span style={{ color: "#d97706", fontStyle: "italic", fontSize: "0.76rem" }}>
                                      ⚡ Búsqueda automática en CNE
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: "7px 10px", color: "var(--text-secondary)" }}>
                                  {tit.telefono || "—"}
                                </td>
                                <td style={{ padding: "7px 10px" }}>
                                  <span
                                    style={{
                                      fontSize: "0.72rem",
                                      fontWeight: 700,
                                      padding: "1px 7px",
                                      borderRadius: "5px",
                                      background:
                                        tit.tipoOpcion === "ALQUILER"
                                          ? "rgba(16, 185, 129, 0.1)"
                                          : tit.tipoOpcion === "PLAN_VENEZUELA_RENACE"
                                          ? "rgba(217, 119, 6, 0.1)"
                                          : "rgba(37, 99, 235, 0.1)",
                                      color:
                                        tit.tipoOpcion === "ALQUILER"
                                          ? "#10b981"
                                          : tit.tipoOpcion === "PLAN_VENEZUELA_RENACE"
                                          ? "#d97706"
                                          : "#2563eb",
                                    }}
                                  >
                                    {tit.tipoOpcion}
                                  </span>
                                </td>
                                <td style={{ padding: "7px 10px" }}>
                                  {tit.cargaFamiliar.length > 0 ? (
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        background: "rgba(37, 99, 235, 0.08)",
                                        color: "#2563eb",
                                        padding: "1px 7px",
                                        borderRadius: "999px",
                                        fontWeight: 700,
                                        fontSize: "0.74rem",
                                      }}
                                    >
                                      {tit.cargaFamiliar.length}{" "}
                                      {tit.cargaFamiliar.length === 1 ? "familiar" : "familiares"}
                                    </span>
                                  ) : (
                                    <span style={{ color: "var(--text-secondary)", fontSize: "0.74rem" }}>
                                      Sin familiares
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: "7px 10px", textAlign: "center" }}>
                                  {tit.cargaFamiliar.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleExpand(tit.cedula)}
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "#2563eb",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                        fontSize: "0.76rem",
                                      }}
                                    >
                                      {isExpanded ? "Ocultar ▲" : "Ver ▼"}
                                    </button>
                                  )}
                                </td>
                              </tr>

                              {/* Fila expandida con detalles de carga familiar */}
                              {isExpanded && (
                                <tr style={{ background: "rgba(37, 99, 235, 0.03)", borderBottom: "1px solid var(--border-color)" }}>
                                  <td colSpan={7} style={{ padding: "8px 14px" }}>
                                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1e3a8a", marginBottom: "4px" }}>
                                      Familiares asignados a V-{tit.cedula}:
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                      {tit.cargaFamiliar.map((fam, fIdx) => (
                                        <div
                                          key={fIdx}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "10px",
                                            fontSize: "0.74rem",
                                            color: "var(--text-primary)",
                                          }}
                                        >
                                          <span style={{ fontWeight: 700, minWidth: "70px", color: "#2563eb" }}>
                                            {fam.parentesco}:
                                          </span>
                                          <span>
                                            {fam.nombreApellido ? fam.nombreApellido : fam.cedula ? `V-${fam.cedula} (Auto CNE)` : "Sin nombre"}
                                          </span>
                                          {fam.cedula && (
                                            <span style={{ color: "var(--text-secondary)" }}>
                                              (Cédula: {fam.cedula})
                                            </span>
                                          )}
                                          {fam.fechaNacimiento && (
                                            <span style={{ color: "var(--text-secondary)" }}>
                                              • Nac: {fam.fechaNacimiento}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Pie del modal con acciones */}
        {!uploadResult && (
          <div
            className="modal-footer"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: "0.85rem",
              borderTop: "1px solid var(--border-color)",
              marginTop: "0.75rem",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                className="toolbar-btn"
                onClick={handleClose}
                disabled={uploading}
                style={{ padding: "0.5rem 1.15rem", borderRadius: "9px" }}
              >
                Cancelar y Cerrar
              </button>

              {parsedTitulares.length > 0 && (
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => {
                    handleReset();
                    showToast("Carga masiva descartada.", "info");
                  }}
                  disabled={uploading}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "9px",
                    background: "rgba(239, 68, 68, 0.08)",
                    color: "#dc2626",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                  <span>Descartar Archivo</span>
                </button>
              )}
            </div>

            <button
              type="button"
              className="toolbar-btn toolbar-btn--primary"
              onClick={handleStartUpload}
              disabled={uploading || effectiveTitulares.length === 0 || !selectedRefugio}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "0.55rem 1.4rem",
                borderRadius: "9px",
                fontWeight: 700,
                fontSize: "0.86rem",
              }}
            >
              {uploading ? (
                <>
                  <span className="spinner spinner-sm" />
                  <span>Procesando e Identificando en CNE...</span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  <span>
                    Iniciar Carga Masiva ({effectiveTitulares.length}{" "}
                    {effectiveTitulares.length === 1 ? "expediente" : "expedientes"})
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
