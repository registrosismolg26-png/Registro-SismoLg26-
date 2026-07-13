// ── Telegram (canal de respaldo para códigos y avisos) ──────────────────────
// Bot API (gratis, oficial). El ENVÍO es saliente (sendMessage) → funciona en local
// y en Vercel. La VINCULACIÓN NO usa webhook (Telegram no llega a localhost): se
// resuelve con getUpdates bajo demanda — el usuario pulsa Start en el bot y la app
// busca su "/start <token>" en las actualizaciones recientes. Credenciales por env:
//   TELEGRAM_BOT_TOKEN      token del bot (@BotFather) — SECRETO, nunca al repo
//   TELEGRAM_ALERT_CHAT_ID  (opc.) chat_id del grupo de admins para avisos generales
// DEGRADACIÓN SEGURA: sin token, telegramReady()=false y nada se envía ni rompe.
// IMPORTANTE: como se usa getUpdates, el bot NO debe tener un webhook activo.

const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const alertChatId = (process.env.TELEGRAM_ALERT_CHAT_ID || "").trim();
const api = (method: string) => `https://api.telegram.org/bot${token}/${method}`;

export const telegramReady = (): boolean => Boolean(token);

async function tg<T = any>(method: string, body: Record<string, any>): Promise<T | null> {
  if (!token) return null;
  try {
    const res = await fetch(api(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({} as any));
    if (!data?.ok) { console.warn(`[telegram] ${method} falló:`, data?.description || res.status); return null; }
    return data.result as T;
  } catch (e) {
    console.error(`[telegram] error en ${method}:`, e);
    return null;
  }
}

/** Envía un mensaje (HTML) a un chat (usuario o grupo). true si se envió. */
export async function sendTelegram(chatId: string | number, text: string): Promise<boolean> {
  if (!chatId) return false;
  const r = await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
  return r !== null;
}

/** Avisa al grupo de admins (TELEGRAM_ALERT_CHAT_ID). No-op si no está configurado. */
export async function sendTelegramGroup(text: string): Promise<boolean> {
  if (!alertChatId) return false;
  return sendTelegram(alertChatId, text);
}

// @username del bot (para el deep-link). Se obtiene una vez con getMe y se cachea.
let botUsernameCache: string | null = null;
export async function getBotUsername(): Promise<string | null> {
  if (botUsernameCache) return botUsernameCache;
  const me = await tg<{ username?: string }>("getMe", {});
  botUsernameCache = me?.username || null;
  return botUsernameCache;
}

/** Busca en las actualizaciones recientes un "/start <token>" y devuelve el chat_id
 *  de quien lo envió, o null si aún no llega. NO consume el offset (así no compite con
 *  otras vinculaciones simultáneas); Telegram descarta las actualizaciones solo (~24h). */
export async function findChatIdByStartToken(linkToken: string): Promise<string | null> {
  if (!token || !linkToken) return null;
  const updates = await tg<any[]>("getUpdates", { limit: 100, timeout: 0 });
  if (!Array.isArray(updates)) return null;
  for (let i = updates.length - 1; i >= 0; i--) {
    const msg = updates[i]?.message;
    const text = String(msg?.text || "").trim();
    if (text === `/start ${linkToken}` && msg?.chat?.id != null) return String(msg.chat.id);
  }
  return null;
}
