import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mailerReady } from "@/lib/mailer";
import { requestCode } from "@/lib/otp";

// ── Recuperar contraseña · PASO 1 (SIN sesión) ──────────────────────────────
// El usuario que olvidó su contraseña pide un código a SU correo. Reglas:
//  · Sin correo configurado (mailerReady=false) → { available:false }: la UI avisa
//    que la recuperación no está disponible (no es dato sensible).
//  · Para NO revelar qué correos existen (enumeración), la respuesta es SIEMPRE la
//    misma exista o no la cuenta; el código solo se genera/envía si el correo
//    pertenece a un usuario real. El cliente NO recibe challengeId (se verifica por
//    correo en el paso 2), así no se filtra la existencia de la cuenta.
export async function POST(req: Request) {
  try {
    if (!mailerReady()) {
      return NextResponse.json({ available: false }, { status: 200 });
    }

    const { email } = await req.json().catch(() => ({}));
    const clean = String(email || "").trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return NextResponse.json({ error: "Ingresa un correo electrónico válido." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: clean }, select: { id: true } });
    if (user) {
      // Solo si existe: genera/envía el código (con cooldown y limpieza incluidos).
      await requestCode(clean, "PASSWORD_RESET");
    }

    // Respuesta uniforme (no revela si el correo existe).
    return NextResponse.json({ available: true, success: true }, { status: 200 });
  } catch (error) {
    console.error("Error en password-reset/request:", error);
    return NextResponse.json({ error: "No se pudo procesar la solicitud." }, { status: 500 });
  }
}
