import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canManageRooms, isMaster, type AuthUser } from "@/lib/auth";

// Refugio objetivo: Master puede indicar uno (?refugio= / body.refugio); el resto usa el suyo.
function targetRefugio(auth: AuthUser, requested?: string | null): string {
  return isMaster(auth) && requested ? requested : auth.refugio;
}

// Capacidad de camas válida: entero 1..999. Devuelve null si el valor es inválido.
function parseCapacidad(raw: unknown): number | null {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 && n <= 999 ? n : null;
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthUser(request);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const requested = new URL(request.url).searchParams.get("refugio");
    // Master sin refugio explícito ve todos; con refugio, solo ese. El resto: solo su refugio.
    const where = isMaster(auth)
      ? (requested ? { refugio: requested } : {})
      : { refugio: auth.refugio };

    // Sin auto-relleno: cada refugio arranca vacío y sus salones se configuran
    // manualmente en Config (regla del proyecto: nada de datos hardcodeados).
    // Orden por creación ASCENDENTE (los primeros creados arriba, los nuevos abajo),
    // con desempate ESTABLE por `id`: si varios salones comparten `createdAt` (carga
    // masiva), un UPDATE posterior —p. ej. editar capacidad— NO los reordena.
    const rooms = await prisma.customRoom.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return NextResponse.json(rooms);
  } catch (error: any) {
    console.error("Error in GET /api/cuartos:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthUser(request);
    if (!auth || !canManageRooms(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const { name } = body;
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    const refugio = targetRefugio(auth, body.refugio);
    const normalizedName = name.trim().toUpperCase();
    const capacidad = parseCapacidad(body.capacidad) ?? 18; // 18 por defecto

    const existing = await prisma.customRoom.findUnique({
      where: { name_refugio: { name: normalizedName, refugio } }
    });
    if (existing) {
      return NextResponse.json({ error: "Room already exists" }, { status: 409 });
    }

    const room = await prisma.customRoom.create({
      data: { name: normalizedName, refugio, capacidad }
    });

    return NextResponse.json(room, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/cuartos:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await getAuthUser(request);
    if (!auth || !canManageRooms(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    if (!name) {
      return NextResponse.json({ error: "Missing room name" }, { status: 400 });
    }

    const refugio = targetRefugio(auth, url.searchParams.get("refugio"));
    const normalizedName = name.trim().toUpperCase();

    const existing = await prisma.customRoom.findUnique({
      where: { name_refugio: { name: normalizedName, refugio } }
    });
    if (!existing) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    await prisma.customRoom.delete({
      where: { name_refugio: { name: normalizedName, refugio } }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/cuartos:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Editar la capacidad de camas de un salón (MASTER/ADMIN, scoped por refugio).
export async function PATCH(request: Request) {
  try {
    const auth = await getAuthUser(request);
    if (!auth || !canManageRooms(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const { name } = body;
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    const capacidad = parseCapacidad(body.capacidad);
    if (capacidad === null) {
      return NextResponse.json({ error: "Capacidad inválida (entero 1–999)" }, { status: 400 });
    }

    const refugio = targetRefugio(auth, body.refugio);
    const normalizedName = name.trim().toUpperCase();

    const existing = await prisma.customRoom.findUnique({
      where: { name_refugio: { name: normalizedName, refugio } }
    });
    if (!existing) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const room = await prisma.customRoom.update({
      where: { name_refugio: { name: normalizedName, refugio } },
      data: { capacidad }
    });

    return NextResponse.json(room);
  } catch (error: any) {
    console.error("Error in PATCH /api/cuartos:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
