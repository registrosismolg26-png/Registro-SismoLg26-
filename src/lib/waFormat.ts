// ── Formato tipo WhatsApp ────────────────────────────────────────────────────
// El dueño redacta avisos con marcadores estilo WhatsApp: *negrita*, _cursiva_,
// ~tachado~. Aquí vive el TOKENIZADOR (puro, sin React → seguro en el servidor)
// que reutilizan tanto el render en la app (WaText) como el envío por Telegram
// (waToTelegramHtml). Un solo nivel (no anida) — suficiente y sin sorpresas.

export type WaToken = { t: "text" | "b" | "i" | "s"; v: string };

// Marca un par de marcadores del MISMO tipo con contenido no vacío en la misma
// línea. Al exigir apertura+cierre, un `*` suelto (multiplicación, viñeta) no se
// interpreta como formato.
const WA_RE = /\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;

/** Trocea el texto en tokens de estilo. Conserva el texto tal cual entre marcas. */
export function tokenizeWa(text: string): WaToken[] {
  const out: WaToken[] = [];
  if (!text) return out;
  let last = 0;
  let m: RegExpExecArray | null;
  WA_RE.lastIndex = 0;
  while ((m = WA_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1] != null) out.push({ t: "b", v: m[1] });
    else if (m[2] != null) out.push({ t: "i", v: m[2] });
    else if (m[3] != null) out.push({ t: "s", v: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

/** Escapa para HTML (Telegram parse_mode HTML y cualquier interpolación segura). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Convierte el formato WhatsApp a HTML de Telegram (<b>/<i>/<s>), escapando el
 *  contenido. Los saltos de línea se respetan tal cual (Telegram los honra). */
export function waToTelegramHtml(text: string): string {
  return tokenizeWa(text)
    .map((tok) => {
      const v = escapeHtml(tok.v);
      if (tok.t === "b") return `<b>${v}</b>`;
      if (tok.t === "i") return `<i>${v}</i>`;
      if (tok.t === "s") return `<s>${v}</s>`;
      return v;
    })
    .join("");
}
