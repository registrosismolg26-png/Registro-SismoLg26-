// ── Cliente de notificaciones push (PWA) ────────────────────────────────────
// Solicita el permiso y (re)suscribe al Push del navegador, guardando la
// suscripción en el servidor. Se usa en el arranque (page.tsx, automático para
// ADMIN) y desde Configuración (botón manual Activar/Renovar). Idempotente:
// re-suscribir limpia primero la suscripción anterior.
import { apiFetch } from "@/lib/apiFetch";

// Clave PÚBLICA VAPID: NO es secreta, se expone al cliente por diseño. Se toma de
// la env NEXT_PUBLIC_* y, si falta, del valor público del proyecto (compat).
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BBklTIPZhS7ziGhVXKTdMFyXPrAE5qmdh12TbUtPxczuVm_al9Qq0ua8EFCCow7xrJI3p6lhaEQI-4OS1v2qTNI";

// ¿El navegador/dispositivo soporta notificaciones push? (requiere HTTPS/localhost)
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): NotificationPermission {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "denied";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushReason = "no-soportado" | "bloqueado" | "sin-permiso" | "servidor" | "error";
export type PushResult =
  | { ok: true; permission: "granted" }
  | { ok: false; permission: NotificationPermission; reason: PushReason };

// Solicita permiso (si está en "default") y (re)suscribe, guardando en el servidor.
// Llamarlo desde un GESTO del usuario (clic) permite que el prompt aparezca aunque
// antes no se hubiera mostrado.
export async function enablePush(userId: string): Promise<PushResult> {
  if (!pushSupported()) return { ok: false, permission: "denied", reason: "no-soportado" };
  try {
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") {
      return { ok: false, permission: perm, reason: perm === "denied" ? "bloqueado" : "sin-permiso" };
    }
    const reg = await navigator.serviceWorker.ready;
    // Limpia la suscripción anterior para re-registrar con la VAPID actual.
    try {
      const old = await reg.pushManager.getSubscription();
      if (old) await old.unsubscribe();
    } catch { /* noop */ }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
    const r = await apiFetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub, userId }),
    });
    return r.ok ? { ok: true, permission: "granted" } : { ok: false, permission: "granted", reason: "servidor" };
  } catch {
    return { ok: false, permission: pushPermission(), reason: "error" };
  }
}
