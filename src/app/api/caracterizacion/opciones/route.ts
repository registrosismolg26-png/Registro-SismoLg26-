import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canManageCaracterizacion } from "@/lib/auth";

// Catálogo GENERAL de opciones cerradas de la caracterización. Una sola tabla
// para todas las listas: `modulo` agrupa, `campo` identifica la lista, `valor`
// es la opción. Se referencia por ID desde la ficha. Sin auto-seed (carga por SQL
// manual: prisma/seed_caracterizacion_opciones.sql).

// GET: todas las opciones (globales, mismas para todos) → cache 120s en navegador.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const opciones = await prisma.caracterizacionOpcion.findMany({
      orderBy: [{ modulo: "asc" }, { campo: "asc" }, { orden: "asc" }, { valor: "asc" }],
      select: { id: true, modulo: true, campo: true, valor: true, orden: true, activo: true },
    });

    return NextResponse.json(
      { success: true, opciones },
      { headers: { "Cache-Control": "private, max-age=120" } }
    );
  } catch (error: any) {
    console.error("Error en GET /api/caracterizacion/opciones:", error);
    return NextResponse.json({ error: "Error al listar opciones" }, { status: 500 });
  }
}

// POST: crear una opción { modulo, campo, valor, orden? } (Master/Admin).
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManageCaracterizacion(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const body = await req.json();
    const modulo = String(body?.modulo ?? "").trim().toUpperCase();
    const campo = String(body?.campo ?? "").trim();
    const valor = String(body?.valor ?? "").replace(/\s+/g, " ").trim().toUpperCase();
    const orden = Number.isFinite(Number(body?.orden)) ? parseInt(String(body.orden), 10) : 0;
    if (!modulo || !campo || !valor) {
      return NextResponse.json({ error: "Módulo, campo y valor son obligatorios" }, { status: 400 });
    }

    const opcion = await prisma.caracterizacionOpcion.create({ data: { modulo, campo, valor, orden } });
    return NextResponse.json({ success: true, opcion }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Esa opción ya existe" }, { status: 409 });
    console.error("Error en POST /api/caracterizacion/opciones:", error);
    return NextResponse.json({ error: "Error al crear la opción" }, { status: 500 });
  }
}

// PUT: editar una opción (renombrar valor / reordenar / activar-desactivar) conservando el ID.
export async function PUT(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManageCaracterizacion(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

    const data: { valor?: string; orden?: number; activo?: boolean } = {};
    if (body?.valor !== undefined) {
      const valor = String(body.valor).replace(/\s+/g, " ").trim().toUpperCase();
      if (!valor) return NextResponse.json({ error: "El valor no puede quedar vacío" }, { status: 400 });
      data.valor = valor;
    }
    if (body?.orden !== undefined && Number.isFinite(Number(body.orden))) data.orden = parseInt(String(body.orden), 10);
    if (body?.activo !== undefined) data.activo = Boolean(body.activo);

    const opcion = await prisma.caracterizacionOpcion.update({ where: { id }, data });
    return NextResponse.json({ success: true, opcion });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Esa opción ya existe" }, { status: 409 });
    if (error?.code === "P2025") return NextResponse.json({ error: "Opción no encontrada" }, { status: 404 });
    console.error("Error en PUT /api/caracterizacion/opciones:", error);
    return NextResponse.json({ error: "Error al actualizar la opción" }, { status: 500 });
  }
}

// DELETE: borrar una opción por ?id= (Master/Admin).
export async function DELETE(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManageCaracterizacion(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

    await prisma.caracterizacionOpcion.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Opción no encontrada" }, { status: 404 });
    console.error("Error en DELETE /api/caracterizacion/opciones:", error);
    return NextResponse.json({ error: "Error al borrar la opción" }, { status: 500 });
  }
}
