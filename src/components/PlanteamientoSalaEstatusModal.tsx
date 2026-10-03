"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import StyledSelect from "@/components/StyledSelect";
import DatePicker from "@/components/DatePicker";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import { ESTATUS_SALA_OPTIONS } from "@/lib/constants";
import { apiFetch } from "@/lib/apiFetch";
import type { PlanteamientoSalaItem, PlanteamientoSalaEstatus } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  item: PlanteamientoSalaItem | null;
  showToast: (msg: string, type: "success" | "error" | "info" | "warning") => void;
}

export default function PlanteamientoSalaEstatusModal({
  isOpen,
  onClose,
  onUpdated,
  item,
  showToast,
}: Props) {
  const modal = useAnimatedModal(isOpen && item ? item : null);
  const activeItem = modal.data;

  const [estatus, setEstatus] = useState<PlanteamientoSalaEstatus>("SIN ESTATUS");
  const [observacion, setObservacion] = useState("");
  const [fechaEntregaSubsidio, setFechaEntregaSubsidio] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
      setEstatus(item.estatus || "SIN ESTATUS");
      setObservacion(item.observacion || "");
      setFechaEntregaSubsidio(
        item.fechaEntregaSubsidio ||
        (item.estatus === "CREDITO ENTREGADO" ? new Date().toISOString().slice(0, 10) : "")
      );
    }
  }, [isOpen, item]);

  if (!modal.mounted || !activeItem || typeof document === "undefined") return null;

  const handleEstatusChange = (val: PlanteamientoSalaEstatus) => {
    setEstatus(val);
    if (val === "CREDITO ENTREGADO" && !fechaEntregaSubsidio) {
      setFechaEntregaSubsidio(new Date().toISOString().slice(0, 10));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = { estatus, observacion };
      if (estatus === "CREDITO ENTREGADO") {
        payload.fechaEntregaSubsidio = fechaEntregaSubsidio || new Date().toISOString().slice(0, 10);
      } else {
        payload.fechaEntregaSubsidio = null;
      }

      const res = await apiFetch(`/api/planteamiento-sala/${encodeURIComponent(activeItem.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        showToast("Estatus y observación actualizados.", "success");
        onUpdated();
        onClose();
      } else {
        showToast(data?.error || "Error al actualizar estatus.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error de conexión al actualizar.", "error");
    } finally {
      setSaving(false);
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
        className={`modal-content pill-form sala-status-modal${modal.closing ? " modal-content--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sala-modal__head">
          <div className="msheet__grip" aria-hidden />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", width: "100%" }}>
            <div>
              <span className="modal-title" style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                Actualizar Estatus del Expediente
              </span>
              <p className="sala-modal__sub" style={{ margin: "3px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                {activeItem.nombreApellido} · C.I. {activeItem.cedula}
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

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div className="sala-modal__body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="form-group">
              <label>Estatus</label>
              <StyledSelect
                value={estatus}
                onChange={(v) => handleEstatusChange(v as PlanteamientoSalaEstatus)}
                ariaLabel="Estatus del expediente"
                options={ESTATUS_SALA_OPTIONS.map((e) => ({ value: e.value, label: e.label }))}
              />
            </div>

            {estatus === "CREDITO ENTREGADO" && (
              <div className="form-group">
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Fecha de Entrega de Subsidio</span>
                  <span style={{ fontSize: "0.72rem", color: "#059669", fontWeight: 700 }}>
                    (Crédito Entregado)
                  </span>
                </label>
                <DatePicker
                  value={fechaEntregaSubsidio || new Date().toISOString().slice(0, 10)}
                  onChange={setFechaEntregaSubsidio}
                  defaultToday
                />
              </div>
            )}

            <div className="form-group">
              <label>Observación</label>
              <AutoGrowTextarea
                placeholder="Indica observaciones, motivos de retorno o novedades…"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                minRows={3}
              />
            </div>
          </div>

          <div className="sala-modal__foot">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-submit"
              disabled={saving}
            >
              {saving ? "Guardando…" : "Actualizar"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
