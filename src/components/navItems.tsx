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
  isRenace,
  canUseRenace,
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
     <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>
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
    show: (r) => !isMedico(r) && !isRenace(r),
    icon: sv(
      <>
<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>
      </>,
    ),
  },
  {
    tab: "caracterizacion",
    label: "Caracterización",
    show: (r) => isMaster(r),
    icon: sv(
      <>
<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>
      </>,
    ),
  },
  {
    tab: "monitoreo",
    label: "Monitoreo",
    show: (r) => isMaster(r),
    icon: sv(
      <>
        <path d="m9 10 2 2 4-4" />
        <rect width="20" height="14" x="2" y="3" rx="2" />
        <path d="M12 17v4" />
        <path d="M8 21h8" />
      </>,
    ),
  },
  {
    tab: "mapa",
    label: "Mapa de calor",
    show: (r) => isMaster(r),
    icon: sv(
      <>
<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>
      </>,
    ),
  },
  {
    // VZLA RENACE (Venezuela Renace): módulo INDEPENDIENTE del censo. Lo ven MASTER,
    // ADMIN, REGISTRADOR y el rol EXCLUSIVO RENACE (NO médicos ni VISUALIZADOR).
    // "Importar Excel" queda gateado DENTRO de la pestaña a Master (canImportRenace).
    tab: "vzlarenace",
    label: "VZLA Renace",
    show: (r) => canUseRenace(r),
    icon: sv(
      <>
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
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
    // TODOS los usuarios ven Config para su PERFIL de operador (editar cuenta, vincular
    // Telegram, activar notificaciones). Las secciones de administración (padrón, salones,
    // refugios) van gateadas dentro de ConfigTab, así que cada rol solo ve lo que le toca.
    label: "Configuración",
    show: () => true,
    icon: sv(
      <>
        <path d="M11 10.27 7 3.34" />
        <path d="m11 13.73-4 6.93" />
        <path d="M12 22v-2" />
        <path d="M12 2v2" />
        <path d="M14 12h8" />
        <path d="m17 20.66-1-1.73" />
        <path d="m17 3.34-1 1.73" />
        <path d="M2 12h2" />
        <path d="m20.66 17-1.73-1" />
        <path d="m20.66 7-1.73 1" />
        <path d="m3.34 17 1.73-1" />
        <path d="m3.34 7 1.73 1" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="12" r="8" />
      </>,
    ),
  },
  {
    href: "/buscar",
    label: "Buscar",
    show: (r) => !isMedico(r) && !isRenace(r),
    icon: sv(
      <>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </>,
    ),
  },
];

