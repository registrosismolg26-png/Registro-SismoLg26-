"use client";

// Devuelve la posición (fixed) del ancla mientras el menú está abierto, para
// renderizar desplegables en un PORTAL sobre todo (sin que los recorte un contenedor
// con overflow: hidden/auto — p. ej. el conditional-wrapper del censo o un modal).
import { useState, useLayoutEffect, useEffect, type RefObject } from "react";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface AnchoredRect { top: number; left: number; width: number; bottom: number; }

export function useAnchoredRect(open: boolean, anchorRef: RefObject<HTMLElement | null>): AnchoredRect | null {
  const [rect, setRect] = useState<AnchoredRect | null>(null);

  useIsoLayoutEffect(() => {
    if (!open) { setRect(null); return; }
    const el = anchorRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, bottom: r.bottom });
    };
    update();
    // true = capturar scroll de cualquier contenedor (no solo window)
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    // En móvil el teclado en pantalla cambia el viewport sin disparar 'resize' fiable.
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, [open, anchorRef]);

  return rect;
}
