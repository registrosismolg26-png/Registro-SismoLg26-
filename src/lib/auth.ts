// ── Autorización del servidor (scoping por refugio) ─────────────────────────
// Regla de oro: el servidor NUNCA confía en el rol/refugio que envía el cliente.
// Recibe un userId (header `x-user-id` o query/body `userId`), busca al usuario
// REAL en la BD y deriva su rol y refugio de ahí. Todas las guardas usan eso.

import { prisma } from "@/lib/prisma";

export type Role = "MASTER" | "ADMIN" | "REGISTRADOR" | "VISUALIZADOR";

export interface AuthUser {
  id: string;
  email: string;
  nombre: string;
  role: string;
  refugio: string; // proviene de User.campamentoTransitorio
}

/** Extrae el userId de la petición: header `x-user-id` primero, luego `?userId=`. */
export function getUserId(req: Request): string | null {
  const header = req.headers.get("x-user-id");
  if (header) return header;
  try {
    return new URL(req.url).searchParams.get("userId");
  } catch {
    return null;
  }
}

/** Carga el usuario real desde la BD. Devuelve null si no existe o no hay id. */
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const userId = getUserId(req);
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    role: u.role,
    refugio: u.campamentoTransitorio,
  };
}

// ── Capacidades por rol (matriz acordada) ───────────────────────────────────
export const isMaster          = (u: AuthUser) => u.role === "MASTER";
export const canRegister       = (u: AuthUser) => ["MASTER", "ADMIN", "REGISTRADOR"].includes(u.role); // crear/editar censo
export const canDeleteRegistro = (u: AuthUser) => ["MASTER", "ADMIN"].includes(u.role);
export const canManageUsers    = (u: AuthUser) => ["MASTER", "ADMIN"].includes(u.role);
export const canManageRooms    = (u: AuthUser) => ["MASTER", "ADMIN"].includes(u.role);
export const canManagePadron   = (u: AuthUser) => ["MASTER", "ADMIN"].includes(u.role);

/** ¿Puede el usuario actuar sobre datos de este refugio? Master: cualquiera. */
export const canActOnRefugio = (u: AuthUser, refugio: string) =>
  isMaster(u) || u.refugio === refugio;

/** Filtro Prisma de refugio para lecturas: Master ve todo; el resto solo el suyo. */
export function refugioScope(u: AuthUser): { refugio?: string } {
  return isMaster(u) ? {} : { refugio: u.refugio };
}
