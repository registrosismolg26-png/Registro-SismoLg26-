import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeAggregateStats } from "@/lib/stats";

// ── Apertura del reporte público: auditoría + entrega condicionada ───────────
// Cada apertura se AUDITA (navegador, IP, ubicación si la hay). La ubicación es
// OBLIGATORIA: sin coordenadas válidas NO se entregan estadísticas (403), pero
// el intento igual queda registrado. Con ubicación → se registra y se devuelven
// las estadísticas AGREGADAS (sin PII) del refugio del link.

const clientIp = (req: Request): string | null => {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || null;
};

const asNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const reporte = await prisma.reporteCompartido.findUnique({
      where: { id: token },
      select: { id: true, refugio: true, activo: true },
    });
    if (!reporte || !reporte.activo) {
      return NextResponse.json({ error: "Reporte no disponible" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const lat = asNum(body.lat);
    const lng = asNum(body.lng);
    const precision = asNum(body.precision);
    const ubicacionConcedida = lat !== null && lng !== null;

    const ua = req.headers.get("user-agent");
    const ip = clientIp(req);

    // Auditoría SIEMPRE (con o sin ubicación).
    await prisma.reporteAcceso.create({
      data: {
        reporteId: reporte.id,
        ip,
        userAgent: ua,
        lat: ubicacionConcedida ? lat : null,
        lng: ubicacionConcedida ? lng : null,
        precision: ubicacionConcedida ? precision : null,
        ubicacionConcedida,
      },
    });

    // Sin ubicación → NO se entregan estadísticas (pero el intento quedó auditado).
    if (!ubicacionConcedida) {
      return NextResponse.json({ granted: false, error: "Ubicación requerida" }, { status: 403 });
    }

    const stats = await computeAggregateStats(reporte.refugio);
    return NextResponse.json({
      granted: true,
      refugio: reporte.refugio,
      refugioLabel: reporte.refugio || "Todos los campamentos",
      stats,
    });
  } catch (error: any) {
    console.error("Error en acceso a reporte público:", error);
    return NextResponse.json({ error: "Error al abrir el reporte" }, { status: 500 });
  }
}
