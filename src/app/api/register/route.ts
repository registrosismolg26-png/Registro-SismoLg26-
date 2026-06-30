import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Quick validation
    const {
      parroquia,
      sector,
      comunidad,
      direccionExacta,
      nombreApellido,
      cedula,
      jefeFamilia,
      genero,
      fechaNacimiento,
      edad,
      perteneceNucleo,
      cedulaJefeFamilia,
      estadoFisico,
      patologia,
      patologiaDescripcion,
      gpsLat,
      gpsLng,
      telefono
    } = body;

    if (!parroquia || !sector || !comunidad || !direccionExacta || !nombreApellido || !cedula || !jefeFamilia || !genero || !fechaNacimiento || edad === undefined || !perteneceNucleo || !estadoFisico || !patologia) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }

    // Try inserting into Supabase via Prisma
    const newRegistro = await prisma.registro.create({
      data: {
        parroquia,
        sector,
        comunidad,
        direccionExacta,
        nombreApellido,
        cedula: String(cedula).trim(),
        jefeFamilia,
        genero,
        fechaNacimiento: new Date(fechaNacimiento),
        edad: Number(edad),
        perteneceNucleo,
        cedulaJefeFamilia: cedulaJefeFamilia ? String(cedulaJefeFamilia).trim() : null,
        estadoFisico,
        patologia,
        patologiaDescripcion: patologiaDescripcion || null,
        gpsLat: gpsLat ? Number(gpsLat) : null,
        gpsLng: gpsLng ? Number(gpsLng) : null,
        telefono: telefono ? String(telefono).trim() : null,
        syncedAt: new Date()
      }
    });

    return NextResponse.json(
      { success: true, id: newRegistro.id },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error en API /api/register:", error);

    // Catch Prisma Unique Constraint Violation (P2002) for cedula
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Registro ya existe", code: "DUPLICATED" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 }
    );
  }
}
