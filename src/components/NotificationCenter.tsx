"use client";

// ── Centro de notificaciones internas (UNIFICADO) ───────────────────────────
// Un SOLO componente para TODAS las notificaciones flotantes: toasts (éxito/error/
// aviso/info), alertas con acción (p. ej. "Nuevo afectado") y el banner de
// actualización. Todas:
//   · centradas — ABAJO en PC, ARRIBA en móvil (CSS responsive)
//   · 100% pill, 100% responsive, 100% tema (variables del sistema)
//   · se DESCARTAN deslizando a cualquier lado (arrastre en vivo, attachSwipe)
//   · las que permiten POSPONER lo hacen solo desde su botón (no por swipe)
//
// La tarjeta arrastrada NO tiene animación CSS de transform (la de entrada va en el
// contenedor .ntf-slot) para que el arrastre imperativo no se "congele".

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { attachSwipe } from "@/lib/swipe";

export type NotifVariant = "success" | "error" | "warning" | "info" | "alert" | "update";
export interface NotifAction { label: string; primary?: boolean; onClick: () => void; }
export interface AppNotif {
  id: string;
  variant: NotifVariant;
  title?: string;
  message: ReactNode;
  actions?: NotifAction[];
  duration?: number;        // ms de auto-cierre; 0/undefined = permanece hasta acción/gesto
  onClose?: () => void;     // se llama al cerrarse (swipe / temporizador / botón X)
}

const ACCENT: Record<NotifVariant, string> = {
  success: "var(--color-success)",
  error: "var(--color-danger)",
  warning: "var(--color-warning)",
  info: "var(--color-primary)",
  alert: "var(--color-primary)",
  update: "var(--color-primary)",
};

function VariantIcon({ variant }: { variant: NotifVariant }) {
  const p: Record<NotifVariant, ReactNode> = {
    success: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
    error: <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>,
    warning: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    info: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
    alert: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
    update: <><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p[variant]}</svg>;
}

function NotifCard({ item, onDismiss }: { item: AppNotif; onDismiss: (id: string) => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const closedRef = useRef(false);
  const simple = !item.title && (!item.actions || item.actions.length === 0);

  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onDismiss(item.id);
    item.onClose?.();
  };

  // Arrastre: descartar hacia cualquier lado (izq o der). Posponer NO va por swipe.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    return attachSwipe(el, () => ({
      onLeft: close,
      onRight: close,
      fade: true,
      ignoreSelector: "button",
      touchAction: "none",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-cierre opcional.
  useEffect(() => {
    if (!item.duration) return;
    const t = window.setTimeout(close, item.duration);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.duration]);

  return (
    <div className="ntf-slot">
      <div
        ref={cardRef}
        className={`ntf-card${simple ? " ntf-card--simple" : ""}`}
        style={{ "--accent": ACCENT[item.variant] } as CSSProperties}
        role="status"
        aria-live="polite"
      >
        <div className="ntf-card__row">
          <span className="ntf-card__ico"><VariantIcon variant={item.variant} /></span>
          <div className="ntf-card__main">
            {item.title && <div className="ntf-card__title">{item.title}</div>}
            <div className="ntf-card__msg">{item.message}</div>
          </div>
          <button type="button" className="ntf-card__x" aria-label="Descartar" onClick={close}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        {item.actions && item.actions.length > 0 && (
          <div className="ntf-card__actions">
            {item.actions.map((a, i) => (
              <button
                key={i}
                type="button"
                className={`ntf-card__btn${a.primary ? " ntf-card__btn--primary" : ""}`}
                onClick={() => { a.onClick(); close(); }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NotificationCenter({ items, onDismiss }: { items: AppNotif[]; onDismiss: (id: string) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className="ntf-center" aria-live="polite">
      {items.map((it) => <NotifCard key={it.id} item={it} onDismiss={onDismiss} />)}
    </div>,
    document.body
  );
}
