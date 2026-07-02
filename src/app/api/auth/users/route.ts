import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { getAuthUser, canManageUsers, canManageTargetUser, invalidateSession, isMaster, type AuthUser } from "@/lib/auth";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

// Roles que el actor puede asignar: Master cualquiera; Admin solo por debajo.
function assignableRoles(actor: AuthUser): string[] {
  return isMaster(actor)
    ? ["ADMIN", "REGISTRADOR", "VISUALIZADOR"]  // Master NO crea/asigna otros Master
    : ["REGISTRADOR", "VISUALIZADOR"];
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManageUsers(auth)) {
      return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 });
    }

    // Master ve todos los operadores; Admin solo los de su refugio.
    const users = await prisma.user.findMany({
      where: isMaster(auth) ? {} : { campamentoTransitorio: auth.refugio },
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
    const auth = await getAuthUser(req);
    if (!auth || !canManageUsers(auth)) {
      return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 });
    }

    const { email, nombre, password, role, campamentoTransitorio } = await req.json();

    if (!email || !nombre || !password || !role) {
      return NextResponse.json({ error: "Todos los campos son obligatorios" }, { status: 400 });
    }

    if (!assignableRoles(auth).includes(role)) {
      return NextResponse.json({ error: "No tiene permiso para asignar ese rol." }, { status: 403 });
    }

    // Admin solo crea en su propio refugio; Master puede elegir el refugio.
    const targetRefugio = isMaster(auth)
      ? (campamentoTransitorio || auth.refugio)
      : auth.refugio;

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return NextResponse.json({ error: "El correo ya se encuentra registrado" }, { status: 409 });
    }

    const newUser = await prisma.user.create({
      data: {
        email: cleanEmail,
        nombre: String(nombre).trim(),
        password: hashPassword(password),
        role,
        campamentoTransitorio: targetRefugio,
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
    const auth = await getAuthUser(req);
    if (!auth || !canManageUsers(auth)) {
      return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 });
    }

    const { id, email, nombre, password, role, campamentoTransitorio } = await req.json();

    if (!id || !email || !nombre || !role) {
      return NextResponse.json({ error: "Todos los campos obligatorios deben estar presentes" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Nadie edita a un Master; Admin solo a Registrador/Visualizador de su refugio;
    // Master a cualquier no-master.
    if (!canManageTargetUser(auth, target)) {
      return NextResponse.json({ error: "No tiene permiso para editar este usuario." }, { status: 403 });
    }

    if (!assignableRoles(auth).includes(role)) {
      return NextResponse.json({ error: "No tiene permiso para asignar ese rol." }, { status: 403 });
    }

    // Admin no puede mover al usuario a otro refugio; Master sí.
    const targetRefugio = isMaster(auth)
      ? (campamentoTransitorio || target.campamentoTransitorio)
      : auth.refugio;

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findFirst({ where: { email: cleanEmail, id: { not: id } } });
    if (existing) {
      return NextResponse.json({ error: "El correo ya está registrado en otra cuenta" }, { status: 409 });
    }

    const updateData: any = {
      email: cleanEmail,
      nombre: String(nombre).trim(),
      role,
      campamentoTransitorio: targetRefugio,
    };
    if (password && password.trim()) {
      updateData.password = hashPassword(password);
    }

    const updatedUser = await prisma.user.update({ where: { id }, data: updateData });
    invalidateSession(id); // refleja de inmediato el cambio de rol/refugio

    return NextResponse.json({
      success: true,
      user: { id: updatedUser.id, email: updatedUser.email, nombre: updatedUser.nombre, role: updatedUser.role, campamentoTransitorio: updatedUser.campamentoTransitorio },
    });
  } catch (error: any) {
    console.error("Error en PUT users API:", error);
    return NextResponse.json({ error: "Error al actualizar el usuario" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManageUsers(auth)) {
      return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 });
    }

    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta el id del usuario" }, { status: 400 });
    }
    if (id === auth.id) {
      return NextResponse.json({ error: "No puede eliminar su propia cuenta." }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Nadie borra a un Master; Admin solo a Registrador/Visualizador de su refugio.
    if (!canManageTargetUser(auth, target)) {
      return NextResponse.json({ error: "No tiene permiso para eliminar este usuario." }, { status: 403 });
    }

    // Limpiar suscripciones push huérfanas (no hay FK en cascada) y borrar.
    await prisma.pushSubscription.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.user.delete({ where: { id } });
    invalidateSession(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en DELETE users API:", error);
    return NextResponse.json({ error: "Error al eliminar el usuario" }, { status: 500 });
  }
}
