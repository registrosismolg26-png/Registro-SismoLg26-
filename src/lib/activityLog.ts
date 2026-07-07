import { apiFetch } from "@/lib/apiFetch";
import { saveLog, getPendingLogs, markLogSynced, incrementLogAttempt, markLogPermanentError } from "@/lib/db";

// ── Logs de actividad (imprimir PDF / descargar Excel) con COLA OFFLINE ──────
// Completamente independiente de la cola de registros. Cada acción se PERSISTE en
// IndexedDB y se envía con reintentos:
//   · Sin conexión / red / timeout / 5xx → temporal: se reintenta con backoff.
//   · La DB responde OK → se borra de la cola.
//   · 400/401/403 → permanente: queda como 'error' con su razón y NO se reintenta.
// NUNCA lanza ni bloquea la impresión/descarga (best-effort en el punto de uso).

export type ActivityLogPayload = {
  accion: "PRINT" | "EXPORT";
  recurso: string;              // "Registrados", "Morbilidad", "Panel de Estadísticas"…
  formato?: "PDF" | "Excel";
  refugio?: string;
  filtros?: string;             // resumen legible de los filtros aplicados
  total?: number;               // cantidad de filas incluidas
};

// Encola la acción y dispara un intento inmediato (si hay conexión).
export function logActivity(payload: ActivityLogPayload): void {
  try {
    void saveLog(payload)
      .then(() => { void syncActivityLogs(); })
      .catch(() => { /* best-effort */ });
  } catch {
    /* best-effort: nunca interrumpe la impresión/descarga */
  }
}

// Procesa la cola de logs pendientes (los que ya pasaron su backoff). Mismo
// criterio de error que la cola de registros. Reentrante-seguro con un flag.
let logSyncInFlight = false;
export async function syncActivityLogs(): Promise<void> {
  if (logSyncInFlight) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  logSyncInFlight = true;
  try {
    const pending = await getPendingLogs();
    for (const log of pending) {
      try {
        const res = await apiFetch("/api/activity-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(log.payload),
          timeoutMs: 12000,
        });
        if (res.ok) {
          await markLogSynced(log.id);
        } else if (res.status === 400 || res.status === 401 || res.status === 403) {
          // Rechazo definitivo: reintentar no ayuda.
          let reason = res.status === 401 ? "Sesión no válida"
            : res.status === 403 ? "Sin permiso" : "Datos inválidos";
          try { const d = await res.json(); if (d?.error) reason = String(d.error); } catch { /* noop */ }
          await markLogPermanentError(log.id, `HTTP ${res.status}: ${reason}`);
        } else {
          await incrementLogAttempt(log.id); // 5xx u otros → temporal (backoff)
        }
      } catch {
        await incrementLogAttempt(log.id);   // red / timeout / abort → temporal
      }
    }
  } finally {
    logSyncInFlight = false;
  }
}
