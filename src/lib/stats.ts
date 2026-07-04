// ── Agregados de estadísticas por refugio (fuente única) ────────────────────
// Calcula el mismo objeto `stats` que consume el Dashboard, en el servidor y en
// UN solo lugar, para que la ruta autenticada (/api/stats) y el reporte público
// (/api/reporte/[token]/acceso) devuelvan EXACTAMENTE lo mismo. Sin PII: solo
// conteos agregados. `scopeRefugio = null` → todos los refugios (solo Master).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface AggregateStats {
  total: number;
  totalRegistrados: number;
  totalRetirados: number;
  nucleosFamiliares: number;
  individuosSolos: number;
  menores: number;
  adultos: number;
  mayores: number;
  promedioEdad: number;
  matrix: {
    menores: { femenino: number; masculino: number; otro: number };
    adultos: { femenino: number; masculino: number; otro: number };
    mayores: { femenino: number; masculino: number; otro: number };
  };
  intermitentes: number;
  lesionados: number;
  conPatologia: number;
  sinCuarto: number;
  byParroquia: { name: string; count: number }[];
  byGenero: { name: string; count: number }[];
  byEstadoFisico: { name: string; count: number }[];
  byPatologia: { name: string; count: number }[];
}

const emptyStats = (totalRetirados = 0): AggregateStats => ({
  total: 0,
  totalRegistrados: totalRetirados,
  totalRetirados,
  nucleosFamiliares: 0,
  individuosSolos: 0,
  menores: 0,
  adultos: 0,
  mayores: 0,
  promedioEdad: 0,
  matrix: {
    menores: { femenino: 0, masculino: 0, otro: 0 },
    adultos: { femenino: 0, masculino: 0, otro: 0 },
    mayores: { femenino: 0, masculino: 0, otro: 0 },
  },
  intermitentes: 0,
  lesionados: 0,
  conPatologia: 0,
  sinCuarto: 0,
  byParroquia: [],
  byGenero: [],
  byEstadoFisico: [],
  byPatologia: [],
});

