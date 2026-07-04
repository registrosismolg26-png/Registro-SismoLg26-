import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Auditoría de apertura del reporte público (SIN autenticación) ────────────
// Registra CADA apertura: IP (del servidor), navegador y ubicación SI la
// conceden. La ubicación NO es obligatoria para ver el reporte (eso lo entrega el
// GET); esto es solo el registro, que el cliente envía en 2do plano cuando la
// geolocalización responde (o falla/expira → se guarda sin ubicación).

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
      select: { id: true, activo: true },
    });
    if (!reporte || !reporte.activo) {
      return NextResponse.json({ error: "Reporte no disponible" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const lat = asNum(body.lat);
    const lng = asNum(body.lng);
    const precision = asNum(body.precision);
    const ubicacionConcedida = lat !== null && lng !== null;

    await prisma.reporteAcceso.create({
      data: {
        reporteId: reporte.id,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
        lat: ubicacionConcedida ? lat : null,
        lng: ubicacionConcedida ? lng : null,
        precision: ubicacionConcedida ? precision : null,
        ubicacionConcedida,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error al auditar acceso a reporte público:", error);
    // La auditoría es best-effort: no rompe la vista del reporte.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
