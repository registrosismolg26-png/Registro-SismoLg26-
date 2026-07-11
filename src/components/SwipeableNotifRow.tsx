"use client";

// ── Fila de notificación deslizable ─────────────────────────────────────────
// Se agarra y se mueve con el dedo/ratón EN VIVO (translate 1:1). Al soltar:
//  · derecha → Posponer (snooze)   · izquierda → Descartar (quitar).
// Debajo del umbral, vuelve a su sitio. Bloqueo de eje: si el gesto empieza
// vertical, no interfiere con el scroll de la lista. Mismo patrón probado del
// SwipeableToast (listeners nativos, touchmove no pasivo).

import { useEffect, useRef, useState, type ReactNode } from "react";

const THRESHOLD = 84;   // px para que la acción "arme"
const OFF = 460;        // desplazamiento al salir

interface Props {
  className?: string;              // clases del contenido (p. ej. "notif-item notif-item--unread")
  onOpen: () => void;
  onDismiss: () => void;
  onSnooze: () => void;
  children: ReactNode;
}

export default function SwipeableNotifRow({ className = "", onOpen, onDismiss, onSnooze, children }: Props) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fgRef = useRef<HTMLDivElement | null>(null);
  const movedRef = useRef(false);

  const finish = (val: number) => {
    if (val <= -THRESHOLD) { setDx(-OFF); setTimeout(onDismiss, 170); }
    else if (val >= THRESHOLD) { setDx(OFF); setTimeout(onSnooze, 170); }
    else setDx(0);
  };

  // Táctil (móvil): native listeners con preventDefault no pasivo + bloqueo de eje.
  useEffect(() => {
    const el = fgRef.current;
    if (!el) return;
    let sx = 0, sy = 0, cur = 0, axis: "" | "x" | "y" = "";
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; axis = ""; cur = 0; movedRef.current = false;
      setDragging(true);
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const ddx = e.touches[0].clientX - sx;
      const ddy = e.touches[0].clientY - sy;
      if (!axis) {
        if (Math.abs(ddx) < 6 && Math.abs(ddy) < 6) return;
        axis = Math.abs(ddx) > Math.abs(ddy) ? "x" : "y";
      }
      if (axis === "y") return;          // dejar que la lista haga scroll
      e.preventDefault();                // capturamos el horizontal
      movedRef.current = true;
      cur = ddx; setDx(ddx);
    };
    const end = () => { setDragging(false); if (axis === "x") finish(cur); axis = ""; };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end); el.removeEventListener("touchcancel", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDismiss, onSnooze]);

  // Ratón (PC): arrastre por eventos de ventana.
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const sx = e.clientX; let cur = 0; movedRef.current = false; setDragging(true);
    const mm = (ev: MouseEvent) => { cur = ev.clientX - sx; if (Math.abs(cur) > 3) movedRef.current = true; setDx(cur); };
    const mu = () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); setDragging(false); finish(cur); };
    window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu);
  };

  const click = () => { if (!movedRef.current) onOpen(); };
  const revealing = dx > 4 ? "snooze" : dx < -4 ? "dismiss" : null;
  const armed = Math.abs(dx) >= THRESHOLD;

  return (
    <div className="swipe-row">
      {revealing === "snooze" && (
        <div className={`swipe-row__act swipe-row__act--snooze${armed ? " is-armed" : ""}`} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          <span>Posponer</span>
        </div>
      )}
      {revealing === "dismiss" && (
        <div className={`swipe-row__act swipe-row__act--dismiss${armed ? " is-armed" : ""}`} aria-hidden>
          <span>Descartar</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
        </div>
      )}
      <div
        ref={fgRef}
        className={`swipe-row__fg ${className}`}
        role="button"
        tabIndex={0}
        onMouseDown={onMouseDown}
        onClick={click}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        onDragStart={(e) => e.preventDefault()}
        draggable={false}
        style={{ transform: `translate3d(${dx}px,0,0)`, transition: dragging ? "none" : "transform 0.17s ease-out", touchAction: "pan-y", cursor: dragging ? "grabbing" : "pointer", userSelect: "none" }}
      >
        {children}
      </div>
    </div>
  );
}
