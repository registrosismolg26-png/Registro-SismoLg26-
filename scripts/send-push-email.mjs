// ─────────────────────────────────────────────────────────────────────────────
//  Correo-resumen tras cada push (regla del skill registro-sismo).
//  El agente (Claude/Gemini) lo ejecuta DESPUÉS de cada `git push` exitoso para
//  avisar al dueño de qué se subió, útil cuando no está presente.
//
//  Uso:
//    node scripts/send-push-email.mjs "<asunto>" <ruta-a-cuerpo.html> [destino]
//
//  La API key de Resend se lee de `.claude/resend.key` (GITIGNORED, nunca se
//  commitea) o de la variable de entorno RESEND_API_KEY. Remitente:
//  onboarding@resend.dev (único permitido sin dominio verificado). Destino por
//  defecto: el correo del dueño (Resend free solo entrega a ese correo).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , subject, bodyPath, toArg] = process.argv;
if (!subject || !bodyPath) {
  console.error('Uso: node scripts/send-push-email.mjs "<asunto>" <ruta-html> [destino]');
  process.exit(1);
}

let apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  try { apiKey = readFileSync(resolve(".claude/resend.key"), "utf8").trim(); } catch { /* noop */ }
}
if (!apiKey) {
  console.error("Falta la API key: crea .claude/resend.key o exporta RESEND_API_KEY.");
  process.exit(1);
}

const html = readFileSync(resolve(bodyPath), "utf8");
const to = toArg || "yender.umc@gmail.com";

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: "Registro-Sismo <onboarding@resend.dev>", to, subject, html }),
});

const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("Resend error", res.status, JSON.stringify(data));
  process.exit(1);
}
console.log("Email enviado:", data.id || JSON.stringify(data));
