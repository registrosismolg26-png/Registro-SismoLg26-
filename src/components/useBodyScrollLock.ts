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

// ── Regla GENERAL de modales (cierre por click-afuera) ───────────────────────
// Un click que EMPIEZA dentro del contenido del modal (p. ej. seleccionar texto
// para copiar) y TERMINA sobre el overlay NO debe cerrar el modal. El evento
// `click` se dispara en el ancestro común de mousedown y mouseup —el overlay—
// aunque el gesto haya arrancado dentro; por eso el `stopPropagation` del
// contenido no basta. Aquí se recuerda dónde EMPEZÓ el gesto (mousedown) y, si
// arrancó dentro de `.modal-content`, se cancela el click de cierre en fase de
// CAPTURA (antes de que React dispare el onClick del overlay). Solo cierra cuando
// el gesto empieza Y termina en el overlay. Se monta una vez (page.tsx).
export function useModalOutsideClickGuard() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    let downInsideContent = false;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      downInsideContent = !!(t && typeof t.closest === "function" && t.closest(".modal-content"));
    };
    const onClickCapture = (e: MouseEvent) => {
      const t = e.target as Element | null;
      // El click "de cierre" ocurre cuando el target ES el overlay (no un hijo).
      if (t && t.classList && t.classList.contains("modal-overlay") && downInsideContent) {
        e.stopPropagation(); // React no verá el onClick del overlay → no cierra
      }
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, []);
}
