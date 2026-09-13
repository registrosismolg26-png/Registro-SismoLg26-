import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canUseRenace } from "@/lib/auth";
import { renaceReadScope } from "@/lib/renaceScope";

// GET — lista LIGERA de los núcleos con estado (APROBADO/RETIRADO), scoped por refugio,
// para insignias y KPIs. Payload chico con ETag propio (count + max updatedAt) → al
// aprobar/retirar solo se re-sincroniza esto, no las ~1000 filas de jefes/miembros.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canUseRenace(auth)) return NextResponse.json({ error: "Sin acceso a VZLA Renace." }, { status: 403 });

    const requested = new URL(req.url).searchParams.get("refugio");
    const { where, key } = await renaceReadScope(auth, requested);

    let etag: string | null = null;
    try {
      const ag = await prisma.renaceEstado.aggregate({ where, _count: true, _max: { updatedAt: true } });
      const mu = ag._max.updatedAt ? ag._max.updatedAt.getTime() : 0;
      etag = `"renace-estado-${key}-${ag._count}-${mu}"`;
    } catch { etag = null; }
    if (etag && req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
    }

    const rows = await prisma.renaceEstado.findMany({ where, select: { jefeNro: true, jefeCedula: true, estado: true } });
    const aprobados = rows.filter((r) => r.estado === "APROBADO");
    const retirados = rows.filter((r) => r.estado === "RETIRADO");
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (etag) headers.ETag = etag;
    return NextResponse.json({
      aprobadoNros: aprobados.map((r) => r.jefeNro),
      aprobadoCedulas: aprobados.map((r) => r.jefeCedula),
      retiradoNros: retirados.map((r) => r.jefeNro),
      retiradoCedulas: retirados.map((r) => r.jefeCedula),
    }, { headers });
  } catch (error: any) {
    console.error("Error en GET /api/vzlarenace/estados:", error);
    return NextResponse.json({ error: "Error al listar estados" }, { status: 500 });
  }
}
