// ─────────────────────────────────────────────────────────────────────────────
//  Anuncio de MEJORAS DE SEGURIDAD a TODOS los usuarios (envío único, segmentado).
//  · Versión ADMINS  → MASTER / ADMIN / AdminMedico.
//  · Versión OPERADORES → el resto (Registrador, Visualizador, Operador/Asistente médico).
//  Sale por el Gmail de la app (nodemailer), individual y espaciado (~1,5 s) para no
//  disparar límites de Gmail. Diseño = misma plantilla de src/lib/mailer.ts.
//
//  Uso (desde la raíz del repo, con .env que tenga DATABASE_URL + GMAIL_*):
//    node scripts/broadcast-security-announce.mjs              # DRY-RUN: solo lista, NO envía
//    node scripts/broadcast-security-announce.mjs --send       # envía de verdad
//    node scripts/broadcast-security-announce.mjs --send --only=operadores   # solo un grupo
//    node scripts/broadcast-security-announce.mjs --test=correo@x --send      # 1 correo de PRUEBA (no toca la BD)
//
//  Requiere: DATABASE_URL, GMAIL_USER, GMAIL_APP_PASSWORD (y opc. MAIL_FROM).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";
import nodemailer from "nodemailer";

// —— Carga .env (sin dependencias) si faltan variables en el entorno ——————————
(function loadEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const k = m[1]; let v = m[2].replace(/^["']|["']$/g, "");
    if (process.env[k] === undefined) process.env[k] = v;
  }
})();

const SEND = process.argv.includes("--send");
const onlyArg = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";
const testEmail = (process.argv.find((a) => a.startsWith("--test=")) || "").split("=")[1] || "";

