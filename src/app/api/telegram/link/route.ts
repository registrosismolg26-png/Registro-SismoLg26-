import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { telegramReady, getBotUsername, findChatIdByStartToken, sendTelegram } from "@/lib/telegram";

// Vinculación de Telegram del usuario autenticado (sin webhook, vía getUpdates).
//   GET    → { available, linked }
//   POST   → genera token y devuelve el deep-link t.me/<bot>?start=<token>
//   PUT    → verifica si ya pulsó Start (busca su /start <token>) y guarda el chatId
//   DELETE → desvincula
const TTL_MIN = 15;

export async function GET(req: Request) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: auth.id }, select: { telegramChatId: true } });
  return NextResponse.json({ available: telegramReady(), linked: Boolean(user?.telegramChatId) });
}

export async function POST(req: Request) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!telegramReady()) return NextResponse.json({ available: false }, { status: 200 });

  const username = await getBotUsername();
  if (!username) return NextResponse.json({ error: "El bot no está disponible." }, { status: 503 });

  const linkToken = crypto.randomBytes(8).toString("hex");
  await prisma.user.update({
    where: { id: auth.id },
    data: { telegramLinkToken: linkToken, telegramLinkExpires: new Date(Date.now() + TTL_MIN * 60_000) },
  });
  return NextResponse.json({ available: true, deepLink: `https://t.me/${username}?start=${linkToken}`, botUsername: username });
}

export async function PUT(req: Request) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: auth.id }, select: { telegramLinkToken: true, telegramLinkExpires: true } });
  const linkToken = user?.telegramLinkToken;
  if (!linkToken || !user?.telegramLinkExpires || user.telegramLinkExpires.getTime() < Date.now()) {
    return NextResponse.json({ error: "La vinculación expiró. Genera un enlace nuevo.", code: "EXPIRED" }, { status: 400 });
  }

  const chatId = await findChatIdByStartToken(linkToken);
  if (!chatId) return NextResponse.json({ linked: false }, { status: 200 }); // aún no pulsa Start

  await prisma.user.update({
    where: { id: auth.id },
    data: { telegramChatId: chatId, telegramLinkToken: null, telegramLinkExpires: null },
  });
  sendTelegram(chatId, "✅ <b>Vinculado</b>. Aquí recibirás tus códigos y avisos del sistema de Campamentos Transitorios.").catch(() => {});
  return NextResponse.json({ linked: true });
}

export async function DELETE(req: Request) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  await prisma.user.update({ where: { id: auth.id }, data: { telegramChatId: null, telegramLinkToken: null, telegramLinkExpires: null } });
  return NextResponse.json({ success: true });
}
