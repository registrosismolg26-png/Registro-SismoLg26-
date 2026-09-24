"use client";

import { useState } from "react";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import { apiFetch } from "@/lib/apiFetch";
import { exportPlanteamientoModalidadExcel } from "@/lib/exportPlanteamientoSalaExcel";
import type { PlanteamientoSalaItem, TipoOpcionPlanteamiento } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedRefugio: string;
  items: PlanteamientoSalaItem[];
  showToast: (msg: string, type: "success" | "error" | "info" | "warning") => void;
}

export default function PlanteamientoSalaExportModal({
  isOpen,
  onClose,
  selectedRefugio,
  items,
  showToast,
}: Props) {
  const modal = useAnimatedModal(isOpen);
  const [exporting, setExporting] = useState<string | null>(null);

  if (!modal.mounted) return null;

  // Conteo local rápido de expedientes por modalidad para la vista actual
  const countCompra = items.filter((it) => it.tipoOpcion === "MERCADO_SECUNDARIO").length;
  const countAlquiler = items.filter((it) => it.tipoOpcion === "ALQUILER").length;
  const countRenace = items.filter((it) => it.tipoOpcion === "PLAN_VENEZUELA_RENACE").length;

  const handleExport = async (modalidad: TipoOpcionPlanteamiento) => {
    setExporting(modalidad);
    try {
      // Consultamos los datos de esa modalidad (respetando el campamento activo si aplica)
      const params = new URLSearchParams();
      params.set("tipoOpcion", modalidad);
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

  return (
    <div
      className={`modal-overlay${modal.closing ? " modal-overlay--closing" : ""}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`modal-content pill-form${modal.closing ? " modal-content--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "480px" }}
      >
        <div className="modal-header" style={{ marginBottom: "0.5rem" }}>
          <h3 className="modal-title" style={{ fontSize: "1.2rem", fontWeight: 800 }}>
            Descargar Excel
          </h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Cerrar modal"
            style={{ width: "32px", height: "32px", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
            margin: "0 0 1.25rem",
          }}
        >
          Elige qué exportar{selectedRefugio !== "TODOS" ? ` (${selectedRefugio})` : ""}:
        </p>

        <div className="export-options">
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
                Mercado Secundario: 9 recaudos documentales, titularidad, estatus y fechas de avance ({countCompra}).
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
                Arrendamiento: 7 recaudos (carta compromiso, fotos, arrendador, arrendatario) y fechas ({countAlquiler}).
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
                Plan Venezuela Renace: recaudos de daños, fotos y desglose de materiales ({countRenace}).
              </small>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
