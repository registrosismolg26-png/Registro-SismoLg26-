import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { mailerReady } from "@/lib/mailer";
import { telegramReady } from "@/lib/telegram";
import { requestCode, type OtpPurpose } from "@/lib/otp";

// (Re)envía un código de verificación al CORREO DEL USUARIO AUTENTICADO. Se usa
// para el botón "Reenviar" del OtpModal. El destinatario siempre es el propio
// actor (crear/editar usuarios se valida contra quien lo ejecuta; cambio de
// contraseña, contra el propio usuario) → nunca se envía a un correo arbitrario.
const VALID: OtpPurpose[] = ["USER_MUTATION", "PASSWORD_CHANGE"];

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!mailerReady() && !telegramReady()) return NextResponse.json({ error: "No hay canal de envío configurado.", code: "NO_CHANNEL" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const purpose = body?.purpose as OtpPurpose;
    if (!VALID.includes(purpose)) return NextResponse.json({ error: "Propósito inválido" }, { status: 400 });

    const res = await requestCode(auth.email, purpose);
    if (!res) return NextResponse.json({ error: "No se pudo enviar el código.", code: "CODE_SEND_FAILED" }, { status: 500 });

    return NextResponse.json({ success: true, challengeId: res.id, sentTo: auth.email, sentVia: { email: res.viaEmail, telegram: res.viaTelegram } });
  } catch (error: any) {
    console.error("Error en POST /api/auth/otp/request:", error);
    return NextResponse.json({ error: "Error al solicitar el código" }, { status: 500 });
  }
}
