// ── Ítems de navegación compartidos ─────────────────────────────────────────
// Fuente única de verdad de las pestañas (etiqueta, icono y gating por rol) para que
// la cabecera (AppHeader, móvil) y el sidebar (AppSidebar, escritorio) no se
// desincronicen. El gating espeja EXACTAMENTE el de AppHeader.

import type { ReactNode } from "react";
import type { ActiveTab } from "@/types";
import {
  canManageUsers,
  canViewDashboard,
  isMedico,
  canManageMorbilidad,
  canRegister,
  isMaster,
} from "@/lib/permissions";

export interface NavItem {
  tab?: ActiveTab; // id de activeTab (undefined si es un enlace externo)
  href?: string; // ruta (p. ej. /buscar) en lugar de cambiar de pestaña
  label: string;
  icon: ReactNode;
  show: (role: string) => boolean;
}

const sv = (children: ReactNode) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

export const NAV_ITEMS: NavItem[] = [
  {
    tab: "censo",
    label: "Registrar",
    show: (r) => canRegister(r),
    icon: sv(
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>,
    ),
  },
  {
    tab: "dashboard",
    label: "Estadísticas",
    show: (r) => canViewDashboard(r),
    icon: sv(
      <>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </>,
    ),
  },
  {
    tab: "asignaciones",
    label: "Registrados",
    show: (r) => !isMedico(r),
    icon: sv(
      <>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>,
    ),
  },
  {
    tab: "caracterizacion",
    label: "Caracterización",
    show: (r) => isMaster(r),
    icon: sv(
      <>
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="M9 12h6" />
        <path d="M9 16h6" />
        <path d="M9 8h2" />
      </>,
    ),
  },
  {
    tab: "monitoreo",
    label: "Monitoreo",
    show: (r) => isMaster(r),
    icon: sv(
      <>
        <path d="M3 3v18h18" />
        <path d="M18 9l-5 5-3-3-4 4" />
      </>,
    ),
  },
  {
    tab: "mapa",
    label: "Mapa de calor",
    show: (r) => isMaster(r),
    icon: sv(
      <>
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </>,
    ),
  },
  {
    tab: "morbilidad",
    label: "Morbilidad",
    show: (r) => canManageMorbilidad(r),
    icon: sv(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />),
  },
  {
    tab: "balance",
    label: "Balance",
    show: (r) => canManageMorbilidad(r),
    icon: sv(
      <>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </>,
    ),
  },
  {
    tab: "historial",
    label: "Historial",
    show: (r) => canManageMorbilidad(r),
    icon: sv(
      <>
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="M8 14h2l1-2 2 4 1-2h2" />
      </>,
    ),
  },
  {
    tab: "usuarios",
    label: "Usuarios",
    show: (r) => canManageUsers(r),
    icon: sv(
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>,
    ),
  },
  {
    tab: "config",
    label: "Configuración",
    show: (r) => !isMedico(r) && r !== "VISUALIZADOR",
    icon: sv(
      <>
       <path d="M11 10.27 7 3.34"/><path d="m11 13.73-4 6.93"/><path d="M12 22v-2"/><path d="M12 2v2"/><path d="M14 12h8"/><path d="m17 20.66-1-1.73"/><path d="m17 3.34-1 1.73"/><path d="M2 12h2"/><path d="m20.66 17-1.73-1"/><path d="m20.66 7-1.73 1"/><path d="m3.34 17 1.73-1"/><path d="m3.34 7 1.73 1"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="8"/>
      </>,
    ),
  },
  {
    href: "/buscar",
    label: "Buscar",
    show: (r) => !isMedico(r),
    icon: sv(
      <>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </>,
    ),
  },
];
