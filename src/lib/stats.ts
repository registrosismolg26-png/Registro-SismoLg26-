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
  hogarSolidario: number; // retirados cuya razón es "HOGAR SOLIDARIO" (subconjunto de retirados)
  nucleosFamiliares: number;
  individuosSolos: number;
  lactantes: number;    // 0–3 años (subconjunto de `menores`, que sigue siendo <18)
  noLactantes: number;  // 4–12 años (subconjunto de `menores`)
  adolescentes: number; // 13–17 años (subconjunto de `menores`)
  menores: number;
  adultos: number;
  mayores: number;
  promedioEdad: number;
  matrix: {
    lactantes: { femenino: number; masculino: number; otro: number };
    noLactantes: { femenino: number; masculino: number; otro: number };
    adolescentes: { femenino: number; masculino: number; otro: number };
    menores: { femenino: number; masculino: number; otro: number };
    adultos: { femenino: number; masculino: number; otro: number };
    mayores: { femenino: number; masculino: number; otro: number };
  };
  intermitentes: number;
  lesionados: number;
  conPatologia: number;
  embarazadas: number;
  sinCuarto: number;
  byParroquia: { name: string; count: number }[];
  byGenero: { name: string; count: number }[];
  byEstadoFisico: { name: string; count: number }[];
  byPatologia: { name: string; count: number }[];
  topPatologias: { name: string; count: number }[]; // patologías del censo (por ID-nativo → nombre)
}

const emptyStats = (totalRetirados = 0): AggregateStats => ({
  total: 0,
  totalRegistrados: totalRetirados,
  totalRetirados,
  hogarSolidario: 0,
  nucleosFamiliares: 0,
  individuosSolos: 0,
  lactantes: 0,
  noLactantes: 0,
  adolescentes: 0,
  menores: 0,
  adultos: 0,
  mayores: 0,
  promedioEdad: 0,
  matrix: {
    lactantes: { femenino: 0, masculino: 0, otro: 0 },
    noLactantes: { femenino: 0, masculino: 0, otro: 0 },
    adolescentes: { femenino: 0, masculino: 0, otro: 0 },
    menores: { femenino: 0, masculino: 0, otro: 0 },
    adultos: { femenino: 0, masculino: 0, otro: 0 },
    mayores: { femenino: 0, masculino: 0, otro: 0 },
  },
  intermitentes: 0,
  lesionados: 0,
  conPatologia: 0,
  embarazadas: 0,
  sinCuarto: 0,
  byParroquia: [],
  byGenero: [],
  byEstadoFisico: [],
  byPatologia: [],
  topPatologias: [],
});

