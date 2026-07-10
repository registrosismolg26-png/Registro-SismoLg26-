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
import { LOGO_GOB_PNG_BASE64 } from "@/lib/logoAsset";

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
  // Logo inline (cid:logogob): se adjunta SOLO cuando la plantilla lo referencia
  // (renderEmail). Va embebido en base64 → no depende de un dominio ni del filesystem.
  const attachments = input.html.includes("cid:logogob")
    ? [{ filename: "logo.png", content: LOGO_GOB_PNG_BASE64, encoding: "base64" as const, cid: "logogob" }]
    : undefined;
  try {
    await t.sendMail({
      from: fromDefault,
      to,
      subject: input.subject,
      html: input.html,
      // Texto plano de respaldo: quita el bloque <style> antes de destripar etiquetas.
      text: input.text || input.html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      replyTo: input.replyTo,
      attachments,
    });
    return true;
  } catch (err) {
    console.error("[mailer] Error enviando correo:", err);
    return false;
  }
}

/** Plantilla institucional (marca de la web): franja tricolor + logo + cabecera
 *  "Campamentos Transitorios" + card redondeado. Responsive y con modo claro/oscuro
 *  (`prefers-color-scheme`, que respetan Apple Mail/iOS; Gmail usa la base clara).
 *  El logo va como `cid:logogob` — sendMail lo adjunta inline. Devuelve HTML completo. */
export function renderEmail(titulo: string, cuerpoHtml: string): string {
  const style = `
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (max-width:600px){ .em-card{border-radius:0 !important;} .em-pad{padding-left:20px !important;padding-right:20px !important;} .em-title-main{font-size:19px !important;} }
    @media (prefers-color-scheme: dark){
      .em-wrap{background:#0f172a !important;} .em-card{background:#1e293b !important;border-color:#334155 !important;}
      .em-org{color:#93c5fd !important;} .em-title-main{color:#f8fafc !important;} .em-sub{color:#94a3b8 !important;}
      .em-h2{color:#93c5fd !important;} .em-body, .em-body p, .em-body li{color:#cbd5e1 !important;}
      .em-divider{border-color:#334155 !important;} .em-foot{color:#64748b !important;}
    }
  </style>`;
  return `${style}
  <div class="em-wrap" style="background:#f1f5f9; padding:24px 12px; font-family:'Segoe UI',Roboto,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto;">
      <tr><td>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="em-card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:24px; overflow:hidden; box-shadow:0 20px 48px -24px rgba(30,58,138,.35);">
          <tr><td style="padding:0; font-size:0; line-height:0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
              <td width="33.34%" style="height:6px; background:#fcd116; font-size:0; line-height:0;">&nbsp;</td>
              <td width="33.33%" style="height:6px; background:#0033a0; font-size:0; line-height:0;">&nbsp;</td>
              <td width="33.33%" style="height:6px; background:#cf142b; font-size:0; line-height:0;">&nbsp;</td>
            </tr></table>
          </td></tr>
          <tr><td class="em-pad" style="padding:22px 28px 6px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td valign="middle" style="padding-right:14px;">
                <img src="cid:logogob" width="58" height="58" alt="Gobernación de La Guaira" style="display:block; width:58px; height:58px; border-radius:14px; background:#ffffff;">
              </td>
              <td valign="middle">
                <div class="em-org" style="font-size:11px; font-weight:800; letter-spacing:.5px; text-transform:uppercase; color:#1e3a8a;">Gobernación del Estado La Guaira</div>
                <div class="em-title-main" style="font-size:21px; font-weight:800; color:#0f172a; line-height:1.12; margin:2px 0;">Campamentos Transitorios</div>
                <div class="em-sub" style="font-size:12px; color:#475569;">Sistema de Gestión · La Guaira 2026</div>
              </td>
            </tr></table>
          </td></tr>
          <tr><td class="em-pad" style="padding:12px 28px 0;">
            <div class="em-divider" style="border-top:1px solid #e2e8f0; font-size:0; line-height:0;">&nbsp;</div>
          </td></tr>
          <tr><td class="em-pad em-body" style="padding:16px 28px 26px; color:#334155; font-size:15px; line-height:1.55;">
            <h2 class="em-h2" style="color:#1e3a8a; margin:0 0 12px; font-size:18px; font-weight:800;">${titulo}</h2>
            ${cuerpoHtml}
          </td></tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;">
          <tr><td style="padding:14px 28px; text-align:center;">
            <div class="em-foot" style="color:#94a3b8; font-size:11px; line-height:1.5;">Correo automático del sistema Registro-SismoLg26 · Gobernación del Estado La Guaira.<br>No respondas a este mensaje.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}

/** Botón full-pill (email-safe) para usar dentro del cuerpo de un correo. */
export function mailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;"><tr>
    <td align="center" style="border-radius:999px; background:#1e3a8a;">
      <a href="${href}" style="display:inline-block; padding:12px 28px; border-radius:999px; background:#1e3a8a; color:#ffffff; font-weight:700; font-size:14px; text-decoration:none; font-family:'Segoe UI',Arial,sans-serif;">${label}</a>
    </td>
  </tr></table>`;
}
