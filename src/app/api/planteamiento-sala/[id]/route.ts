import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canManagePlanteamientoSala } from "@/lib/auth";
import { calcularProgreso } from "../route";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManagePlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const existing = await prisma.planteamientoSala.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    }

    const body = await req.json();
    const updateData: any = {};

    if (body.estatus !== undefined) {
      const estatusValidos = [
        "CREDITO ENTREGADO",
        "EN PROCESO",
        "CARPETA RETORNADA",
        "CON NOVEDAD EN LA SEDE",
      ];
      if (estatusValidos.includes(body.estatus)) {
        updateData.estatus = body.estatus;
      }
    }

    if (body.observacion !== undefined) {
      updateData.observacion = body.observacion ? String(body.observacion).trim() : null;
    }

    // Si se enviaron requisitos, actualizarlos y recalcular progreso
    const reqFields = [
      "planillaCaracterizacion",
      "cedulaCatastral",
      "tituloCasa",
      "referenciaBancariaVendedor",
      "qrHabitatVivienda",
      "cedulaVendedor",
      "cedulaComprador",
      "fotosVivienda",
      "cantidadFotos",
      "vendedorPoseePatria",
    ];

    let touchedReq = false;
    for (const f of reqFields) {
      if (body[f] !== undefined) {
        touchedReq = true;
        updateData[f] = body[f];
      }
    }

    if (touchedReq) {
      const merged = { ...existing, ...updateData };
      updateData.porcentajeProgreso = calcularProgreso(merged);
    }

    const item = await prisma.planteamientoSala.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, item });
  } catch (error: any) {
    console.error("Error en PATCH /api/planteamiento-sala/[id]:", error);
    return NextResponse.json({ error: "Error al actualizar", details: error?.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManagePlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    await prisma.planteamientoSala.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en DELETE /api/planteamiento-sala/[id]:", error);
    return NextResponse.json({ error: "Error al eliminar expediente" }, { status: 500 });
  }
}
