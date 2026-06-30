import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Single SQL pass for all numeric aggregates (replaces 14 sequential queries)
    const [aggregates] = await prisma.$queryRaw<any[]>`
      SELECT
        COUNT(*)                                                                        AS total,
        ROUND(AVG(edad))                                                                AS promedio_edad,
        COUNT(*) FILTER (WHERE edad < 18)                                               AS menores,
        COUNT(*) FILTER (WHERE edad >= 18 AND edad < 60)                                AS adultos,
        COUNT(*) FILTER (WHERE edad >= 60)                                              AS mayores,
        COUNT(*) FILTER (WHERE edad < 18  AND genero = 'FEMENINO')                     AS men_fem,
        COUNT(*) FILTER (WHERE edad < 18  AND genero = 'MASCULINO')                    AS men_masc,
        COUNT(*) FILTER (WHERE edad < 18  AND genero NOT IN ('FEMENINO','MASCULINO'))   AS men_otro,
        COUNT(*) FILTER (WHERE edad >= 18 AND edad < 60 AND genero = 'FEMENINO')        AS ad_fem,
        COUNT(*) FILTER (WHERE edad >= 18 AND edad < 60 AND genero = 'MASCULINO')       AS ad_masc,
        COUNT(*) FILTER (WHERE edad >= 18 AND edad < 60 AND genero NOT IN ('FEMENINO','MASCULINO')) AS ad_otro,
        COUNT(*) FILTER (WHERE edad >= 60 AND genero = 'FEMENINO')                     AS may_fem,
        COUNT(*) FILTER (WHERE edad >= 60 AND genero = 'MASCULINO')                    AS may_masc,
        COUNT(*) FILTER (WHERE edad >= 60 AND genero NOT IN ('FEMENINO','MASCULINO'))   AS may_otro
      FROM "Registro"
    `;

    const total = Number(aggregates.total ?? 0);

    if (total === 0) {
      return NextResponse.json(
        {
          success: true,
          stats: {
            total: 0,
            menores: 0,
            adultos: 0,
            mayores: 0,
            matrix: {
              menores: { femenino: 0, masculino: 0, otro: 0 },
              adultos: { femenino: 0, masculino: 0, otro: 0 },
              mayores: { femenino: 0, masculino: 0, otro: 0 }
            },
            byParroquia: [],
            byGenero: [],
            byEstadoFisico: [],
            byPatologia: [],
            promedioEdad: 0
          }
        },
        { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
      );
    }

    // 4 groupBy queries running in parallel
    const [parroquiaGroup, generoGroup, estadoFisicoGroup, patologiaGroup] =
      await Promise.all([
        prisma.registro.groupBy({ by: ["parroquia"], _count: { _all: true } }),
        prisma.registro.groupBy({ by: ["genero"],    _count: { _all: true } }),
        prisma.registro.groupBy({ by: ["estadoFisico"], _count: { _all: true } }),
        prisma.registro.groupBy({ by: ["patologia"], _count: { _all: true } })
      ]);

    const n = (v: unknown) => Number(v ?? 0);

    return NextResponse.json(
      {
        success: true,
        stats: {
          total,
          menores:      n(aggregates.menores),
          adultos:      n(aggregates.adultos),
          mayores:      n(aggregates.mayores),
          promedioEdad: n(aggregates.promedio_edad),
          matrix: {
            menores: { femenino: n(aggregates.men_fem),  masculino: n(aggregates.men_masc),  otro: n(aggregates.men_otro) },
            adultos: { femenino: n(aggregates.ad_fem),   masculino: n(aggregates.ad_masc),   otro: n(aggregates.ad_otro) },
            mayores: { femenino: n(aggregates.may_fem),  masculino: n(aggregates.may_masc),  otro: n(aggregates.may_otro) }
          },
          byParroquia:    parroquiaGroup.map(g => ({ name: g.parroquia,    count: g._count._all })),
          byGenero:       generoGroup.map(g =>    ({ name: g.genero,       count: g._count._all })),
          byEstadoFisico: estadoFisicoGroup.map(g => ({ name: g.estadoFisico, count: g._count._all })),
          byPatologia:    patologiaGroup.map(g =>  ({ name: g.patologia,   count: g._count._all }))
        }
      },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );

  } catch (error: any) {
    console.error("Error en stats API:", error);
    return NextResponse.json(
      { error: "Error al obtener estadísticas del servidor" },
      { status: 500 }
    );
  }
}
