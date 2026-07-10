import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { verifyCodeByEmail } from "@/lib/otp";
import { invalidateSession } from "@/lib/auth";

// scrypt con salt aleatorio (mismo formato que login/users). "scrypt$<salt>$<hash>".
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

// ── Recuperar contraseña · PASO 2 (SIN sesión) ──────────────────────────────
// Recibe { email, code, newPassword }. El código se verifica CONTRA EL CORREO (el
// más reciente vigente, un solo uso) → así no hace falta challengeId ni se filtra la
// existencia de la cuenta. Si el código es válido, fija la nueva contraseña. No
// exige la contraseña actual (justamente porque el usuario la olvidó).
export async function POST(req: Request) {
  try {
    const { email, code, newPassword } = await req.json().catch(() => ({}));
    const clean = String(email || "").trim().toLowerCase();
    const pwd = String(newPassword || "");

    if (!clean || !code) {
      return NextResponse.json({ error: "Faltan datos para restablecer la contraseña." }, { status: 400 });
    }
    if (pwd.length < 6) {
      return NextResponse.json({ error: "La nueva contraseña debe tener al menos 6 caracteres." }, { status: 400 });
    }

    const ok = await verifyCodeByEmail(clean, String(code), "PASSWORD_RESET");
    if (!ok) {
      return NextResponse.json({ error: "Código inválido o vencido.", code: "CODE_INVALID" }, { status: 403 });
    }

    // Código válido → aplica la nueva contraseña al usuario de ESE correo.
    const user = await prisma.user.findUnique({ where: { email: clean }, select: { id: true } });
    if (!user) {
      // Borde: la cuenta se eliminó entre el paso 1 y el 2.
      return NextResponse.json({ error: "La cuenta ya no existe." }, { status: 404 });
    }

    await prisma.user.update({ where: { id: user.id }, data: { password: hashPassword(pwd) } });
    invalidateSession(user.id); // por si hubiera sesión cacheada

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en password-reset/confirm:", error);
    return NextResponse.json({ error: "No se pudo restablecer la contraseña." }, { status: 500 });
  }
}
