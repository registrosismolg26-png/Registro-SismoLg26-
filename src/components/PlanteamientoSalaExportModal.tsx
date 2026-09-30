"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import { apiFetch } from "@/lib/apiFetch";
import {
  exportPlanteamientoModalidadExcel,
  exportPlanteamientoTodasModalidadesExcel,
} from "@/lib/exportPlanteamientoSalaExcel";
import type { PlanteamientoSalaItem, TipoOpcionPlanteamiento } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedRefugio: string;
  items?: PlanteamientoSalaItem[];
  showToast: (msg: string, type: "success" | "error" | "info" | "warning") => void;
}

export default function PlanteamientoSalaExportModal({
  isOpen,
  onClose,
  selectedRefugio,
  items = [],
  showToast,
}: Props) {
  const modal = useAnimatedModal(isOpen);
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExportTodas = async () => {
    setExporting("TODAS");
    try {
      const params = new URLSearchParams();
      params.set("noPagination", "true");
      if (selectedRefugio && selectedRefugio !== "TODOS") {
        params.set("refugio", selectedRefugio);
      }

      const res = await apiFetch(`/api/planteamiento-sala?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      const expedientes: PlanteamientoSalaItem[] =
        res.ok && data?.success && Array.isArray(data.items)
          ? data.items
          : items;

      if (expedientes.length === 0) {
        showToast("No hay registros en este campamento para exportar.", "warning");
        setExporting(null);
        return;
      }

      const generadoEn = new Date().toLocaleString("es-VE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const filtrosDesc =
        selectedRefugio !== "TODOS"
          ? `Campamento: ${selectedRefugio}`
          : "Todos los Campamentos (26)";

      await exportPlanteamientoTodasModalidadesExcel({
        items: expedientes,
        refugio: selectedRefugio !== "TODOS" ? selectedRefugio : "Todos los Campamentos",
        generadoEn,
        filtros: filtrosDesc,
      });

      showToast("Archivo Excel con las 5 hojas descargado exitosamente.", "success");
      onClose();
    } catch (err) {
      console.error("Error al exportar Excel consolidado:", err);
      showToast("Error al generar el archivo Excel consolidado.", "error");
    } finally {
      setExporting(null);
    }
  };

  const handleExport = async (modalidad: TipoOpcionPlanteamiento) => {
    setExporting(modalidad);
    try {
      // Consultamos los datos de esa modalidad (respetando el campamento activo si aplica)
      const params = new URLSearchParams();
      params.set("tipoOpcion", modalidad);
      params.set("noPagination", "true");
      if (selectedRefugio && selectedRefugio !== "TODOS") {
        params.set("refugio", selectedRefugio);
      }

      const res = await apiFetch(`/api/planteamiento-sala?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      const expedientes: PlanteamientoSalaItem[] =
        res.ok && data?.success && Array.isArray(data.items)
          ? data.items
          : items.filter((it) => it.tipoOpcion === modalidad);

      if (expedientes.length === 0) {
        showToast("No hay registros para la modalidad seleccionada en este campamento.", "warning");
        setExporting(null);
        return;
      }

      const generadoEn = new Date().toLocaleString("es-VE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const filtrosDesc =
        selectedRefugio !== "TODOS"
          ? `Campamento: ${selectedRefugio}`
          : "Todos los Campamentos (26)";

      await exportPlanteamientoModalidadExcel({
        items: expedientes,
        modalidad,
        refugio: selectedRefugio !== "TODOS" ? selectedRefugio : "Todos los Campamentos",
        generadoEn,
        filtros: filtrosDesc,
      });

      showToast("Archivo Excel descargado exitosamente.", "success");
      onClose();
    } catch (err) {
      console.error("Error al exportar Excel de planteamiento:", err);
      showToast("Error al generar el archivo Excel.", "error");
    } finally {
      setExporting(null);
    }
  };

  if (!modal.mounted || typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`modal-overlay modal-overlay--sala${modal.closing ? " modal-overlay--closing" : ""}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`modal-content pill-form sala-export-modal${modal.closing ? " modal-content--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sala-modal__head">
          <div className="msheet__grip" aria-hidden />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", width: "100%" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Descargar Excel
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Elige la modalidad a exportar{selectedRefugio !== "TODOS" ? ` (${selectedRefugio})` : ""}:
              </p>
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

        <div className="sala-modal__body">
          <div className="export-options">
          {/* Opción Destacada: Todas las Modalidades (5 Hojas) */}
          <button
            type="button"
            className="export-option"
            onClick={handleExportTodas}
            disabled={exporting !== null}
            style={{
              background: "rgba(37, 99, 235, 0.05)",
              borderColor: "rgba(37, 99, 235, 0.35)",
              borderWidth: "1.5px",
            }}
          >
            <span
              className="export-option__icon"
              style={{
                background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
                color: "#ffffff",
                boxShadow: "0 2px 6px rgba(37,99,235,0.25)",
              }}
            >
              {exporting === "TODAS" ? (
                <span
                  className="spinner spinner-sm"
                  style={{ width: "18px", height: "18px", borderColor: "#ffffff", borderTopColor: "transparent" }}
                />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              )}
            </span>
            <span className="export-option__text" style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
                <strong style={{ color: "#1e3a8a", fontSize: "0.93rem" }}>
                  Descargar Todas las Modalidades
                </strong>
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 800,
                    background: "#2563eb",
                    color: "#ffffff",
                    padding: "2px 7px",
                    borderRadius: "5px",
                    letterSpacing: "0.3px",
                  }}
                >
                  5 HOJAS
                </span>
              </div>
              <small>
                Descarga un solo archivo Excel con las 5 hojas: <b>Alquiler</b>, <b>Mercado Secundario</b>, <b>Asignación GMVV</b>, <b>Venezuela Renace</b> y <b>Campamento Mayor Permanencia</b>.
              </small>
            </span>
          </button>

          {/* Opción 1: Compra de Vivienda */}
          <button
            type="button"
            className="export-option"
            onClick={() => handleExport("MERCADO_SECUNDARIO")}
            disabled={exporting !== null}
          >
            <span
              className="export-option__icon"
              style={{
                background: "rgba(37, 99, 235, 0.12)",
                color: "#2563eb",
              }}
            >
              {exporting === "MERCADO_SECUNDARIO" ? (
                <span className="spinner spinner-sm" style={{ width: "18px", height: "18px" }} />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              )}
            </span>
            <span className="export-option__text">
              <strong>Compra de Vivienda</strong>
              <small>
                Mercado Secundario: 9 recaudos documentales, titularidad, estatus y fechas de avance.
              </small>
            </span>
          </button>

          {/* Opción 2: Alquiler */}
          <button
            type="button"
            className="export-option"
            onClick={() => handleExport("ALQUILER")}
            disabled={exporting !== null}
          >
            <span
              className="export-option__icon"
              style={{
                background: "rgba(13, 148, 136, 0.12)",
                color: "#0d9488",
              }}
            >
              {exporting === "ALQUILER" ? (
                <span className="spinner spinner-sm" style={{ width: "18px", height: "18px" }} />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              )}
            </span>
            <span className="export-option__text">
              <strong>Alquiler</strong>
              <small>
                Arrendamiento: 7 recaudos (carta compromiso, fotos, arrendador, arrendatario) y fechas.
              </small>
            </span>
          </button>

          {/* Opción 3: Plan Venezuela Renace */}
          <button
            type="button"
            className="export-option"
            onClick={() => handleExport("PLAN_VENEZUELA_RENACE")}
            disabled={exporting !== null}
          >
            <span
              className="export-option__icon"
              style={{
                background: "rgba(217, 119, 6, 0.12)",
                color: "#d97706",
              }}
            >
              {exporting === "PLAN_VENEZUELA_RENACE" ? (
                <span className="spinner spinner-sm" style={{ width: "18px", height: "18px" }} />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              )}
            </span>
            <span className="export-option__text">
              <strong>Venezuela Renace</strong>
              <small>
                Plan Venezuela Renace: recaudos de daños, fotos y desglose de materiales.
              </small>
            </span>
          </button>

          {/* Opción 4: Campamento Mayor Permanencia */}
          <button
            type="button"
            className="export-option"
            onClick={() => handleExport("CAMPAMENTO_MAYOR_PERMANENCIA")}
            disabled={exporting !== null}
          >
            <span
              className="export-option__icon"
              style={{
                background: "rgba(234, 88, 12, 0.12)",
                color: "#ea580c",
              }}
            >
              {exporting === "CAMPAMENTO_MAYOR_PERMANENCIA" ? (
                <span className="spinner spinner-sm" style={{ width: "18px", height: "18px" }} />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              )}
            </span>
            <span className="export-option__text">
              <strong>Campamento Mayor Permanencia</strong>
              <small>
                Permanencia en campamentos: expedientes y núcleos familiares asignados.
              </small>
            </span>
          </button>

          {/* Opción 5: Asignación GMVV */}
          <button
            type="button"
            className="export-option"
            onClick={() => handleExport("ASIGNACION_GMVV")}
            disabled={exporting !== null}
          >
            <span
              className="export-option__icon"
              style={{
                background: "rgba(8, 145, 178, 0.12)",
                color: "#0891b2",
              }}
            >
              {exporting === "ASIGNACION_GMVV" ? (
                <span className="spinner spinner-sm" style={{ width: "18px", height: "18px" }} />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              )}
            </span>
            <span className="export-option__text">
              <strong>Asignación GMVV</strong>
              <small>
                Gran Misión Vivienda Venezuela: soluciones habitacionales asignadas directamente.
              </small>
            </span>
          </button>
        </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
