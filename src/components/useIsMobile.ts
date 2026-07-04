"use client";

// ¿El viewport es de teléfono/tablet? Se usa para decidir si los desplegables
// (StyledSelect/DatePicker/SearchableSelect) se muestran como dropdown anclado
// (escritorio) o como MODAL nativo-like (hoja inferior / pantalla) en táctil.
import { useState, useEffect } from "react";

export function useIsMobile(query = "(max-width: 820px)"): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return isMobile;
}
