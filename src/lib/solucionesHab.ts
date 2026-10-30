import { SOLUCIONES_HABITACIONALES, SOLUCIONES_HAB_LEGACY } from "@/lib/constants";

// Solución habitacional MULTI (Registro.solucionesHabitacionales, JSONB). Puro: lo usan el
// servidor (/api/register), el censo, Registrados y los Excel, también sin red.

const up = (x: unknown): string => String(x ?? "").replace(/\s+/g, " ").trim().toUpperCase();

/**
 * Normaliza a la lista canónica: acepta array o un valor único (clientes viejos), pasa los
 * valores del campo anterior por el mapa legado, descarta lo que no sea una opción vigente y
 * deduplica en el ORDEN del catálogo.
 */
export function normalizeSoluciones(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : v === null || v === undefined ? [] : [v];
  const set = new Set<string>();
  for (const item of raw) {
    const k = up(item);
    const mapped = SOLUCIONES_HAB_LEGACY[k] ?? k;
    if ((SOLUCIONES_HABITACIONALES as readonly string[]).includes(mapped)) set.add(mapped);
  }
  return SOLUCIONES_HABITACIONALES.filter((s) => set.has(s));
}

/** Soluciones de un registro: la lista nueva; si está vacía, el campo único anterior (respaldo). */
export function solucionesDe(reg?: { solucionesHabitacionales?: unknown; solucionHabitacional?: unknown } | null): string[] {
  if (!reg) return [];
  const arr = normalizeSoluciones(reg.solucionesHabitacionales);
  return arr.length ? arr : normalizeSoluciones(reg.solucionHabitacional);
}

export const solucionesTexto = (reg?: Parameters<typeof solucionesDe>[0], sep = ", "): string =>
  solucionesDe(reg).join(sep);
