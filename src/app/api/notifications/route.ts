import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// Centro de avisos in-app del PROPIO usuario (scope = auth.id).
//   GET   → { items (últimos 30), unread }
//   PATCH → marca leídos (todos, o los { ids } del body)
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const items = await prisma.notification.findMany({
      where: { userId: auth.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const unread = items.reduce((n, it) => n + (it.readAt ? 0 : 1), 0);

    // Contador de "nuevos afectados" (registros nuevos desde ?afectadosSince) para
    // Master/Admin — se lee del censo directamente, sin crear filas. Egress: un count.
    let nuevosAfectados = 0;
    const afectadosSince = new URL(req.url).searchParams.get("afectadosSince");
    if ((auth.role === "MASTER" || auth.role === "ADMIN") && afectadosSince) {
      const since = new Date(afectadosSince);
      if (!isNaN(since.getTime())) {
        const where: any = { createdAt: { gt: since } };
        if (auth.role !== "MASTER") where.refugio = auth.refugio;
        nuevosAfectados = await prisma.registro.count({ where }).catch(() => 0);
      }
    }

    return NextResponse.json({ success: true, items, unread, nuevosAfectados });
  } catch (error: any) {
    console.error("Error en GET /api/notifications:", error);
    return NextResponse.json({ error: "Error al listar avisos" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const ids: string[] | undefined = Array.isArray(body?.ids) ? body.ids.map(String) : undefined;
    await prisma.notification.updateMany({
      where: { userId: auth.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en PATCH /api/notifications:", error);
    return NextResponse.json({ error: "Error al marcar avisos" }, { status: 500 });
  }
}
