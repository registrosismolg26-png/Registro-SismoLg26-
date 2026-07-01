import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { subscription, userId } = body;

    if (!subscription || !subscription.endpoint || !userId) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    const { endpoint, keys } = subscription;
    const { auth, p256dh } = keys || {};

    if (!auth || !p256dh) {
      return NextResponse.json({ error: "Faltan claves de la suscripción (auth, p256dh)" }, { status: 400 });
    }

    // Save or update subscription
    const saved = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId,
        keysAuth: auth,
        keysP256dh: p256dh
      },
      create: {
        userId,
        endpoint,
        keysAuth: auth,
        keysP256dh: p256dh
      }
    });

    return NextResponse.json({ success: true, id: saved.id });
  } catch (error: any) {
    console.error("Error en API /api/push/subscribe:", error);
    return NextResponse.json({ error: "Error interno del servidor", details: error.message }, { status: 500 });
  }
}
