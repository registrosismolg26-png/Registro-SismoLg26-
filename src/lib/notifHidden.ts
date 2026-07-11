// ── Descartar / Posponer notificaciones (100% cliente) ───────────────────────
// El deslizamiento para quitar (descartar) o posponer (snooze) se guarda SOLO en
// localStorage: funciona OFFLINE y no genera NADA de egress. Es un filtro de vista,
// no toca el servidor. Estructura: { [id]: hastaMs } donde 0 = descartada para
// siempre y >0 = pospuesta hasta ese instante (reaparece al vencer).

const KEY = "notif_hidden";
export const SNOOZE_MS = 3 * 60 * 60 * 1000; // posponer = ocultar 3 horas

type HiddenMap = Record<string, number>;

export function loadHidden(): HiddenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    const map: HiddenMap = raw ? JSON.parse(raw) : {};
    // Poda de pospuestas vencidas para que no crezca sin límite.
    const now = Date.now();
    let changed = false;
    for (const k of Object.keys(map)) {
      if (map[k] !== 0 && map[k] <= now) { delete map[k]; changed = true; }
    }
    if (changed) localStorage.setItem(KEY, JSON.stringify(map));
    return map;
  } catch { return {}; }
}

function persist(map: HiddenMap) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* almacenamiento lleno: no rompe */ }
}

/** ¿Está oculta AHORA? (descartada, o pospuesta y aún sin vencer) */
export function isHiddenNow(map: HiddenMap, id: string): boolean {
  const v = map[id];
  if (v === undefined) return false;
  return v === 0 || v > Date.now();
}

/** Descartar (para siempre) o posponer (hasta +SNOOZE_MS). Devuelve el mapa nuevo. */
export function hideNotif(map: HiddenMap, id: string, mode: "dismiss" | "snooze"): HiddenMap {
  const next = { ...map, [id]: mode === "dismiss" ? 0 : Date.now() + SNOOZE_MS };
  persist(next);
  return next;
}
