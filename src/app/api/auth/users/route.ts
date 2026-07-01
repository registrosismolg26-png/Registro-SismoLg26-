import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

async function checkAdmin(adminId: string) {
  if (!adminId) return false;
  const user = await prisma.user.findUnique({ where: { id: adminId } });
  return user?.role === "ADMIN";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get("adminId") || "";

    if (!(await checkAdmin(adminId))) {
      return NextResponse.json(
        { error: "Acceso no autorizado. Requiere rol de Administrador." },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      select: { id: true, email: true, nombre: true, role: true, campamentoTransitorio: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, users });
  } catch (error: any) {
    console.error("Error en GET users API:", error);
    return NextResponse.json({ error: "Error al listar usuarios" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { email, nombre, password, role, campamentoTransitorio, adminId } = await req.json();

    if (!(await checkAdmin(adminId))) {
      return NextResponse.json(
        { error: "Acceso no autorizado. Requiere rol de Administrador." },
        { status: 403 }
      );
    }

    if (!email || !nombre || !password || !role) {
      return NextResponse.json({ error: "Todos los campos son obligatorios" }, { status: 400 });
    }

    const validRoles = ["ADMIN", "REGISTRADOR", "VISUALIZADOR"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
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
        role,
        campamentoTransitorio: campamentoTransitorio || "Complejo Educativo República de Panamá"
      },
    });

    return NextResponse.json(
      { success: true, user: { id: newUser.id, email: newUser.email, nombre: newUser.nombre, role: newUser.role, campamentoTransitorio: newUser.campamentoTransitorio } },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error en POST users API:", error);
    return NextResponse.json({ error: "Error al crear el usuario" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { id, email, nombre, password, role, campamentoTransitorio, adminId } = await req.json();

    if (!(await checkAdmin(adminId))) {
      return NextResponse.json(
        { error: "Acceso no autorizado. Requiere rol de Administrador." },
        { status: 403 }
      );
    }

    if (!id || !email || !nombre || !role) {
      return NextResponse.json({ error: "Todos los campos obligatorios deben estar presentes" }, { status: 400 });
    }

    const validRoles = ["ADMIN", "REGISTRADOR", "VISUALIZADOR"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findFirst({
      where: {
        email: cleanEmail,
        id: { not: id }
      }
    });
    if (existing) {
      return NextResponse.json(
        { error: "El correo ya está registrado en otra cuenta" },
        { status: 409 }
      );
    }

    const updateData: any = {
      email: cleanEmail,
      nombre: String(nombre).trim(),
      role,
      campamentoTransitorio: campamentoTransitorio || "Complejo Educativo República de Panamá"
    };

    if (password && password.trim()) {
      updateData.password = hashPassword(password);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        nombre: updatedUser.nombre,
        role: updatedUser.role,
        campamentoTransitorio: updatedUser.campamentoTransitorio
      }
    });
  } catch (error: any) {
    console.error("Error en PUT users API:", error);
    return NextResponse.json({ error: "Error al actualizar el usuario" }, { status: 500 });
  }
}
