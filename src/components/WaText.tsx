"use client";

// Renderiza texto con formato tipo WhatsApp (*negrita*, _cursiva_, ~tachado~) y
// respeta los saltos de línea. Reutiliza el tokenizador puro de lib/waFormat, así
// la app y Telegram interpretan EXACTAMENTE lo mismo. Sin dangerouslySetInnerHTML:
// el texto del usuario se pinta como nodos React (no hay inyección posible).

import { Fragment, type ReactNode } from "react";
import { tokenizeWa } from "@/lib/waFormat";

// Un token puede contener saltos de línea → los partimos en <br/>.
function withBreaks(v: string, key: string): ReactNode {
  const parts = v.split("\n");
  return parts.map((p, i) => (
    <Fragment key={`${key}-${i}`}>
      {i > 0 && <br />}
      {p}
    </Fragment>
  ));
}

export default function WaText({ text }: { text: string }) {
  const tokens = tokenizeWa(text || "");
  return (
    <>
      {tokens.map((tok, i) => {
        const content = withBreaks(tok.v, String(i));
        if (tok.t === "b") return <strong key={i}>{content}</strong>;
        if (tok.t === "i") return <em key={i}>{content}</em>;
        if (tok.t === "s") return <s key={i}>{content}</s>;
        return <Fragment key={i}>{content}</Fragment>;
      })}
    </>
  );
}
