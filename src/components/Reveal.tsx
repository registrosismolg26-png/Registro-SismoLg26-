"use client";

// ── Reveal: mostrar/ocultar con animación suave de entrada y salida ──────────
// Colapsa el contenido con la técnica grid 0fr→1fr (anima altura o ancho de
// verdad, sin max-height mágico) + fade. El contenido queda montado pero
// colapsado (overflow hidden, min-size 0) e `inert` cuando está cerrado, así
// no es enfocable ni lo lee el lector de pantalla. Reutilizable en cualquier form.
//   <Reveal open={cond}>…campos que aparecen…</Reveal>          (vertical)
//   <Reveal open={cond} inline>…pill/badge…</Reveal>            (horizontal)

import type { ReactNode } from "react";

export default function Reveal({ open, inline = false, className = "", children }: { open: boolean; inline?: boolean; className?: string; children: ReactNode }) {
  return (
    <div
      className={`reveal${inline ? " reveal--inline" : ""}${open ? " is-open" : ""}${className ? " " + className : ""}`}
      {...(open ? {} : { inert: "" as any })}
    >
      <div className="reveal__inner">{children}</div>
    </div>
  );
}
