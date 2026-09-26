import { NextRequest, NextResponse } from "next/server";
import https from "https";
import http from "http";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canManagePlanteamientoSala } from "@/lib/auth";

export const dynamic = "force-dynamic";

function fetchHttpsInsecure(urlStr: string, timeoutMs = 15000): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const client = u.protocol === "http:" ? http : https;
      const req = client.get(
        urlStr,
        {
          rejectUnauthorized: false,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Accept: "application/json, text/html, */*",
            "Accept-Language": "es-VE,es;q=0.9,en;q=0.8",
          },
          timeout: timeoutMs,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            resolve({ status: res.statusCode || 200, text: body });
          });
        }
      );

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Tiempo de espera agotado al conectar con el servidor"));
      });

      req.on("error", (err) => {
        reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

interface ExtractedData {
  tipo: string;
  edificacion: string;
  pisoApto: string;
  direccion: string;
  zona: string;
  circuitoComunal: string;
  gps: string;
  grupoFamiliar: Array<{ nombre: string; cedula: string }>;
  operadorCenso: string;
  qrUrl: string;
}

// Decodifica entidades HTML y escapes unicode comunes (\u00f3 -> ó)
function decodeEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&oacute;/gi, "ó")
    .replace(/&#243;/gi, "ó")
    .replace(/&iacute;/gi, "í")
    .replace(/&#237;/gi, "í")
    .replace(/&aacute;/gi, "á")
    .replace(/&#225;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&#233;/gi, "é")
    .replace(/&uacute;/gi, "ú")
    .replace(/&#250;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&#241;/gi, "ñ")
    .replace(/&Ntilde;/gi, "Ñ")
    .replace(/&#209;/gi, "Ñ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

// Convierte HTML en texto plano conservando saltos de línea semánticos
function cleanHtml(html: string): string {
  const decoded = decodeEntities(html);
  return decoded
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Búsqueda en texto plano estructurado
function extractFieldFromText(text: string, labelRegex: RegExp, nextLabelsRegex: RegExp): string {
  const match = text.match(labelRegex);
  if (!match || match.index === undefined) return "";
  const sub = text.slice(match.index + match[0].length);
  const nextMatch = sub.match(nextLabelsRegex);
  const raw = nextMatch && nextMatch.index !== undefined ? sub.slice(0, nextMatch.index) : sub.slice(0, 150);
  return raw.trim().replace(/^[:\-\s]+/, "").trim();
}

function parseFromHtmlOrText(html: string, originalUrl: string): ExtractedData {
  const data: ExtractedData = {
    tipo: "",
    edificacion: "",
    pisoApto: "",
    direccion: "",
    zona: "",
    circuitoComunal: "",
    gps: "",
    grupoFamiliar: [],
    operadorCenso: "",
    qrUrl: originalUrl,
  };

  const decodedRaw = decodeEntities(html);

  // 1. Intentar buscar JSON embebido clásico (__NEXT_DATA__ o scripts JSON)
  try {
    const nextDataMatch = decodedRaw.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch) {
      const json = JSON.parse(nextDataMatch[1]);
      const findKey = (obj: any, keys: string[]): any => {
        if (!obj || typeof obj !== "object") return null;
        for (const k of Object.keys(obj)) {
          if (keys.includes(k.toLowerCase())) return obj[k];
          if (typeof obj[k] === "object") {
            const found = findKey(obj[k], keys);
            if (found !== null && found !== undefined) return found;
          }
        }
        return null;
      };

      const t = findKey(json, ["tipo", "viviendatipo", "tipovivienda"]);
      if (typeof t === "string") data.tipo = t;

      const ed = findKey(json, ["edificacion", "edificio", "viviendaedificacion"]);
      if (typeof ed === "string") data.edificacion = ed;

      const pa = findKey(json, ["pisoapto", "piso_apto", "apartamento"]);
      if (typeof pa === "string") data.pisoApto = pa;

      const dir = findKey(json, ["direccion", "direccionexacta", "viviendadireccion"]);
      if (typeof dir === "string") data.direccion = dir;

      const z = findKey(json, ["zona", "parroquia", "sector", "comunidad"]);
      if (typeof z === "string") data.zona = z;

      const cc = findKey(json, ["circuitocomunal", "circuito_comunal", "circuito"]);
      if (typeof cc === "string") data.circuitoComunal = cc;

      const gpsVal = findKey(json, ["gps", "coordenadas", "latlng", "location"]);
      if (typeof gpsVal === "string") data.gps = gpsVal;
      else if (gpsVal && typeof gpsVal === "object" && gpsVal.lat && gpsVal.lng) {
        data.gps = `${gpsVal.lat}, ${gpsVal.lng}`;
      }

      const fam = findKey(json, ["grupofamiliar", "grupo_familiar", "familia", "personas", "miembros"]);
      if (Array.isArray(fam)) {
        fam.forEach((m: any) => {
          if (m && typeof m === "object") {
            const nom = m.nombre || m.nombreApellido || m.nombreCompleto || "";
            const ced = m.cedula || m.ci || m.documento || "";
            if (nom || ced) {
              data.grupoFamiliar.push({ nombre: String(nom).trim(), cedula: String(ced).trim() });
            }
          }
        });
      }

      const op = findKey(json, ["operador", "operadorcenso", "censista", "censador"]);
      if (typeof op === "string") data.operadorCenso = op;
      else if (op && typeof op === "object" && op.nombre) data.operadorCenso = String(op.nombre);
    }
  } catch (e) {
    console.warn("[qr-lookup] No se pudo parsear __NEXT_DATA__:", e);
  }

  // 2. Extraer mediante análisis por líneas (para tarjetas DOM con etiquetas y valores contiguos)
  const lines = decodedRaw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "\n")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "\n")
    .replace(/<\/(div|p|tr|td|li|dd|dt|h\d|section|article|span)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((l) => l.trim().replace(/[ \t]+/g, " "))
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const next = lines[i + 1] || "";

    if (!data.tipo) {
      if (/^Tipo[:\s]*$/i.test(l) && next && !/^Edificaci/i.test(next)) data.tipo = next;
      else if (/^Tipo:\s*(.+)$/i.test(l)) data.tipo = l.match(/^Tipo:\s*(.+)$/i)![1].trim();
    }

    if (!data.edificacion) {
      if (/^Edificaci[oó]n[:\s]*$/i.test(l) && next && !/^Piso/i.test(next)) data.edificacion = next;
      else if (/^Edificaci[oó]n:\s*(.+)$/i.test(l)) data.edificacion = l.match(/^Edificaci[oó]n:\s*(.+)$/i)![1].trim();
      else if (/OPPPE/i.test(l)) data.edificacion = l;
    }

    if (!data.pisoApto) {
      if (/^Piso\s*\/?\s*Apto[:\s]*$/i.test(l) && next && !/^Direcci/i.test(next)) data.pisoApto = next;
      else if (/^Piso\s*\/?\s*Apto:\s*(.+)$/i.test(l)) data.pisoApto = l.match(/^Piso\s*\/?\s*Apto:\s*(.+)$/i)![1].trim();
      else if (/^\d{1,2}\s*\/\s*\d{1,4}$/.test(l)) data.pisoApto = l;
    }

    if (!data.direccion) {
      if (/^Direcci[oó]n[:\s]*$/i.test(l) && next && !/^Zona/i.test(next)) data.direccion = next;
      else if (/^Direcci[oó]n:\s*(.+)$/i.test(l)) data.direccion = l.match(/^Direcci[oó]n:\s*(.+)$/i)![1].trim();
    }

    if (!data.zona) {
      if (/^Zona[:\s]*$/i.test(l) && next && !/^Circuito/i.test(next)) data.zona = next;
      else if (/^Zona:\s*(.+)$/i.test(l)) data.zona = l.match(/^Zona:\s*(.+)$/i)![1].trim();
    }

    if (!data.circuitoComunal) {
      if (/^Circuito\s*comunal[:\s]*$/i.test(l) && next && !/^GPS/i.test(next)) data.circuitoComunal = next;
      else if (/^Circuito\s*comunal:\s*(.+)$/i.test(l)) data.circuitoComunal = l.match(/^Circuito\s*comunal:\s*(.+)$/i)![1].trim();
      else if (/^Circuito\s+[A-Za-z]/i.test(l)) data.circuitoComunal = l;
    }

    if (!data.gps) {
      if (/^GPS[:\s]*$/i.test(l) && next) data.gps = next;
      else if (/^GPS:\s*(.+)$/i.test(l)) data.gps = l.match(/^GPS:\s*(.+)$/i)![1].trim();
      else if (/^-?\d{1,2}\.\d{4,}[,\s]+-?\d{1,3}\.\d{4,}$/.test(l)) data.gps = l;
    }

    if (!data.operadorCenso) {
      if (/Nombre:\s*([A-Za-záéíóúÁÉÍÓÚñÑ\s]+)/i.test(l) && (i > 0 && /Operador/i.test(lines[i - 1]) || /Operador/i.test(l))) {
        data.operadorCenso = l.match(/Nombre:\s*([A-Za-záéíóúÁÉÍÓÚñÑ\s]+)/i)![1].trim();
      }
    }

    // Extracción de miembros del grupo familiar
    const sameLineFam = l.match(/^(?:\d+[\.\)]\s*)?([A-Za-záéíóúÁÉÍÓÚñÑ\s]{4,45})\s+([VEve]?[- ]?\d{1,2}[\*\d]{4,10})$/);
    if (sameLineFam && !l.includes("Operador") && !l.includes("Grupo familiar") && !l.includes("Vivienda") && !l.includes("Circuito")) {
      const nom = sameLineFam[1].trim();
      const ced = sameLineFam[2].trim().toUpperCase();
      if (!data.grupoFamiliar.some((m) => m.cedula === ced)) {
        data.grupoFamiliar.push({ nombre: nom, cedula: ced });
      }
    } else {
      const nameOnly = l.match(/^(?:\d+[\.\)]\s*)?([A-Za-záéíóúÁÉÍÓÚñÑ\s]{5,45})$/);
      const nextCed = next.match(/^([VEve]?[- ]?\d{1,2}[\*\d]{4,10})$/);
      if (nameOnly && nextCed && !l.includes("Operador") && !l.includes("Grupo familiar") && !l.includes("Vivienda") && !l.includes("Circuito")) {
        const nom = nameOnly[1].trim();
        const ced = nextCed[1].trim().toUpperCase();
        if (!data.grupoFamiliar.some((m) => m.cedula === ced)) {
          data.grupoFamiliar.push({ nombre: nom, cedula: ced });
          i++; // consumir línea siguiente
        }
      }
    }
  }

  // 3. Extracción secundaria mediante patrones de texto sobre texto plano continuo (fallback)
  const clean = cleanHtml(html);
  const nextKeys = /(?:Edificaci[oó]n|Piso\s*\/?\s*Apto|Direcci[oó]n|Zona|Circuito\s*comunal|GPS|Grupo\s*familiar|Operador)/i;

  if (!data.tipo) data.tipo = extractFieldFromText(clean, /\bTipo\b[:\s]*/i, nextKeys);
  if (!data.edificacion) data.edificacion = extractFieldFromText(clean, /\bEdificaci[oó]n\b[:\s]*/i, nextKeys);
  if (!data.pisoApto) data.pisoApto = extractFieldFromText(clean, /\bPiso\s*\/?\s*Apto\b[:\s]*/i, nextKeys);
  if (!data.direccion) data.direccion = extractFieldFromText(clean, /\bDirecci[oó]n\b[:\s]*/i, nextKeys);
  if (!data.zona) data.zona = extractFieldFromText(clean, /\bZona\b[:\s]*/i, nextKeys);
  if (!data.circuitoComunal) data.circuitoComunal = extractFieldFromText(clean, /\bCircuito\s*comunal\b[:\s]*/i, nextKeys);

  if (!data.gps) {
    const gpsMatch = clean.match(/GPS[:\s]*(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/i) ||
                     clean.match(/(-?\d{1,2}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/);
    if (gpsMatch) {
      data.gps = `${gpsMatch[1]}, ${gpsMatch[2]}`;
    } else {
      data.gps = extractFieldFromText(clean, /\bGPS\b[:\s]*/i, nextKeys);
    }
  }

  // 4. Extracción de scripts tipo RSC Next.js (self.__next_f.push) si faltan datos
  if (!data.tipo || !data.edificacion || !data.circuitoComunal || data.grupoFamiliar.length === 0) {
    try {
      const rscMatches = decodedRaw.matchAll(/self\.__next_f\.push\(\[\d+,\s*"([\s\S]*?)"\]\)/g);
      let rscAccum = "";
      for (const m of rscMatches) {
        rscAccum += " " + m[1].replace(/\\"/g, '"');
      }
      if (rscAccum) {
        if (!data.tipo) {
          const m = rscAccum.match(/"Apartamento"|"Casa"|"Quinta"|"Habitaci[oó]n"/i);
          if (m) data.tipo = m[0].replace(/"/g, "");
        }
        if (!data.edificacion) {
          const m = rscAccum.match(/Edificio\s+OPPPE\s+[\w\-]+/i);
          if (m) data.edificacion = m[0];
        }
        if (!data.pisoApto) {
          const m = rscAccum.match(/\b(\d{1,2}\s*\/\s*\d{1,4})\b/);
          if (m) data.pisoApto = m[1];
        }
        if (!data.circuitoComunal) {
          const m = rscAccum.match(/Circuito\s+Tanaguarena[^\"]+/i) || rscAccum.match(/Circuito\s+[A-Za-z\s]+/i);
          if (m) data.circuitoComunal = m[0].trim();
        }
        if (!data.gps) {
          const m = rscAccum.match(/(-?\d{1,2}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/);
          if (m) data.gps = `${m[1]}, ${m[2]}`;
        }
      }
    } catch (e) {
      console.warn("[qr-lookup] Fallback RSC:", e);
    }
  }

  // 5. Extracción de grupo familiar en texto libre si aún está vacío
  if (data.grupoFamiliar.length === 0) {
    const famSectionMatch = clean.match(/Grupo\s*familiar\s*(?:\([^)]*\))?[:\s]*([\s\S]*?)(?:Operador\s*de\s*censo|$)/i);
    const famText = famSectionMatch ? famSectionMatch[1] : clean;
    const memberRegex = /(?:(\d+)[\.\)]\s*)?([A-Za-záéíóúÁÉÍÓÚñÑ\s]{3,45}?)\s+([VEve]?[- ]?\d{1,2}[\*\d]{4,10})/g;
    let m: RegExpExecArray | null;
    while ((m = memberRegex.exec(famText)) !== null) {
      const nom = m[2].trim();
      const ced = m[3].trim().toUpperCase();
      if (!nom.toLowerCase().includes("vivienda") &&
          !nom.toLowerCase().includes("circuito") &&
          !nom.toLowerCase().includes("operador") &&
          nom.length >= 4) {
        if (!data.grupoFamiliar.some((f) => f.cedula === ced)) {
          data.grupoFamiliar.push({ nombre: nom, cedula: ced });
        }
      }
    }
  }

  // 6. Extracción de Operador si aún está vacío
  if (!data.operadorCenso) {
    const opMatch = clean.match(/Operador\s*de\s*censo\s*Nombre[:\s]*([A-Za-záéíóúÁÉÍÓÚñÑ\s]+?)(?:$|Vivienda|Grupo)/i) ||
                    clean.match(/Operador[:\s]+(?:Nombre[:\s]*)?([A-Za-záéíóúÁÉÍÓÚñÑ\s]+?)(?:$|Vivienda|Grupo)/i);
    if (opMatch) {
      data.operadorCenso = opMatch[1].trim();
    }
  }

  return data;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let auth = await getAuthUser(req);

    // Fallback: Si no vino cabecera x-user-id, buscar por body.userId
    if (!auth && body.userId) {
      const u = await prisma.user.findUnique({ where: { id: String(body.userId) } });
      if (u) {
        auth = {
          id: u.id,
          email: u.email,
          nombre: u.nombre,
          role: u.role,
          refugio: u.campamentoTransitorio || "",
        };
      }
    }

    if (!auth || !canManagePlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const qrInput = String(body.qrInput || "").trim();

    if (!qrInput) {
      return NextResponse.json(
        { error: "No se proporcionó ningún código QR o enlace válido." },
        { status: 400 }
      );
    }

    // Caso 0: Si el usuario pegó directamente el texto copiado de la página del censo
    if (
      qrInput.includes("Vivienda censada") ||
      qrInput.includes("Edificio OPPPE") ||
      (qrInput.includes("Apartamento") && qrInput.includes("Circuito")) ||
      (qrInput.includes("Edificaci") && qrInput.includes("Piso"))
    ) {
      const manualData = parseFromHtmlOrText(qrInput, "texto_manual");
      if (manualData.tipo || manualData.edificacion || manualData.direccion || manualData.circuitoComunal || manualData.gps) {
        return NextResponse.json({ success: true, data: manualData });
      }
    }

    // Caso A: Si el QR es directamente un objeto JSON serializado
    if (qrInput.startsWith("{") && qrInput.endsWith("}")) {
      try {
        const parsed = JSON.parse(qrInput);
        const data: ExtractedData = {
          tipo: String(parsed.tipo || parsed.viviendaTipo || "").trim(),
          edificacion: String(parsed.edificacion || parsed.viviendaEdificacion || "").trim(),
          pisoApto: String(parsed.pisoApto || parsed.viviendaPisoApto || "").trim(),
          direccion: String(parsed.direccion || parsed.viviendaDireccion || "").trim(),
          zona: String(parsed.zona || parsed.viviendaZona || "").trim(),
          circuitoComunal: String(parsed.circuitoComunal || parsed.viviendaCircuitoComunal || "").trim(),
          gps: String(parsed.gps || parsed.viviendaGps || "").trim(),
          grupoFamiliar: Array.isArray(parsed.grupoFamiliar) ? parsed.grupoFamiliar : [],
          operadorCenso: String(parsed.operadorCenso || parsed.viviendaOperador || "").trim(),
          qrUrl: qrInput,
        };
        return NextResponse.json({ success: true, data });
      } catch {
        // Continuar con otros métodos si falla el JSON
      }
    }

    // Caso B: Integración oficial directa con HABITABLE (habitable.gob.ve)
    const habitableMatch =
      qrInput.match(/\/c\/([a-zA-Z0-9_\-]+)/) ||
      qrInput.match(/([0-9]{15,22}-[a-zA-Z0-9]{6,12})/);

    if (habitableMatch || qrInput.includes("habitable.gob.ve")) {
      const slug = habitableMatch ? habitableMatch[1] : qrInput.replace(/^.*\//, "").trim();
      const apiUrl = `https://habitable.gob.ve/api/v1/certificados/${encodeURIComponent(slug)}`;
      console.log("[qr-lookup] Consultando API directa de HABITABLE:", apiUrl);

      try {
        const apiRes = await fetchHttpsInsecure(apiUrl, 15000);
        if (apiRes.status === 200) {
          const json = JSON.parse(apiRes.text);
          if (json.ok && json.data) {
            const cert = json.data;
            const ubicacion = cert.ubicacion || {};
            const tipoMap: Record<string, string> = {
              apartamento: "Apartamento",
              casa: "Casa",
              mision_vivienda: "Misión Vivienda (GMVV)",
            };

            const data: ExtractedData = {
              tipo: tipoMap[cert.tipo_vivienda] || cert.tipo_vivienda || "Apartamento",
              edificacion: String(ubicacion.nombre_edificacion || ubicacion.edificacion || "").trim(),
              pisoApto:
                ubicacion.piso && ubicacion.apartamento
                  ? `${ubicacion.piso} / ${ubicacion.apartamento}`
                  : String(ubicacion.piso || ubicacion.apartamento || ubicacion.numero_casa || "").trim(),
              direccion: String(ubicacion.direccion || "").trim(),
              zona: [ubicacion.parroquia, ubicacion.municipio, ubicacion.estado].filter(Boolean).join(", "),
              circuitoComunal: String(ubicacion.circuito_comunal || "").trim(),
              gps:
                ubicacion.lat && ubicacion.lng
                  ? `${Number(ubicacion.lat).toFixed(6)}, ${Number(ubicacion.lng).toFixed(6)}`
                  : "",
              grupoFamiliar: (cert.personas || []).map((p: any) => ({
                nombre: [p.nombre, p.apellido].filter(Boolean).join(" ").trim(),
                cedula: String(p.cedula || "").trim().toUpperCase(),
              })),
              operadorCenso: String(cert.operador?.nombre || "").trim(),
              qrUrl: qrInput.startsWith("http") ? qrInput : `https://habitable.gob.ve/c/${slug}`,
            };

            console.log("[qr-lookup] Extracción exitosa vía API HABITABLE:", data.edificacion);
            return NextResponse.json({ success: true, data });
          }
        }
      } catch (apiErr: any) {
        console.warn("[qr-lookup] Fallo al consultar API directa de habitable.gob.ve:", apiErr?.message);
      }
    }

    // Caso C: Si el QR es una URL genérica
    let targetUrl = qrInput;
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      if (targetUrl.includes(".") && !targetUrl.includes(" ")) {
        targetUrl = `https://${targetUrl}`;
      } else {
        return NextResponse.json(
          { error: "El formato del QR no parece una URL válida o JSON." },
          { status: 400 }
        );
      }
    }

    console.log("[qr-lookup] Consultando URL genérica:", targetUrl);

    let html = "";
    try {
      const res = await fetchHttpsInsecure(targetUrl, 15000);
      if (res.status >= 400) {
        return NextResponse.json(
          { error: `La página del QR respondió con estado ${res.status}.` },
          { status: 502 }
        );
      }
      html = res.text;
    } catch (fetchErr: any) {
      console.error("[qr-lookup] Error de conexión:", fetchErr);
      return NextResponse.json(
        { error: `No se pudo conectar a la página del QR: ${fetchErr.message || "Error de red"}` },
        { status: 502 }
      );
    }

    // Parsear el contenido obtenido
    const data = parseFromHtmlOrText(html, targetUrl);

    const hasData = Boolean(
      data.tipo ||
      data.edificacion ||
      data.pisoApto ||
      data.direccion ||
      data.circuitoComunal ||
      data.gps ||
      data.grupoFamiliar.length > 0
    );

    if (!hasData) {
      return NextResponse.json(
        {
          error: "Se accedió a la página pero no se encontraron los datos de vivienda censada o grupo familiar esperados.",
          rawSnippet: cleanHtml(html).slice(0, 300),
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("[qr-lookup] Error general:", error);
    return NextResponse.json(
      { error: error?.message || "Error interno al procesar el QR." },
      { status: 500 }
    );
  }
}
