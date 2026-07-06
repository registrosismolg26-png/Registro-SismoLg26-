import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

// ── Proxy a la API externa de cédulas (api.cedula.com.ve) ───────────────────
// Tercera fuente de identidad (además del censo y el padrón local). Se hace del
// lado del SERVIDOR para: (1) no exponer el token en el navegador, (2) evitar
// CORS. Credenciales SIEMPRE desde `.env` (nunca hardcodeadas):
//   CEDULA_API_APP_ID, CEDULA_API_TOKEN
// Requiere usuario autenticado (evita abuso del servicio de pago). Devuelve una
// forma NORMALIZADA a lo que usamos; ignora cne/estado/municipio/parroquia/rif.

const API_BASE = "https://api.cedula.com.ve/api/v1";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const appId = process.env.CEDULA_API_APP_ID;
    const token = process.env.CEDULA_API_TOKEN;
    if (!appId || !token) {
      return NextResponse.json({ found: false, error: "Servicio de cédula no configurado" }, { status: 503 });
    }

    const params = new URL(req.url).searchParams;
    const nacionalidad = (params.get("nacionalidad") || "V").toUpperCase() === "E" ? "E" : "V";
    const cedula = (params.get("cedula") || "").replace(/\D/g, "");
    if (cedula.length < 5) return NextResponse.json({ found: false, error: "Cédula inválida" }, { status: 400 });

    const apiUrl = `${API_BASE}?app_id=${encodeURIComponent(appId)}&token=${encodeURIComponent(token)}&nacionalidad=${nacionalidad}&cedula=${cedula}`;

    // Timeout defensivo: si la API está lenta/caída no cuelga la petición.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let json: any = null;
    try {
      const res = await fetch(apiUrl, { signal: controller.signal, headers: { Accept: "application/json" } });
      json = await res.json().catch(() => null);
    } finally {
      clearTimeout(timer);
    }

    const data = json && json.error === false ? json.data : null;
    if (!data) return NextResponse.json({ found: false });

    // Nombre como lo necesitamos: APELLIDOS + NOMBRES (solo las partes presentes).
    const nombreApellido = [data.primer_apellido, data.segundo_apellido, data.primer_nombre, data.segundo_nombre]
      .map((s: any) => (s == null ? "" : String(s).trim()))
      .filter(Boolean)
      .join(" ");

    // Género SOLO si la API lo trae (el CNE no siempre lo incluye).
    const sexoRaw = String(data.sexo ?? data.genero ?? "").trim().toUpperCase();
    const genero = sexoRaw.startsWith("F") ? "FEMENINO" : sexoRaw.startsWith("M") ? "MASCULINO" : "";

    // Fecha de nacimiento: la API la entrega como "yyyy-mm-dd".
    const fn = String(data.fecha_nac ?? "").trim();
    const fechaNacimiento = /^\d{4}-\d{2}-\d{2}$/.test(fn) ? fn : "";

    return NextResponse.json({
      found: !!(nombreApellido || fechaNacimiento || genero),
      nombreApellido,
      genero,
      fechaNacimiento,
    });
  } catch (error: any) {
    // Nunca rompe el flujo del cliente: se trata como "no encontrado".
    console.error("Error en /api/cedula-lookup:", error?.message);
    return NextResponse.json({ found: false, error: "No disponible" });
  }
}
