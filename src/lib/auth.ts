// ── Autorización del servidor (scoping por refugio) ─────────────────────────
// Regla de oro: el servidor NUNCA confía en el rol/refugio que envía el cliente.
// Recibe un userId (header `x-user-id` o query/body `userId`), busca al usuario
// REAL en la BD y deriva su rol y refugio de ahí. Todas las guardas usan eso.

import { prisma } from "@/lib/prisma";


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
// Gestión de usuarios: Admin (censo, su refugio), AdminMedico (solo médicos, su refugio) y Master.
export const canManageUsers    = (u: AuthUser) => ["MASTER", "ADMIN", "AdminMedico"].includes(u.role);
export const canManageRooms    = (u: AuthUser) => ["MASTER", "ADMIN"].includes(u.role);
export const canManagePadron   = (u: AuthUser) => ["MASTER", "ADMIN"].includes(u.role);
// VZLA RENACE: ver/planear = operadores del refugio (scoped por refugioId); IMPORTAR el
// Excel al campamento seleccionado (op. masiva) = SOLO Master. Espejo en permissions.ts.
export const canImportRenace   = (u: AuthUser) => u.role === "MASTER";
// VZLA RENACE: descargar el Directorio a Excel = MASTER/ADMIN (NO Registrador/RENACE/Master Renace).
export const canExportRenace   = (u: AuthUser) => ["MASTER", "ADMIN"].includes(u.role);
// VZLA RENACE: editar datos de jefe/miembro = MASTER/ADMIN/REGISTRADOR (scoped por refugio).
export const canEditRenace     = (u: AuthUser) => ["MASTER", "ADMIN", "REGISTRADOR"].includes(u.role);
// Morbilidad: registrar consultas médicas.
export const canManageMorbilidad = (u: AuthUser) => ["MASTER", "AdminMedico", "OperadorMedico", "AsistenteMedico"].includes(u.role);
// Eliminar consultas médicas: SOLO AdminMedico y Master (Operador/Asistente no eliminan).
export const canDeleteConsulta = (u: AuthUser) => ["MASTER", "AdminMedico"].includes(u.role);
// ¿Es un rol médico? (solo ven Morbilidad; AdminMedico además ve Usuarios filtrado a médicos).
export const isMedico = (u: AuthUser) => ["AdminMedico", "OperadorMedico", "AsistenteMedico"].includes(u.role);
// Rol EXCLUSIVO de VZLA RENACE: solo ese módulo + su Config de perfil.
export const isRenace = (u: AuthUser) => u.role === "RENACE";
// Rol EXCLUSIVO "Master Renace": solo el módulo VZLA RENACE y ahí SOLO las Gráficas
// (dashboard global). No ve el Directorio ni otros módulos; no importa ni edita.
export const isRenaceMaster = (u: AuthUser) => u.role === "RENACE_MASTER";
// ¿Puede VER las Gráficas agregadas del módulo? Master global + Master Renace.
export const canViewRenaceGraficas = (u: AuthUser) => isMaster(u) || isRenaceMaster(u);
// ¿Puede USAR el módulo VZLA RENACE? Lado censo SIN visualizador + los roles RENACE y RENACE_MASTER.
export const canUseRenace = (u: AuthUser) => ["MASTER", "ADMIN", "REGISTRADOR", "RENACE", "RENACE_MASTER"].includes(u.role);
// Catálogos médicos — CREAR/EDITAR (renombrar): AdminMedico, OperadorMedico y Master.
export const canEditCatalogosMedicos = (u: AuthUser) => ["MASTER", "AdminMedico", "OperadorMedico"].includes(u.role);
// Catálogos médicos — ELIMINAR y superficie de administración: solo AdminMedico y Master
// (OperadorMedico crea/edita pero NO elimina).
export const canManageCatalogosMedicos = (u: AuthUser) => ["MASTER", "AdminMedico"].includes(u.role);
// Caracterización — POR AHORA todo el módulo (pestaña, fichas y catálogo) es SOLO Master.
// (Cuando se abra a más roles, ampliar aquí + en el gating de la pestaña y el POST.)
export const canManageCaracterizacion = (u: AuthUser) => ["MASTER"].includes(u.role);

/** ¿Puede el usuario actuar sobre datos de este refugio? Master: cualquiera. */
export const canActOnRefugio = (u: AuthUser, refugio: string) =>
  isMaster(u) || u.refugio === refugio;

/** ¿Puede el actor GESTIONAR (crear/editar/borrar) a este usuario objetivo?
 *  - A un MASTER no lo toca nadie desde la app (se gestionan por SQL).
 *  - Master: cualquier usuario que no sea Master (incluye crear/editar AdminMedico).
 *  - Admin (censo): solo Registrador/Visualizador de su propio refugio.
 *  - AdminMedico: solo OperadorMedico/AsistenteMedico de su propio refugio (NO otro
 *    AdminMedico: crear/editar AdminMedico es exclusivo de Master). */
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
  if (actor.role === "AdminMedico") {
    return ["OperadorMedico", "AsistenteMedico"].includes(target.role)
      && target.campamentoTransitorio === actor.refugio;
  }
  return false;
}


/** Filtro de refugio respetando el "refugio de vista" que Master envía por
 *  ?refugio: Master → ese refugio (o TODOS si no lo manda); el resto → siempre
 *  su refugio (ignora el parámetro, no puede espiar otros refugios). */
export function refugioScopeFor(u: AuthUser, requested?: string | null): { refugio?: string } {
  if (isMaster(u)) return requested ? { refugio: requested } : {};
  return { refugio: u.refugio };
}

/** ¿Hay un refugio válido asociado? (no null/undefined/vacío). Guarda para no
 *  crear registros ni usuarios "huérfanos" sin refugio. */
export function hasRefugio(refugio: string | null | undefined): boolean {
  return typeof refugio === "string" && refugio.trim().length > 0;
}
