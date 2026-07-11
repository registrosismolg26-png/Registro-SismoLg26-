import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canDeleteRegistro, canActOnRefugio } from "@/lib/auth";
import { withAuditUser } from "@/lib/audit";

// NOTA: el PATCH de actualización parcial fue RETIRADO a propósito. Toda edición de
// un registro del censo va por la cola offline → POST /api/register (que aplica el
// traslado automático y la regla "≤1 fila activa por cédula"). Ese PATCH quedaba
// huérfano (la UI no lo usaba) y saltaba esos guards, por eso se elimina. Aquí solo
// queda DELETE (usado por Asignaciones para borrar un registro).

// GET por id: para abrir la ficha de una persona que NO está en la lista cargada
// (Master saltando a un aviso de otro campamento, o un aviso viejo sin refugio).
// Scoped por refugio: Master cualquiera; el resto solo el suyo.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    const registro = await prisma.registro.findUnique({ where: { id } });
    if (!registro) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    if (!canActOnRefugio(auth, registro.refugio)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    return NextResponse.json({ success: true, registro });
  } catch (error: any) {
    console.error("Error en GET /api/registros/[id]:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!canDeleteRegistro(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;

    // Cargar el registro y verificar pertenencia al refugio del usuario.
    const registro = await prisma.registro.findUnique({ where: { id } });
    if (!registro) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }
    if (!canActOnRefugio(auth, registro.refugio)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const deleted = await withAuditUser(auth.email, (tx) =>
      tx.registro.delete({ where: { id } })
    );
    return NextResponse.json({ success: true, registro: deleted });
  } catch (error: any) {
    console.error("Error en DELETE /api/registros/[id]:", error);
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
