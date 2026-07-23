import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeAggregateStats } from "@/lib/stats";

// ── Reporte público (SIN autenticación) ──────────────────────────────────────
// Devuelve metadatos + estadísticas AGREGADAS (sin PII). La ubicación NO es
// obligatoria para ver el reporte; la auditoría (IP/navegador/ubicación) se hace
// aparte y en 2do plano vía POST /acceso.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const reporte = await prisma.reporteCompartido.findUnique({
      where: { id: token },
      select: { id: true, refugio: true, creadoPorNombre: true, activo: true },
    });

    if (!reporte || !reporte.activo) {
      return NextResponse.json({ error: "Reporte no disponible" }, { status: 404 });
    }

    // Ubicación (Google Maps) del refugio, si está registrada — solo para contexto.
    let ubicacionRefugio: string | null = null;
    // Tipo del campamento: define si el reporte muestra el desglose POR COMUNIDAD
    // (solo ITINERANTE/MIXTO, igual que en el panel de Estadísticas).
    let refugioTipo: string | null = null;
    if (reporte.refugio) {
      const ref = await prisma.refugio.findUnique({
        where: { nombre: reporte.refugio },
        select: { ubicacion: true, tipo: true },
      });
      ubicacionRefugio = ref?.ubicacion ?? null;
      refugioTipo = ref?.tipo ?? null;
    }

    const stats = await computeAggregateStats(reporte.refugio);

    return NextResponse.json({
      success: true,
      refugio: reporte.refugio,
      refugioLabel: reporte.refugio || "Todos los campamentos",
      refugioTipo,
      creadoPorNombre: reporte.creadoPorNombre,
      ubicacionRefugio,
      stats,
    });
  } catch (error: any) {
    console.error("Error al obtener reporte público:", error);
    return NextResponse.json({ error: "Error al obtener el reporte" }, { status: 500 });
  }
}
