// ── Escritura tolerante a cuota en localStorage ─────────────────────────────
// Los caches del cliente (registros/stats/consultas/catálogos/directorio Renace…) son
// OPCIONALES: aceleran, pero la app funciona sin ellos. Cuando localStorage se llena,
// `setItem` lanza QuotaExceededError; si no se atrapa, Next lo pinta como error y el
// cache se pierde. `safeSetItem` degrada con gracia: ante la cuota, PURGA los caches
// re-descargables (menos el que se escribe) y reintenta UNA vez; si aún falla, calla.

// Prefijos de claves que son caches re-descargables (seguras de purgar para hacer sitio).
const EVICTABLE_PREFIXES = ["cached_", "sismo_cached_", "renace_jm_v1", "renace_plan_v1", "renace_estado_v1"];

export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // Cuota (o storage no disponible). Intenta liberar espacio y reintentar una vez.
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k !== key && EVICTABLE_PREFIXES.some((p) => k.startsWith(p))) toRemove.push(k);
      }
      for (const k of toRemove) localStorage.removeItem(k);
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false; // sin sitio o sin storage → el cache es opcional, se omite
    }
  }
}
