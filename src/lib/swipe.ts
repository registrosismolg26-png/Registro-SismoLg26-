// ── Primitivo de arrastre (deslizar para descartar) ──────────────────────────
// Listeners NATIVOS de Pointer Events sobre el elemento (no eventos sintéticos de
// React → sin capas intermedias) + setPointerCapture (no se pierde el arrastre
// aunque el dedo salga). Escribe el `transform` DIRECTO al DOM en cada movimiento
// → sigue al dedo/ratón 1:1, sin re-render.
//
// CLAVE: el elemento arrastrado NO debe tener una `animation` de CSS que anime el
// `transform` (el fill de la animación gana sobre el estilo inline y "congela" el
// arrastre). Por eso las animaciones de entrada van en un contenedor aparte.
//
// touchAction: usa "none" en tarjetas flotantes (captura todo el gesto → el táctil
// funciona siempre) y "pan-y" en filas dentro de una lista con scroll vertical.

export interface SwipeOpts {
  onLeft?: () => void;                        // fling a la izquierda pasado el umbral
  onRight?: () => void;                       // fling a la derecha pasado el umbral
  onTap?: () => void;                         // toque sin arrastre
  onReveal?: (dir: "" | "left" | "right", armed: boolean) => void;
  ignoreSelector?: string;                    // pointerdown aquí → no arrastra (botones internos)
  threshold?: number;                         // px para "armar" / disparar
  flyOff?: number;                            // px del desplazamiento al salir
  baseTransform?: string;                     // transform base a conservar (p. ej. centrado)
  fade?: boolean;                             // atenuar opacidad al arrastrar
  touchAction?: string;                       // "none" (tarjetas) | "pan-y" (filas en scroll)
}

/** Engancha el gesto al elemento. `getOpts` devuelve SIEMPRE las opciones vigentes
 *  (para no capturar closures viejos de React). Devuelve una función de limpieza. */
export function attachSwipe(el: HTMLElement, getOpts: () => SwipeOpts): () => void {
  let x0 = 0, y0 = 0, dx = 0, active = false, decided = false, horiz = false, pid = -1;
  const first = getOpts();
  el.style.touchAction = first.touchAction || "pan-y";
  el.style.userSelect = "none";

  const baseT = () => { const b = getOpts().baseTransform; return b ? b + " " : ""; };
  const setT = (v: number, animate: boolean) => {
    el.style.transition = animate ? "transform .2s ease-out, opacity .2s ease-out" : "none";
    el.style.transform = baseT() + "translate3d(" + v + "px,0,0)";
    if (getOpts().fade) el.style.opacity = v === 0 ? "" : String(Math.max(0.25, 1 - Math.abs(v) / 280));
  };
  const reveal = (v: number) => {
    const o = getOpts();
    if (!o.onReveal) return;
    o.onReveal(v > 6 ? "right" : v < -6 ? "left" : "", Math.abs(v) >= (o.threshold ?? 80));
  };

  const down = (e: PointerEvent) => {
    const o = getOpts();
    if (e.button != null && e.button > 0) return;                 // solo botón principal
    if (o.ignoreSelector && (e.target as HTMLElement).closest?.(o.ignoreSelector)) return;
    active = true; decided = false; horiz = false; x0 = e.clientX; y0 = e.clientY; dx = 0; pid = e.pointerId;
    setT(0, false);
  };
  const move = (e: PointerEvent) => {
    if (!active || e.pointerId !== pid) return;
    dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (!decided) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      decided = true;
      horiz = Math.abs(dx) > Math.abs(dy);
      if (!horiz) { active = false; return; }                    // vertical → cede al scroll
      try { el.setPointerCapture(e.pointerId); } catch { /* noop */ }
    }
    if (!horiz) return;
    const o = getOpts();
    let v = dx;
    if (v < 0 && !o.onLeft) v = 0;
    if (v > 0 && !o.onRight) v = 0;
    dx = v;
    setT(v, false);                                              // ← movimiento EN VIVO
    reveal(v);
    if (e.cancelable) e.preventDefault();
  };
  const end = (e: PointerEvent) => {
    if (pid !== -1 && e.pointerId !== pid) return;
    if (!active) { return; }
    active = false;
    try { el.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    const o = getOpts();
    if (!decided) { setT(0, false); if (o.onTap) o.onTap(); return; }   // toque puro
    const TH = o.threshold ?? 80, OFF = o.flyOff ?? 600;
    if (dx <= -TH && o.onLeft) { setT(-OFF, true); if (o.fade) el.style.opacity = "0"; window.setTimeout(o.onLeft, 190); }
    else if (dx >= TH && o.onRight) { setT(OFF, true); if (o.fade) el.style.opacity = "0"; window.setTimeout(o.onRight, 190); }
    else { setT(0, true); if (o.fade) el.style.opacity = ""; if (o.onReveal) o.onReveal("", false); }
    dx = 0;
  };

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
  };
}
