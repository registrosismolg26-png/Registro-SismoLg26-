// ── Tipos compartidos de la aplicación ──────────────────────────────────────
// Extraídos de page.tsx para reutilización entre componentes/tabs/hooks.

import type { LocalRegistro } from "@/lib/db";
export type { LocalRegistro };

// Ítem de medicamento en un registro/consulta: vínculo POR-ID al catálogo
// (MedicamentoPredefinido.id) + posología por paciente. El nombre NO se guarda;
// se interpola desde el catálogo al mostrar (ver helpers medById/medLabel).
export type Medicamento = { id: string; dosis: string; periodo: string };

// Catálogo de patologías (para pills/selects). Se guarda solo el id en los registros.
export type Patologia = { id: string; nombre: string };

// Catálogo de medicamentos predefinidos (principio activo · concentración · presentación).
export type MedicamentoPredefinido = {
  id: string;
  nombre: string;
  concentracion: string;
  presentacion: string;
  dosis: string;
  periodo: string;
  nota?: string | null;
};

// Estado del formulario de censo (useReducer)
export type FormData = {
  parroquia: string; sector: string; comunidad: string; direccionExacta: string;
  nacionalidad: string; cedula: string; nombreApellido: string; genero: string;
  fechaNacimiento: string; edad: string; perteneceNucleo: string; jefeFamilia: string;
  cedulaJefeFamilia: string; estadoFisico: string; patologia: string;
  patologiaIds: string[]; telefonoCod: string; telefonoNum: string;
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
export type ActiveTab = "censo" | "dashboard" | "usuarios" | "config" | "asignaciones" | "morbilidad" | "balance" | "historial";

export interface LocalConsulta {
  id: string;
  type?: "new";
  data: {
    cedula: string;
    nombreApellido: string;
    genero?: string;
    edad?: number;
    refugio: string;
    // Antecedentes (por-ID)
    antecedentesPatologiaIds: string[];
    antecedentesMedicamentoIds: Medicamento[];
    // Diagnóstico (por-ID)
    diagnosticoPatologiaIds: string[];
    diagnosticoMedicamentoIds: Medicamento[];
    notasDoctor?: string;
  };
  status: "pending" | "synced" | "error";
  attempts: number;
  createdAt: string;
  userId?: string;
  nextAttemptAt?: number;
  permanentError?: string;
}

