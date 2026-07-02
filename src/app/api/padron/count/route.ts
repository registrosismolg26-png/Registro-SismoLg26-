import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// Total de registros del padrón en el servidor. Ligero (solo COUNT), pensado para
// que el cliente verifique en cada arranque si su copia local está completa y
// reanude la descarga si falta, sin traer todo el stream.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const total = await prisma.padron.count();
    return NextResponse.json({ total });
  } catch (error: any) {
    console.error("Error en GET /api/padron/count:", error);
    return NextResponse.json({ error: "Error al contar el padrón" }, { status: 500 });
  }
}
