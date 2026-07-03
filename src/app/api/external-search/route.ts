import { NextResponse } from "next/server";

// ── Proxy de búsqueda a "Paciente Venezuela" (fuente externa) ────────────────
// Fuente pública de localización de personas en hospitales tras el sismo. La
// Gobernación (dueña del proyecto) autorizó integrar esta fuente en el portal
// público /buscar. Notas:
//  · Es una SPA que consulta su propio Supabase (tabla `patients`). Su anon key
//    es PÚBLICA (viaja en el bundle del sitio); aquí se extrae en runtime para
//    no incrustarla y sobrevivir a cambios de hash del bundle. Se cachea en
//    memoria del proceso.
//  · Los datos NO se persisten en este proyecto: el servidor consulta y reenvía
//    al cliente. Cada resultado se muestra atribuido a la fuente.

const SITE = "https://www.pacientevenezuela.com";
const SUPABASE_URL = "https://mdduikbfbdlzaxhuynef.supabase.co";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; CampamentosLaGuaira/1.0)" };

let cachedKey: string | null = null;

async function getAnonKey(): Promise<string | null> {
  if (cachedKey) return cachedKey;
  try {
    // El hash del bundle cambia por deploy → se descubre desde el HTML.
    const html = await (await fetch(`${SITE}/buscar`, { headers: UA })).text();
    const bundle = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    if (!bundle) return null;
    const js = await (await fetch(`${SITE}${bundle[0]}`, { headers: UA })).text();
    const key = js.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    cachedKey = key ? key[0] : null;
    return cachedKey;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (q.length < 3) {
      return NextResponse.json({ success: true, results: [] });
    }

    const key = await getAnonKey();
    if (!key) {
      return NextResponse.json({ success: false, results: [], error: "Fuente externa no disponible" });
    }

    // Sanitiza el término para el filtro ilike de PostgREST y matchea por
    // nombre en cualquier posición ("*jose*perez*").
    const term = q.replace(/[%,()*.\\]/g, " ").replace(/\s+/g, " ").trim();
    if (!term) return NextResponse.json({ success: true, results: [] });
    const pattern = `*${term.replace(/ /g, "*")}*`;

    const params = new URLSearchParams({
      select: "id,name,full_name,status,city,age,notes",
      or: `(name.ilike.${pattern},full_name.ilike.${pattern})`,
      limit: "12",
    });

    const res = await fetch(`${SUPABASE_URL}/rest/v1/patients?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, ...UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return NextResponse.json({ success: false, results: [], error: "Fuente externa no disponible" });
    }

    const rows = await res.json();
    const results = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      id: String(r.id ?? crypto.randomUUID()),
      nombre: r.full_name || r.name || "—",
      estado: r.status || null,
      ciudad: r.city || null,
      edad: typeof r.age === "number" ? r.age : null,
      notas: r.notes || null,
    }));

    return NextResponse.json({ success: true, results });
  } catch {
    return NextResponse.json({ success: false, results: [], error: "Fuente externa no disponible" });
  }
}