export async function computeAggregateStats(scopeRefugio: string | null): Promise<AggregateStats> {
  const refugioSql = scopeRefugio ? Prisma.sql`WHERE refugio = ${scopeRefugio}` : Prisma.empty;
  const refugioFilter: { refugio?: string } = scopeRefugio ? { refugio: scopeRefugio } : {};

  const [aggregates] = await prisma.$queryRaw<any[]>`
    SELECT
      COUNT(*) FILTER (WHERE retirado = 'NO')                                         AS total,
      ROUND(AVG(edad) FILTER (WHERE retirado = 'NO'))                                 AS promedio_edad,
      COUNT(*) FILTER (WHERE edad < 4 AND retirado = 'NO')                            AS lactantes,
      COUNT(*) FILTER (WHERE edad >= 4 AND edad < 13 AND retirado = 'NO')             AS no_lactantes,
      COUNT(*) FILTER (WHERE edad >= 13 AND edad < 18 AND retirado = 'NO')            AS adolescentes,
      COUNT(*) FILTER (WHERE edad < 18 AND retirado = 'NO')                           AS menores,
      COUNT(*) FILTER (WHERE edad >= 18 AND edad < 60 AND retirado = 'NO')            AS adultos,
      COUNT(*) FILTER (WHERE edad >= 60 AND retirado = 'NO')                          AS mayores,
      COUNT(*) FILTER (WHERE edad < 4   AND genero = 'FEMENINO' AND retirado = 'NO')  AS lac_fem,
      COUNT(*) FILTER (WHERE edad < 4   AND genero = 'MASCULINO' AND retirado = 'NO') AS lac_masc,
      COUNT(*) FILTER (WHERE edad < 4   AND genero NOT IN ('FEMENINO','MASCULINO') AND retirado = 'NO') AS lac_otro,
      COUNT(*) FILTER (WHERE edad >= 4 AND edad < 13 AND genero = 'FEMENINO' AND retirado = 'NO')  AS nolac_fem,
      COUNT(*) FILTER (WHERE edad >= 4 AND edad < 13 AND genero = 'MASCULINO' AND retirado = 'NO') AS nolac_masc,
      COUNT(*) FILTER (WHERE edad >= 4 AND edad < 13 AND genero NOT IN ('FEMENINO','MASCULINO') AND retirado = 'NO') AS nolac_otro,
      COUNT(*) FILTER (WHERE edad >= 13 AND edad < 18 AND genero = 'FEMENINO' AND retirado = 'NO')  AS adol_fem,
      COUNT(*) FILTER (WHERE edad >= 13 AND edad < 18 AND genero = 'MASCULINO' AND retirado = 'NO') AS adol_masc,
      COUNT(*) FILTER (WHERE edad >= 13 AND edad < 18 AND genero NOT IN ('FEMENINO','MASCULINO') AND retirado = 'NO') AS adol_otro,
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
      COUNT(*) FILTER (WHERE retirado = 'SI' AND UPPER(TRIM("retiradoRazon")) = 'HOGAR SOLIDARIO') AS hogar_solidario,
      COUNT(*) FILTER (WHERE intermitente = 'SI' AND retirado = 'NO')                  AS intermitentes,
      COUNT(*) FILTER (WHERE "estadoFisico" = 'LESIONADO' AND retirado = 'NO')         AS lesionados,
      COUNT(*) FILTER (WHERE patologia = 'SI' AND retirado = 'NO')                     AS con_patologia,
      COUNT(*) FILTER (WHERE cuarto IS NULL AND retirado = 'NO')                        AS sin_cuarto
    FROM "Registro"
    ${refugioSql}
  `;

  const total = Number(aggregates?.total ?? 0);
  const totalRetirados = Number(aggregates?.total_retirados ?? 0);

  // Filtro "activos" (retirado='NO' + refugio) para las consultas SQL de familias y
  // patologías. ANTES se traían TODAS las filas activas al servidor para contarlas en
  // JS; ahora se cuenta EN SQL (egress constante de unos KB, no proporcional al censo).
  const activeSql = scopeRefugio
    ? Prisma.sql`WHERE retirado = 'NO' AND refugio = ${scopeRefugio}`
    : Prisma.sql`WHERE retirado = 'NO'`;

  // Núcleos familiares e individuos solos, EN SQL — misma lógica que el JS anterior:
  //   familyId = jefe → su cédula; integrante → cédula del jefe (o la propia si no tiene).
  //   grupo de 2+ = núcleo familiar; grupo de 1 = individuo solo.
  // NULLIF("cedulaJefeFamilia", '') replica el `cedulaJefeFamilia || cedula` de JS
  // (trata la cadena vacía como ausente).
  const [fam] = await prisma.$queryRaw<any[]>`
    SELECT
      COUNT(*) FILTER (WHERE cnt >= 2)::int AS nucleos,
      COUNT(*) FILTER (WHERE cnt =  1)::int AS individuos
    FROM (
      SELECT
        CASE WHEN "jefeFamilia" = 'SI' THEN cedula
             ELSE COALESCE(NULLIF("cedulaJefeFamilia", ''), cedula) END AS family_id,
        COUNT(*) AS cnt
      FROM "Registro"
      ${activeSql}
      GROUP BY 1
    ) g
  `;
  const nucleosFamiliares = Number(fam?.nucleos ?? 0);
  const individuosSolos = Number(fam?.individuos ?? 0);

  if (total === 0) return { ...emptyStats(totalRetirados), hogarSolidario: Number(aggregates?.hogar_solidario ?? 0), nucleosFamiliares: 0, individuosSolos: 0 };

  const activeFilter = { retirado: "NO", ...refugioFilter };
  const [parroquiaGroup, generoGroup, estadoFisicoGroup, patologiaGroup] = await Promise.all([
    prisma.registro.groupBy({ where: activeFilter, by: ["parroquia"], _count: { _all: true } }),
    prisma.registro.groupBy({ where: activeFilter, by: ["genero"], _count: { _all: true } }),
    prisma.registro.groupBy({ where: activeFilter, by: ["estadoFisico"], _count: { _all: true } }),
    prisma.registro.groupBy({ where: activeFilter, by: ["patologia"], _count: { _all: true } }),
  ]);

  // Top-8 patologías del censo (por ID-nativo dentro del JSON `patologiaIds`), EN SQL:
  // se "desanidan" los ids del array jsonb y se cuentan. `jsonb_typeof = 'array'` replica
  // el `Array.isArray(...) ? ... : []` de JS (si el valor no es array → se ignora); y
  // `elem <> ''` replica el `typeof id === 'string' && id` (ignora ids vacíos).
  const patRows = await prisma.$queryRaw<any[]>`
    SELECT elem AS pat_id, COUNT(*)::int AS cnt
    FROM "Registro" r
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(r."patologiaIds"::jsonb) = 'array'
           THEN r."patologiaIds"::jsonb ELSE '[]'::jsonb END
    ) AS t(elem)
    ${scopeRefugio
      ? Prisma.sql`WHERE r.retirado = 'NO' AND r.refugio = ${scopeRefugio} AND elem <> ''`
      : Prisma.sql`WHERE r.retirado = 'NO' AND elem <> ''`}
    GROUP BY elem
    ORDER BY cnt DESC, elem ASC
    LIMIT 8
  `;
  let topPatologias: { name: string; count: number }[] = [];
  if (patRows.length) {
    const ids = patRows.map((p) => String(p.pat_id));
    const pats = await prisma.patologia.findMany({
      where: { id: { in: ids } },
      select: { id: true, nombre: true },
    });
    const nameById = new Map(pats.map((p) => [p.id, p.nombre]));
    topPatologias = patRows.map((p) => ({ name: nameById.get(String(p.pat_id)) || "Patología", count: Number(p.cnt) }));
  }

  const n = (v: unknown) => Number(v ?? 0);

  // Mujeres embarazadas (censo): conteo AISLADO y a prueba de fallos. La columna
  // `Registro.embarazo` puede no estar migrada aún en producción; si falta, este
  // count lanza y se degrada a 0 SIN romper el resto de las estadísticas.
  let embarazadas = 0;
  try {
    embarazadas = await prisma.registro.count({ where: { embarazo: "SI", retirado: "NO", ...refugioFilter } });
  } catch { embarazadas = 0; }

  return {
    total,
    totalRegistrados: total + totalRetirados,
    totalRetirados,
    hogarSolidario: n(aggregates.hogar_solidario),
    nucleosFamiliares,
    individuosSolos,
    lactantes: n(aggregates.lactantes),
    noLactantes: n(aggregates.no_lactantes),
    adolescentes: n(aggregates.adolescentes),
    menores: n(aggregates.menores),
    adultos: n(aggregates.adultos),
    mayores: n(aggregates.mayores),
    promedioEdad: n(aggregates.promedio_edad),
    matrix: {
      lactantes: { femenino: n(aggregates.lac_fem), masculino: n(aggregates.lac_masc), otro: n(aggregates.lac_otro) },
      noLactantes: { femenino: n(aggregates.nolac_fem), masculino: n(aggregates.nolac_masc), otro: n(aggregates.nolac_otro) },
      adolescentes: { femenino: n(aggregates.adol_fem), masculino: n(aggregates.adol_masc), otro: n(aggregates.adol_otro) },
      menores: { femenino: n(aggregates.men_fem), masculino: n(aggregates.men_masc), otro: n(aggregates.men_otro) },
      adultos: { femenino: n(aggregates.ad_fem), masculino: n(aggregates.ad_masc), otro: n(aggregates.ad_otro) },
      mayores: { femenino: n(aggregates.may_fem), masculino: n(aggregates.may_masc), otro: n(aggregates.may_otro) },
    },
    intermitentes: n(aggregates.intermitentes),
    lesionados: n(aggregates.lesionados),
    conPatologia: n(aggregates.con_patologia),
    embarazadas,
    sinCuarto: n(aggregates.sin_cuarto),
    byParroquia: parroquiaGroup.map((g: any) => ({ name: g.parroquia, count: g._count._all })),
    byGenero: generoGroup.map((g: any) => ({ name: g.genero, count: g._count._all })),
    byEstadoFisico: estadoFisicoGroup.map((g: any) => ({ name: g.estadoFisico, count: g._count._all })),
    byPatologia: patologiaGroup.map((g: any) => ({ name: g.patologia, count: g._count._all })),
    topPatologias,
  };
}
