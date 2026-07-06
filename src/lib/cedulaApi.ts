// ── Consulta de identidad por la API externa (proxy /api/cedula-lookup) ─────
// Tercera fuente tras el censo y el padrón local. SOLO online: devuelve null si
// no hay internet, el servicio no está configurado, no se halló o hubo error.
// La normalización (nombre APELLIDOS+NOMBRES, género si viene, fecha yyyy-mm-dd)
// la hace el backend; aquí solo se consume.

import { apiFetch } from "@/lib/apiFetch";

export interface CedulaExterna {
  nombreApellido: string;
  genero: string;          // "FEMENINO" | "MASCULINO" | "" (si la API no lo trae)
  fechaNacimiento: string; // "yyyy-mm-dd" | ""
}

export async function fetchCedulaExterna(nacionalidad: string, cedula: string): Promise<CedulaExterna | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  const digits = (cedula || "").replace(/\D/g, "");
  if (digits.length < 5) return null;
  const nac = (nacionalidad || "V").toUpperCase() === "E" ? "E" : "V";
  try {
    const res = await apiFetch(`/api/cedula-lookup?nacionalidad=${nac}&cedula=${digits}`);
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    if (!d || !d.found) return null;
    return {
      nombreApellido: d.nombreApellido || "",
      genero: d.genero || "",
      fechaNacimiento: d.fechaNacimiento || "",
    };
  } catch {
    return null;
  }
}
