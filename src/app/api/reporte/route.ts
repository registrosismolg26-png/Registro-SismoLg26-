import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isMaster, type AuthUser } from "@/lib/auth";

// ── Matriz de visibilidad / revocación de links (decisión del dueño) ─────────
// VER: Master ve todos; Admin ve todos MENOS los de un Master; el resto solo los suyos.
// REVOCAR: cada quien revoca los suyos; Master/Admin además revocan los de usuarios
// NO privilegiados (ni de otros admins ni de un master); Admin nunca ve/revoca los de Master.
function canSeeLink(auth: AuthUser, creatorId: string, creatorRole?: string): boolean {
  if (creatorId === auth.id) return true;
  if (isMaster(auth)) return true;
  if (auth.role === "ADMIN") return creatorRole !== "MASTER";
  return false;
}
function canRevokeLink(auth: AuthUser, creatorId: string, creatorRole?: string): boolean {
  if (creatorId === auth.id) return true; // los propios siempre
  const privileged = isMaster(auth) || auth.role === "ADMIN";
  if (!privileged) return false;
  const creatorPrivileged = creatorRole === "MASTER" || creatorRole === "ADMIN";
  return !creatorPrivileged; // solo links de usuarios NO privilegiados
}

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

    // Master/Admin traen TODOS (se filtran por visibilidad abajo); el resto, solo los suyos.
    const privileged = isMaster(auth) || auth.role === "ADMIN";
    const rows = await prisma.reporteCompartido.findMany({
      where: privileged ? {} : { creadoPor: auth.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, refugio: true, activo: true, createdAt: true, creadoPor: true, creadoPorNombre: true,
        _count: { select: { accesos: true } },
      },
    });

    // Rol del creador de cada link (para aplicar la matriz de visibilidad/revocación).
    const creatorIds = [...new Set(rows.map((r) => r.creadoPor).filter(Boolean) as string[])];
    const creators = creatorIds.length
      ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, role: true } })
      : [];
    const roleById = new Map(creators.map((u) => [u.id, u.role]));

    const reportes = rows
      .filter((r) => canSeeLink(auth, r.creadoPor, roleById.get(r.creadoPor)))
      .map((r) => ({
        id: r.id, refugio: r.refugio, activo: r.activo, createdAt: r.createdAt,
        accesos: r._count.accesos,
        creadoPorNombre: r.creadoPorNombre || "—",
        creadoPorRole: roleById.get(r.creadoPor) || null,
        esMio: r.creadoPor === auth.id,
        puedeRevocar: canRevokeLink(auth, r.creadoPor, roleById.get(r.creadoPor)),
      }));

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
    // Matriz de revocación: propios siempre; Master/Admin solo links de usuarios NO
    // privilegiados (nunca de otros admins ni de un master).
    const creatorRole = existing.creadoPor
      ? (await prisma.user.findUnique({ where: { id: existing.creadoPor }, select: { role: true } }))?.role
      : undefined;
    if (!canRevokeLink(auth, existing.creadoPor, creatorRole ?? undefined)) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    await prisma.reporteCompartido.update({ where: { id }, data: { activo: false } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error al revocar reporte compartido:", error);
    return NextResponse.json({ error: "Error al revocar el link" }, { status: 500 });
  }
}
