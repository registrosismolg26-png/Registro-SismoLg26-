import webpush from "web-push";
import { prisma } from "./prisma";

const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").replace(/^["']|["']$/g, "").trim();
const privateKey = (process.env.VAPID_PRIVATE_KEY || "").replace(/^["']|["']$/g, "").trim();

if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(
      "mailto:admin@registrosismolg26.gob.ve",
      publicKey,
      privateKey
    );
  } catch (err) {
    console.error("Error setting VAPID details:", err);
  }
}

export async function sendPushToAdmins(registro: { id: string; nombreApellido: string; cedula: string; refugio: string }) {
  try {
    if (!publicKey || !privateKey) {
      console.warn("VAPID keys not configured. Skipping push notification.");
      return;
    }

    // Alertas de "nuevo afectado": SOLO a ADMIN/MASTER (los roles que gestionan el censo).
    // Antes se enviaba a TODAS las suscripciones; ahora que cualquier operador puede activar
    // el push (para recibir avisos), hay que filtrar por rol para no spamear a médicos, etc.
    const admins = await prisma.user.findMany({
      where: { role: { in: ["MASTER", "ADMIN"] } },
      select: { id: true },
    });
    const adminIds = admins.map((a) => a.id);
    if (!adminIds.length) return;
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: adminIds } },
    });

    const refugio = registro.refugio || "Sin campamento";

    const payload = JSON.stringify({
      title: "Nuevo Afectado Registrado",
      // El campamento va al FINAL del cuerpo para que el Master sepa dónde se registró
      // al afectado sin abrir la app.
      body: `${registro.nombreApellido} (C.I. ${registro.cedula}) ha sido registrado en el censo. Campamento: ${refugio}`,
      url: `/?registroId=${registro.id}`, // Navigate to this record on click
      refugio,
      // tag ÚNICO por registro (prefijado por campamento) para que las notificaciones se
      // APILEN en vez de reemplazarse: cada afectado nuevo es una notificación distinta,
      // agrupada por su campamento. Ver comentario en sw.js (handler `push`).
      tag: `nuevo-registro-${refugio}-${registro.id}`,
    });

    const promises = subscriptions.map(sub => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          auth: sub.keysAuth,
          p256dh: sub.keysP256dh
        }
      };

      const options = {
        TTL: 86400, // Keep in queue for 24 hours if offline
        headers: {
          "Urgency": "high" // Wake up Android devices immediately from sleep mode
        }
      };

      return webpush.sendNotification(pushSubscription, payload, options)
        .catch(err => {
          // Clean up invalid or expired subscriptions
          if (err.statusCode === 404 || err.statusCode === 410) {
            return prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          }
          console.error("Error sending web push to subscriber:", err);
        });
    });

    await Promise.all(promises);
  } catch (error) {
    console.error("Error in sendPushToAdmins:", error);
  }
}

/** Push (PWA) a las suscripciones de una LISTA de usuarios (para los avisos del
 *  composer). Best-effort: sin VAPID o sin suscripciones, no hace nada ni rompe. */
export async function sendPushToUsers(
  userIds: string[],
  data: { title: string; body: string; url?: string; tag?: string }
) {
  try {
    if (!publicKey || !privateKey) { console.warn("VAPID no configurado. Se omite el push."); return; }
    if (!userIds.length) return;
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    if (!subscriptions.length) return;

    const payload = JSON.stringify({
      type: "aviso", // el SW lo usa para mostrarlo como AVISO (no como "nuevo afectado")
      title: data.title,
      body: data.body,
      url: data.url || "/",
      tag: data.tag || `aviso-${Date.now()}`,
    });
    const options = { TTL: 86400, headers: { "Urgency": "high" } };

    await Promise.all(subscriptions.map((sub) => {
      const pushSubscription = { endpoint: sub.endpoint, keys: { auth: sub.keysAuth, p256dh: sub.keysP256dh } };
      return webpush.sendNotification(pushSubscription, payload, options).catch((err: any) => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          return prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
        console.error("Error sending web push to subscriber:", err);
      });
    }));
  } catch (error) {
    console.error("Error in sendPushToUsers:", error);
  }
}
