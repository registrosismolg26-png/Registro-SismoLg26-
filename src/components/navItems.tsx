// ── Ítems de navegación compartidos ─────────────────────────────────────────
// Fuente única de verdad de las pestañas (etiqueta, icono y gating por rol) para que
// la cabecera (AppHeader, móvil) y el sidebar (AppSidebar, escritorio) no se
// desincronicen. El gating espeja EXACTAMENTE el de AppHeader.

import type { ReactNode } from "react";
import type { ActiveTab } from "@/types";
import { canManageUsers, canViewDashboard, isMedico, canManageMorbilidad, canRegister } from "@/lib/permissions";

export interface NavItem {
  tab?: ActiveTab;  // id de activeTab (undefined si es un enlace externo)
  href?: string;  // ruta (p. ej. /buscar) en lugar de cambiar de pestaña
  label: string;
  icon: ReactNode;
  show: (role: string) => boolean;
}

const sv = (children: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

export const NAV_ITEMS: NavItem[] = [
  { tab: "censo", label: "Registrar", show: (r) => canRegister(r),
    icon: sv(<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>) },
  { tab: "dashboard", label: "Estadísticas", show: (r) => canViewDashboard(r),
    icon: sv(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>) },
  { tab: "asignaciones", label: "Registrados", show: (r) => !isMedico(r),
    icon: sv(<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>) },
  { tab: "caracterizacion", label: "Caracterización", show: (r) => canRegister(r),
    icon: sv(<><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12h6" /><path d="M9 16h6" /><path d="M9 8h2" /></>) },
  { tab: "morbilidad", label: "Morbilidad", show: (r) => canManageMorbilidad(r),
    icon: sv(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />) },
  { tab: "balance", label: "Balance", show: (r) => canManageMorbilidad(r),
    icon: sv(<><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>) },
  { tab: "historial", label: "Historial", show: (r) => canManageMorbilidad(r),
    icon: sv(<><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M8 14h2l1-2 2 4 1-2h2" /></>) },
  { tab: "usuarios", label: "Usuarios", show: (r) => canManageUsers(r),
    icon: sv(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>) },
  { tab: "config", label: "Configuración", show: (r) => !isMedico(r) && r !== "VISUALIZADOR",
    icon: sv(<><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M17.66 17.66l-1.41-1.41M6.34 17.66l1.41-1.41" /></>) },
  { href: "/buscar", label: "Buscar", show: (r) => !isMedico(r),
    icon: sv(<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>) },
];
