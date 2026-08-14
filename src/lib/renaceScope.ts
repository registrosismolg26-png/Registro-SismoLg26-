// ── Alcance por refugio para VZLA RENACE ────────────────────────────────────
// Los datos Renace se scopean por `refugioId` (uuid del Refugio, estable — no por
// nombre, igual que Comunidad.refugioId). auth.ts entrega el NOMBRE del refugio del
// usuario; aquí se resuelve a su ID y se arma el filtro/destino según el rol.

import { prisma } from "@/lib/prisma";
import { type AuthUser, isMaster, refugioScopeFor } from "@/lib/auth";

/** Resuelve el refugioId (uuid) desde el NOMBRE del refugio. Null si no existe. */
export async function refugioIdByName(nombre: string | null | undefined): Promise<string | null> {
  const n = String(nombre ?? "").trim();
  if (!n) return null;
  const r = await prisma.refugio.findUnique({ where: { nombre: n }, select: { id: true } });
  return r?.id ?? null;
}

/**
 * Filtro de LECTURA (list): no-master → SIEMPRE su refugio; Master → el `?refugio=`
 * pedido, o TODOS si no manda ninguno. Devuelve un `where` por refugioId (o {} = todos,
 * solo Master). `key` es un sello estable del alcance para el ETag.
 */
export async function renaceReadScope(
  auth: AuthUser,
  requested: string | null,
): Promise<{ where: { refugioId?: string }; key: string }> {
  const scope = refugioScopeFor(auth, requested); // { refugio?: name }
  if (!scope.refugio) return { where: {}, key: "all" }; // Master sin filtro → todos
  const id = await refugioIdByName(scope.refugio);
  return { where: { refugioId: id ?? "__none__" }, key: id ?? "none" };
}

/**
 * Refugio DESTINO para ESCRITURA (import / planteamiento): no-master → su refugio
 * (ignora al cliente); Master → el refugio indicado (obligatorio). Devuelve el id y
 * el nombre, o id=null si no se puede determinar (p. ej. Master sin campamento).
 */
export async function renaceWriteRefugio(
  auth: AuthUser,
  requested: string | null,
): Promise<{ refugioId: string | null; refugioName: string | null }> {
  const name = isMaster(auth) ? (requested?.trim() || null) : auth.refugio;
  if (!name) return { refugioId: null, refugioName: null };
  const id = await refugioIdByName(name);
  return { refugioId: id, refugioName: name };
}
