import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, refugioScopeFor } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Master respeta el "refugio de vista" (?refugio); si no lo manda, ve todos.
    // El resto: siempre su refugio (el parámetro se ignora).
    const requested = new URL(req.url).searchParams.get("refugio");
    const registros = await prisma.registro.findMany({
      where: refugioScopeFor(auth, requested),
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ registros });
  } catch (error: any) {
    console.error("Error en GET /api/registros:", error);
    return NextResponse.json(
      { error: "Error interno del servidor", code: error?.code, details: error?.message },
      { status: 500 }
    );
  }
}
