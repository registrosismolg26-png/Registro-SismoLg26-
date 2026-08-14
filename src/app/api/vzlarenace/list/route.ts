import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET — devuelve TODOS los jefes y miembros para las dos tablas (dataset chico:
// ~259 + ~1629). El cliente cachea en localStorage y pagina/busca en cliente.
// Sello barato (count + max(createdAt)) → 304 si nada cambió. Autenticado.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    let etag: string | null = null;
    try {
      const [ja, ma] = await Promise.all([
        prisma.renaceJefe.aggregate({ _count: true, _max: { createdAt: true } }),
        prisma.renaceMiembro.aggregate({ _count: true, _max: { createdAt: true } }),
      ]);
      const jm = ja._max.createdAt ? ja._max.createdAt.getTime() : 0;
      const mm = ma._max.createdAt ? ma._max.createdAt.getTime() : 0;
      etag = `"renace-${ja._count}-${jm}-${ma._count}-${mm}"`;
    } catch { etag = null; }
    if (etag && req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
    }

    const [jefes, miembros] = await Promise.all([
      prisma.renaceJefe.findMany({ orderBy: { nro: "asc" } }),
      prisma.renaceMiembro.findMany({ orderBy: [{ jefeNro: "asc" }, { nombres: "asc" }] }),
    ]);

    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (etag) headers.ETag = etag;
    return NextResponse.json({ jefes, miembros }, { headers });
  } catch (error: any) {
    console.error("Error en GET /api/vzlarenace/list:", error);
    return NextResponse.json({ error: "Error al listar" }, { status: 500 });
  }
}
