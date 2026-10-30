import https from "https";
import http from "http";
import { ETIQUETAS_COMISION } from "@/lib/constants";

// QR de vivienda del JEFE de familia (Censo ITINERANTE/MIXTO, Paso 5): normalización del
// payload que viaja en `/api/register` y lectura del CONTENIDO de cada QR desde el servidor.

export type QrKind = "habitable" | "colapso";

export type ViviendaPayload = {
  habitableUrl: string | null;
  habitableData: unknown | null;
  colapsoUrl: string | null;
  colapsoData: unknown | null;
  comisionEtiqueta: string | null;
};

const MAX_URL = 2000;
const MAX_DATA_BYTES = 60_000;
const MAX_TEXT = 20_000;
const FETCH_TIMEOUT_MS = 5000;

const HABITABLE_HOST = "habitable.gob.ve";

/** Hosts extra permitidos (env `QR_EXTRA_HOSTS`, separados por coma) además de habitable.gob.ve. */
function extraHosts(): string[] {
  return (process.env.QR_EXTRA_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Solo se consulta (server-side) un host explícitamente permitido: evita SSRF con QR
 * arbitrarios. Los DOS QR (habitable = familia censada, colapso = edificación colapsada)
 * apuntan a habitable.gob.ve; lo que cambia es la página.
 */
function hostPermitido(host: string): boolean {
  const h = host.toLowerCase();
  return [HABITABLE_HOST, ...extraHosts()].some((a) => h === a || h.endsWith(`.${a}`));
}

const cleanStr = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, MAX_URL) : null;
};

// Acepta SOLO un objeto/array JSON de tamaño acotado; cualquier otra cosa → null.
const cleanData = (v: unknown): unknown | null => {
  if (v === null || typeof v !== "object") return null;
  try {
    return JSON.stringify(v).length <= MAX_DATA_BYTES ? v : null;
  } catch {
    return null;
  }
};

/** Normaliza el bloque `vivienda` del body de /api/register. null = no vino / vacío. */
export function normalizeVivienda(raw: unknown): ViviendaPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const etiqueta = String(r.comisionEtiqueta ?? "").trim().toUpperCase();
  const out: ViviendaPayload = {
    habitableUrl: cleanStr(r.habitableUrl),
    habitableData: cleanData(r.habitableData),
    colapsoUrl: cleanStr(r.colapsoUrl),
    colapsoData: cleanData(r.colapsoData),
    comisionEtiqueta: ETIQUETAS_COMISION.some((e) => e.value === etiqueta) ? etiqueta : null,
  };
  const vacio = !out.habitableUrl && !out.colapsoUrl && !out.comisionEtiqueta;
  return vacio ? null : out;
}

function getText(urlStr: string, insecure: boolean): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const client = u.protocol === "http:" ? http : https;
      const req = client.get(
        urlStr,
        {
          ...(insecure ? { rejectUnauthorized: false } : {}),
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; RegistroSismo/1.0)",
            Accept: "application/json, text/html;q=0.9, */*;q=0.5",
          },
          timeout: FETCH_TIMEOUT_MS,
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => { if (body.length < 500_000) body += c; });
          res.on("end", () => resolve({ status: res.statusCode || 200, text: body }));
        },
      );
      req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
      req.on("error", reject);
    } catch (e) {
      reject(e);
    }
  });
}

const htmlToText = (html: string): string =>
  html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Lee el contenido de un QR (su URL) desde el servidor. NUNCA lanza: devuelve
 * `{ ok:false, reason }` si el host no está permitido o la consulta falla, para que el
 * registro se guarde igual con la URL sola.
 *  - habitable.gob.ve (`/c/<slug>`): usa su API de certificados y devuelve el JSON `data`.
 *  - resto de hosts permitidos: JSON tal cual, o el texto de la página.
 */
export async function resolveQrContent(
  kind: QrKind,
  qrText: string,
): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
  const text = (qrText || "").trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "El QR no contiene una URL; se guarda el texto tal cual." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Solo se leen URLs https." };
  if (!hostPermitido(url.hostname)) {
    return { ok: false, reason: `Contenido no leído: el dominio ${url.hostname} no está en la lista permitida.` };
  }

  const isHabitable = url.hostname.toLowerCase().endsWith(HABITABLE_HOST);
  const target = isHabitable
    ? (() => {
        const slug = url.pathname.match(/\/c\/([A-Za-z0-9_-]+)/)?.[1];
        return slug ? `https://${HABITABLE_HOST}/api/v1/certificados/${encodeURIComponent(slug)}` : text;
      })()
    : text;

  try {
    let res: { status: number; text: string };
    try {
      res = await getText(target, false);
    } catch (e: any) {
      // habitable.gob.ve ha servido con certificado no verificable (el lector de
      // Planteamiento ya lo tolera): solo para ese host se reintenta sin verificar.
      if (isHabitable && /certificate|self[- ]signed|unable to verify/i.test(String(e?.message))) {
        res = await getText(target, true);
      } else {
        throw e;
      }
    }
    if (res.status >= 400) return { ok: false, reason: `La página del QR respondió ${res.status}.` };
    try {
      const json = JSON.parse(res.text);
      const data = isHabitable && json?.ok && json?.data ? json.data : json;
      const clean = cleanData(data);
      if (clean) return { ok: true, data: clean };
    } catch {
      /* no es JSON → texto de la página */
    }
    const plain = htmlToText(res.text).slice(0, MAX_TEXT);
    if (!plain) return { ok: false, reason: "La página del QR no devolvió contenido legible." };
    return { ok: true, data: { tipoQr: kind, url: text, texto: plain } };
  } catch (e: any) {
    return { ok: false, reason: `No se pudo consultar el QR: ${e?.message || "error de red"}` };
  }
}
