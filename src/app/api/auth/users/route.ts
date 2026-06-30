import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Helper to check if requester is an Admin
async function checkAdmin(adminId: string) {
  if (!adminId) return false;
  const user = await prisma.user.findUnique({
    where: { id: adminId }
  });
  return user?.role === "ADMIN";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get("adminId") || "";

    const isAdmin = await checkAdmin(adminId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Acceso no autorizado. Requiere rol de Administrador." },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        nombre: true,
        role: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({ success: true, users });
  } catch (error: any) {
    console.error("Error en GET users API:", error);
    return NextResponse.json(
      { error: "Error al listar usuarios" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { email, nombre, password, role, adminId } = await req.json();

    const isAdmin = await checkAdmin(adminId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Acceso no autorizado. Requiere rol de Administrador." },
        { status: 403 }
      );
    }

    if (!email || !nombre || !password || !role) {
      return NextResponse.json(
        { error: "Todos los campos son obligatorios" },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "El correo ya se encuentra registrado" },
        { status: 409 }
      );
    }

    const newUser = await prisma.user.create({
      data: {
        email: cleanEmail,
        nombre: String(nombre).trim(),
        password: hashPassword(password),
        role: role
      }
    });

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        nombre: newUser.nombre,
        role: newUser.role
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error("Error en POST users API:", error);
    return NextResponse.json(
      { error: "Error al crear el usuario" },
      { status: 500 }
    );
  }
}
