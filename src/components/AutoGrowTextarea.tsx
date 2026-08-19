"use client";

import React, { useRef, useLayoutEffect, useCallback } from "react";

// Textarea que CRECE automáticamente con su contenido: mantiene el tamaño predeterminado
// (rows / min-height del CSS) como MÍNIMO y, si el texto se desborda, aumenta el alto para
// mostrarlo completo sin scroll interno. Funciona editable y en solo-lectura (crece al
// montar/cambiar el valor). El mínimo lo pone `rows` + el `min-height` del `.morb-control`.
type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number };

export function AutoGrowTextarea({ minRows = 2, value, style, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // "auto" primero para medir el contenido real; luego fijamos el alto a scrollHeight.
    // Como el CSS mantiene `min-height`, scrollHeight nunca baja del mínimo → ese tamaño
    // predeterminado queda como piso y solo crece hacia arriba.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Reajusta al montar y cada vez que cambia el valor (incluye precarga en editar/ver).
  useLayoutEffect(fit, [value, fit]);

  return (
    <textarea
      {...rest}
      ref={ref}
      value={value}
      rows={minRows}
      onInput={fit}
      style={{ resize: "none", overflow: "hidden", ...style }}
    />
  );
}