// Texto plano de respaldo: un correo con parte text/plain (no solo HTML) entra
// mejor a "Principal". Quita el bloque <style> antes de destripar las etiquetas.
const toText = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// —— Plantilla institucional (copia fiel de src/lib/mailer.ts renderEmail) —————
function renderEmail(titulo, cuerpoHtml) {
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

const cierre = `<p style="margin:0 0 12px">Los códigos <b>vencen en 10 minutos</b> y son de <b>un solo uso</b>. Nunca compartas tu código: ningún funcionario te lo pedirá.</p>
      <p style="margin:0"><b>¿Qué debes hacer?</b> Nada especial. Solo mantén el acceso a tu correo; cuando el sistema te pida un código, ingrésalo.</p>`;

const VERSIONS = {
  admins: {
    subject: "Mejoras de seguridad del sistema",
    html: renderEmail("Reforzamos la seguridad de los datos", `
      <p style="margin:0 0 12px">Estimado usuario del sistema de <b>Campamentos Transitorios</b>:</p>
      <p style="margin:0 0 12px">Implementamos mejoras para <b>proteger mejor los datos</b> de la plataforma. Esto es lo que verás a partir de ahora:</p>
      <ul style="margin:0 0 12px;padding-left:18px;color:#334155">
        <li style="margin-bottom:6px"><b>Códigos de verificación por correo:</b> al <b>crear, editar o eliminar usuarios</b> y al <b>cambiar tu contraseña</b>, el sistema te pedirá un código de 6 dígitos enviado a tu correo.</li>
        <li style="margin-bottom:6px"><b>Recuperar tu acceso:</b> si olvidas tu contraseña, ahora puedes restablecerla tú mismo con <b>«¿Olvidaste tu contraseña?»</b> en la pantalla de inicio.</li>
        <li style="margin-bottom:6px"><b>Avisos importantes:</b> recibirás por correo eventos como <b>traslados</b> entre campamentos y <b>creación de nuevos usuarios</b>.</li>
      </ul>
      ${cierre}`),
  },
  operadores: {
    subject: "Mejoras de seguridad de tu cuenta",
    html: renderEmail("Reforzamos la seguridad de tu cuenta", `
      <p style="margin:0 0 12px">Estimado usuario del sistema de <b>Campamentos Transitorios</b>:</p>
      <p style="margin:0 0 12px">Reforzamos la seguridad de tu cuenta. Dos cosas que te conviene saber:</p>
      <ul style="margin:0 0 12px;padding-left:18px;color:#334155">
        <li style="margin-bottom:6px"><b>Cambiar tu contraseña pide un código:</b> cuando cambies tu contraseña, el sistema te enviará un código de 6 dígitos a tu correo para confirmar que eres tú.</li>
        <li style="margin-bottom:6px"><b>¿Olvidaste tu contraseña?:</b> si no puedes entrar, ahora puedes restablecerla tú mismo desde la pantalla de inicio, con un código que llega a tu correo.</li>
      </ul>
      ${cierre}`),
  },
};

const ADMIN_ROLES = new Set(["MASTER", "ADMIN", "AdminMedico"]);
const versionForRole = (role) => (ADMIN_ROLES.has(role) ? "admins" : "operadores");

async function main() {
  let targets = [];

  if (testEmail) {
    // Modo PRUEBA: un solo correo a la dirección dada, sin tocar la BD. Útil para
    // verificar dónde cae (usa una dirección DISTINTA a la que envía, GMAIL_USER).
    const version = onlyArg === "operadores" ? "operadores" : "admins";
    targets = [{ email: testEmail.trim().toLowerCase(), role: "(test)", version }];
    console.log(`\nMODO TEST: 1 correo (versión ${version}) a ${targets[0].email}.`);
  } else {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) { console.error("Falta DATABASE_URL (revisa tu .env)."); process.exit(1); }

    // 1) Traer usuarios (email + rol) de la BD.
    const client = new pg.Client({
      connectionString: dbUrl,
      ssl: /localhost|127\.0\.0\.1/.test(dbUrl) ? false : { rejectUnauthorized: false },
    });
    await client.connect();
    const { rows } = await client.query('SELECT email, role FROM "User"');
    await client.end();

    // 2) Deduplicar por correo y clasificar por versión.
    const seen = new Set();
    for (const r of rows) {
      const email = String(r.email || "").trim().toLowerCase();
      if (!email.includes("@") || seen.has(email)) continue;
      const version = versionForRole(r.role);
      if (onlyArg && version !== onlyArg) continue;
      seen.add(email);
      targets.push({ email, role: r.role, version });
    }
    const counts = targets.reduce((a, t) => ((a[t.version] = (a[t.version] || 0) + 1), a), {});
    console.log(`\nUsuarios en BD: ${rows.length} · destinatarios únicos: ${targets.length}`);
    console.log(`  admins: ${counts.admins || 0} · operadores: ${counts.operadores || 0}`);
    if (onlyArg) console.log(`  (filtrado --only=${onlyArg})`);
  }

  console.log("");
  for (const t of targets) console.log(`  [${t.version.padEnd(10)}] ${t.email}  (${t.role})`);

  if (!SEND) {
    console.log(`\nDRY-RUN: no se envió nada. Cuando estés listo:\n  node scripts/broadcast-security-announce.mjs --send\n`);
    return;
  }

  // 3) Enviar por Gmail (individual y espaciado).
  const user = (process.env.GMAIL_USER || "").trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) { console.error("Falta GMAIL_USER / GMAIL_APP_PASSWORD (revisa tu .env)."); process.exit(1); }
  const from = process.env.MAIL_FROM || `Registro SismoLg26 <${user}>`;
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  const logoB64 = readFileSync("public/logo_gob_push.png").toString("base64");

  let ok = 0, fail = 0;
  console.log(`\nEnviando ${targets.length} correos (espaciado ~1,5s)…  From: ${from}\n`);
  for (const t of targets) {
    const v = VERSIONS[t.version];
    try {
      const info = await transporter.sendMail({
        from, to: t.email, subject: v.subject, html: v.html,
        text: toText(v.html),
        headers: { "List-Unsubscribe": `<mailto:${user}?subject=Baja%20de%20avisos>` },
        attachments: [{ filename: "logo.png", content: logoB64, encoding: "base64", cid: "logogob" }],
      });
      ok++;
      // Diagnóstico: respuesta SMTP de Gmail + destinatarios aceptados/rechazados.
      const rej = (info.rejected || []).length ? ` RECHAZADO:${info.rejected.join(",")}` : "";
      console.log(`  OK   ${t.email} (${t.version}) -> ${info.response || info.messageId || ""}${rej}`);
    } catch (e) {
      fail++; console.log(`  FAIL ${t.email} -> ${e?.message || e}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`\nListo. Enviados: ${ok} · Fallidos: ${fail}\n`);
}

main().catch((e) => { console.error("Error:", e?.message || e); process.exit(1); });
