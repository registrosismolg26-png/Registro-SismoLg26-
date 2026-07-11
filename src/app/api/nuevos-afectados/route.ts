import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// Feed de "nuevos afectados" (SOLO Master/Admin): registros RECIENTES leídos
// directamente del censo (NO crea filas de aviso → egress mínimo). Columnas ligeras
// + límite. Master ve todos los campamentos; Admin solo el suyo. `nuevos` = cuántos
// de los recientes son posteriores a ?since (para el "N nuevos desde tu última visita").
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (auth.role !== "MASTER" && auth.role !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const since = new URL(req.url).searchParams.get("since");
    const sinceDate = since ? new Date(since) : null;

    const where: any = {};
    if (auth.role !== "MASTER") where.refugio = auth.refugio;

    const items = await prisma.registro.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, nombreApellido: true, cedula: true, refugio: true, parroquia: true, jefeFamilia: true, retirado: true, createdAt: true },
    });

    const nuevos = sinceDate && !isNaN(sinceDate.getTime())
      ? items.reduce((n, r) => n + (r.createdAt > sinceDate ? 1 : 0), 0)
      : 0;

    return NextResponse.json({ success: true, items, nuevos, generadoEn: new Date().toISOString() });
  } catch (error: any) {
    console.error("Error en GET /api/nuevos-afectados:", error);
    return NextResponse.json({ error: "Error al listar nuevos afectados" }, { status: 500 });
  }
}
