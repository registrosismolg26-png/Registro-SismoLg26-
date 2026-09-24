"use client";

import { useState, useEffect } from "react";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import StyledSelect from "@/components/StyledSelect";
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
  const modal = useAnimatedModal(isOpen);

  const [estatus, setEstatus] = useState<PlanteamientoSalaEstatus>("EN PROCESO");
  const [observacion, setObservacion] = useState("");
  const [fechaEntregaSubsidio, setFechaEntregaSubsidio] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
      setEstatus(item.estatus || "EN PROCESO");
      setObservacion(item.observacion || "");
      setFechaEntregaSubsidio(
        item.fechaEntregaSubsidio ||
        (item.estatus === "CREDITO ENTREGADO" ? new Date().toISOString().slice(0, 10) : "")
      );
    }
  }, [isOpen, item]);

  if (!modal.mounted || !item) return null;

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

      const res = await apiFetch(`/api/planteamiento-sala/${encodeURIComponent(item.id)}`, {
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
        <div className="modal-header" style={{ marginBottom: "1rem" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
              Actualizar Estatus del Expediente
            </h3>
            <p style={{ margin: "3px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              {item.nombreApellido} · C.I. {item.cedula}
            </p>
          </div>
          <button
            type="button"
            className="toolbar-btn"
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

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: "1rem" }}>
            <label>Estatus</label>
            <StyledSelect
              value={estatus}
              onChange={(v) => handleEstatusChange(v as PlanteamientoSalaEstatus)}
              ariaLabel="Estatus del expediente"
              options={ESTATUS_SALA_OPTIONS.map((e) => ({ value: e.value, label: e.label }))}
            />
          </div>

          {estatus === "CREDITO ENTREGADO" && (
            <div className="form-group" style={{ marginBottom: "1rem" }}>
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Fecha de Entrega de Subsidio</span>
                <span style={{ fontSize: "0.72rem", color: "#059669", fontWeight: 700 }}>
                  (Crédito Entregado)
                </span>
              </label>
              <input
                type="date"
                value={fechaEntregaSubsidio || new Date().toISOString().slice(0, 10)}
                onChange={(e) => setFechaEntregaSubsidio(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
          )}

          <div className="form-group" style={{ marginBottom: "1.5rem" }}>
            <label>Observación</label>
            <AutoGrowTextarea
              placeholder="Indica observaciones, motivos de retorno o novedades…"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              minRows={3}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
            <button type="button" className="toolbar-btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button
              type="submit"
              className="toolbar-btn toolbar-btn--primary"
              disabled={saving}
              style={{
                background: "var(--color-primary)",
                color: "#fff",
                fontWeight: 600,
                padding: "0 1.25rem",
              }}
            >
              {saving ? "Guardando…" : "Actualizar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
