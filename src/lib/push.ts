import webpush from "web-push";
import { prisma } from "./prisma";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const privateKey = process.env.VAPID_PRIVATE_KEY || "";

if (publicKey && privateKey) {
  webpush.setVapidDetails(
    "mailto:admin@registrosismolg26.gob.ve",
    publicKey,
    privateKey
  );
}

export async function sendPushToAdmins(registro: { id: string; nombreApellido: string; cedula: string }) {
  try {
    if (!publicKey || !privateKey) {
      console.warn("VAPID keys not configured. Skipping push notification.");
      return;
    }

    // Find all stored push subscriptions
    const subscriptions = await prisma.pushSubscription.findMany();
    
    const payload = JSON.stringify({
      title: "Nuevo Afectado Registrado",
      body: `${registro.nombreApellido} (C.I. ${registro.cedula}) ha sido registrado en el censo.`,
      url: `/?registroId=${registro.id}` // Navigate to this record on click
    });

    const promises = subscriptions.map(sub => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          auth: sub.keysAuth,
          p256dh: sub.keysP256dh
        }
      };

      return webpush.sendNotification(pushSubscription, payload)
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
