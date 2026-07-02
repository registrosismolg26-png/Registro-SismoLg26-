// ── Capacidades por rol (lado cliente) ──────────────────────────────────────
// Espejo de la matriz del servidor (src/lib/auth.ts). SOLO para gating de UX:
// mostrar/ocultar acciones según el rol. El backend es la fuente de verdad y
// bloquea de verdad; aquí solo evitamos ofrecer botones que el back rechazaría.
//
// Reciben el `role` como string (el rol del usuario autenticado del contexto).
// Roles: MASTER, ADMIN, REGISTRADOR, VISUALIZADOR.

export const isMaster          = (role: string) => role === "MASTER";
export const canRegister       = (role: string) => ["MASTER", "ADMIN", "REGISTRADOR"].includes(role); // crear/editar censo
export const canDeleteRegistro = (role: string) => ["MASTER", "ADMIN"].includes(role);
export const canManageUsers    = (role: string) => ["MASTER", "ADMIN"].includes(role);
export const canManageRooms    = (role: string) => ["MASTER", "ADMIN"].includes(role);
export const canManagePadron   = (role: string) => ["MASTER", "ADMIN"].includes(role);
export const canViewDashboard  = (role: string) => ["MASTER", "ADMIN", "VISUALIZADOR"].includes(role); // panel de estadísticas

/** ¿Puede el actor editar/borrar a este usuario objetivo? Espejo del back.
 *  - A un MASTER no lo toca nadie desde la app.
 *  - Master: cualquier no-master. Admin: solo Registrador/Visualizador de su refugio. */
export function canManageTargetUser(
  actorRole: string, actorRefugio: string,
  targetRole: string, targetRefugio: string
): boolean {
  if (targetRole === "MASTER") return false;
  if (isMaster(actorRole)) return true;
  if (actorRole === "ADMIN") {
    return ["REGISTRADOR", "VISUALIZADOR"].includes(targetRole) && targetRefugio === actorRefugio;
  }
  return false;
}
