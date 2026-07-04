import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canEditCatalogosMedicos, canManageCatalogosMedicos } from "@/lib/auth";

// GET: catálogo de patologías como objetos { id, nombre } (modelo por-ID).
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const patologias = await prisma.patologia.findMany({
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    });

    return NextResponse.json({ success: true, patologias });
  } catch (error: any) {
    console.error("Error en GET /api/patologias:", error);
    return NextResponse.json({ error: "Error al listar patologías" }, { status: 500 });
  }
}

// POST: crear una patología del catálogo (crear/editar → AdminMedico/OperadorMedico/Master).
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canEditCatalogosMedicos(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const nombre = String(body?.nombre ?? "").replace(/\s+/g, " ").trim();
    if (!nombre) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }
    // Los nombres no llevan coma: el diagnóstico se muestra separado por comas.
    if (nombre.includes(",")) {
      return NextResponse.json({ error: "El nombre no puede contener comas" }, { status: 400 });
    }

    const patologia = await prisma.patologia.create({ data: { nombre } });
    return NextResponse.json({ success: true, patologia }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "Esa patología ya existe" }, { status: 409 });
    }
    console.error("Error en POST /api/patologias:", error);
    return NextResponse.json({ error: "Error al crear patología" }, { status: 500 });
  }
}

// PUT: renombrar una patología conservando su id (crear/editar → canEdit). Así las
// consultas/registros que la referencian por ID siguen válidos tras el cambio de nombre.
export async function PUT(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canEditCatalogosMedicos(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    const nombre = String(body?.nombre ?? "").replace(/\s+/g, " ").trim();
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    if (nombre.includes(",")) {
      return NextResponse.json({ error: "El nombre no puede contener comas" }, { status: 400 });
    }

    const patologia = await prisma.patologia.update({ where: { id }, data: { nombre } });
    return NextResponse.json({ success: true, patologia });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Esa patología ya existe" }, { status: 409 });
    if (error?.code === "P2025") return NextResponse.json({ error: "Patología no encontrada" }, { status: 404 });
    console.error("Error en PUT /api/patologias:", error);
    return NextResponse.json({ error: "Error al actualizar patología" }, { status: 500 });
  }
}

// DELETE: borrar una patología del catálogo por id (?id=). Solo AdminMedico/Master.
export async function DELETE(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManageCatalogosMedicos(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

    await prisma.patologia.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Patología no encontrada" }, { status: 404 });
    }
    console.error("Error en DELETE /api/patologias:", error);
    return NextResponse.json({ error: "Error al borrar patología" }, { status: 500 });
  }
}
