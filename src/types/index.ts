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

// Catálogo de COMUNIDADES (refugios ITINERANTE/MIXTO): cada una pertenece a una parroquia
// Y a un campamento (`refugioId` = id del Refugio), para que no se mezclen entre campamentos.
export type Comunidad = { id: string; nombre: string; parroquia: string; refugioId?: string | null };

// Catálogo de TIPOS DE CARPA (refugios ITINERANTE/MIXTO).
export type TipoCarpa = { id: string; nombre: string };

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

// Borrador de un INTEGRANTE de la carga familiar (Paso 5 del censo). Cada integrante
// se registra como un Registro INDEPENDIENTE asociado al jefe: comparte los mismos
// campos por-persona del formulario del jefe (identidad + salud completa). La
// ubicación/geo/carpa/refugio se HEREDA del jefe al encolar (no se guarda aquí).
export type IntegranteDraft = {
  key: string;                 // id estable para React (crypto.randomUUID)
  menorSinCedula: boolean;     // menor sin cédula → cédula = V-<cédula del jefe>-N
  dependentNumber: string;     // correlativo del menor (cuando menorSinCedula)
  nacionalidad: string;        // "V" | "E"
  cedula: string;              // solo dígitos
  nombreApellido: string;
  genero: string;
  fechaNacimiento: string;     // dd/mm/aaaa
  edad: string;                // calculada desde fechaNacimiento
  telefonoCod: string;
  telefonoNum: string;         // OPCIONAL para integrantes
  estadoFisico: string;
  embarazo: string;
  patologia: string;
  patologiaIds: string[];
  medicamentos: Medicamento[];
  intermitente: string;
  motivoIntermitente: string;
  errors: Record<string, string>;
};

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
export type ActiveTab = "censo" | "dashboard" | "usuarios" | "config" | "asignaciones" | "morbilidad" | "balance" | "historial" | "caracterizacion" | "monitoreo" | "mapa";

// Fila de monitoreo por campamento (números generales, todo agregado en SQL → sin PII).
// Definiciones ALINEADAS con Estadísticas (src/lib/stats.ts + DashboardTab):
//   registrados = activos + retirados (todos, = "Total Registrados")
//   presentes   = activos (retirado=NO; INCLUYE intermitentes, = "Presentes")
export interface MonitoreoRow {
  refugio: string;
  registrados: number; presentes: number; intermitentes: number; retirados: number;
  nucleos: number; individuos: number;
  asignados: number; capacidad: number;
  lesionados: number; conPatologia: number; embarazadas: number;
}

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

