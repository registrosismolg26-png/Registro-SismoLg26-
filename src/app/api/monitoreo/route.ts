import { NextResponse } from "next/server";
import { getAuthUser, isMaster } from "@/lib/auth";
import { computeMonitoreo } from "@/lib/monitoreo";
import { monitoreoETag } from "@/lib/etag";

// Monitoreo de campamentos — SOLO Master. Números generales por refugio, todo
// calculado con agregados SQL (egress mínimo). ETag/304: si nada cambió en el
// censo/consultas/salones, responde 304 sin cuerpo. Sin auto-refresh en el
// cliente (al abrir + botón manual) para no machacar Supabase.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isMaster(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const etag = await monitoreoETag();
    if (etag && req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
    }

    const { campamentos, totales } = await computeMonitoreo();

    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (etag) headers.ETag = etag;
    return NextResponse.json({ success: true, campamentos, totales, generadoEn: new Date().toISOString() }, { headers });
  } catch (error: any) {
    console.error("Error en GET /api/monitoreo:", error);
    return NextResponse.json({ error: "Error al calcular el monitoreo", details: error?.message }, { status: 500 });
  }
}
