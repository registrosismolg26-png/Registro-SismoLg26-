import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canUseRenace } from "@/lib/auth";
import { renaceReadScope } from "@/lib/renaceScope";

// GET — lista LIGERA de los jefeNro que tienen planteamiento (scoped por refugio),
// para el semáforo y los KPI. Payload chico (solo ints) con ETag propio (count + max
// updatedAt) → al registrar un planteamiento solo se re-sincroniza esto, no las ~1000
// filas de jefes/miembros. Autenticado.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canUseRenace(auth)) return NextResponse.json({ error: "Sin acceso a VZLA Renace." }, { status: 403 });

    const requested = new URL(req.url).searchParams.get("refugio");
    const { where, key } = await renaceReadScope(auth, requested);

    let etag: string | null = null;
    try {
      const pa = await prisma.renacePlanteamiento.aggregate({ where, _count: true, _max: { updatedAt: true } });
      const pm = pa._max.updatedAt ? pa._max.updatedAt.getTime() : 0;
      etag = `"renace-plan-${key}-${pa._count}-${pm}"`;
    } catch { etag = null; }
    if (etag && req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
    }

    const plans = await prisma.renacePlanteamiento.findMany({ where, select: { jefeNro: true, jefeCedula: true } });
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (etag) headers.ETag = etag;
    // Se devuelven AMBOS: cédulas (ancla que MANDA) y NROs (respaldo durante la transición,
    // antes del backfill). El cliente marca el semáforo si coincide por cualquiera.
    return NextResponse.json({
      planteamientoNros: plans.map((p) => p.jefeNro),
      planteamientoCedulas: plans.map((p) => p.jefeCedula).filter((c): c is string => !!c),
    }, { headers });
  } catch (error: any) {
    console.error("Error en GET /api/vzlarenace/planteamientos:", error);
    return NextResponse.json({ error: "Error al listar planteamientos" }, { status: 500 });
  }
}
