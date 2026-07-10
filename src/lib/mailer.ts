// ── Servicio de correo (nodemailer + Gmail App Password) ────────────────────
// Sin dominio propio (emergencia) → se envía vía una cuenta de Gmail con una
// "Contraseña de aplicación". Credenciales por variables de entorno:
//   GMAIL_USER           correo Gmail remitente (ej. avisos.sismolg@gmail.com)
//   GMAIL_APP_PASSWORD   contraseña de aplicación de 16 caracteres (SIN espacios)
//   MAIL_FROM            (opcional) remitente visible; por defecto GMAIL_USER
//
// DEGRADACIÓN SEGURA: si faltan las credenciales, sendMail() NO lanza — registra un
// aviso y devuelve false, para que un correo nunca rompa el registro/alerta.
// Nota: corre en el runtime Node de los route handlers (Vercel), no en Edge.

import nodemailer from "nodemailer";

const user = (process.env.GMAIL_USER || "").trim();
const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, ""); // las app passwords se muestran con espacios
const fromDefault = process.env.MAIL_FROM || (user ? `Registro SismoLg26 <${user}>` : "");

let transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter | null {
  if (!user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }
  return transporter;
}

/** ¿Está configurado el correo? (para no ofrecer envíos si faltan credenciales). */
export const mailerReady = (): boolean => Boolean(user && pass);

/** Destinatarios de los AVISOS (traslado / usuario nuevo), de ALERT_EMAILS (CSV). */
export const alertEmails = (): string[] =>
  (process.env.ALERT_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);

export interface MailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/** Envía un correo. Devuelve true si se envió, false si no se pudo (no lanza). */
export async function sendMail(input: MailInput): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    console.warn("[mailer] GMAIL_USER/GMAIL_APP_PASSWORD no configurados; se omite el correo.");
    return false;
  }
  const to = Array.isArray(input.to) ? input.to.filter(Boolean).join(",") : input.to;
  if (!to) return false;
  try {
    await t.sendMail({
      from: fromDefault,
      to,
      subject: input.subject,
      html: input.html,
      text: input.text || input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      replyTo: input.replyTo,
    });
    return true;
  } catch (err) {
    console.error("[mailer] Error enviando correo:", err);
    return false;
  }
}

/** Plantilla institucional simple (header azul + cuerpo). Devuelve HTML completo. */
export function renderEmail(titulo: string, cuerpoHtml: string): string {
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.55">
    <div style="background:#1e3a8a;border-radius:14px 14px 0 0;padding:16px 22px">
      <div style="color:#fff;font-weight:800;font-size:15px;letter-spacing:.02em">GOBERNACIÓN DEL ESTADO LA GUAIRA</div>
      <div style="color:#bfdbfe;font-size:12px">Registro de afectados por sismo · Campamentos transitorios</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;padding:20px 22px">
      <h2 style="color:#1e3a8a;margin:0 0 12px;font-size:18px">${titulo}</h2>
      ${cuerpoHtml}
    </div>
    <p style="color:#94a3b8;font-size:11px;text-align:center;margin:14px 0 0">Correo automático del sistema Registro-SismoLg26. No responder.</p>
  </div>`;
}
