import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let patologias = await prisma.patologia.findMany({
      orderBy: { nombre: "asc" },
    });

    // Auto-seed si está vacío
    if (patologias.length === 0) {
      const defaultNombres = ["Hipertensión", "Diabetes", "Asma", "Cardiopatía", "Epilepsia", "Otros"];
      await prisma.patologia.createMany({
        data: defaultNombres.map(nombre => ({ nombre })),
        skipDuplicates: true
      });

      patologias = await prisma.patologia.findMany({
        orderBy: { nombre: "asc" },
      });
    }

    return NextResponse.json({ success: true, patologias: patologias.map(p => p.nombre) });
  } catch (error: any) {
    console.error("Error en GET /api/patologias:", error);
    return NextResponse.json({ error: "Error al listar patologías" }, { status: 500 });
  }
}
