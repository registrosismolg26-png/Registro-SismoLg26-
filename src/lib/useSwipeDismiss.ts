"use client";

// Envoltura React del primitivo attachSwipe: engancha listeners NATIVOS al ref una
// sola vez y lee siempre las opciones vigentes (optsRef) para no capturar closures
// viejos. Devuelve el ref para colocarlo en el elemento arrastrable.

import { useRef, useEffect } from "react";
import { attachSwipe, type SwipeOpts } from "@/lib/swipe";

export function useSwipeDismiss<T extends HTMLElement = HTMLElement>(opts: SwipeOpts) {
  const ref = useRef<T | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  useEffect(() => {
    if (!ref.current) return;
    return attachSwipe(ref.current, () => optsRef.current);
  }, []);
  return ref;
}
