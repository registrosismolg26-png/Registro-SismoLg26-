import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const registros = await prisma.registro.findMany({
      orderBy: { createdAt: "desc" },
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
