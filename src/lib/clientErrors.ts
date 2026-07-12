import { logClientError } from "@/lib/activityLog";

// ── Captura GLOBAL de errores del cliente (observabilidad en campo) ──────────
// Engancha window.onerror (excepciones JS no atrapadas) y unhandledrejection
// (promesas sin catch) y los manda a AuditLog vía la cola offline (accion "ERROR").
// · NO-PII: solo mensaje + stack recortados + location.pathname (SIN query) + origen.
// · Solo reporta con SESIÓN activa (el endpoint exige auth; evita 401 en la cola).
// · Offline-safe: la cola persiste el error y lo envía al reconectar.
// · Dedupe + tope por sesión viven en logClientError (no inunda si algo falla en bucle).
// · Bubble-phase (sin capture) → NO captura errores de carga de recursos (img/script),
//   solo errores reales de JS. Idempotente (se instala una sola vez).

let installed = false;

export function installErrorReporter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const hasSession = (): boolean => {
    try {
      return !!(localStorage.getItem("sismo_operator") || sessionStorage.getItem("sismo_operator"));
    } catch {
      return false;
    }
  };

  const report = (mensaje: string, stack: string | undefined, origen: string): void => {
    if (!hasSession()) return;
    logClientError({
      mensaje: (mensaje || "Error").slice(0, 500),
      stack: stack ? String(stack).slice(0, 2000) : undefined,
      ruta: typeof location !== "undefined" ? location.pathname : undefined,
      origen,
    });
  };

  window.addEventListener("error", (ev: ErrorEvent) => {
    const msg = ev.message || (ev.error && ev.error.message) || "Error";
    const stack = ev.error && ev.error.stack ? String(ev.error.stack) : undefined;
    report(String(msg), stack, "onerror");
  });

  window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
    const r = ev.reason as { message?: string; stack?: string; toString?: () => string } | undefined;
    const msg = (r && (r.message || (typeof r.toString === "function" && r.toString()))) || "Promesa rechazada";
    const stack = r && r.stack ? String(r.stack) : undefined;
    report(String(msg), stack, "unhandledrejection");
  });
}
