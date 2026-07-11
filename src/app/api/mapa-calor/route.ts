import { NextResponse } from "next/server";
import { getAuthUser, isMaster } from "@/lib/auth";
import { computeMapaCalor } from "@/lib/mapaCalor";
import { mapaCalorETag } from "@/lib/etag";

// Mapa de calor del censo — SOLO Master. Densidades por celda (agregado SQL, egress
// mínimo). ETag/304: si nada cambió en los registros con GPS, responde 304 sin cuerpo.
// Sin auto-refresh en el cliente (al abrir + botón) para no machacar Supabase.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isMaster(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const etag = await mapaCalorETag();
    if (etag && req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
    }

    const { celdas, total } = await computeMapaCalor();

    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (etag) headers.ETag = etag;
    return NextResponse.json({ success: true, celdas, total, generadoEn: new Date().toISOString() }, { headers });
  } catch (error: any) {
    console.error("Error en GET /api/mapa-calor:", error);
    return NextResponse.json({ error: "Error al calcular el mapa de calor", details: error?.message }, { status: 500 });
  }
}
