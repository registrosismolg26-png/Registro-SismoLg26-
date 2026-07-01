import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    let rooms = await prisma.customRoom.findMany({
      orderBy: { createdAt: "desc" } // Order by creation date DESC
    });

    // Auto-seed table if it is currently empty
    if (rooms.length === 0) {
      const defaultNames = [
        ...Array.from({ length: 22 }, (_, i) => `EDIFICIO 1 SALON ${i + 1}`),
        ...Array.from({ length: 10 }, (_, i) => `EDIFICIO 2 SALON ${i + 23}`)
      ];

      // To keep correct order (SALON 1 first up to SALON 32 last) when ordering desc by createdAt,
      // we must create them sequentially.
      for (const name of defaultNames) {
        await prisma.customRoom.create({
          data: { name },
          select: { id: true }
        }).catch(() => {});
      }

      rooms = await prisma.customRoom.findMany({
        orderBy: { createdAt: "desc" }
      });
    }

    return NextResponse.json(rooms);
  } catch (error: any) {
    console.error("Error in GET /api/cuartos:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    const normalizedName = name.trim().toUpperCase();

    const existing = await prisma.customRoom.findUnique({
      where: { name: normalizedName }
    });
    if (existing) {
      return NextResponse.json({ error: "Room already exists" }, { status: 409 });
    }

    const room = await prisma.customRoom.create({
      data: { name: normalizedName }
    });

    return NextResponse.json(room, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/cuartos:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    if (!name) {
      return NextResponse.json({ error: "Missing room name" }, { status: 400 });
    }

    const normalizedName = name.trim().toUpperCase();

    // Check if the room exists
    const existing = await prisma.customRoom.findUnique({
      where: { name: normalizedName }
    });
    if (!existing) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    await prisma.customRoom.delete({
      where: { name: normalizedName }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/cuartos:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
