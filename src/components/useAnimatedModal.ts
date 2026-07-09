"use client";

import { useState, useEffect, useRef } from "react";

// ── Animación de SALIDA de modales, sin saltos ──────────────────────────────
// El problema: React DESMONTA el modal al instante cuando su estado pasa a
// cerrado, así que la animación de cierre (.modal-overlay--closing /
// .modal-content--closing) no llega a verse. Este hook mantiene el modal montado
// durante `duration` ms tras el cierre para que la animación se reproduzca.
//
// `source` puede ser:
//   • un booleano  (p. ej. showModal)              → el modal está abierto si es true
//   • un objeto/valor (p. ej. registroAEliminar)   → abierto mientras sea truthy
// Devuelve:
//   • mounted: renderizar (abierto O animando la salida)
//   • closing: está saliendo → añade las clases `*--closing`
//   • data:    el ÚLTIMO valor truthy, CONSERVADO durante la salida, para que el
//              contenido del modal (que suele leer ese objeto) no se quede sin datos
//              y "salte" mientras se desvanece.
//
// Uso típico:
//   const m = useAnimatedModal(algo);
//   return m.mounted && (
//     <div className={`modal-overlay${m.closing ? " modal-overlay--closing" : ""}`} onClick={cerrar}>
//       <div className={`modal-content${m.closing ? " modal-content--closing" : ""}`} ...>
//   );
// El handler `cerrar` solo pone el estado en cerrado (false/null) como siempre;
// el hook se encarga del retardo.
export function useAnimatedModal<T>(source: T, duration = 220): { mounted: boolean; closing: boolean; data: NonNullable<T> | null } {
  const open = Boolean(source);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const dataRef = useRef<NonNullable<T> | null>((source || null) as NonNullable<T> | null);
  if (open) dataRef.current = source as NonNullable<T>; // conserva el último valor abierto

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, duration);
    return () => clearTimeout(t);
  }, [open, mounted, duration]);

  return { mounted, closing, data: dataRef.current };
}
