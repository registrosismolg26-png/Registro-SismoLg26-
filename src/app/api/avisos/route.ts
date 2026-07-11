import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canManageUsers, isMaster } from "@/lib/auth";
import { assignableRoles } from "@/lib/permissions";
import { sendTelegram } from "@/lib/telegram";
import { sendPushToUsers } from "@/lib/push";
import { waToTelegramHtml } from "@/lib/waFormat";

// Enviar aviso (Master/Admin) a usuarios elegidos por ROL y CAMPAMENTO, por in-app
// y/o Telegram. El servidor NO confía en el cliente: los roles se recortan a los que
// el emisor puede gestionar (assignableRoles) y el ámbito de campamento se fuerza
// (Master elige o todos; Admin/AdminMedico → SIEMPRE su propio refugio).
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManageUsers(auth)) return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const titulo = String(body?.titulo || "").trim();
    const cuerpo = String(body?.cuerpo || "").trim();
    let roles: string[] = Array.isArray(body?.roles) ? body.roles.map(String) : [];
    const refugiosReq: string[] = Array.isArray(body?.refugios) ? body.refugios.map(String).filter(Boolean) : [];
    const canalInApp = body?.canalInApp !== false; // por defecto true
    const canalTelegram = Boolean(body?.canalTelegram);

    if (!titulo || !cuerpo) return NextResponse.json({ error: "El título y el mensaje son obligatorios." }, { status: 400 });
    if (titulo.length > 120) return NextResponse.json({ error: "El título es muy largo (máx. 120)." }, { status: 400 });
    if (cuerpo.length > 1000) return NextResponse.json({ error: "El mensaje es muy largo (máx. 1000)." }, { status: 400 });
    if (!canalInApp && !canalTelegram) return NextResponse.json({ error: "Elige al menos un canal (in-app o Telegram)." }, { status: 400 });

    // Roles válidos para ESTE emisor (recorte server-side).
    const permitidos = assignableRoles(auth.role);
    roles = roles.filter((r) => permitidos.includes(r));
    if (!roles.length) return NextResponse.json({ error: "Selecciona al menos un rol válido." }, { status: 400 });

    // Ámbito de campamento: Master elige (o todos); el resto SOLO su refugio.
    const where: any = { role: { in: roles }, id: { not: auth.id } };
    if (isMaster(auth)) {
      if (refugiosReq.length) where.campamentoTransitorio = { in: refugiosReq };
    } else {
      where.campamentoTransitorio = auth.refugio;
    }

    const users = await prisma.user.findMany({ where, select: { id: true, telegramChatId: true } });
    if (!users.length) return NextResponse.json({ success: true, count: 0, telegram: 0 });

    // El EMISOR también recibe una COPIA (para ver lo que envió). `users` ya excluye
    // su id, así que se agrega una sola vez → aparece en su propia campana/Telegram.
    const sender = await prisma.user.findUnique({ where: { id: auth.id }, select: { id: true, telegramChatId: true } });
    const recipients = sender ? [...users, sender] : users;

    // In-app: persiste (await, debe quedar guardado). tipo "AVISO".
    if (canalInApp) {
      await prisma.notification.createMany({
        data: recipients.map((u) => ({ userId: u.id, tipo: "AVISO", titulo, cuerpo })),
      });
      // Push (PWA): que el aviso llegue aunque no tengan la app abierta.
      await sendPushToUsers(recipients.map((u) => u.id), { title: titulo, body: cuerpo, url: "/", tag: `aviso-${Date.now()}` }).catch(() => {});
    }

    // Telegram DM a los vinculados (best-effort, no bloquea la respuesta).
    let tgTargets = 0;
    if (canalTelegram) {
      // El cuerpo respeta el formato WhatsApp (*negrita* _cursiva_ ~tachado~) → HTML de Telegram.
      const txt = `📢 <b>${esc(titulo)}</b>\n${waToTelegramHtml(cuerpo)}\n\n— ${esc(auth.nombre)}`;
      for (const u of recipients) {
        if (u.telegramChatId) { tgTargets++; sendTelegram(u.telegramChatId, txt).catch(() => {}); }
      }
    }

    return NextResponse.json({ success: true, count: users.length, telegram: tgTargets });
  } catch (error: any) {
    console.error("Error en POST /api/avisos:", error);
    return NextResponse.json({ error: "Error al enviar el aviso." }, { status: 500 });
  }
}
