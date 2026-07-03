// ── Utilidades puras compartidas ────────────────────────────────────────────

// Hash SHA-256 en cliente para autenticación offline de respaldo
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Formatea el nombre de una habitación para mostrar (Edif. / Salón)
export const formatRoomLabel = (room: string) => {
  return room
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .replace("Edificio", "Edif.")
    .replace("Salon", "Salón");
};

// Capacidad por defecto de camas de un salón (cuando no se ha configurado)
export const DEFAULT_ROOM_CAPACITY = 18;

// Nivel de ocupación de un salón según ocupantes vs. capacidad de camas.
// Proporcional a la capacidad real (no umbrales fijos): usa el % de ocupación,
// con alerta temprana para que el color avise ANTES de que el salón se llene.
// Se usa en el select de asignación, el censo y las tarjetas del dashboard.
export function roomFillLevel(count: number, capacity: number): "green" | "yellow" | "red" {
  const cap = capacity > 0 ? capacity : DEFAULT_ROOM_CAPACITY;
  const ratio = count / cap;
  if (ratio >= 0.9) return "red";      // 90%+  → lleno o casi lleno
  if (ratio >= 0.7) return "yellow";   // 70–89% → llenándose
  return "green";                       // < 70% → espacio disponible
}
