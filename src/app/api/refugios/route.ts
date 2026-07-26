import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isMaster } from "@/lib/auth";

// Tipos válidos de campamento. TRANSITORIO = asignación por habitación (cuarto);
// ITINERANTE/MIXTO = asignación por Comunidad + Tipo de carpa + Nº (compuesta en `cuarto`).
const TIPOS_REFUGIO: readonly string[] = ["TRANSITORIO", "ITINERANTE", "MIXTO"];
const normTipo = (v: unknown): string => {
  const t = String(v ?? "").trim().toUpperCase();
  return TIPOS_REFUGIO.includes(t) ? t : "TRANSITORIO";
};

// GET — cualquier usuario autenticado. Lista de refugios para selectores.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const refugios = await prisma.refugio.findMany({
      orderBy: { nombre: "asc" },
    });

    // Lista global de campamentos → cache en navegador 120s (ver nota en
    // patologias/route.ts). ConfigTab refetchea con cache:"reload" tras crear/renombrar/borrar.
    return NextResponse.json({ success: true, refugios }, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch (error: any) {
    console.error("Error en GET /api/refugios:", error);
    return NextResponse.json({ error: "Error al listar campamentos" }, { status: 500 });
  }
}

// POST — solo Master. Crea un refugio { nombre }.
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !isMaster(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const nombre = body?.nombre ? String(body.nombre).trim() : "";
    if (!nombre) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }

    const existing = await prisma.refugio.findUnique({ where: { nombre } });
    if (existing) {
      return NextResponse.json({ error: "El campamento ya existe" }, { status: 409 });
    }

    const ubicacion = body?.ubicacion ? (String(body.ubicacion).trim() || null) : null;
    const refugio = await prisma.refugio.create({ data: { nombre, tipo: normTipo(body?.tipo), ubicacion } });
    return NextResponse.json({ success: true, refugio }, { status: 201 });
  } catch (error: any) {
    console.error("Error en POST /api/refugios:", error);
    if (error.code === "P2002") {
      return NextResponse.json({ error: "El campamento ya existe" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error al crear el campamento" }, { status: 500 });
  }
}

// PUT — solo Master. Renombra en cascada { id, nombre }.
export async function PUT(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !isMaster(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const id = body?.id ? String(body.id) : "";
    const nombre = body?.nombre ? String(body.nombre).trim() : "";
    if (!id || !nombre) {
      return NextResponse.json({ error: "id y nombre son obligatorios" }, { status: 400 });
    }
    // ubicacion opcional: si viene, se actualiza (string vacío → null).
    const ubicacion = body?.ubicacion !== undefined
      ? (String(body.ubicacion).trim() || null)
      : undefined;
    // tipo opcional: solo se actualiza si viene y es un valor válido.
    const tipo = body?.tipo !== undefined && TIPOS_REFUGIO.includes(String(body.tipo).trim().toUpperCase())
      ? String(body.tipo).trim().toUpperCase()
      : undefined;
    // poblacionBase opcional: total de referencia. Si viene, se guarda solo si es
    // un entero > 0; cualquier otra cosa (vacío, 0, no numérico) → null (no aplica).
    const poblacionBase = body?.poblacionBase !== undefined
      ? (() => { const nb = parseInt(String(body.poblacionBase), 10); return Number.isFinite(nb) && nb > 0 ? nb : null; })()
      : undefined;

    const current = await prisma.refugio.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Campamento no encontrado" }, { status: 404 });
    }

    const oldName = current.nombre;
    const nameChanged = oldName !== nombre;

    if (!nameChanged) {
      // Solo se edita la ubicación, el tipo y/o la población base (o nada cambió).
      const data: { ubicacion?: string | null; tipo?: string; poblacionBase?: number | null } = {};
      if (ubicacion !== undefined) data.ubicacion = ubicacion;
      if (tipo !== undefined) data.tipo = tipo;
      if (poblacionBase !== undefined) data.poblacionBase = poblacionBase;
      const refugio = Object.keys(data).length
        ? await prisma.refugio.update({ where: { id }, data })
        : current;
      return NextResponse.json({ success: true, refugio });
    }

    // El nombre nuevo no debe colisionar con otro refugio existente.
    const clash = await prisma.refugio.findUnique({ where: { nombre } });
    if (clash && clash.id !== id) {
      return NextResponse.json({ error: "Ya existe un campamento con ese nombre" }, { status: 409 });
    }

    // Cascada atómica: renombrar el refugio (+ ubicación si vino) y propagar a
    // las tablas que referencian el nombre viejo (no hay FK, es por texto).
    const [refugio] = await prisma.$transaction([
      prisma.refugio.update({
        where: { id },
        data: { nombre, ...(ubicacion !== undefined ? { ubicacion } : {}), ...(tipo !== undefined ? { tipo } : {}), ...(poblacionBase !== undefined ? { poblacionBase } : {}) },
      }),
      prisma.user.updateMany({
        where: { campamentoTransitorio: oldName },
        data: { campamentoTransitorio: nombre },
      }),
      prisma.registro.updateMany({
        where: { refugio: oldName },
        // syncedAt: refresca la marca de "última modificación" (validador ETag del censo).
        data: { refugio: nombre, syncedAt: new Date() },
      }),
      prisma.customRoom.updateMany({
        where: { refugio: oldName },
        data: { refugio: nombre },
      }),
    ]);

    return NextResponse.json({ success: true, refugio });
  } catch (error: any) {
    console.error("Error en PUT /api/refugios:", error);
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Ya existe un campamento con ese nombre" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error al renombrar el campamento" }, { status: 500 });
  }
}

// DELETE — solo Master. Recibe ?id=. Solo borra si el refugio está vacío.
export async function DELETE(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !isMaster(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta el id del campamento" }, { status: 400 });
    }

    const current = await prisma.refugio.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Campamento no encontrado" }, { status: 404 });
    }

    const nombre = current.nombre;

    // No borrar si hay usuarios o registros asociados a este refugio.
    const [userCount, registroCount] = await Promise.all([
      prisma.user.count({ where: { campamentoTransitorio: nombre } }),
      prisma.registro.count({ where: { refugio: nombre } }),
    ]);

    if (userCount > 0 || registroCount > 0) {
      return NextResponse.json(
        {
          error: `No se puede eliminar: el campamento tiene ${userCount} usuario(s) y ${registroCount} registro(s) asociados.`,
        },
        { status: 409 }
      );
    }

    await prisma.refugio.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en DELETE /api/refugios:", error);
    return NextResponse.json({ error: "Error al eliminar el campamento" }, { status: 500 });
  }
}
