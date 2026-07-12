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
export const canManageUsers    = (role: string) => ["MASTER", "ADMIN", "AdminMedico"].includes(role);
export const canManageRooms    = (role: string) => ["MASTER", "ADMIN"].includes(role);
export const canManagePadron   = (role: string) => ["MASTER", "ADMIN"].includes(role);
export const canViewDashboard  = (role: string) => ["MASTER", "ADMIN", "VISUALIZADOR"].includes(role); // panel de estadísticas
export const canManageMorbilidad = (role: string) => ["MASTER", "AdminMedico", "OperadorMedico", "AsistenteMedico"].includes(role);
// Eliminar consultas médicas: SOLO AdminMedico y Master (Operador/Asistente no eliminan).
export const canDeleteConsulta = (role: string) => ["MASTER", "AdminMedico"].includes(role);
// ¿Rol médico? Solo ven Morbilidad (AdminMedico además ve Usuarios filtrado a médicos).
export const isMedico          = (role: string) => ["AdminMedico", "OperadorMedico", "AsistenteMedico"].includes(role);
// Catálogos médicos — CREAR/EDITAR: AdminMedico, OperadorMedico y Master.
export const canEditCatalogosMedicos = (role: string) => ["MASTER", "AdminMedico", "OperadorMedico"].includes(role);
// Catálogos médicos — ELIMINAR y superficie de administración: solo AdminMedico y Master.
export const canManageCatalogosMedicos = (role: string) => ["MASTER", "AdminMedico"].includes(role);
// Caracterización — POR AHORA todo el módulo (pestaña, fichas y catálogo) es SOLO Master.
// (Cuando se abra a más roles, ampliar aquí + en el gating de la pestaña y el POST.)
export const canManageCaracterizacion = (role: string) => ["MASTER"].includes(role);

/** ¿El usuario tiene un refugio válido asociado? (espejo de auth.ts hasRefugio). */
export const hasRefugio        = (refugio: string | null | undefined): boolean =>
  typeof refugio === "string" && refugio.trim().length > 0;

/** Roles que el actor puede asignar al crear/editar usuarios. Espejo EXACTO del
 *  backend (src/app/api/auth/users/route.ts → assignableRoles). Solo para poblar
 *  el selector de rol; el backend vuelve a validar. */
export function assignableRoles(role: string): string[] {
  if (isMaster(role)) return ["ADMIN", "REGISTRADOR", "VISUALIZADOR", "AdminMedico", "OperadorMedico", "AsistenteMedico"];
  if (role === "AdminMedico") return ["OperadorMedico", "AsistenteMedico"];
  return ["REGISTRADOR", "VISUALIZADOR"];
}

/** Roles a los que un emisor puede DIRIGIR un aviso. Distinto de `assignableRoles`
 *  (crear/asignar usuarios): aquí el Master SÍ puede incluir a los MASTER (avisar a
 *  otros Master y verse a sí mismo en la audiencia). El resto de emisores mantiene
 *  su ámbito. El backend revalida con esta misma función. */
export function avisoAudienceRoles(role: string): string[] {
  if (isMaster(role)) return ["MASTER", "ADMIN", "REGISTRADOR", "VISUALIZADOR", "AdminMedico", "OperadorMedico", "AsistenteMedico"];
  return assignableRoles(role);
}

/** Etiquetas legibles de cada rol para la UI. */
export const ROLE_LABELS: Record<string, string> = {
  MASTER: "Master",
  ADMIN: "Administrador",
  REGISTRADOR: "Registrador",
  VISUALIZADOR: "Visualizador",
  AdminMedico: "Admin Médico",
  OperadorMedico: "Operador Médico",
  AsistenteMedico: "Asistente Médico",
};

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
    return ["REGISTRADOR", "VISUALIZADOR", "AdminMedico", "OperadorMedico", "AsistenteMedico"].includes(targetRole) && targetRefugio === actorRefugio;
  }
  return false;
}
