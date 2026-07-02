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

// ── Cache de sesión en memoria (mejora G) ───────────────────────────────────
// Evita un `findUnique` a la BD en CADA request. TTL corto para que un cambio de
// rol/refugio se refleje pronto; además se invalida explícitamente al editar o
// borrar un usuario (ver invalidateSession). Nota: en despliegues serverless el
// cache es por-instancia (efímero), pero sigue ahorrando queries en instancias
// calientes; en un server persistente es un cache de proceso.
const SESSION_TTL_MS = 30_000;
const sessionCache = new Map<string, { user: AuthUser; expires: number }>();

/** Invalida el cache de sesión de un usuario (llamar tras editar/borrar). */
export function invalidateSession(userId: string): void {
  sessionCache.delete(userId);
}

/** Carga el usuario real desde la BD (con cache corto). Null si no existe. */
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const userId = getUserId(req);
  if (!userId) return null;

  const now = Date.now();
  const cached = sessionCache.get(userId);
  if (cached && cached.expires > now) return cached.user;

  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) {
    sessionCache.delete(userId);
    return null;
  }
  const user: AuthUser = {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    role: u.role,
    refugio: u.campamentoTransitorio,
  };
  sessionCache.set(userId, { user, expires: now + SESSION_TTL_MS });
  return user;
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

/** ¿Puede el actor GESTIONAR (editar/borrar) a este usuario objetivo?
 *  - A un MASTER no lo toca nadie desde la app (se gestionan por SQL).
 *  - Master: cualquier usuario que no sea Master.
 *  - Admin: solo Registrador/Visualizador de su propio refugio (no Admin ni Master). */
export function canManageTargetUser(
  actor: AuthUser,
  target: { role: string; campamentoTransitorio: string }
): boolean {
  if (target.role === "MASTER") return false;
  if (isMaster(actor)) return true;
  if (actor.role === "ADMIN") {
    return ["REGISTRADOR", "VISUALIZADOR"].includes(target.role)
      && target.campamentoTransitorio === actor.refugio;
  }
  return false;
}

/** Filtro Prisma de refugio para lecturas: Master ve todo; el resto solo el suyo. */
export function refugioScope(u: AuthUser): { refugio?: string } {
  return isMaster(u) ? {} : { refugio: u.refugio };
}
