import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_GENERO = ["MASCULINO", "FEMENINO"];
const VALID_ESTADO_FISICO = ["ILESO", "LESIONADO"];
const VALID_SI_NO = ["SI", "NO"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const {
      cuarto,
      nombreApellido,
      parroquia,
      sector,
      comunidad,
      direccionExacta,
      genero,
      estadoFisico,
      patologia,
      patologiaDescripcion,
      telefono,
    } = body;

    // Build update payload — only include fields present in the request body
    const data: Record<string, any> = {};

    if ("cuarto" in body) {
      data.cuarto = cuarto ? String(cuarto).trim() : null;
    }
    if ("nombreApellido" in body) {
      if (!nombreApellido?.trim()) {
        return NextResponse.json({ error: "Nombre no puede estar vacío" }, { status: 400 });
      }
      data.nombreApellido = String(nombreApellido).trim();
    }
    if ("parroquia" in body) data.parroquia = String(parroquia).trim();
    if ("sector" in body) data.sector = String(sector).trim();
    if ("comunidad" in body) data.comunidad = String(comunidad).trim();
    if ("direccionExacta" in body) data.direccionExacta = String(direccionExacta).trim();

    if ("genero" in body) {
      if (!VALID_GENERO.includes(genero)) {
        return NextResponse.json({ error: "Género inválido" }, { status: 400 });
      }
      data.genero = genero;
    }
    if ("estadoFisico" in body) {
      if (!VALID_ESTADO_FISICO.includes(estadoFisico)) {
        return NextResponse.json({ error: "Estado físico inválido" }, { status: 400 });
      }
      data.estadoFisico = estadoFisico;
    }
    if ("patologia" in body) {
      if (!VALID_SI_NO.includes(patologia)) {
        return NextResponse.json({ error: "Valor de patología inválido" }, { status: 400 });
      }
      data.patologia = patologia;
    }
    if ("patologiaDescripcion" in body) {
      data.patologiaDescripcion = patologiaDescripcion ? String(patologiaDescripcion).trim() : null;
    }
    if ("telefono" in body) {
      data.telefono = telefono ? String(telefono).trim() : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    const updated = await prisma.registro.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, registro: updated });
  } catch (error: any) {
    console.error("Error en PATCH /api/registros/[id]:", error);
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
