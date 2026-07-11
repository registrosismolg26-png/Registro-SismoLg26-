// ── OTP por correo (código de validación para acciones sensibles) ───────────
// Genera un código de 6 dígitos, guarda su HASH (sha256) en VerificationCode y lo
// envía por correo. `verifyCode` valida y CONSUME el código (un solo uso). Expira a
// los 10 min; máx. 5 intentos. Se usa en crear/editar usuarios, cambiar contraseña
// y recuperar contraseña ("olvidé"). Cooldown 60s + limpieza de códigos vencidos.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendMail, renderEmail, mailerReady } from "@/lib/mailer";
import { sendTelegram, telegramReady } from "@/lib/telegram";

export type OtpPurpose = "USER_MUTATION" | "PASSWORD_CHANGE" | "PASSWORD_RESET";
const TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 60_000; // no enviar OTRO correo si hay un código vigente de < 60s

const hashCode = (code: string) => crypto.createHash("sha256").update(code).digest("hex");
const genCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const PURPOSE_LABEL: Record<OtpPurpose, string> = {
  USER_MUTATION: "gestión de usuarios (crear, editar o eliminar)",
  PASSWORD_CHANGE: "cambio de contraseña",
  PASSWORD_RESET: "recuperación de contraseña",
};

export interface RequestCodeResult { id: string; viaEmail: boolean; viaTelegram: boolean }

/** Genera un código, lo guarda (hash) y lo entrega por correo y/o Telegram DM.
 *  Devuelve `{ id, viaEmail, viaTelegram }` (canales usados/disponibles) o null si
 *  NINGÚN canal pudo entregar. */
