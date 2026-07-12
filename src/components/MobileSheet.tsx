"use client";

// ── Hoja modal para táctil (teléfono/tablet) ────────────────────────────────
// Emula el comportamiento de los selectores/date nativos del móvil (bottom sheet
// / diálogo a pantalla) pero con NUESTROS estilos. Se renderiza en un portal a
// document.body por encima de todo, con overlay, animación de entrada/salida,
// bloqueo de scroll de fondo, cierre por backdrop/Esc y una franja opcional de
// búsqueda pegada bajo el encabezado (para el searchable).
//
// DRAG-TO-CLOSE: sosteniendo el área de arrastre (grip + head) y deslizando
// hacia abajo se puede cerrar el sheet. Los listeners son directos en el DOM
// (no sintéticos de React) con requestAnimationFrame para máxima fluidez en
// pantallas táctiles. El overlay se desvanece en tiempo real junto al sheet.

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "./useBodyScrollLock";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  search?: ReactNode;   // franja sticky de búsqueda (SearchableSelect/SingleSelect)
  fullHeight?: boolean; // modal alto (búsqueda con teclado) vs hoja inferior compacta
  className?: string;   // clase CSS personalizada para el modal
}

const CLOSE_THRESHOLD = 72;  // px mínimos hacia abajo para cerrar
const CLOSE_VELOCITY  = 0.4; // px/ms — gesto rápido también cierra

export default function MobileSheet({ open, onClose, title, children, search, fullHeight = false, className = "" }: Props) {
  const [render, setRender]   = useState(open);
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

  useBodyScrollLock(render);

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ── Drag-to-close ──────────────────────────────────────────────────────────
  const sheetRef      = useRef<HTMLDivElement>(null);
  const overlayRef    = useRef<HTMLDivElement>(null);
  const handleRef     = useRef<HTMLDivElement>(null);
  const rafRef        = useRef<number | null>(null);
  const dragActive    = useRef(false);
  const startY        = useRef(0);
  const startTime     = useRef(0);
  const currentDY     = useRef(0);

  // Aplica el estado visual al frame actual (llamado desde rAF)
  const applyFrame = useCallback((dy: number) => {
    const sheet   = sheetRef.current;
    const overlay = overlayRef.current;
    if (!sheet || !overlay) return;

    const clamped  = Math.max(0, dy);
    const progress = Math.min(clamped / CLOSE_THRESHOLD, 1);

    sheet.style.transform  = `translateY(${clamped}px)`;
    sheet.style.willChange = "transform";

    // Overlay: opacidad y blur se desvanecen con el progreso del arrastre
    const opacity = 0.48 * (1 - progress * 0.88);
    const blur    = 2    * (1 - progress * 0.95);
    overlay.style.background              = `rgba(15,23,42,${opacity.toFixed(3)})`;
    overlay.style.backdropFilter          = `blur(${blur.toFixed(2)}px)`;
    (overlay.style as any).webkitBackdropFilter = `blur(${blur.toFixed(2)}px)`;
  }, []);

  const commitClose = useCallback(() => {
    const sheet   = sheetRef.current;
    const overlay = overlayRef.current;
    if (sheet && overlay) {
      sheet.style.transition   = "transform 0.22s cubic-bezier(0.4,0,1,1)";
      overlay.style.transition = "background 0.22s ease, backdrop-filter 0.22s ease, -webkit-backdrop-filter 0.22s ease";
      sheet.style.transform                      = "translateY(105%)";
      overlay.style.background                   = "rgba(15,23,42,0)";
      overlay.style.backdropFilter               = "blur(0px)";
      (overlay.style as any).webkitBackdropFilter = "blur(0px)";
    }
    setTimeout(onClose, 215);
  }, [onClose]);

  const commitSnap = useCallback(() => {
    const sheet   = sheetRef.current;
    const overlay = overlayRef.current;
    if (!sheet || !overlay) return;

    sheet.style.transition   = "transform 0.3s cubic-bezier(0.16,1,0.3,1)";
    overlay.style.transition = "background 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease";
    sheet.style.transform                      = "";
    overlay.style.background                   = "";
    overlay.style.backdropFilter               = "";
    (overlay.style as any).webkitBackdropFilter = "";
    sheet.style.willChange                     = "";

    const t = setTimeout(() => {
      if (sheetRef.current)   { sheetRef.current.style.transition = ""; sheetRef.current.style.willChange = ""; }
      if (overlayRef.current) { overlayRef.current.style.transition = ""; overlayRef.current.style.background = ""; overlayRef.current.style.backdropFilter = ""; }
    }, 320);
    return t;
  }, []);

  // Registra los listeners de touch/pointer directamente en el DOM para evitar
  // la latencia de los eventos sintéticos de React en móvil.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    const onTouchStart = (e: TouchEvent) => {
      dragActive.current = true;
      startY.current     = e.touches[0].clientY;
      startTime.current  = e.timeStamp;
      currentDY.current  = 0;

      if (sheetRef.current)   sheetRef.current.style.transition   = "none";
      if (overlayRef.current) overlayRef.current.style.transition = "none";
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragActive.current) return;
      const dy = e.touches[0].clientY - startY.current;
      currentDY.current = dy;

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => applyFrame(dy));

      if (dy > 0) e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!dragActive.current) return;
      dragActive.current = false;
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

      const dy       = currentDY.current;
      const dt       = Math.max(1, e.timeStamp - startTime.current);
      const velocity = dy / dt;

      if (dy > CLOSE_THRESHOLD || velocity > CLOSE_VELOCITY) {
        commitClose();
      } else {
        commitSnap();
      }
    };

    const onTouchCancel = () => {
      if (!dragActive.current) return;
      dragActive.current = false;
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      commitSnap();
    };

    handle.addEventListener("touchstart",  onTouchStart,  { passive: true });
    handle.addEventListener("touchmove",   onTouchMove,   { passive: false });
    handle.addEventListener("touchend",    onTouchEnd,    { passive: true });
    handle.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      handle.removeEventListener("touchstart",  onTouchStart);
      handle.removeEventListener("touchmove",   onTouchMove);
      handle.removeEventListener("touchend",    onTouchEnd);
      handle.removeEventListener("touchcancel", onTouchCancel);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [render, applyFrame, commitClose, commitSnap]);
  // ──────────────────────────────────────────────────────────────────────────

  if (!render || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      className={`msheet-overlay${closing ? " is-closing" : ""}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={sheetRef}
        className={`msheet${fullHeight ? " msheet--full" : ""}${closing ? " is-closing" : ""}${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Zona de arrastre: grip + cabecera */}
        <div ref={handleRef} className="msheet__drag-handle">
          <div className="msheet__grip" aria-hidden />
          <div className="msheet__head">
            <span className="msheet__title">{title}</span>
            <button type="button" className="msheet__close" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
        </div>
        {search ? <div className="msheet__search">{search}</div> : null}
        <div className="msheet__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
