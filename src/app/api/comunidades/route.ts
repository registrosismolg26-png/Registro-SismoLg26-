import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isMaster } from "@/lib/auth";
import { PARROQUIAS } from "@/lib/constants";

// Catálogo de COMUNIDADES (refugios ITINERANTE/MIXTO). Cada comunidad pertenece a una
// parroquia; el censo filtra las comunidades por la parroquia elegida. Gestión = Master.
// La parroquia se normaliza a MAYÚSCULAS y debe existir en PARROQUIAS (así el filtro del
// censo —que compara con formData.parroquia— cuadra exacto).
const normParroquia = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase();

// GET — cualquier usuario autenticado (el censo lo necesita).
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const comunidades = await prisma.comunidad.findMany({
      orderBy: [{ parroquia: "asc" }, { nombre: "asc" }],
      select: { id: true, nombre: true, parroquia: true, refugioId: true },
    });
    // Catálogo global → cache en el navegador 120s (ver patologias/route.ts). Config
    // refetchea con cache:"reload" tras crear/editar/borrar.
    return NextResponse.json({ success: true, comunidades }, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch (error: any) {
    console.error("Error en GET /api/comunidades:", error);
    return NextResponse.json({ error: "Error al listar comunidades" }, { status: 500 });
  }
}

// POST — solo Master. Crea { nombre, parroquia }.
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !isMaster(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const body = await req.json();
    const nombre = String(body?.nombre ?? "").replace(/\s+/g, " ").trim();
    const parroquia = normParroquia(body?.parroquia);
    const refugioId = String(body?.refugioId ?? "").trim() || null;
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    if (!parroquia) return NextResponse.json({ error: "La parroquia es obligatoria" }, { status: 400 });
    if (!PARROQUIAS.includes(parroquia)) {
      return NextResponse.json({ error: "Parroquia no válida" }, { status: 400 });
    }

    const comunidad = await prisma.comunidad.create({ data: { nombre, parroquia, refugioId } });
    return NextResponse.json({ success: true, comunidad }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Esa comunidad ya existe en esa parroquia" }, { status: 409 });
    console.error("Error en POST /api/comunidades:", error);
    return NextResponse.json({ error: "Error al crear comunidad" }, { status: 500 });
  }
}

// PUT — solo Master. Edita { id, nombre, parroquia }. NOTA: no cascadea a registros ya
// censados (que guardan la comunidad por nombre); editar una comunidad conviene hacerlo
// antes de usarla en el censo.
export async function PUT(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !isMaster(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    const nombre = String(body?.nombre ?? "").replace(/\s+/g, " ").trim();
    const parroquia = normParroquia(body?.parroquia);
    // Si viene la clave `refugioId` se actualiza (incluye vaciarla → null); si NO viene, no se toca.
    const hasRefugio = Object.prototype.hasOwnProperty.call(body ?? {}, "refugioId");
    const refugioId = hasRefugio ? (String(body?.refugioId ?? "").trim() || null) : undefined;
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    if (!parroquia || !PARROQUIAS.includes(parroquia)) {
      return NextResponse.json({ error: "Parroquia no válida" }, { status: 400 });
    }

    const comunidad = await prisma.comunidad.update({
      where: { id },
      data: { nombre, parroquia, ...(refugioId !== undefined ? { refugioId } : {}) },
    });
    return NextResponse.json({ success: true, comunidad });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Esa comunidad ya existe en esa parroquia" }, { status: 409 });
    if (error?.code === "P2025") return NextResponse.json({ error: "Comunidad no encontrada" }, { status: 404 });
    console.error("Error en PUT /api/comunidades:", error);
    return NextResponse.json({ error: "Error al actualizar comunidad" }, { status: 500 });
  }
}

// DELETE — solo Master. ?id=.
export async function DELETE(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !isMaster(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

    await prisma.comunidad.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Comunidad no encontrada" }, { status: 404 });
    console.error("Error en DELETE /api/comunidades:", error);
    return NextResponse.json({ error: "Error al borrar comunidad" }, { status: 500 });
  }
}
