import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const cleanQ = q.trim();

    if (cleanQ.length < 3) {
      return NextResponse.json({ success: true, registros: [] });
    }

    const registros = await prisma.registro.findMany({
      where: {
        OR: [
          { nombreApellido: { contains: cleanQ, mode: "insensitive" } },
          { cedula: { contains: cleanQ, mode: "insensitive" } },
          { telefono: { contains: cleanQ, mode: "insensitive" } },
          { sector: { contains: cleanQ, mode: "insensitive" } },
          { comunidad: { contains: cleanQ, mode: "insensitive" } },
          { direccionExacta: { contains: cleanQ, mode: "insensitive" } }
        ]
      },
      select: {
        id: true,
        nombreApellido: true,
        cedula: true,
        parroquia: true,
        sector: true,
        comunidad: true,
        direccionExacta: true,
        genero: true,
        fechaNacimiento: true,
        edad: true,
        estadoFisico: true,
        cuarto: true,
        retirado: true,
        retiradoRazon: true,
        telefono: true
      },
      take: 20
    });

    return NextResponse.json({ success: true, registros });
  } catch (error) {
    console.error("Error in public-search API:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
