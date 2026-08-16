"use client";

// ── Modal de CONFIRMACIÓN reutilizable (reemplaza el confirm() nativo) ───────
// Estilo del app (modal-content--detail, título en rojo, recuadro punteado con el
// elemento, botón "Sí, eliminar" rojo con spinner). `onConfirm` es async: el modal
// muestra el spinner y se cierra solo al terminar. Pensado para borrados.

import { useState, useEffect, type ReactNode } from "react";
import { useAnimatedModal } from "@/components/useAnimatedModal";

export default function ConfirmModal({
  title = "Confirmar eliminación",
  message,
  highlight,
  note = "Esta acción no se puede deshacer.",
  confirmLabel = "Sí, eliminar",
  cancelLabel = "Cancelar",
  onConfirm,
  onClose,
}: {
  title?: string;
  message: ReactNode;
  highlight?: string;   // nombre/elemento resaltado en el recuadro rojo punteado
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [show, setShow] = useState(true);
  const [busy, setBusy] = useState(false);
  const modal = useAnimatedModal(show);
  const close = () => { if (!busy) setShow(false); };
  useEffect(() => { if (!modal.mounted) onClose(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [modal.mounted]);

  const doConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try { await onConfirm(); setShow(false); }
    catch { /* onConfirm maneja su propio error */ }
    finally { setBusy(false); }
  };

  if (!modal.mounted) return null;
  return (
    <div className={`modal-overlay${modal.closing ? " modal-overlay--closing" : ""}`} onClick={close}>
      <div className={`modal-content modal-content--detail${modal.closing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "400px" }}>
        <div className="modal-header">
          <span className="modal-title" style={{ color: "var(--color-danger)" }}>⚠️ {title}</span>
          <button className="modal-close" onClick={close} disabled={busy} aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: "0.5rem 0", color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: 1.5 }}>
          <p>{message}</p>
          {highlight && (
            <div style={{ margin: "1rem 0", padding: "0.75rem", backgroundColor: "var(--bg-primary)", borderRadius: "6px", border: "1px dashed #fca5a5", textAlign: "center", fontSize: "0.95rem", color: "var(--color-danger)", fontWeight: 700 }}>
              {highlight}
            </div>
          )}
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>{note}</p>
        </div>

        <div className="modal-edit-actions" style={{ marginTop: "1rem" }}>
          <button type="button" className="btn-secondary" onClick={close} disabled={busy}>{cancelLabel}</button>
          <button type="button" className="btn-submit" style={{ flex: 1, backgroundColor: "var(--color-danger)", borderColor: "var(--color-danger)" }} onClick={doConfirm} disabled={busy}>
            {busy ? <><span className="spinner spinner-sm"></span>Eliminando</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
