import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { renaceReadScope } from "@/lib/renaceScope";

// GET — jefes y miembros del refugio del usuario (Master: el `?refugio=` seleccionado,
// o todos si no manda ninguno). Dataset chico → el cliente cachea en localStorage y
// pagina/busca en cliente. Sello barato (scope + count + max(createdAt)) → 304. Autenticado.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const requested = new URL(req.url).searchParams.get("refugio");
    const { where, key } = await renaceReadScope(auth, requested);

    let etag: string | null = null;
    try {
      // Se incluye el planteamiento (count + max updatedAt) en el sello para que los KPI
      // se refresquen cuando se registra/actualiza un planteamiento.
      const [ja, ma, pa] = await Promise.all([
        prisma.renaceJefe.aggregate({ where, _count: true, _max: { createdAt: true } }),
        prisma.renaceMiembro.aggregate({ where, _count: true, _max: { createdAt: true } }),
        prisma.renacePlanteamiento.aggregate({ where, _count: true, _max: { updatedAt: true } }),
      ]);
      const jm = ja._max.createdAt ? ja._max.createdAt.getTime() : 0;
      const mm = ma._max.createdAt ? ma._max.createdAt.getTime() : 0;
      const pm = pa._max.updatedAt ? pa._max.updatedAt.getTime() : 0;
      etag = `"renace-${key}-${ja._count}-${jm}-${ma._count}-${mm}-${pa._count}-${pm}"`;
    } catch { etag = null; }
    if (etag && req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
    }

    const [jefes, miembros, plans] = await Promise.all([
      prisma.renaceJefe.findMany({ where, orderBy: { nro: "asc" } }),
      prisma.renaceMiembro.findMany({ where, orderBy: [{ jefeNro: "asc" }, { nombres: "asc" }] }),
      prisma.renacePlanteamiento.findMany({ where, select: { jefeNro: true } }), // qué jefes tienen plan (semáforo + KPI)
    ]);
    const planteamientoNros = plans.map((p) => p.jefeNro);

    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (etag) headers.ETag = etag;
    return NextResponse.json({ jefes, miembros, planteamientoNros }, { headers });
  } catch (error: any) {
    console.error("Error en GET /api/vzlarenace/list:", error);
    return NextResponse.json({ error: "Error al listar" }, { status: 500 });
  }
}
