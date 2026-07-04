import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isMaster } from "@/lib/auth";

// ── Gestión de links públicos de reporte (autenticado) ──────────────────────
// POST   → crea un link. Master elige el refugio (o "todos" = null); el resto
//          queda forzado a SU refugio. Nunca se confía en el cliente.
// GET    → lista los links que YO creé, con conteo de accesos.
// DELETE → revoca (activo=false) un link mío; la auditoría se conserva.

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    // Master decide el refugio (o null = consolidado). El resto: su propio refugio.
    let refugio: string | null;
    if (isMaster(auth)) {
      const r = typeof body.refugio === "string" ? body.refugio.trim() : "";
      refugio = r ? r : null;
    } else {
      if (!auth.refugio) {
        return NextResponse.json({ error: "No tienes un refugio asignado" }, { status: 400 });
      }
      refugio = auth.refugio;
    }

    const reporte = await prisma.reporteCompartido.create({
      data: { refugio, creadoPor: auth.id, creadoPorNombre: auth.nombre },
      select: { id: true, refugio: true, createdAt: true },
    });

    return NextResponse.json({ success: true, token: reporte.id, refugio: reporte.refugio, createdAt: reporte.createdAt });
  } catch (error: any) {
    console.error("Error al crear reporte compartido:", error);
    return NextResponse.json({ error: "Error al crear el link" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const reportes = await prisma.reporteCompartido.findMany({
      where: { creadoPor: auth.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, refugio: true, activo: true, createdAt: true,
        _count: { select: { accesos: true } },
      },
    });

    return NextResponse.json({ success: true, reportes });
  } catch (error: any) {
    console.error("Error al listar reportes compartidos:", error);
    return NextResponse.json({ error: "Error al listar los links" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

    const existing = await prisma.reporteCompartido.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "No existe" }, { status: 404 });
    // Solo el creador o Master puede revocar.
    if (existing.creadoPor !== auth.id && !isMaster(auth)) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    await prisma.reporteCompartido.update({ where: { id }, data: { activo: false } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error al revocar reporte compartido:", error);
    return NextResponse.json({ error: "Error al revocar el link" }, { status: 500 });
  }
}
