import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// ── Registro de acciones de usuario (imprimir / exportar) ────────────────────
// Escribe en la MISMA tabla `AuditLog` que el trigger de cambios de datos, para
// que todo quede en un solo lugar. Aquí la `accion` es 'PRINT' | 'EXPORT' (el
// trigger usa CREATE/UPDATE/DELETE). Requiere el CHECK de AuditLog ampliado:
// ver `prisma/auditlog_acciones.sql` (ejecutar manual en Supabase).
// AuditLog NO está en el schema de Prisma (tabla + trigger son SQL), por eso se
// inserta con $executeRaw. Best-effort desde el cliente: no bloquea la acción.

const ACCIONES = new Set(["PRINT", "EXPORT"]);

export async function POST(request: Request) {
  try {
    const auth = await getAuthUser(request);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const accion = String(body?.accion || "").toUpperCase();
    if (!ACCIONES.has(accion)) {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    }

    const str = (v: unknown, max = 160) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const metadata = {
      recurso: str(body?.recurso) || "—",              // qué se imprimió/exportó
      formato: str(body?.formato, 20),                 // "PDF" | "Excel"
      refugio: str(body?.refugio),                     // campamento activo
      filtros: str(body?.filtros, 600),                // resumen de filtros aplicados
      total: typeof body?.total === "number" ? body.total : null, // filas incluidas
      rol: auth.role,
    };
    const entidad = accion === "PRINT" ? "Impresion" : "Exportacion";

    await prisma.$executeRaw`
      INSERT INTO "AuditLog"(entidad, entidad_id, accion, metadata, user_email)
      VALUES (${entidad}, ${crypto.randomUUID()}, ${accion}, ${JSON.stringify(metadata)}::jsonb, ${auth.email})
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en /api/activity-log:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
