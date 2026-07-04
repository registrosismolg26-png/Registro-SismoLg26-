import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Metadatos del reporte público (SIN autenticación, SIN estadísticas) ──────
// Devuelve solo lo necesario para pintar la pantalla previa: si el link está
// activo, de qué refugio es y quién lo compartió. Las estadísticas NO se
// entregan aquí: solo tras conceder la ubicación (ver /acceso).
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
    if (reporte.refugio) {
      const ref = await prisma.refugio.findUnique({
        where: { nombre: reporte.refugio },
        select: { ubicacion: true },
      });
      ubicacionRefugio = ref?.ubicacion ?? null;
    }

    return NextResponse.json({
      success: true,
      refugio: reporte.refugio,
      refugioLabel: reporte.refugio || "Todos los campamentos",
      creadoPorNombre: reporte.creadoPorNombre,
      ubicacionRefugio,
    });
  } catch (error: any) {
    console.error("Error al obtener reporte público:", error);
    return NextResponse.json({ error: "Error al obtener el reporte" }, { status: 500 });
  }
}
