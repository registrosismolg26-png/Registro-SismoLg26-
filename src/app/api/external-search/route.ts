import { NextResponse } from "next/server";

// ── Proxy de búsqueda a "Paciente Venezuela" (fuente externa) ────────────────
// Fuente pública de localización de personas en hospitales/refugios tras el
// sismo. La Gobernación (dueña del proyecto) autorizó integrar esta fuente en el
// portal público /buscar. Notas:
//  · Es una SPA que consulta su propio Supabase (tabla `patients`). Su anon key
//    es PÚBLICA (viaja en el bundle del sitio); aquí se extrae en runtime para
//    no incrustarla y sobrevivir a cambios de hash del bundle. Se cachea en
//    memoria del proceso.
//  · La consulta (select, filtro, relaciones) replica exactamente la que hace su
//    propia página /buscar, extraída de su bundle público. El nombre puede estar
//    en full_name, first_name o last_name; la ciudad/lugar vienen de las
//    relaciones hospitals(...) o shelters(...).
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

type PVPlace = { name?: string | null; city?: string | null } | null;
type PVRow = {
  id?: string | number;
  full_name?: string | null;
  status?: string | null;
  notes?: string | null;
  age?: number | null;
  gender?: string | null;
  hospitals?: PVPlace;
  shelters?: PVPlace;
};

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

    // Sanea solo lo que rompería la sintaxis del filtro `or=(...)` de PostgREST
    // (%, coma, asterisco, paréntesis, backslash). El término se busca completo,
    // igual que hace el sitio original.
    const term = q.replace(/[%,*()\\]/g, " ").replace(/\s+/g, " ").trim();
    if (!term) return NextResponse.json({ success: true, results: [] });
    const enc = encodeURIComponent(term);

    // Mismo select y filtro que pacientevenezuela.com. Se usa `*` como comodín de
    // ilike (equivalente a `%` en la interfaz REST de PostgREST) para no lidiar
    // con el doble escape de `%`.
    const select = "id,full_name,status,notes,age,gender,hospitals(name,city),shelters(name,city)";
    const or = `(full_name.ilike.*${enc}*,first_name.ilike.*${enc}*,last_name.ilike.*${enc}*)`;
    const url = `${SUPABASE_URL}/rest/v1/patients?select=${select}&or=${or}&order=last_update.desc&limit=40`;

    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, ...UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return NextResponse.json({ success: false, results: [], error: "Fuente externa no disponible" });
    }

    const rows = await res.json();
    const results = (Array.isArray(rows) ? rows : []).map((r: PVRow) => {
      const lugar = r.hospitals || r.shelters || null;
      const tipo = r.hospitals ? "Hospital" : r.shelters ? "Refugio" : null;
      const ubicacion = lugar?.name ? (tipo ? `${tipo}: ${lugar.name}` : lugar.name) : null;
      return {
        id: String(r.id ?? crypto.randomUUID()),
        nombre: r.full_name || "—",
        estado: r.status || null,
        ubicacion,
        ciudad: lugar?.city || null,
        edad: typeof r.age === "number" ? r.age : null,
        notas: r.notes || null,
      };
    });

    return NextResponse.json({ success: true, results });
  } catch {
    return NextResponse.json({ success: false, results: [], error: "Fuente externa no disponible" });
  }
}
