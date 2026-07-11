// ── Avisos in-app (Notification) + destinatarios administrativos ────────────
// Los avisos in-app se PERSISTEN (1 fila por destinatario) y se muestran en la
// campana de la cabecera. `adminRecipients` da a quién avisar de un evento de
// refugio (Master + Admin del refugio), con su telegramChatId para el DM.

import { prisma } from "@/lib/prisma";

export interface Recipient { id: string; telegramChatId: string | null }

/** Master (todos los refugios) + Admin del refugio dado (o todos los Admin si no se
 *  pasa refugio). Devuelve id + telegramChatId para in-app + Telegram DM. */
export async function adminRecipients(refugio?: string): Promise<Recipient[]> {
  try {
    return await prisma.user.findMany({
      where: { OR: [{ role: "MASTER" }, refugio ? { role: "ADMIN", campamentoTransitorio: refugio } : { role: "ADMIN" }] },
      select: { id: true, telegramChatId: true },
    });
  } catch (e) { console.error("[notify] adminRecipients:", e); return []; }
}

/** Persiste N avisos in-app (best-effort, no lanza). */
export async function createNotifications(
  rows: { userId: string; tipo: string; titulo: string; cuerpo: string }[],
): Promise<void> {
  if (!rows.length) return;
  try { await prisma.notification.createMany({ data: rows }); } catch (e) { console.error("[notify] createMany:", e); }
}
