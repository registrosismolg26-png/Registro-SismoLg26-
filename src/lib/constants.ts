// ── Constantes compartidas de la aplicación ─────────────────────────────────

import type { FormData } from "@/types";

// Parroquias de La Guaira y Caracas
export const PARROQUIAS = [
  "EL JUNKO",
  "CARAYACA",
  "CATIA LA MAR",
  "URIMARE",
  "CARLOS SOUBLETTE",
  "MAIQUETIA",
  "LA GUAIRA",
  "MACUTO",
  "CARABALLEDA",
  "NAIGUATA",
  "CARUAO",
  "CARACAS"
];

// Habitaciones base (las personalizadas se cargan desde la BD)
export const CUARTOS: string[] = [];

// Estado inicial del formulario de censo
export const INITIAL_FORM: FormData = {
  parroquia: "", sector: "", comunidad: "", direccionExacta: "",
  nacionalidad: "V", cedula: "", nombreApellido: "", genero: "",
  fechaNacimiento: "", edad: "", perteneceNucleo: "", jefeFamilia: "",
  cedulaJefeFamilia: "", estadoFisico: "", patologia: "", patologiaIds: [],
  telefonoCod: "0412", telefonoNum: "",
  isChildDependent: false, dependentNumber: "1",
  intermitente: "NO", motivoIntermitente: "",
};

// Correos con privilegios de super-admin (gestión de usuarios)
export const ALLOWED_ADMINS = [
  "yender.umc@gmail.com",
  "juventudlgelectoral@gmail.com",
  "abelenviso@gmail.com"
];

// Entes por defecto para el informe de WhatsApp
export const DEFAULT_ENTES = [
  "Ministerio de Alimentación y sus entes",
  "Gobernación",
  "MPP Educación",
  "MPP Indistria y Comercio",
  "MPP Proceso Social del Trabajo",
  "MPP Juventud",
  "MPP para la Defensa",
  "Alcaldía",
  "Vicepresidencia de Obras Publicad y Servicios",
  "Juventud Socialista (brigadas de solidaridad)"
];

// Tiempo de expiración de sesión por inactividad (1 hora)
export const INACTIVITY_MS = 60 * 60 * 1000;

// Tipo de atención en Morbilidad: refugiado (censado) o apoyos externos.
export const TIPO_PACIENTE_OPTS = [
  { value: "REFUGIADO", label: "Refugiado (del censo)" },
  { value: "APOYO_INSTITUCIONAL", label: "Apoyo Institucional" },
  { value: "APOYO_COMUNITARIO", label: "Apoyo Comunitario" },
  { value: "EMERGENCIA", label: "Emergencia" },
];
export const TIPO_PACIENTE_LABELS: Record<string, string> = {
  REFUGIADO: "Refugiado",
  APOYO_INSTITUCIONAL: "Apoyo Institucional",
  APOYO_COMUNITARIO: "Apoyo Comunitario",
  EMERGENCIA: "Emergencia",
};

// Frecuencias (período) para la posología de medicamentos. Es lo único que el
// operador elige por prescripción; el nombre/dosis salen del catálogo por ID.
export const PERIODO_OPTIONS = [
  "Interdiario",
  "1 vez al día",
  "Cada 12 horas",
  "Cada 8 horas",
  "Cada 6 horas",
  "Cada 4 horas",
];
