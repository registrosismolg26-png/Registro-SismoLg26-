"use client";

// ── Fila de notificación deslizable (campana) ───────────────────────────────
// Arrastre EN VIVO con listeners nativos (useSwipeDismiss → attachSwipe): sigue al
// dedo/ratón 1:1. Izquierda → Descartar, derecha → Posponer, toque → abrir. En una
// lista con scroll vertical, así que touchAction "pan-y". La acción de fondo se
// pinta con data-reveal / data-armed (imperativo).

import { useRef, type ReactNode, type CSSProperties } from "react";
import { useSwipeDismiss } from "@/lib/useSwipeDismiss";

interface Props {
  className?: string;
  style?: CSSProperties;
  onOpen: () => void;
  onDismiss: () => void;
  onSnooze: () => void;
  children: ReactNode;
}

export default function SwipeableNotifRow({ className = "", style, onOpen, onDismiss, onSnooze, children }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useSwipeDismiss<HTMLDivElement>({
    onLeft: onDismiss,
    onRight: onSnooze,
    onTap: onOpen,
    touchAction: "pan-y",
    onReveal: (dir, armed) => {
      const w = wrapRef.current;
      if (!w) return;
      w.dataset.reveal = dir === "right" ? "snooze" : dir === "left" ? "dismiss" : "";
      w.dataset.armed = armed ? "1" : "0";
    },
  });

  return (
    <div className="swipe-row" ref={wrapRef} data-reveal="" data-armed="0">
      <div className="swipe-row__act swipe-row__act--snooze" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        <span>Posponer</span>
      </div>
      <div className="swipe-row__act swipe-row__act--dismiss" aria-hidden>
        <span>Descartar</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
      </div>
      <div
        ref={fgRef}
        className={`swipe-row__fg ${className}`}
        style={style}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      >
        {children}
      </div>
    </div>
  );
}
