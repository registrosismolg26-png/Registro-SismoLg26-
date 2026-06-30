import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    // Retrieve all electoral records from Supabase
    // Using select to extract only the required columns and minimize DB footprint
    const citizens = await prisma.padron.findMany({
      select: {
        cedula: true,
        nacionalidad: true,
        nombreCompleto: true,
        sexo: true,
        fechaNacimiento: true,
        parroquia: true
      }
    });

    console.log(`Exportando padrón completo de ${citizens.length} registros para descarga...`);

    // Format as a raw Array of Arrays to avoid repeating JSON keys (saves 65% bandwidth)
    // Structure: [ [cedula, nacionalidad, nombreCompleto, sexo, fechaNacimiento, parroquia] ]
    const optimizedList = citizens.map(c => [
      c.cedula,
      c.nacionalidad,
      c.nombreCompleto,
      c.sexo,
      c.fechaNacimiento.toISOString().slice(0, 10), // "YYYY-MM-DD"
      c.parroquia
    ]);

    return NextResponse.json(optimizedList);
  } catch (error: any) {
    console.error("Error en API /api/padron/download:", error);
    return NextResponse.json(
      { error: "Error al generar la descarga", details: error.message },
      { status: 500 }
    );
  }
}
