import { NextResponse } from "next/server";
import { getAuthUser, canManagePlanteamientoSala } from "@/lib/auth";
import { getOrComputePlanteamientoSalaStats } from "@/lib/planteamientoStatsCache";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManagePlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const clientEtag = req.headers.get("if-none-match");
    const { stats, etag, notModified } = await getOrComputePlanteamientoSalaStats(clientEtag);

    const headers: Record<string, string> = {
      ETag: etag,
      "Cache-Control": "private, no-cache",
    };

    if (notModified) {
      return new NextResponse(null, { status: 304, headers });
    }

    return NextResponse.json(
      {
        success: true,
        stats,
      },
      { headers }
    );
  } catch (error: any) {
    console.error("Error en GET /api/planteamiento-sala/stats:", error);
    return NextResponse.json(
      { error: "Error al calcular estadísticas", details: error?.message },
      { status: 500 }
    );
  }
}
