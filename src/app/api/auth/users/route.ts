import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { getAuthUser, canManageUsers, canManageTargetUser, invalidateSession, isMaster, hasRefugio, type AuthUser } from "@/lib/auth";
import { withAuditUser } from "@/lib/audit";
import { otpGate, otpErrorResponse } from "@/lib/otp";
import { sendMail, renderEmail, alertEmails } from "@/lib/mailer";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

// Roles que el actor puede asignar:
//  · Master → cualquiera menos Master (incluye crear AdminMedico).
//  · AdminMedico → SOLO OperadorMedico / AsistenteMedico (nunca otro AdminMedico).
//  · Admin (censo) → solo roles de censo (Registrador/Visualizador); no crea médicos.
function assignableRoles(actor: AuthUser): string[] {
  if (isMaster(actor)) return ["ADMIN", "REGISTRADOR", "VISUALIZADOR", "AdminMedico", "OperadorMedico", "AsistenteMedico"];
  if (actor.role === "AdminMedico") return ["OperadorMedico", "AsistenteMedico"];
  return ["REGISTRADOR", "VISUALIZADOR"];
}

// Filtro de listado por actor (espejado en la UI):
//  · Master → todos.  · AdminMedico → solo médicos (Operador/Asistente) de su refugio.
//  · Admin → todos los de su refugio.
function usersListWhere(auth: AuthUser) {
  if (isMaster(auth)) return {};
  if (auth.role === "AdminMedico") {
    return { campamentoTransitorio: auth.refugio, role: { in: ["OperadorMedico", "AsistenteMedico"] } };
  }
  return { campamentoTransitorio: auth.refugio };
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManageUsers(auth)) {
      return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 });
    }

    // Master: todos. AdminMedico: solo médicos de su refugio. Admin: los de su refugio.
    const users = await prisma.user.findMany({
      where: usersListWhere(auth),
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

    const body = await req.json();
    const { email, nombre, password, role, campamentoTransitorio } = body;

    if (!email || !nombre || !password || !role) {
      return NextResponse.json({ error: "Todos los campos son obligatorios" }, { status: 400 });
    }

    if (!assignableRoles(auth).includes(role)) {
      return NextResponse.json({ error: "No tiene permiso para asignar ese rol." }, { status: 403 });
    }

    // Admin solo crea en su propio refugio; Master puede elegir el refugio.
    const targetRefugio = isMaster(auth)
      ? (campamentoTransitorio && String(campamentoTransitorio).trim() ? String(campamentoTransitorio).trim() : auth.refugio)
      : auth.refugio;

    // Guarda: todo usuario (Admin/Registrador/Visualizador) debe tener refugio.
    if (!hasRefugio(targetRefugio)) {
      return NextResponse.json(
        { error: "Debe asociar el usuario a un campamento. No se pueden crear usuarios sin campamento." },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return NextResponse.json({ error: "El correo ya se encuentra registrado" }, { status: 409 });
    }

    // OTP: valida al ACTOR (admin/master) por correo antes de crear (si el correo está configurado).
    const blocked = otpErrorResponse(await otpGate(body, auth.email, "USER_MUTATION"), auth.email);
    if (blocked) return blocked;

    const newUser = await withAuditUser(auth.email, (tx) => tx.user.create({
      data: {
        email: cleanEmail,
        nombre: String(nombre).trim(),
        password: hashPassword(password),
        role,
        campamentoTransitorio: targetRefugio,
      },
    }));

    // Aviso (fire-and-forget) a ALERT_EMAILS. Nunca rompe la creación.
    const avisoTo = alertEmails();
    if (avisoTo.length) {
      sendMail({
        to: avisoTo,
        subject: `Nuevo usuario: ${newUser.nombre}`,
        html: renderEmail("Nuevo usuario creado", `<p>Se creó una cuenta en el sistema:</p><ul style="margin:8px 0;padding-left:18px;color:#334155"><li><b>${newUser.nombre}</b> · ${newUser.email}</li><li>Rol: <b>${newUser.role}</b></li><li>Campamento: <b>${newUser.campamentoTransitorio}</b></li><li>Creado por: ${auth.nombre} (${auth.email})</li></ul>`),
      }).catch(() => {});
    }

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

    const body = await req.json();
    const { id, email, nombre, password, role, campamentoTransitorio } = body;

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
      ? (campamentoTransitorio && String(campamentoTransitorio).trim() ? String(campamentoTransitorio).trim() : target.campamentoTransitorio)
      : auth.refugio;

    // Guarda: el usuario debe quedar asociado a un refugio.
    if (!hasRefugio(targetRefugio)) {
      return NextResponse.json(
        { error: "Debe asociar el usuario a un campamento. No se pueden actualizar usuarios sin campamento." },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findFirst({ where: { email: cleanEmail, id: { not: id } } });
    if (existing) {
      return NextResponse.json({ error: "El correo ya está registrado en otra cuenta" }, { status: 409 });
    }

    // OTP: valida al ACTOR por correo antes de editar (si el correo está configurado).
    const blocked = otpErrorResponse(await otpGate(body, auth.email, "USER_MUTATION"), auth.email);
    if (blocked) return blocked;

    const updateData: any = {
      email: cleanEmail,
      nombre: String(nombre).trim(),
      role,
      campamentoTransitorio: targetRefugio,
    };
    if (password && password.trim()) {
      updateData.password = hashPassword(password);
    }

    const updatedUser = await withAuditUser(auth.email, (tx) => tx.user.update({ where: { id }, data: updateData }));
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
    await withAuditUser(auth.email, (tx) => tx.user.delete({ where: { id } }));
    invalidateSession(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en DELETE users API:", error);
    return NextResponse.json({ error: "Error al eliminar el usuario" }, { status: 500 });
  }
}
