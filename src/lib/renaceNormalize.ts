// ── Normalización compartida de campos de VZLA RENACE ───────────────────────
// ÚNICA fuente para el import Y la edición (jefe/miembro), así un dato queda IGUAL
// sin importar por dónde entró:
//   · cédula → SOLO DÍGITOS (sin espacios, guiones, puntos ni letras V/E).
//   · fechaNacimiento → dd/mm/yyyy con reparación INTELIGENTE (unifica separadores,
//     colapsa dobles barras, separa mes+año pegados, corrige mm/dd, año de 2 dígitos
//     con pivote ≤25→20xx). Lo que no sea fecha válida/recuperable → null.

export const normCedula = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

export function normFechaNacimiento(v: unknown): string | null {
  const s = String(v ?? "").trim().replace(/[.\-]/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  if (!s) return null;
  const parts = s.split("/");
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  let d = 0, mo = 0, yStr = "";
  if (parts.length === 3) {
    if (parts[0].length === 4) { yStr = parts[0]; mo = +parts[1]; d = +parts[2]; } // yyyy/m/d
    else { d = +parts[0]; mo = +parts[1]; yStr = parts[2]; }                        // d/m/yyyy
  } else if (parts.length === 2 && parts[0].length <= 2 && parts[1].length >= 5 && parts[1].length <= 6) {
    d = +parts[0]; yStr = parts[1].slice(-4); mo = +parts[1].slice(0, -4);          // día / (mes+año pegados)
  } else return null;
  let y = 0;
  if (yStr.length === 2) { const yy = +yStr; y = yy <= 25 ? 2000 + yy : 1900 + yy; }
  else if (yStr.length === 4) { y = +yStr; }
  else return null;
  if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; } // mm/dd → intercambiar
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900 || y > 2100) return null;
  return `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}`;
}
