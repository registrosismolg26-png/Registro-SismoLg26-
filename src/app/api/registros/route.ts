import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const registros = await prisma.registro.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nombreApellido: true,
        cedula: true,
        parroquia: true,
        sector: true,
        comunidad: true,
        direccionExacta: true,
        genero: true,
        edad: true,
        fechaNacimiento: true,
        jefeFamilia: true,
        perteneceNucleo: true,
        cedulaJefeFamilia: true,
        estadoFisico: true,
        patologia: true,
        patologiaDescripcion: true,
        telefono: true,
        cuarto: true,
        retirado: true,
        retiradoRazon: true,
        retiradoFecha: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ registros });
  } catch (error: any) {
    console.error("Error en GET /api/registros:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
