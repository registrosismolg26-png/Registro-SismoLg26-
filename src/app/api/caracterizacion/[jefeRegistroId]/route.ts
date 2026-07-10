import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, refugioScopeFor } from "@/lib/auth";

// Ficha COMPLETA de una familia (al abrir para editar): hogar + todas sus personas.
// Scoped por refugio (Master respeta el refugio de vista). Next 16 → params async.
export async function GET(req: Request, ctx: { params: Promise<{ jefeRegistroId: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { jefeRegistroId } = await ctx.params;
    const requested = new URL(req.url).searchParams.get("refugio");
    const scope = refugioScopeFor(auth, requested);

    const hogar = await prisma.caracterizacionHogar.findFirst({ where: { jefeRegistroId, ...scope } });
    if (!hogar) return NextResponse.json({ success: true, hogar: null, personas: [] });

    const personas = await prisma.caracterizacionPersona.findMany({
      where: { familiaCedula: hogar.familiaCedula, ...scope },
    });

    return NextResponse.json(
      { success: true, hogar, personas },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("Error en GET /api/caracterizacion/[jefeRegistroId]:", error);
    return NextResponse.json({ error: "Error al cargar la ficha" }, { status: 500 });
  }
}
