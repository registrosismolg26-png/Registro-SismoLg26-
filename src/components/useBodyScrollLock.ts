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
