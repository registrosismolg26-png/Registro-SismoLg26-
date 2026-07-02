import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, refugioScope } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Master ve todos los refugios; el resto solo el suyo.
    const registros = await prisma.registro.findMany({
      where: refugioScope(auth),
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
