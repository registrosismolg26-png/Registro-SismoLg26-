import { NextResponse } from "next/server";
import { getAuthUser, isMaster } from "@/lib/auth";
import { computeAggregateStats } from "@/lib/stats";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Scoping por refugio. Master respeta el "refugio de vista" (?refugio); si no
    // lo manda, ve todos. El resto: siempre su refugio (ignora el parámetro).
    const requested = new URL(req.url).searchParams.get("refugio");
    const scopeRefugio = isMaster(auth) ? (requested || null) : auth.refugio;

    const stats = await computeAggregateStats(scopeRefugio);

    return NextResponse.json(
      { success: true, stats },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch (error: any) {
    console.error("Error en stats API:", error);
    return NextResponse.json(
      { error: "Error al obtener estadísticas del servidor" },
      { status: 500 }
    );
  }
}
