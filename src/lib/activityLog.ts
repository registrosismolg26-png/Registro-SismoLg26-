import { apiFetch } from "@/lib/apiFetch";

// Registra (best-effort) una acción de usuario —imprimir PDF / exportar Excel— en
// los logs (tabla AuditLog, vía /api/activity-log). NUNCA lanza ni bloquea la
// acción principal: si falla (sin conexión, error del servidor), simplemente se
// omite el log. Se llama justo antes/después de imprimir o descargar.
export function logActivity(payload: {
  accion: "PRINT" | "EXPORT";
  recurso: string;              // p. ej. "Registrados", "Morbilidad", "Panel de Estadísticas"
  formato?: "PDF" | "Excel";
  refugio?: string;
  filtros?: string;             // resumen legible de los filtros aplicados
  total?: number;               // cantidad de filas incluidas
}): void {
  try {
    void apiFetch("/api/activity-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => { /* best-effort */ });
  } catch {
    /* best-effort: nunca interrumpe la impresión/descarga */
  }
}
