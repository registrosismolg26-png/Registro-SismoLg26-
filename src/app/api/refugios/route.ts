import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isMaster } from "@/lib/auth";

// GET — cualquier usuario autenticado. Lista de refugios para selectores.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const refugios = await prisma.refugio.findMany({
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ success: true, refugios });
  } catch (error: any) {
    console.error("Error en GET /api/refugios:", error);
    return NextResponse.json({ error: "Error al listar refugios" }, { status: 500 });
  }
}

// POST — solo Master. Crea un refugio { nombre }.
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !isMaster(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const nombre = body?.nombre ? String(body.nombre).trim() : "";
    if (!nombre) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }

    const existing = await prisma.refugio.findUnique({ where: { nombre } });
    if (existing) {
      return NextResponse.json({ error: "El refugio ya existe" }, { status: 409 });
    }

    const refugio = await prisma.refugio.create({ data: { nombre } });
    return NextResponse.json({ success: true, refugio }, { status: 201 });
  } catch (error: any) {
    console.error("Error en POST /api/refugios:", error);
    if (error.code === "P2002") {
      return NextResponse.json({ error: "El refugio ya existe" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error al crear el refugio" }, { status: 500 });
  }
}

// PUT — solo Master. Renombra en cascada { id, nombre }.
export async function PUT(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !isMaster(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const id = body?.id ? String(body.id) : "";
    const nombre = body?.nombre ? String(body.nombre).trim() : "";
    if (!id || !nombre) {
      return NextResponse.json({ error: "id y nombre son obligatorios" }, { status: 400 });
    }

    const current = await prisma.refugio.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Refugio no encontrado" }, { status: 404 });
    }

    const oldName = current.nombre;
    if (oldName === nombre) {
      return NextResponse.json({ success: true, refugio: current });
    }

    // El nombre nuevo no debe colisionar con otro refugio existente.
    const clash = await prisma.refugio.findUnique({ where: { nombre } });
    if (clash && clash.id !== id) {
      return NextResponse.json({ error: "Ya existe un refugio con ese nombre" }, { status: 409 });
    }

    // Cascada atómica: renombrar el refugio y propagar a todas las tablas
    // que referencian el nombre viejo (no hay FK, la relación es por texto).
    const [refugio] = await prisma.$transaction([
      prisma.refugio.update({ where: { id }, data: { nombre } }),
      prisma.user.updateMany({
        where: { campamentoTransitorio: oldName },
        data: { campamentoTransitorio: nombre },
      }),
      prisma.registro.updateMany({
        where: { refugio: oldName },
        data: { refugio: nombre },
      }),
      prisma.customRoom.updateMany({
        where: { refugio: oldName },
        data: { refugio: nombre },
      }),
    ]);

    return NextResponse.json({ success: true, refugio });
  } catch (error: any) {
    console.error("Error en PUT /api/refugios:", error);
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Ya existe un refugio con ese nombre" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error al renombrar el refugio" }, { status: 500 });
  }
}

// DELETE — solo Master. Recibe ?id=. Solo borra si el refugio está vacío.
export async function DELETE(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !isMaster(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta el id del refugio" }, { status: 400 });
    }

    const current = await prisma.refugio.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Refugio no encontrado" }, { status: 404 });
    }

    const nombre = current.nombre;

    // No borrar si hay usuarios o registros asociados a este refugio.
    const [userCount, registroCount] = await Promise.all([
      prisma.user.count({ where: { campamentoTransitorio: nombre } }),
      prisma.registro.count({ where: { refugio: nombre } }),
    ]);

    if (userCount > 0 || registroCount > 0) {
      return NextResponse.json(
        {
          error: `No se puede eliminar: el refugio tiene ${userCount} usuario(s) y ${registroCount} registro(s) asociados.`,
        },
        { status: 409 }
      );
    }

    await prisma.refugio.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en DELETE /api/refugios:", error);
    return NextResponse.json({ error: "Error al eliminar el refugio" }, { status: 500 });
  }
}
