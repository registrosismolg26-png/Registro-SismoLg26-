// ── Utilidades puras compartidas ────────────────────────────────────────────

import type { Patologia, MedicamentoPredefinido, Medicamento, TipoLesion, CaracterizacionOpcion } from "@/types";

// Normaliza texto para BÚSQUEDAS: minúsculas y SIN acentos/diacríticos, para que
// "patologia" encuentre "patología" y "nino" encuentre "niño". Úsalo tanto en la
// consulta como en el texto candidato antes de comparar con includes().
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ── Representante de un hijo/dependiente (INFORMATIVO, NO se persiste) ───────
// Un hijo/dependiente se guarda con la cédula del representante + un correlativo:
// "<nac>-<dígitos>-<n>" (ej. "V-12345678-1"). Dada la cédula BASE (los dígitos del
// representante) devuelve el nombre del representante buscándolo en el censo. Es
// solo para mostrar al registrar / editar / ver el detalle; nunca se almacena.
export function findRepresentante(
  cedulaBase: string | null | undefined,
  registros: Array<{ id?: string; cedula?: string | null; nombreApellido?: string | null }>,
  excludeId?: string,
): string | null {
  const digits = String(cedulaBase ?? "").replace(/\D/g, "");
  if (digits.length < 6) return null;
  // Una cédula de dependiente tiene sufijo "-n"; el representante NUNCA es otro
  // dependiente, así que se descartan esos registros.
  const esDependiente = (c: string) => /^\s*[VE]?-?\d+-\d+\s*$/i.test(String(c ?? "").trim());
  const rep = registros.find((r) => {
    if (excludeId && r.id === excludeId) return false;
    const c = r.cedula ?? "";
    return !esDependiente(c) && c.replace(/\D/g, "") === digits;
  });
  return rep?.nombreApellido || null;
}

// Cédula "de familia" para COMPARAR/AGRUPAR familias: SOLO los dígitos base, sin prefijo
// (V-/E-) ni sufijo de dependiente (-N). Así "V-26597356", "26597356" y "V-26597356-1"
// comparan igual → "26597356". Úsala siempre que asocies familias por cédula.
export function cedulaFamilia(cedula: string | null | undefined): string {
  const t = String(cedula ?? "").trim();
  const m = t.match(/^\s*[VE]?-?(\d+)(?:-\d+)?\s*$/i);
  if (m) return m[1];
  const d = t.match(/\d+/);
  return d ? d[0] : "";
}

// ── Interpolación ID → nombre (modelo por-ID) ───────────────────────────────
// Los registros/consultas guardan SOLO ids del catálogo; el nombre se resuelve
// aquí para mostrar/exportar. Si el id no existe (ítem borrado del catálogo),
// se muestra "(no disponible)" — nunca un UUID crudo.

export function patologiaNombre(id: string, catalogo: Patologia[]): string {
  return catalogo.find(p => p.id === id)?.nombre ?? "(no disponible)";
}

// Nombre del tipo de lesión a partir de su id (catálogo TipoLesion).
export function tipoLesionNombre(id: string, catalogo: TipoLesion[]): string {
  return catalogo.find(t => t.id === id)?.nombre ?? "(no disponible)";
}

// Lista de nombres de patologías a partir de sus ids (para resúmenes/CSV).
export function patologiaNombres(ids: string[] | undefined | null, catalogo: Patologia[]): string[] {
  return (Array.isArray(ids) ? ids : []).map(id => patologiaNombre(id, catalogo));
}

// ── Caracterización: catálogo general (una tabla, filtrado por módulo/campo) ──
// Opciones ACTIVAS de una lista concreta (ordenadas), para poblar un select.
export function opcionesDe(
  opciones: CaracterizacionOpcion[], modulo: string, campo: string
): CaracterizacionOpcion[] {
  return (opciones || [])
    .filter(o => o.activo && o.modulo === modulo && o.campo === campo)
    .sort((a, b) => a.orden - b.orden || a.valor.localeCompare(b.valor));
}

// Etiqueta (valor) de una opción por su id. Vacío → ""; id inexistente → "(no disponible)".
export function opcionLabel(id: string | null | undefined, opciones: CaracterizacionOpcion[]): string {
  if (!id) return "";
  return (opciones || []).find(o => o.id === id)?.valor ?? "(no disponible)";
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

// Separador de miles (es-VE): 1862 → "1.862". Fuente única para Estadísticas,
// reporte público y presentación, para que TODO dato numérico se vea igual.
export const fmtMil = (n: number | null | undefined): string =>
  Number(n ?? 0).toLocaleString("es-VE");

// Comparador NATURAL/alfanumérico para nombres de cuartos: "Piso 2" va antes que
// "Piso 10" (numeric:true), insensible a mayúsculas/acentos. Fuente única para
// ordenar habitaciones/salones en el dashboard, el selector y el PDF de presentes.
export function compareCuarto(a?: string | null, b?: string | null): number {
  return String(a ?? "").localeCompare(String(b ?? ""), "es", { numeric: true, sensitivity: "base" });
}
