import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Single SQL pass for all numeric aggregates (replaces 14 sequential queries)
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
        COUNT(*) FILTER (WHERE retirado = 'SI')                                         AS total_retirados
      FROM "Registro"
    `;

    const total = Number(aggregates.total ?? 0);
    const totalRetirados = Number(aggregates.total_retirados ?? 0);

    // Family nuclei calculations
    const presentRegistros = await prisma.registro.findMany({
      where: { retirado: "NO" },
      select: { cedula: true, jefeFamilia: true, cedulaJefeFamilia: true }
    });

    const familyGroups: Record<string, number> = {};
    presentRegistros.forEach(r => {
      let familyId = "";
      if (r.jefeFamilia === "SI") {
        familyId = r.cedula;
      } else if (r.cedulaJefeFamilia) {
        familyId = r.cedulaJefeFamilia;
      } else {
        familyId = r.cedula;
      }
      familyGroups[familyId] = (familyGroups[familyId] || 0) + 1;
    });

    let nucleosFamiliares = 0;
    let individuosSolos = 0;
    Object.values(familyGroups).forEach(size => {
      if (size >= 2) {
        nucleosFamiliares++;
      } else {
        individuosSolos++;
      }
    });

    if (total === 0) {
      return NextResponse.json(
        {
          success: true,
          stats: {
            total: 0,
            totalRegistrados: totalRetirados,
            totalRetirados,
            nucleosFamiliares: 0,
            individuosSolos: 0,
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

    const activeFilter = { retirado: "NO" };

    // 4 groupBy queries running in parallel, filtering active people
    const [parroquiaGroup, generoGroup, estadoFisicoGroup, patologiaGroup] =
      await Promise.all([
        prisma.registro.groupBy({ where: activeFilter, by: ["parroquia"], _count: { _all: true } }),
        prisma.registro.groupBy({ where: activeFilter, by: ["genero"],    _count: { _all: true } }),
        prisma.registro.groupBy({ where: activeFilter, by: ["estadoFisico"], _count: { _all: true } }),
        prisma.registro.groupBy({ where: activeFilter, by: ["patologia"], _count: { _all: true } })
      ]);

    const n = (v: unknown) => Number(v ?? 0);

    return NextResponse.json(
      {
        success: true,
        stats: {
          total,
          totalRegistrados: total + totalRetirados,
          totalRetirados,
          nucleosFamiliares,
          individuosSolos,
          menores:      n(aggregates.menores),
          adultos:      n(aggregates.adultos),
          mayores:      n(aggregates.mayores),
          promedioEdad: n(aggregates.promedio_edad),
          matrix: {
            menores: { femenino: n(aggregates.men_fem),  masculino: n(aggregates.men_masc),  otro: n(aggregates.men_otro) },
            adultos: { femenino: n(aggregates.ad_fem),   masculino: n(aggregates.ad_masc),   otro: n(aggregates.ad_otro) },
            mayores: { femenino: n(aggregates.may_fem),  masculino: n(aggregates.may_masc),  otro: n(aggregates.may_otro) }
          },
          byParroquia:    parroquiaGroup.map((g: { parroquia: string; _count: { _all: number } }) => ({ name: g.parroquia,    count: g._count._all })),
          byGenero:       generoGroup.map((g: { genero: string; _count: { _all: number } }) =>       ({ name: g.genero,       count: g._count._all })),
          byEstadoFisico: estadoFisicoGroup.map((g: { estadoFisico: string; _count: { _all: number } }) => ({ name: g.estadoFisico, count: g._count._all })),
          byPatologia:    patologiaGroup.map((g: { patologia: string; _count: { _all: number } }) =>  ({ name: g.patologia,   count: g._count._all }))
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
