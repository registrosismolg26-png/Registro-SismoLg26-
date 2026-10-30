import { NextResponse } from "next/server";
import { getAuthUser, canRegister } from "@/lib/auth";
import { resolveQrContent } from "@/lib/viviendaQr";

export const dynamic = "force-dynamic";

// Lee el CONTENIDO de un QR de vivienda (habitable / colapso) para el Paso 5 del censo.
// Solo consulta dominios permitidos (ver viviendaQr.ts). Que no se pueda leer NO es un
// error: devuelve `data: null` + `reason` y el censo guarda la URL sola.
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canRegister(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const kind = body?.kind === "colapso" ? "colapso" : body?.kind === "habitable" ? "habitable" : null;
    const qr = typeof body?.qr === "string" ? body.qr.trim() : "";
    if (!kind || !qr) {
      return NextResponse.json({ error: "Faltan el tipo de QR o su contenido." }, { status: 400 });
    }

    const r = await resolveQrContent(kind, qr);
    return NextResponse.json(r.ok ? { success: true, data: r.data } : { success: true, data: null, reason: r.reason });
  } catch (error: any) {
    console.error("Error en /api/vivienda-qr/lookup:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
