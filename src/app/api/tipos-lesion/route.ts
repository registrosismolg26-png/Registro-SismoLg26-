import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canEditCatalogosMedicos, canManageCatalogosMedicos } from "@/lib/auth";

// Catálogo de TIPOS DE LESIÓN/HERIDA (administrable). Análogo a /api/patologias.

// GET: lista { id, nombre }.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const tiposLesion = await prisma.tipoLesion.findMany({
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    });
    return NextResponse.json({ success: true, tiposLesion });
  } catch (error: any) {
    console.error("Error en GET /api/tipos-lesion:", error);
    return NextResponse.json({ error: "Error al listar tipos de lesión" }, { status: 500 });
  }
}

// POST: crear (crear/editar → AdminMedico/OperadorMedico/Master).
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canEditCatalogosMedicos(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const body = await req.json();
    const nombre = String(body?.nombre ?? "").replace(/\s+/g, " ").trim();
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

    const tipoLesion = await prisma.tipoLesion.create({ data: { nombre } });
    return NextResponse.json({ success: true, tipoLesion }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Ese tipo de lesión ya existe" }, { status: 409 });
    console.error("Error en POST /api/tipos-lesion:", error);
    return NextResponse.json({ error: "Error al crear el tipo de lesión" }, { status: 500 });
  }
}

// PUT: renombrar conservando el id (así las consultas que lo referencian siguen válidas).
export async function PUT(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canEditCatalogosMedicos(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    const nombre = String(body?.nombre ?? "").replace(/\s+/g, " ").trim();
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

    const tipoLesion = await prisma.tipoLesion.update({ where: { id }, data: { nombre } });
    return NextResponse.json({ success: true, tipoLesion });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Ese tipo de lesión ya existe" }, { status: 409 });
    if (error?.code === "P2025") return NextResponse.json({ error: "Tipo de lesión no encontrado" }, { status: 404 });
    console.error("Error en PUT /api/tipos-lesion:", error);
    return NextResponse.json({ error: "Error al actualizar el tipo de lesión" }, { status: 500 });
  }
}

// DELETE ?id= (borrar → AdminMedico/Master).
export async function DELETE(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManageCatalogosMedicos(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

    await prisma.tipoLesion.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Tipo de lesión no encontrado" }, { status: 404 });
    console.error("Error en DELETE /api/tipos-lesion:", error);
    return NextResponse.json({ error: "Error al borrar el tipo de lesión" }, { status: 500 });
  }
}