export async function computeAggregateStats(scopeRefugio: string | null): Promise<AggregateStats> {
  const refugioSql = scopeRefugio ? Prisma.sql`WHERE refugio = ${scopeRefugio}` : Prisma.empty;
  const refugioFilter: { refugio?: string } = scopeRefugio ? { refugio: scopeRefugio } : {};

  const [aggregates] = await prisma.$queryRaw<any[]>`
    SELECT
      COUNT(*) FILTER (WHERE retirado = 'NO')                                         AS total,
      ROUND(AVG(edad) FILTER (WHERE retirado = 'NO'))                                 AS promedio_edad,
      COUNT(*) FILTER (WHERE edad < 18 AND retirado = 'NO')                           AS menores,
      COUNT(*) FILTER (WHERE edad >= 18 AND edad < 60 AND retirado = 'NO')            AS adultos,
      COUNT(*) FILTER (WHERE edad >= 60 AND retirado = 'NO')                          AS mayores,
      COUNT(*) FILTER (WHERE edad < 18  AND genero = 'FEMENINO' AND retirado = 'NO')  AS men_fem,
      COUNT(*) FILTER (WHERE edad < 18  AND genero = 'MASCULINO' AND retirado = 'NO') AS men_masc,
      COUNT(*) FILTER (WHERE edad < 18  AND genero NOT IN ('FEMENINO','MASCULINO') AND retirado = 'NO') AS men_otro,
      COUNT(*) FILTER (WHERE edad >= 18 AND edad < 60 AND genero = 'FEMENINO' AND retirado = 'NO')  AS ad_fem,
      COUNT(*) FILTER (WHERE edad >= 18 AND edad < 60 AND genero = 'MASCULINO' AND retirado = 'NO') AS ad_masc,
      COUNT(*) FILTER (WHERE edad >= 18 AND edad < 60 AND genero NOT IN ('FEMENINO','MASCULINO') AND retirado = 'NO') AS ad_otro,
      COUNT(*) FILTER (WHERE edad >= 60 AND genero = 'FEMENINO' AND retirado = 'NO')  AS may_fem,
      COUNT(*) FILTER (WHERE edad >= 60 AND genero = 'MASCULINO' AND retirado = 'NO') AS may_masc,
      COUNT(*) FILTER (WHERE edad >= 60 AND genero NOT IN ('FEMENINO','MASCULINO') AND retirado = 'NO') AS may_otro,
      COUNT(*) FILTER (WHERE retirado = 'SI')                                         AS total_retirados,
      COUNT(*) FILTER (WHERE intermitente = 'SI' AND retirado = 'NO')                  AS intermitentes,
      COUNT(*) FILTER (WHERE "estadoFisico" = 'LESIONADO' AND retirado = 'NO')         AS lesionados,
      COUNT(*) FILTER (WHERE patologia = 'SI' AND retirado = 'NO')                     AS con_patologia,
      COUNT(*) FILTER (WHERE cuarto IS NULL AND retirado = 'NO')                        AS sin_cuarto
    FROM "Registro"
    ${refugioSql}
  `;

  const total = Number(aggregates?.total ?? 0);
  const totalRetirados = Number(aggregates?.total_retirados ?? 0);

  // Núcleos familiares (misma lógica que /api/stats).
  const presentRegistros = await prisma.registro.findMany({
    where: { retirado: "NO", ...refugioFilter },
    select: { cedula: true, jefeFamilia: true, cedulaJefeFamilia: true },
  });
  const familyGroups: Record<string, number> = {};
  presentRegistros.forEach((r) => {
    const familyId = r.jefeFamilia === "SI" ? r.cedula : r.cedulaJefeFamilia || r.cedula;
    familyGroups[familyId] = (familyGroups[familyId] || 0) + 1;
  });
  let nucleosFamiliares = 0;
  let individuosSolos = 0;
  Object.values(familyGroups).forEach((size) => {
    if (size >= 2) nucleosFamiliares++;
    else individuosSolos++;
  });

  if (total === 0) return { ...emptyStats(totalRetirados), nucleosFamiliares: 0, individuosSolos: 0 };

  const activeFilter = { retirado: "NO", ...refugioFilter };
  const [parroquiaGroup, generoGroup, estadoFisicoGroup, patologiaGroup] = await Promise.all([
    prisma.registro.groupBy({ where: activeFilter, by: ["parroquia"], _count: { _all: true } }),
    prisma.registro.groupBy({ where: activeFilter, by: ["genero"], _count: { _all: true } }),
    prisma.registro.groupBy({ where: activeFilter, by: ["estadoFisico"], _count: { _all: true } }),
    prisma.registro.groupBy({ where: activeFilter, by: ["patologia"], _count: { _all: true } }),
  ]);

  const n = (v: unknown) => Number(v ?? 0);

  return {
    total,
    totalRegistrados: total + totalRetirados,
    totalRetirados,
    nucleosFamiliares,
    individuosSolos,
    menores: n(aggregates.menores),
    adultos: n(aggregates.adultos),
    mayores: n(aggregates.mayores),
    promedioEdad: n(aggregates.promedio_edad),
    matrix: {
      menores: { femenino: n(aggregates.men_fem), masculino: n(aggregates.men_masc), otro: n(aggregates.men_otro) },
      adultos: { femenino: n(aggregates.ad_fem), masculino: n(aggregates.ad_masc), otro: n(aggregates.ad_otro) },
      mayores: { femenino: n(aggregates.may_fem), masculino: n(aggregates.may_masc), otro: n(aggregates.may_otro) },
    },
    intermitentes: n(aggregates.intermitentes),
    lesionados: n(aggregates.lesionados),
    conPatologia: n(aggregates.con_patologia),
    sinCuarto: n(aggregates.sin_cuarto),
    byParroquia: parroquiaGroup.map((g: any) => ({ name: g.parroquia, count: g._count._all })),
    byGenero: generoGroup.map((g: any) => ({ name: g.genero, count: g._count._all })),
    byEstadoFisico: estadoFisicoGroup.map((g: any) => ({ name: g.estadoFisico, count: g._count._all })),
    byPatologia: patologiaGroup.map((g: any) => ({ name: g.patologia, count: g._count._all })),
  };
}
