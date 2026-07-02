"use client";

// ── Context global de la aplicación ─────────────────────────────────────────
// Expone el estado y las funciones compartidas entre las distintas pestañas.
// El estado y la lógica siguen viviendo en page.tsx (Home); aquí solo se
// distribuyen a los componentes hijos sin prop-drilling.

import { createContext, useContext } from "react";
import type { CurrentUser, ActiveTab, ToastType, LocalRegistro } from "@/types";

export interface AppContextValue {
  // Conexión y tema
  isOnline: boolean;
  theme: "dark" | "light";
  toggleTheme: () => void;

  // Sesión
  currentUser: CurrentUser | null;
  isPowerAdmin: boolean;
  handleLogout: () => void;

  // Navegación
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // Notificaciones
  showToast: (message: string, type: ToastType) => void;

  // Sincronización
  triggerSync: () => void;
  isSyncing: boolean;
  syncQueueProgress: { done: number; total: number } | null;
  pendingCount: number;

  // Datos compartidos
  registros: any[];
  fetchRegistros: () => void;
  localRecords: LocalRegistro[];
  refreshLocalRecords: () => void;

  // Habitaciones
  customCuartos: string[];
  setCustomCuartos: React.Dispatch<React.SetStateAction<string[]>>;
  allCuartos: string[];
  sortedCustomCuartos: string[];
  dashboardRooms: string[];

  // Estadísticas
  stats: any;
  loadingStats: boolean;
  fetchStats: (force?: boolean, silent?: boolean) => void;

  // Padrón / GPS
  votersCount: number;
  coords: { lat: number | null; lng: number | null };

  // Padrón — control de descarga (la lógica vive en Home por el effect de
  // auto-descarga al login; ConfigTab consume estado y acciones desde aquí).
  syncStatus: "idle" | "downloading" | "saving" | "completed" | "error";
  syncProgress: number;
  syncTotal: number;
  downloadFullPadron: () => void;
  deletePadronLocal: () => void;
  refreshVotersCount: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext debe usarse dentro de <AppContext.Provider>");
  }
  return ctx;
}
