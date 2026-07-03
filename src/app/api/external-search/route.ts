import { NextResponse } from "next/server";

// ── Proxy de búsqueda a fuentes externas oficiales ───────────────────────────
// Consulta en PARALELO varias fuentes públicas de localización de personas tras
// el sismo y reenvía los resultados al cliente, cada uno atribuido a su fuente.
// La Gobernación (dueña del proyecto) autorizó la integración. Notas:
//  · Los datos NO se persisten aquí: el servidor consulta y reenvía.
//  · Cada consulta replica exactamente la que hace el propio sitio, extraída de
//    su código público.
//  · Tolerante a fallos: si una fuente falla o tarda, se devuelven las de las
//    demás (Promise.allSettled + timeout por fuente).
// Para añadir una fuente nueva: crea una función search<Fuente>(term) que
// devuelva ExternalResult[] y agrégala al Promise.allSettled del handler.

const UA = { "User-Agent": "Mozilla/5.0 (compatible; CampamentosLaGuaira/1.0)" };
const TIMEOUT_MS = 7000;

type ExternalResult = {
  id: string;
  fuente: string;
  nombre: string;
  estado: string | null;
  ubicacion: string | null;
  ciudad: string | null;
  edad: number | null;
  telefono: string | null;
  notas: string | null;
  enlace: string | null;
};

// ─── Fuente 1: Paciente Venezuela (SPA + Supabase público) ───────────────────
const PV_SITE = "https://www.pacientevenezuela.com";
const PV_SUPABASE = "https://mdduikbfbdlzaxhuynef.supabase.co";
let pvKey: string | null = null;

async function pvGetKey(): Promise<string | null> {
  if (pvKey) return pvKey;
  try {
    // El hash del bundle cambia por deploy → se descubre desde el HTML.
    const html = await (await fetch(`${PV_SITE}/buscar`, { headers: UA })).text();
    const bundle = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    if (!bundle) return null;
    const js = await (await fetch(`${PV_SITE}${bundle[0]}`, { headers: UA })).text();
    const key = js.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    pvKey = key ? key[0] : null;
    return pvKey;
  } catch {
    return null;
  }
}

type PVPlace = { name?: string | null; city?: string | null } | null;

async function searchPacienteVenezuela(term: string): Promise<ExternalResult[]> {
  const key = await pvGetKey();
  if (!key) return [];
  const enc = encodeURIComponent(term);
  // Mismo select y filtro que el propio sitio (tabla patients + relaciones).
  const select = "id,full_name,status,notes,age,gender,hospitals(name,city),shelters(name,city)";
  const or = `(full_name.ilike.*${enc}*,first_name.ilike.*${enc}*,last_name.ilike.*${enc}*)`;
  const url = `${PV_SUPABASE}/rest/v1/patients?select=${select}&or=${or}&order=last_update.desc&limit=40`;
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).map((r: PVRow, i: number) => {
    const lugar: PVPlace = r.hospitals || r.shelters || null;
    const tipo = r.hospitals ? "Hospital" : r.shelters ? "Refugio" : null;
    return {
      id: `pv-${r.id ?? i}`,
      fuente: "Paciente Venezuela",
      nombre: r.full_name || "—",
      estado: r.status || null,
      ubicacion: lugar?.name ? (tipo ? `${tipo}: ${lugar.name}` : lugar.name) : null,
      ciudad: lugar?.city || null,
      edad: typeof r.age === "number" ? r.age : null,
      telefono: null,
      notas: r.notes || null,
      enlace: `${PV_SITE}/buscar?q=${enc}`,
    };
  });
}

type PVRow = {
  id?: string | number;
  full_name?: string | null;
  status?: string | null;
  notes?: string | null;
  age?: number | null;
  hospitals?: PVPlace;
  shelters?: PVPlace;
};

// ─── Fuente 2: Localiza Pacientes (Next.js oficial, endpoint /api/search) ─────
const LP_SITE = "https://localizapacientes.com";

async function searchLocalizaPacientes(term: string): Promise<ExternalResult[]> {
  // Su propia página consulta este mismo endpoint GET y usa `resultados`.
  const res = await fetch(`${LP_SITE}/api/search?q=${encodeURIComponent(term)}`, {
    headers: UA,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const rows: LPRow[] = Array.isArray(data?.resultados) ? data.resultados : [];
  return rows.map((r: LPRow, i: number) => ({
    id: `lp-${r.id ?? r.cedula ?? i}`,
    fuente: "Localiza Pacientes",
    nombre: r.nombre || r.nombreCompleto || "—",
    estado: r.condicion || null,
    ubicacion: r.hospital || null,
    ciudad: [r.ciudad, r.estado].filter(Boolean).join(", ") || null,
    edad: typeof r.edad === "number" ? r.edad : null,
    telefono: r.telefono || null,
    notas: r.direccion || null,
    enlace: LP_SITE,
  }));
}

type LPRow = {
  id?: string | number;
  cedula?: string | null;
  nombre?: string | null;
  nombreCompleto?: string | null;
  condicion?: string | null;
  hospital?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  edad?: number | null;
  telefono?: string | null;
  direccion?: string | null;
};

export async function GET(req: Request) {
  try {
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (q.length < 3) {
      return NextResponse.json({ success: true, results: [] });
    }

    const settled = await Promise.allSettled([
      searchPacienteVenezuela(q),
      searchLocalizaPacientes(q),
    ]);
    const results = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));

    return NextResponse.json({ success: true, results });
  } catch {
    return NextResponse.json({ success: false, results: [], error: "Fuentes externas no disponibles" });
  }
}
