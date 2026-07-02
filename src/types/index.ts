// ── Tipos compartidos de la aplicación ──────────────────────────────────────
// Extraídos de page.tsx para reutilización entre componentes/tabs/hooks.

import type { LocalRegistro } from "@/lib/db";
export type { LocalRegistro };

// Medicamento dinámico (censo de salud)
export type Medicamento = { nombre: string; dosis: string; periodo: string };

// Estado del formulario de censo (useReducer)
export type FormData = {
  parroquia: string; sector: string; comunidad: string; direccionExacta: string;
  nacionalidad: string; cedula: string; nombreApellido: string; genero: string;
  fechaNacimiento: string; edad: string; perteneceNucleo: string; jefeFamilia: string;
  cedulaJefeFamilia: string; estadoFisico: string; patologia: string;
  patologiaDescripcion: string; telefonoCod: string; telefonoNum: string;
  isChildDependent: boolean; dependentNumber: string;
  intermitente: string; motivoIntermitente: string;
};

export type FormAction =
  | { type: "SET"; field: keyof FormData; value: any }
  | { type: "SET_MANY"; patch: Partial<FormData> }
  | { type: "RESET" };

// Tipos de notificación toast
export type ToastType = "success" | "error" | "info" | "warning";

// Usuario/operador autenticado
export interface CurrentUser {
  id: string;
  email: string;
  nombre: string;
  role: string;
  campamentoTransitorio: string;
}

// Vista de pestaña activa
export type ActiveTab = "censo" | "dashboard" | "usuarios" | "config" | "asignaciones";
