import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { getAuthUser, invalidateSession } from "@/lib/auth";
import { withAuditUser } from "@/lib/audit";

// Mismo esquema que login/users: "scrypt$<salt>$<hash>" (con respaldo SHA-256 legado).
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(input: string, stored: string): boolean {
  if (stored.startsWith("scrypt$")) {
    const parts = stored.split("$");
    if (parts.length !== 3) return false;
    const [, salt, storedHash] = parts;
    try {
      const derived = crypto.scryptSync(input, salt, 64).toString("hex");
      return crypto.timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(storedHash, "hex"));
    } catch { return false; }
  }
  return crypto.createHash("sha256").update(input).digest("hex") === stored;
}

// ── AUTOSERVICIO: el usuario autenticado edita SU PROPIA cuenta ──────────────
// GUARDA CRÍTICA (back): opera SIEMPRE sobre `auth.id` derivado de la sesión (getAuthUser),
// NUNCA sobre un id del body. Solo permite cambiar `nombre` y/o `password`.
// NUNCA cambia email, rol ni campamento (ni siquiera un admin lo hace por aquí).
export async function PUT(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const nombre = body?.nombre != null ? String(body.nombre).replace(/\s+/g, " ").trim() : undefined;
    const currentPassword = body?.currentPassword != null ? String(body.currentPassword) : "";
    const newPassword = body?.newPassword != null ? String(body.newPassword) : "";

    const wantsPassword = !!newPassword;
    const wantsNombre = nombre !== undefined;
    if (!wantsNombre && !wantsPassword) {
      return NextResponse.json({ error: "No hay cambios que guardar." }, { status: 400 });
    }

    const me = await prisma.user.findUnique({ where: { id: auth.id }, select: { id: true, password: true } });
    if (!me) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const data: Record<string, string> = {};

    if (wantsNombre) {
      if (!nombre) return NextResponse.json({ error: "El nombre no puede quedar vacío." }, { status: 400 });
      data.nombre = nombre;
    }

    if (wantsPassword) {
      if (newPassword.length < 6) {
        return NextResponse.json({ error: "La nueva contraseña debe tener al menos 6 caracteres." }, { status: 400 });
      }
      // Cambiar la contraseña EXIGE la actual y se verifica de verdad en el back.
      if (!currentPassword || !verifyPassword(currentPassword, me.password)) {
        return NextResponse.json({ error: "La contraseña actual es incorrecta." }, { status: 403 });
      }
      data.password = hashPassword(newPassword);
    }

    const updated = await withAuditUser(auth.email, (tx) => tx.user.update({ where: { id: auth.id }, data }));
    if (data.password) invalidateSession(auth.id); // refresca cualquier caché de sesión

    // Se devuelven SOLO los campos públicos; email/rol/campamento van tal como estaban.
    return NextResponse.json({
      success: true,
      user: { id: updated.id, email: updated.email, nombre: updated.nombre, role: updated.role, campamentoTransitorio: updated.campamentoTransitorio },
    });
  } catch (error: any) {
    console.error("Error en PUT /api/auth/me:", error);
    return NextResponse.json({ error: "Error al actualizar la cuenta" }, { status: 500 });
  }
}