export async function requestCode(email: string, purpose: OtpPurpose): Promise<RequestCodeResult | null> {
  const to = String(email || "").trim().toLowerCase();
  if (!to) return null;

  // Limpieza: borra los códigos ya consumidos o vencidos de este correo (mantiene la tabla chica).
  await prisma.verificationCode.deleteMany({
    where: { email: to, OR: [{ consumedAt: { not: null } }, { expiresAt: { lt: new Date() } }] },
  }).catch(() => {});

  // Canales disponibles para este usuario (para informar por dónde llega el código).
  const user = await prisma.user.findUnique({ where: { email: to }, select: { telegramChatId: true } }).catch(() => null);
  const canEmail = mailerReady();
  const canTelegram = Boolean(user?.telegramChatId);

  // Cooldown anti-spam: si hay un código VIGENTE (< 60s), se reutiliza (no reenvía);
  // se reportan los canales disponibles (por donde llegó el original).
  const reciente = await prisma.verificationCode.findFirst({
    where: { email: to, purpose, consumedAt: null, expiresAt: { gt: new Date() }, createdAt: { gt: new Date(Date.now() - COOLDOWN_MS) } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (reciente) return { id: reciente.id, viaEmail: canEmail, viaTelegram: canTelegram };

  const code = genCode();
  const rec = await prisma.verificationCode.create({
    data: { email: to, codeHash: hashCode(code), purpose, expiresAt: new Date(Date.now() + TTL_MIN * 60_000) },
  });
  const cuerpo = `
    <p style="margin:0 0 10px">Se solicitó una acción que requiere validación: <b>${PURPOSE_LABEL[purpose]}</b>.</p>
    <p style="font-size:13px;color:#475569;margin:0 0 6px">Tu código de verificación es:</p>
    <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 0;text-align:center;font-family:monospace">${code}</div>
    <p style="font-size:13px;color:#475569;margin:12px 0 0">Vence en ${TTL_MIN} minutos. Si no fuiste tú, ignora este correo y <b>no compartas el código</b> con nadie.</p>`;
  // Entrega por TODOS los canales disponibles (redundancia): correo + Telegram DM.
  const [emailOk, tgOk] = await Promise.all([
    canEmail
      ? sendMail({ to, subject: `Código de verificación: ${code}`, html: renderEmail("Código de verificación", cuerpo) })
      : Promise.resolve(false),
    canTelegram
      ? sendTelegram(user!.telegramChatId!, `🔐 <b>Código de verificación</b>\nAcción: <b>${PURPOSE_LABEL[purpose]}</b>\n\nTu código: <b>${code}</b>\n\nVence en ${TTL_MIN} min. No lo compartas con nadie.`)
      : Promise.resolve(false),
  ]);
  if (!emailOk && !tgOk) {
    // Ningún canal entregó → borra el registro para no dejar códigos huérfanos.
    await prisma.verificationCode.delete({ where: { id: rec.id } }).catch(() => {});
    return null;
  }
  return { id: rec.id, viaEmail: emailOk, viaTelegram: tgOk };
}

// Compara (timing-safe) y CONSUME el código; incrementa intentos y audita en fallo.
async function consumeIfMatches(id: string, codeHash: string, code: string, purpose: OtpPurpose): Promise<boolean> {
  const match = crypto.timingSafeEqual(Buffer.from(codeHash, "hex"), Buffer.from(hashCode(code), "hex"));
  if (!match) {
    await prisma.verificationCode.update({ where: { id }, data: { attempts: { increment: 1 } } }).catch(() => {});
    console.warn(`[otp] intento fallido challenge=${id} purpose=${purpose}`); // auditoría en logs del server
    return false;
  }
  await prisma.verificationCode.update({ where: { id }, data: { consumedAt: new Date() } });
  return true;
}

/** Verifica y CONSUME un código por challengeId (un solo uso). true si es válido. */
export async function verifyCode(challengeId: string, code: string, purpose: OtpPurpose): Promise<boolean> {
  const id = String(challengeId || "").trim();
  const c = String(code || "").trim();
  if (!id || !/^\d{6}$/.test(c)) return false;

  const rec = await prisma.verificationCode.findUnique({ where: { id } });
  if (!rec || rec.purpose !== purpose || rec.consumedAt || rec.expiresAt.getTime() < Date.now() || rec.attempts >= MAX_ATTEMPTS) return false;
  return consumeIfMatches(rec.id, rec.codeHash, c, purpose);
}

/** Verifica y CONSUME el código VIGENTE más reciente de un CORREO. Se usa en
 *  recuperación de contraseña (sin sesión): el cliente no maneja challengeId, así
 *  la respuesta no revela qué correos existen. true si es válido. */
export async function verifyCodeByEmail(email: string, code: string, purpose: OtpPurpose): Promise<boolean> {
  const to = String(email || "").trim().toLowerCase();
  const c = String(code || "").trim();
  if (!to || !/^\d{6}$/.test(c)) return false;

  const rec = await prisma.verificationCode.findFirst({
    where: { email: to, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!rec || rec.attempts >= MAX_ATTEMPTS) return false;
  return consumeIfMatches(rec.id, rec.codeHash, c, purpose);
}

// ── Compuerta OTP para los endpoints sensibles ──────────────────────────────
// Encapsula el patrón: sin credenciales → se OMITE (skip); con { challengeId, code }
// → se verifica (ok/invalid); sin código → se envía uno al destinatario y se pide
// (required + challengeId). El endpoint mapea el resultado a su respuesta.
export type OtpGateResult =
  | { status: "skip" | "ok" | "invalid" | "send_failed" }
  | { status: "required"; challengeId: string; viaEmail: boolean; viaTelegram: boolean };

/** Interruptor global del OTP. Por defecto ACTIVO; se APAGA con `OTP_ENABLED=false`
 *  (o 0/off/no) SIN tocar las credenciales de Gmail. Útil si la entrega de correo se
 *  degrada temporalmente y no queremos bloquear acciones: con el OTP apagado, crear/
 *  editar/eliminar usuarios y cambiar contraseña operan sin código (como antes del OTP). */
export function otpEnabled(): boolean {
  const v = String(process.env.OTP_ENABLED ?? "").trim().toLowerCase();
  return !["false", "0", "off", "no"].includes(v);
}

export async function otpGate(body: any, destEmail: string, purpose: OtpPurpose): Promise<OtpGateResult> {
  if (!otpEnabled() || (!mailerReady() && !telegramReady())) return { status: "skip" }; // apagado o sin canal → no bloquea
  const challengeId = body?.challengeId ? String(body.challengeId) : "";
  const code = body?.code ? String(body.code) : "";
  if (challengeId && code) {
    const ok = await verifyCode(challengeId, code, purpose);
    return { status: ok ? "ok" : "invalid" };
  }
  const res = await requestCode(destEmail, purpose);
  return res ? { status: "required", challengeId: res.id, viaEmail: res.viaEmail, viaTelegram: res.viaTelegram } : { status: "send_failed" };
}

/** Mapea el resultado de otpGate a una respuesta HTTP. Devuelve null si se puede
 *  proceder ("skip" u "ok"); el endpoint hace `const b = otpErrorResponse(...); if (b) return b;`. */
export function otpErrorResponse(gate: OtpGateResult, actorEmail: string): NextResponse | null {
  if (gate.status === "required") return NextResponse.json({ error: "Ingresa el código de verificación que te enviamos.", code: "CODE_REQUIRED", challengeId: gate.challengeId, sentVia: { email: gate.viaEmail, telegram: gate.viaTelegram } }, { status: 403 });
  if (gate.status === "invalid") return NextResponse.json({ error: "Código de verificación inválido o vencido.", code: "CODE_INVALID" }, { status: 403 });
  if (gate.status === "send_failed") return NextResponse.json({ error: "No se pudo enviar el código de verificación.", code: "CODE_SEND_FAILED" }, { status: 500 });
  return null;
}
