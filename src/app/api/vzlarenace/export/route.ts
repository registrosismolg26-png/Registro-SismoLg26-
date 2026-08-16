import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canExportRenace } from "@/lib/auth";
import { renaceReadScope } from "@/lib/renaceScope";

// GET — planteamientos COMPLETOS del alcance (scoped por refugio) para la descarga a
// Excel del Directorio. SOLO MASTER/ADMIN (`canExportRenace`; NO Registrador/RENACE/
// Master Renace). Los jefes/miembros los reutiliza el cliente de `/list` (ya cargados
// y cacheados); aquí solo se traen los planteamientos, que no viven en el cliente.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canExportRenace(auth)) return NextResponse.json({ error: "Sin permiso para descargar." }, { status: 403 });

    const requested = new URL(req.url).searchParams.get("refugio");
    const { where } = await renaceReadScope(auth, requested);
    const planteamientos = await prisma.renacePlanteamiento.findMany({ where, orderBy: { jefeNro: "asc" } });
    return NextResponse.json({ planteamientos }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("Error en GET /api/vzlarenace/export:", error);
    return NextResponse.json({ error: "Error al preparar la descarga" }, { status: 500 });
  }
}
