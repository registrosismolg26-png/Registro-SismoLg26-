"use client";

// Bloquea el scroll del <body> mientras haya CUALQUIER capa abierta (modal, hoja,
// desplegable de select/date). Usa un contador global: si dos cosas lo piden a la
// vez, el body queda bloqueado hasta que ambas se cierran. Compensa el ancho de la
// barra de scroll con padding-right para que el fondo no “salte” al bloquear.
import { useEffect } from "react";

let lockCount = 0;
let savedOverflow = "";
let savedPaddingRight = "";

function applyLock() {
  if (typeof document === "undefined") return;
  if (lockCount === 0) {
    const body = document.body;
    savedOverflow = body.style.overflow;
    savedPaddingRight = body.style.paddingRight;
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbarW > 0) body.style.paddingRight = `${scrollbarW}px`;
  }
  lockCount++;
}

function releaseLock() {
  if (typeof document === "undefined") return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    applyLock();
    return releaseLock;
  }, [active]);
}

// ── Regla GENERAL de modales ────────────────────────────────────────────────
// Mientras exista CUALQUIER `.modal-overlay` en el DOM, bloquea el scroll del
// fondo (con compensación de scrollbar, sin salto). Se monta UNA sola vez a
// nivel de app (page.tsx). Así todo modal —presente o futuro— que use
// `.modal-overlay` bloquea el fondo automáticamente, sin llamar al hook en cada
// componente. Comparte el mismo contador global que `useBodyScrollLock`, así que
// convive sin problema con los modales/hojas que ya lo usan.
export function useModalOverlayScrollLock() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    let locked = false;
    const sync = () => {
      const hasModal = document.querySelector(".modal-overlay") !== null;
      if (hasModal && !locked) { applyLock(); locked = true; }
      else if (!hasModal && locked) { releaseLock(); locked = false; }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync(); // estado inicial (por si ya hay un modal montado)
    return () => {
      observer.disconnect();
      if (locked) { releaseLock(); locked = false; }
    };
  }, []);
}
