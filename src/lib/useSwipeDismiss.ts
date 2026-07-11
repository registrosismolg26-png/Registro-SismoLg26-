"use client";

// ── Gesto de deslizar (arrastre EN VIVO, 1:1 con el dedo/ratón) ──────────────
// Clave: el `transform` se escribe DIRECTO al DOM en cada movimiento (imperativo,
// SIN estado de React) → sigue al dedo sin lag ni re-renders. Usa Pointer Events
// + pointer capture, así el arrastre NO se pierde aunque el dedo salga del
// elemento. Bloqueo de eje: si empieza vertical, cede al scroll de la lista.
//
// Reutilizable por: filas de la campana (izq=descartar / der=posponer con reveal),
// toasts, y tarjetas flotantes (aviso "nuevo afectado", banner de actualización).

import { useRef } from "react";
import type { PointerEvent as RPointerEvent, DragEvent as RDragEvent } from "react";

type Dir = "" | "left" | "right";

interface Opts {
  onLeft?: () => void;     // fling a la izquierda pasado el umbral
  onRight?: () => void;    // fling a la derecha pasado el umbral
  onTap?: () => void;      // toque sin arrastre
  onReveal?: (dir: Dir, armed: boolean) => void; // para pintar la acción de fondo
  baseTransform?: string;  // transform base a conservar (p. ej. "translateX(-50%)")
  fade?: boolean;          // atenuar opacidad al arrastrar (tarjetas/toasts)
  ignoreSelector?: string; // si el pointerdown cae aquí, no arrastra (botones internos)
  threshold?: number;      // px para "armar" la acción
  flyOff?: number;         // px del desplazamiento al salir
}

export function useSwipeDismiss<T extends HTMLElement = HTMLElement>(opts: Opts) {
  const ref = useRef<T | null>(null);
  const st = useRef({ x0: 0, y0: 0, dx: 0, active: false, axis: "" as "" | "x" | "y", moved: false, id: -1 });
  const TH = opts.threshold ?? 80;
  const OFF = opts.flyOff ?? 520;
  const base = opts.baseTransform ? opts.baseTransform + " " : "";

  const apply = (dx: number, animate: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = animate ? "transform 0.2s ease-out, opacity 0.2s ease-out" : "none";
    el.style.transform = `${base}translate3d(${dx}px,0,0)`;
    if (opts.fade) el.style.opacity = dx === 0 ? "" : String(Math.max(0.2, 1 - Math.abs(dx) / 320));
  };
  const doReveal = (dx: number) => {
    if (!opts.onReveal) return;
    const dir: Dir = dx > 4 ? "right" : dx < -4 ? "left" : "";
    opts.onReveal(dir, Math.abs(dx) >= TH);
  };
  const snapBack = () => { apply(0, true); opts.onReveal?.("", false); };

  const onPointerDown = (e: RPointerEvent<T>) => {
    if (e.button != null && e.button > 0) return; // solo principal (izq)
    if (opts.ignoreSelector && (e.target as HTMLElement).closest?.(opts.ignoreSelector)) return;
    const s = st.current;
    s.x0 = e.clientX; s.y0 = e.clientY; s.dx = 0; s.active = true; s.axis = ""; s.moved = false; s.id = e.pointerId;
    apply(0, false);
  };
  const onPointerMove = (e: RPointerEvent<T>) => {
    const s = st.current;
    if (!s.active || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      s.moved = true;                                   // cualquier arrastre anula el "tap"
      if (s.axis === "y") { s.active = false; return; } // cede al scroll vertical
      try { ref.current?.setPointerCapture(e.pointerId); } catch { /* noop */ }
    }
    if (s.axis !== "x") return;
    let v = dx;
    if (v < 0 && !opts.onLeft) v = 0;                   // sin handler ese lado no se arrastra
    if (v > 0 && !opts.onRight) v = 0;
    s.dx = v;
    apply(v, false);                                    // ← movimiento EN VIVO (imperativo)
    doReveal(v);
  };
  const finishDrag = (e: RPointerEvent<T>) => {
    const s = st.current;
    if (s.id !== -1 && e.pointerId !== s.id) return;
    if (!s.moved || s.axis !== "x") { s.active = false; s.axis = ""; return; }
    const v = s.dx; s.active = false;
    try { ref.current?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (v <= -TH && opts.onLeft) { apply(-OFF, true); window.setTimeout(opts.onLeft, 190); }
    else if (v >= TH && opts.onRight) { apply(OFF, true); window.setTimeout(opts.onRight, 190); }
    else snapBack();
    s.axis = ""; s.dx = 0;
  };
  const onClick = () => { if (!st.current.moved) opts.onTap?.(); };

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
      onClick,
      onDragStart: (e: RDragEvent<T>) => e.preventDefault(),
      draggable: false,
      style: { touchAction: "pan-y" as const },
    },
  };
}
