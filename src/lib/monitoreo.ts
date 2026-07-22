// ── Monitoreo de campamentos (agregados por refugio) ───────────────────────
// Números GENERALES de cada campamento para el panel de Master. TODO se calcula
// con agregados SQL (GROUP BY refugio) → ~1 fila por campamento con conteos, NO
// filas del censo. Egress mínimo y constante. Sin PII.
//
// Definiciones IDÉNTICAS a Estadísticas (src/lib/stats.ts + DashboardTab.getLocalStats):
//   activos      = retirado = 'NO'  (= "Presentes"; incluye intermitentes)
//   registrados  = activos + retirados  (= "Total Registrados")
//   intermitentes/lesionados/conPatologia/embarazadas = sobre activos
//   nucleos/individuos = agrupando por jefe de familia (solo activos)
// GROUP BY TRIM(refugio): un campamento no se parte por espacios sobrantes en el
// string de refugio (causa de que "unos campamentos cuadren y otros no").

import { prisma } from "@/lib/prisma";
import type { MonitoreoRow } from "@/types";

const empty = (refugio: string): MonitoreoRow => ({
  refugio, registrados: 0, presentes: 0, intermitentes: 0, retirados: 0,
  nucleos: 0, individuos: 0, asignados: 0, capacidad: 0,
  lesionados: 0, conPatologia: 0, embarazadas: 0,
});

export async function computeMonitoreo(): Promise<{ campamentos: MonitoreoRow[]; totales: MonitoreoRow }> {
  const refugios = await prisma.refugio.findMany({ select: { nombre: true }, orderBy: { nombre: "asc" } });

  const reg = await prisma.$queryRaw<any[]>`
    SELECT TRIM(refugio) AS refugio,
      COUNT(*) FILTER (WHERE retirado = 'NO')::int                                          AS activos,
      COUNT(*) FILTER (WHERE retirado = 'NO' AND intermitente = 'SI')::int                  AS intermitentes,
      COUNT(*) FILTER (WHERE retirado = 'SI')::int                                          AS retirados,
      COUNT(*) FILTER (WHERE retirado = 'NO' AND "estadoFisico" = 'LESIONADO')::int         AS lesionados,
      COUNT(*) FILTER (WHERE retirado = 'NO' AND patologia = 'SI')::int                     AS con_patologia,
      COUNT(*) FILTER (WHERE retirado = 'NO' AND embarazo = 'SI')::int                      AS embarazadas,
      COUNT(*) FILTER (WHERE retirado = 'NO' AND cuarto IS NOT NULL)::int                   AS asignados
    FROM "Registro" GROUP BY TRIM(refugio)
  `;

  const fam = await prisma.$queryRaw<any[]>`
    SELECT refugio,
      COUNT(*) FILTER (WHERE cnt >= 2)::int AS nucleos,
      COUNT(*) FILTER (WHERE cnt =  1)::int AS individuos
    FROM (
      SELECT TRIM(refugio) AS refugio,
        regexp_replace(
          CASE WHEN "jefeFamilia" = 'SI' THEN cedula
               ELSE COALESCE(NULLIF("cedulaJefeFamilia", ''), cedula) END,
          '^[VEve]?-?([0-9]+)(-[0-9]+)?$', '\\1'
        ) AS family_id,
        COUNT(*) AS cnt
      FROM "Registro" WHERE retirado = 'NO'
      GROUP BY TRIM(refugio), family_id
    ) g GROUP BY refugio
  `;

  const cap = await prisma.$queryRaw<any[]>`SELECT TRIM(refugio) AS refugio, COALESCE(SUM(capacidad), 0)::int AS capacidad FROM "CustomRoom" GROUP BY TRIM(refugio)`;

  const map = new Map<string, MonitoreoRow>();
  const ensure = (r: string) => { const k = (r || "").trim(); if (!map.has(k)) map.set(k, empty(k)); return map.get(k)!; };
  for (const rr of refugios) ensure(rr.nombre);
  for (const row of reg) {
    const m = ensure(row.refugio);
    const activos = Number(row.activos);
    m.presentes = activos;
    m.retirados = Number(row.retirados);
    m.registrados = activos + m.retirados;
    m.intermitentes = Number(row.intermitentes);
    m.lesionados = Number(row.lesionados);
    m.conPatologia = Number(row.con_patologia);
    m.embarazadas = Number(row.embarazadas);
    m.asignados = Number(row.asignados);
  }
  for (const row of fam) { const m = ensure(row.refugio); m.nucleos = Number(row.nucleos); m.individuos = Number(row.individuos); }
  for (const row of cap) { const m = ensure(row.refugio); m.capacidad = Number(row.capacidad); }

  const campamentos = [...map.values()].sort((a, b) => a.refugio.localeCompare(b.refugio));
  const totales = campamentos.reduce<MonitoreoRow>((t, c) => {
    (Object.keys(t) as (keyof MonitoreoRow)[]).forEach((k) => { if (k !== "refugio") (t as any)[k] = (t[k] as number) + (c[k] as number); });
    return t;
  }, empty("TOTAL"));

  return { campamentos, totales };
}
