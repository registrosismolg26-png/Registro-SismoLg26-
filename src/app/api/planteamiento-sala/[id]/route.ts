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
        if (body.estatus === "CREDITO ENTREGADO") {
          updateData.fechaEntregaSubsidio = body.fechaEntregaSubsidio
            ? String(body.fechaEntregaSubsidio).trim().slice(0, 10)
            : existing.fechaEntregaSubsidio || new Date().toISOString().slice(0, 10);
        } else if (body.fechaEntregaSubsidio !== undefined) {
          updateData.fechaEntregaSubsidio = body.fechaEntregaSubsidio
            ? String(body.fechaEntregaSubsidio).trim().slice(0, 10)
            : null;
        }
      }
    } else if (body.fechaEntregaSubsidio !== undefined) {
      updateData.fechaEntregaSubsidio = body.fechaEntregaSubsidio
        ? String(body.fechaEntregaSubsidio).trim().slice(0, 10)
        : null;
    }

    if (body.fechaEntregaCarpeta !== undefined) {
      updateData.fechaEntregaCarpeta = body.fechaEntregaCarpeta
        ? String(body.fechaEntregaCarpeta).trim().slice(0, 10)
        : null;
    }

    if (body.observacion !== undefined) {
      updateData.observacion = body.observacion ? String(body.observacion).trim() : null;
    }

    if (body.nombreApellido !== undefined) {
      updateData.nombreApellido = String(body.nombreApellido).trim().toUpperCase();
    }
    if (body.telefono !== undefined) {
      updateData.telefono = body.telefono ? String(body.telefono).trim() : null;
    }
    if (body.genero !== undefined) {
      updateData.genero = ["MASCULINO", "FEMENINO"].includes(String(body.genero || "").toUpperCase())
        ? String(body.genero).toUpperCase()
        : null;
    }
    if (body.fechaNacimiento !== undefined) {
      updateData.fechaNacimiento = body.fechaNacimiento ? String(body.fechaNacimiento).trim().slice(0, 10) : null;
    }
    if (body.edad !== undefined) {
      if (body.edad === null || body.edad === "") {
        updateData.edad = null;
      } else {
        const parsedAge = parseInt(String(body.edad), 10);
        updateData.edad = !isNaN(parsedAge) && parsedAge >= 0 && parsedAge <= 130 ? parsedAge : null;
      }
    }

    if (body.cargaFamiliar !== undefined) {
      if (Array.isArray(body.cargaFamiliar)) {
        updateData.cargaFamiliar = body.cargaFamiliar
          .filter((m: any) => m && (m.cedula || m.nombreApellido))
          .map((m: any) => ({
            id: m.id || crypto.randomUUID(),
            cedula: String(m.cedula || "").replace(/\D/g, ""),
            nombreApellido: String(m.nombreApellido || "").trim().toUpperCase(),
            parentesco: String(m.parentesco || "OTRO").trim().toUpperCase(),
            genero: ["MASCULINO", "FEMENINO"].includes(String(m.genero || "").toUpperCase())
              ? String(m.genero).toUpperCase()
              : null,
            fechaNacimiento: m.fechaNacimiento ? String(m.fechaNacimiento).trim().slice(0, 10) : null,
            edad: m.edad !== undefined && m.edad !== null && m.edad !== "" ? parseInt(String(m.edad), 10) : null,
            telefono: m.telefono ? String(m.telefono).trim() : null,
          }));
      } else {
        updateData.cargaFamiliar = [];
      }
      updateData.cargaFamiliar = JSON.parse(JSON.stringify(updateData.cargaFamiliar));
    }

    // Si se enviaron requisitos o modalidad, actualizarlos y recalcular progreso
    const reqFields = [
      "tipoOpcion",
      // Mercado Secundario
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
      "qrColapsoVivienda",
      // Alquiler
      "cartaCompromiso",
      "fotosAlquiler",
      "cantidadFotosAlquiler",
      "referenciaBancariaAlquiler",
      "cedulaArrendador",
      "cedulaArrendatario",
      "rifArrendador",
      "rifArrendatario",
      // Plan Venezuela Renace
      "rifViviendaDanos",
      "fotosViviendaRenace",
      "cantidadFotosRenace",
      "sacosCemento",
      "metrosArena",
      "bloques",
      "cabillas",
      "pego",
    ];

    let touchedReq = false;
    for (const f of reqFields) {
      if (body[f] !== undefined) {
        touchedReq = true;
        if (["cantidadFotos", "cantidadFotosAlquiler", "cantidadFotosRenace", "sacosCemento", "bloques", "cabillas", "pego"].includes(f)) {
          updateData[f] = Math.max(0, parseInt(body[f] || "0", 10) || 0);
        } else if (f === "metrosArena") {
          updateData[f] = Math.max(0, parseFloat(body[f] || "0") || 0);
        } else {
          updateData[f] = body[f];
        }
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
