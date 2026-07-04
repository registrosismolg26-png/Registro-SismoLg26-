"use client";

// ── Hoja modal para táctil (teléfono/tablet) ────────────────────────────────
// Emula el comportamiento de los selectores/date nativos del móvil (bottom sheet
// / diálogo a pantalla) pero con NUESTROS estilos. Se renderiza en un portal a
// document.body por encima de todo, con overlay, animación de entrada/salida,
// bloqueo de scroll de fondo, cierre por backdrop/Esc y una franja opcional de
// búsqueda pegada bajo el encabezado (para el searchable).

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  search?: ReactNode;   // franja sticky de búsqueda (SearchableSelect/SingleSelect)
  fullHeight?: boolean; // modal alto (búsqueda con teclado) vs hoja inferior compacta
}

export default function MobileSheet({ open, onClose, title, children, search, fullHeight = false }: Props) {
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);

  // Monta al abrir; al cerrar, reproduce la animación de salida y luego desmonta.
  useEffect(() => {
    if (open) {
      setRender(true);
      setClosing(false);
      return;
    }
    if (render) {
      setClosing(true);
      const t = setTimeout(() => setRender(false), 190);
      return () => clearTimeout(t);
    }
  }, [open, render]);

  // Bloquea el scroll del fondo mientras la hoja está montada.
  useEffect(() => {
    if (!render) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [render]);

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!render || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`msheet-overlay${closing ? " is-closing" : ""}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`msheet${fullHeight ? " msheet--full" : ""}${closing ? " is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="msheet__grip" aria-hidden />
        <div className="msheet__head">
          <span className="msheet__title">{title}</span>
          <button type="button" className="msheet__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {search ? <div className="msheet__search">{search}</div> : null}
        <div className="msheet__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
