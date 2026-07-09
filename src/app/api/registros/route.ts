import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, refugioScopeFor } from "@/lib/auth";
import { registrosETag } from "@/lib/etag";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Master respeta el "refugio de vista" (?refugio); si no lo manda, ve todos.
    // El resto: siempre su refugio (el parámetro se ignora).
    const requested = new URL(req.url).searchParams.get("refugio");
    const scope = refugioScopeFor(auth, requested);

    // Sello barato (count + max(syncedAt)): si el cliente reenvía el mismo y nada
    // cambió, respondemos 304 sin re-descargar todo el censo (ahorro de egress).
    const etag = await registrosETag(scope);
    if (etag && req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
    }

    const registros = await prisma.registro.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
    });

    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (etag) headers.ETag = etag;
    return NextResponse.json({ registros }, { headers });
  } catch (error: any) {
    console.error("Error en GET /api/registros:", error);
    return NextResponse.json(
      { error: "Error interno del servidor", code: error?.code, details: error?.message },
      { status: 500 }
    );
  }
}
