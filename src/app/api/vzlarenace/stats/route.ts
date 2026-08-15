import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canViewRenaceGraficas } from "@/lib/auth";

// GET — estadísticas AGREGADAS de VZLA RENACE por campamento + global (para las
// gráficas). Todo en SQL (`groupBy`) → egress mínimo, sin traer filas ni PII. Solo
// aparecen los campamentos CON datos (con jefes) → la lista crece sola al importar.
// Solo roles que ven el dashboard: Master global + Master Renace (canViewRenaceGraficas).
const TIPOS = ["COMPRA", "ALQUILER", "GMVV_INTERIOR", "PLAN_RENACE"] as const;

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canViewRenaceGraficas(auth)) return NextResponse.json({ error: "Sin permiso para ver las gráficas." }, { status: 403 });

    const [jefesByRef, miembrosByRef, plansByRef, plansByRefTipo] = await Promise.all([
      prisma.renaceJefe.groupBy({ by: ["refugioId"], _count: true }),
      prisma.renaceMiembro.groupBy({ by: ["refugioId"], _count: true }),
      prisma.renacePlanteamiento.groupBy({ by: ["refugioId"], _count: true }),
      prisma.renacePlanteamiento.groupBy({ by: ["refugioId", "tipo"], _count: true }),
    ]);

    // Nombres de los campamentos presentes.
    const refIds = jefesByRef.map((x) => x.refugioId);
    const refugios = refIds.length
      ? await prisma.refugio.findMany({ where: { id: { in: refIds } }, select: { id: true, nombre: true } })
      : [];
    const nameById = new Map(refugios.map((r) => [r.id, r.nombre]));
    const miembrosMap = new Map(miembrosByRef.map((x) => [x.refugioId, x._count]));
    const plansMap = new Map(plansByRef.map((x) => [x.refugioId, x._count]));
    const tipoMap = new Map<string, Record<string, number>>();
    for (const t of plansByRefTipo) {
      const m = tipoMap.get(t.refugioId) || {};
      m[t.tipo] = (m[t.tipo] || 0) + t._count;
      tipoMap.set(t.refugioId, m);
    }

    const campamentos = jefesByRef
      .map((j) => {
        const familias = j._count;
        const conPlan = plansMap.get(j.refugioId) || 0;
        const porTipo: Record<string, number> = {};
        const tm = tipoMap.get(j.refugioId) || {};
        for (const k of TIPOS) porTipo[k] = tm[k] || 0;
        return {
          refugioId: j.refugioId,
          nombre: nameById.get(j.refugioId) || j.refugioId,
          familias,
          miembros: miembrosMap.get(j.refugioId) || 0,
          conPlan,
          sinPlan: Math.max(0, familias - conPlan),
          porTipo,
        };
      })
      .sort((a, b) => b.familias - a.familias);

    const global = campamentos.reduce(
      (acc, c) => {
        acc.familias += c.familias;
        acc.miembros += c.miembros;
        acc.conPlan += c.conPlan;
        acc.sinPlan += c.sinPlan;
        for (const k of TIPOS) acc.porTipo[k] += c.porTipo[k] || 0;
        return acc;
      },
      { campamentos: campamentos.length, familias: 0, miembros: 0, conPlan: 0, sinPlan: 0, porTipo: { COMPRA: 0, ALQUILER: 0, GMVV_INTERIOR: 0, PLAN_RENACE: 0 } as Record<string, number> },
    );

    return NextResponse.json({ campamentos, global }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("Error en GET /api/vzlarenace/stats:", error);
    return NextResponse.json({ error: "Error al calcular estadísticas" }, { status: 500 });
  }
}
