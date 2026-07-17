import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isMaster } from "@/lib/auth";

// Catálogo de TIPOS DE CARPA (refugios ITINERANTE/MIXTO). Gestión = Master. Análogo a
// patologias/tipos-lesion pero global de campamentos (guarda isMaster).

// GET — cualquier usuario autenticado (el censo lo necesita).
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const tiposCarpa = await prisma.tipoCarpa.findMany({
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    });
    return NextResponse.json({ success: true, tiposCarpa }, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch (error: any) {
    console.error("Error en GET /api/tipos-carpa:", error);
    return NextResponse.json({ error: "Error al listar tipos de carpa" }, { status: 500 });
  }
}

// POST — solo Master. Crea { nombre }.
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !isMaster(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const body = await req.json();
    const nombre = String(body?.nombre ?? "").replace(/\s+/g, " ").trim();
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

    const tipoCarpa = await prisma.tipoCarpa.create({ data: { nombre } });
    return NextResponse.json({ success: true, tipoCarpa }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Ese tipo de carpa ya existe" }, { status: 409 });
    console.error("Error en POST /api/tipos-carpa:", error);
    return NextResponse.json({ error: "Error al crear tipo de carpa" }, { status: 500 });
  }
}

// PUT — solo Master. Renombra { id, nombre } conservando el id.
export async function PUT(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !isMaster(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    const nombre = String(body?.nombre ?? "").replace(/\s+/g, " ").trim();
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

    const tipoCarpa = await prisma.tipoCarpa.update({ where: { id }, data: { nombre } });
    return NextResponse.json({ success: true, tipoCarpa });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Ese tipo de carpa ya existe" }, { status: 409 });
    if (error?.code === "P2025") return NextResponse.json({ error: "Tipo de carpa no encontrado" }, { status: 404 });
    console.error("Error en PUT /api/tipos-carpa:", error);
    return NextResponse.json({ error: "Error al actualizar tipo de carpa" }, { status: 500 });
  }
}

// DELETE — solo Master. ?id=.
export async function DELETE(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !isMaster(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

    await prisma.tipoCarpa.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Tipo de carpa no encontrado" }, { status: 404 });
    console.error("Error en DELETE /api/tipos-carpa:", error);
    return NextResponse.json({ error: "Error al borrar tipo de carpa" }, { status: 500 });
  }
}
