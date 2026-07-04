import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canEditCatalogosMedicos, canManageCatalogosMedicos } from "@/lib/auth";

// GET: catálogo de medicamentos predefinidos (objetos con id).
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const list = await prisma.medicamentoPredefinido.findMany({
      orderBy: [{ nombre: "asc" }, { concentracion: "asc" }, { presentacion: "asc" }],
      select: {
        id: true,
        nombre: true,
        concentracion: true,
        presentacion: true,
        dosis: true,
        periodo: true,
        nota: true,
      }
    });

    return NextResponse.json({ success: true, medicamentos: list });
  } catch (error: any) {
    console.error("Error en GET /api/medicamentos:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// POST: crear un medicamento del catálogo (crear/editar → AdminMedico/OperadorMedico/Master).
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canEditCatalogosMedicos(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const norm = (v: any) => String(v ?? "").replace(/\s+/g, " ").trim();
    const nombre = norm(body?.nombre);
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

    const medicamento = await prisma.medicamentoPredefinido.create({
      data: {
        nombre,
        concentracion: norm(body?.concentracion),
        presentacion: norm(body?.presentacion),
        dosis: norm(body?.dosis),
        periodo: norm(body?.periodo),
        nota: body?.nota ? norm(body.nota) : null,
      },
    });
    return NextResponse.json({ success: true, medicamento }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "Ese medicamento (nombre + concentración + presentación) ya existe" }, { status: 409 });
    }
    console.error("Error en POST /api/medicamentos:", error);
    return NextResponse.json({ error: "Error al crear medicamento" }, { status: 500 });
  }
}

// PUT: editar un medicamento conservando su id (crear/editar → canEdit). Preserva el
// vínculo por ID en consultas/registros. Único por (nombre, concentración, presentación).
export async function PUT(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canEditCatalogosMedicos(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const norm = (v: any) => String(v ?? "").replace(/\s+/g, " ").trim();
    const id = norm(body?.id);
    const nombre = norm(body?.nombre);
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

    const medicamento = await prisma.medicamentoPredefinido.update({
      where: { id },
      data: {
        nombre,
        concentracion: norm(body?.concentracion),
        presentacion: norm(body?.presentacion),
        dosis: norm(body?.dosis),
        periodo: norm(body?.periodo),
        nota: body?.nota ? norm(body.nota) : null,
      },
    });
    return NextResponse.json({ success: true, medicamento });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "Ese medicamento (nombre + concentración + presentación) ya existe" }, { status: 409 });
    }
    if (error?.code === "P2025") return NextResponse.json({ error: "Medicamento no encontrado" }, { status: 404 });
    console.error("Error en PUT /api/medicamentos:", error);
    return NextResponse.json({ error: "Error al actualizar medicamento" }, { status: 500 });
  }
}

// DELETE: borrar un medicamento por id (?id=). Solo AdminMedico/Master.
export async function DELETE(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManageCatalogosMedicos(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

    await prisma.medicamentoPredefinido.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Medicamento no encontrado" }, { status: 404 });
    }
    console.error("Error en DELETE /api/medicamentos:", error);
    return NextResponse.json({ error: "Error al borrar medicamento" }, { status: 500 });
  }
}
