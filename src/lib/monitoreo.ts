// ── Monitoreo de campamentos (agregados por refugio) ───────────────────────
// Números GENERALES de cada campamento para el panel de Master. TODO se calcula
// con agregados SQL (GROUP BY refugio) → devuelve ~1 fila por campamento con un
// puñado de conteos, NO filas del censo. Egress mínimo y constante, sin importar
// cuánto crezca el censo. Sin PII (solo conteos).

import { prisma } from "@/lib/prisma";
import type { MonitoreoRow } from "@/types";

const empty = (refugio: string): MonitoreoRow => ({
  refugio, registrados: 0, presentes: 0, intermitentes: 0, retirados: 0,
  nucleos: 0, individuos: 0, asignados: 0, capacidad: 0,
  lesionados: 0, conPatologia: 0, embarazadas: 0, consultas: 0, fichas: 0,
});

export async function computeMonitoreo(): Promise<{ campamentos: MonitoreoRow[]; totales: MonitoreoRow }> {
  // Lista canónica de campamentos (para incluir los que tienen 0 registros).
  const refugios = await prisma.refugio.findMany({ select: { nombre: true }, orderBy: { nombre: "asc" } });

  // Agregados del censo por refugio (una sola pasada).
  const reg = await prisma.$queryRaw<any[]>`
    SELECT refugio,
      COUNT(*) FILTER (WHERE retirado = 'NO')::int                                          AS activos,
      COUNT(*) FILTER (WHERE retirado = 'NO' AND intermitente = 'SI')::int                  AS intermitentes,
      COUNT(*) FILTER (WHERE retirado = 'SI')::int                                           AS retirados,
      COUNT(*) FILTER (WHERE retirado = 'NO' AND "estadoFisico" = 'LESIONADO')::int         AS lesionados,
      COUNT(*) FILTER (WHERE retirado = 'NO' AND patologia = 'SI')::int                     AS con_patologia,
      COUNT(*) FILTER (WHERE retirado = 'NO' AND embarazo = 'SI')::int                      AS embarazadas,
      COUNT(*) FILTER (WHERE retirado = 'NO' AND cuarto IS NOT NULL)::int                   AS asignados
    FROM "Registro" GROUP BY refugio
  `;

  // Núcleos familiares e individuos solos por refugio (misma lógica que stats.ts).
  const fam = await prisma.$queryRaw<any[]>`
    SELECT refugio,
      COUNT(*) FILTER (WHERE cnt >= 2)::int AS nucleos,
      COUNT(*) FILTER (WHERE cnt =  1)::int AS individuos
    FROM (
      SELECT refugio,
        CASE WHEN "jefeFamilia" = 'SI' THEN cedula
             ELSE COALESCE(NULLIF("cedulaJefeFamilia", ''), cedula) END AS family_id,
        COUNT(*) AS cnt
      FROM "Registro" WHERE retirado = 'NO'
      GROUP BY refugio, family_id
    ) g GROUP BY refugio
  `;

  const cons = await prisma.$queryRaw<any[]>`SELECT refugio, COUNT(*)::int AS consultas FROM "ConsultaMedica" GROUP BY refugio`;
  const cap = await prisma.$queryRaw<any[]>`SELECT refugio, COALESCE(SUM(capacidad), 0)::int AS capacidad FROM "CustomRoom" GROUP BY refugio`;

  // Fichas de caracterización por refugio (best-effort: la tabla puede no estar migrada).
  let fichas: any[] = [];
  try { fichas = await prisma.$queryRaw<any[]>`SELECT refugio, COUNT(*)::int AS fichas FROM "CaracterizacionHogar" GROUP BY refugio`; } catch { fichas = []; }

  const map = new Map<string, MonitoreoRow>();
  const ensure = (r: string) => { if (!map.has(r)) map.set(r, empty(r)); return map.get(r)!; };
  for (const rr of refugios) ensure(rr.nombre);
  for (const row of reg) {
    const m = ensure(row.refugio);
    const activos = Number(row.activos);   // retirado = NO (= "Presentes" del Dashboard, incluye intermitentes)
    m.presentes = activos;
    m.retirados = Number(row.retirados);
    m.registrados = activos + m.retirados;  // = "Total Registrados" (activos + retirados)
    m.intermitentes = Number(row.intermitentes);
    m.lesionados = Number(row.lesionados); m.conPatologia = Number(row.con_patologia); m.embarazadas = Number(row.embarazadas);
    m.asignados = Number(row.asignados);
  }
  for (const row of fam) { const m = ensure(row.refugio); m.nucleos = Number(row.nucleos); m.individuos = Number(row.individuos); }
  for (const row of cons) { const m = ensure(row.refugio); m.consultas = Number(row.consultas); }
  for (const row of cap) { const m = ensure(row.refugio); m.capacidad = Number(row.capacidad); }
  for (const row of fichas) { const m = ensure(row.refugio); m.fichas = Number(row.fichas); }

  const campamentos = [...map.values()].sort((a, b) => a.refugio.localeCompare(b.refugio));
  const totales = campamentos.reduce<MonitoreoRow>((t, c) => {
    (Object.keys(t) as (keyof MonitoreoRow)[]).forEach((k) => { if (k !== "refugio") (t as any)[k] = (t[k] as number) + (c[k] as number); });
    return t;
  }, empty("TOTAL"));

  return { campamentos, totales };
}
