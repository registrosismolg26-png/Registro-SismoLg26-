// ── Utilidades puras compartidas ────────────────────────────────────────────

import type { Patologia, MedicamentoPredefinido, Medicamento } from "@/types";

// Normaliza texto para BÚSQUEDAS: minúsculas y SIN acentos/diacríticos, para que
// "patologia" encuentre "patología" y "nino" encuentre "niño". Úsalo tanto en la
// consulta como en el texto candidato antes de comparar con includes().
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ── Interpolación ID → nombre (modelo por-ID) ───────────────────────────────
// Los registros/consultas guardan SOLO ids del catálogo; el nombre se resuelve
// aquí para mostrar/exportar. Si el id no existe (ítem borrado del catálogo),
// se muestra "(no disponible)" — nunca un UUID crudo.

export function patologiaNombre(id: string, catalogo: Patologia[]): string {
  return catalogo.find(p => p.id === id)?.nombre ?? "(no disponible)";
}

// Lista de nombres de patologías a partir de sus ids (para resúmenes/CSV).
export function patologiaNombres(ids: string[] | undefined | null, catalogo: Patologia[]): string[] {
  return (Array.isArray(ids) ? ids : []).map(id => patologiaNombre(id, catalogo));
}

// Registro del catálogo para un ítem de medicamento (por su id).
export function medById(id: string, catalogo: MedicamentoPredefinido[]): MedicamentoPredefinido | undefined {
  return catalogo.find(m => m.id === id);
}

// Etiqueta de un medicamento en fila/receta: "NOMBRE - PRESENTACIÓN".
// (La concentración se muestra aparte, en la columna Dosis.)
export function medLabel(id: string, catalogo: MedicamentoPredefinido[]): string {
  const m = medById(id, catalogo);
  if (!m) return "(no disponible)";
  return [m.nombre, m.presentacion].map(s => (s || "").trim()).filter(Boolean).join(" - ");
}

// Concentración (dosis) de un medicamento por id — solo lectura, viene del catálogo.
export function medConcentracion(id: string, catalogo: MedicamentoPredefinido[]): string {
  return (medById(id, catalogo)?.concentracion || "").trim();
}

// Solo el nombre (principio activo) de un medicamento por id.
export function medNombre(id: string, catalogo: MedicamentoPredefinido[]): string {
  return medById(id, catalogo)?.nombre ?? "(no disponible)";
}

// Texto de una receta/lista de medicamentos { id, dosis, periodo } (para resúmenes/CSV).
export function medItemsText(items: Medicamento[] | undefined | null, catalogo: MedicamentoPredefinido[]): string {
  return (Array.isArray(items) ? items : [])
    .map(m => {
      const base = medLabel(m.id, catalogo);
      const extra = [m.dosis, m.periodo].map(s => (s || "").trim()).filter(Boolean).join(" ");
      return extra ? `${base} (${extra})` : base;
    })
    .join(", ");
}


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
