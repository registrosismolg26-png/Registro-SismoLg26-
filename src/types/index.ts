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

// Catálogo de tipos de lesión/herida (administrable). Solo se guarda el id.
export type TipoLesion = { id: string; nombre: string };

// Lesión/herida registrada en una consulta: tipo (catálogo por id), zona del
// cuerpo (lista fija), estado (lista fija) y la cura/observaciones en texto.
export type Lesion = { tipoId: string; zona: string; estado: string; cura: string };

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
  cedulaJefeFamilia: string; estadoFisico: string; embarazo: string; patologia: string;
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
export type ActiveTab = "censo" | "dashboard" | "usuarios" | "config" | "asignaciones" | "morbilidad" | "balance" | "historial" | "caracterizacion";

// ── Caracterización (encuesta socioeconómica) ───────────────────────────────
// Opción del catálogo general (una tabla para todas las listas cerradas).
export type CaracterizacionOpcion = {
  id: string; modulo: string; campo: string; valor: string; orden: number; activo: boolean;
};

// Datos del HOGAR (1 por familia). Los *Id referencian CaracterizacionOpcion;
// los SI/NO son strings explícitos; los multi son arrays de ids.
export interface CaracterizacionHogarData {
  jefeRegistroId: string; familiaCedula: string; refugio: string;
  fechaIngresoRefugio?: string | null;
  gpsViviendaLat?: number | null; gpsViviendaLng?: number | null;
  tenenciaId?: string | null; misionVivienda?: string | null; tipoViviendaId?: string | null;
  materialId?: string | null; nivelDanoId?: string | null; estadoEnseresId?: string | null;
  servicioAfectadoIds?: string[]; riesgoEntornoIds?: string[];
  // Fase 2
  rangoIngresoId?: string | null; recibeRemesas?: string | null; recibeClap?: string | null;
  accesoPatriaId?: string | null; recibeBonosPatria?: string | null; bonoContingenciaId?: string | null;
}

// Datos de la PERSONA (1 por censado).
export interface CaracterizacionPersonaData {
  registroId: string; cedula: string; familiaCedula: string; refugio: string;
  estadoCivilId?: string | null; correo?: string | null; telefonoAlt?: string | null;
  parentescoId?: string | null; asisteEscuela?: string | null; vulnerabilidadId?: string | null;
  grupoSanguineoId?: string | null; alergiaIds?: string[]; discapacidad?: string | null;
  discapacidadTipoId?: string | null; discapacidadDesc?: string | null; vacunaAntitetanicaId?: string | null;
  saludMental?: string | null; requiereAtencion?: string | null; detalleAtencion?: string | null;
  semanasGestacion?: number | null;
  pesoKg?: number | null; estaturaCm?: number | null;
  tallaCamisaId?: string | null; tallaPantalonId?: string | null; tallaCalzadoId?: string | null;
  necesidadIds?: string[];
  // Fase 2
  nivelEducativoId?: string | null; impactoLaboralId?: string | null; sectorEconomicoId?: string | null;
  oficioId?: string | null; aniosExperiencia?: number | null; rescatoHerramientas?: string | null;
  aptitudFisicaLaboralId?: string | null; disponibilidadId?: string | null;
  puedeTrabajarInmediato?: string | null; validacionDestreza?: string;
}

// Registro offline: la ficha de UNA familia (hogar + personas). `id` = jefeRegistroId
// (ancla) para idempotencia/upsert. Misma forma de cola que LocalRegistro/LocalConsulta.
export interface LocalCaracterizacion {
  id: string;
  type?: "new";
  data: { hogar: CaracterizacionHogarData; personas: CaracterizacionPersonaData[] };
  status: "pending" | "synced" | "error";
  attempts: number;
  createdAt: string;
  refugio?: string;
  userId?: string;
  nextAttemptAt?: number;
  permanentError?: string;
}

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

