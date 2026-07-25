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
  cedulaJefeFamilia: "", estadoFisico: "", embarazo: "NO", patologia: "", patologiaIds: [],
  telefonoCod: "0412", telefonoNum: "",
  isChildDependent: false, dependentNumber: "1",
  intermitente: "NO", motivoIntermitente: "",
};

// Opciones del "número correlativo de hijo/dependiente". El dependiente se guarda
// con la cédula del representante + este sufijo: "<cédula>-<N>" (ej. V-12345678-3).
// Fuente ÚNICA usada por el censo (alta) y por la edición de registros. El parseo
// del sufijo admite N de varios dígitos, así que la lista puede crecer sin tocar
// la lógica (aquí: hasta 12).
const DEP_ORDINALES = ["1er", "2do", "3er", "4to", "5to", "6to", "7mo", "8vo", "9no", "10mo", "11vo", "12vo"];
export const DEPENDENT_NUMBER_OPTIONS = DEP_ORDINALES.map((ord, i) => ({
  value: String(i + 1),
  label: `${ord} Hijo/Representado (-${i + 1})`,
}));


// Códigos de área telefónicos (Venezuela). Fuente única para el censo del jefe y
// el sub-formulario de integrantes (carga familiar).
export const TELEFONO_CODIGOS = ["0424", "0414", "0416", "0426", "0412", "0422", "0212"];

// Razones de retiro/egreso (desplegable). A cada una se le puede añadir una
// especificación opcional; se guarda "Tipo" o "Tipo: especificación" en
// Registro.retiradoRazon. Fuente ÚNICA (censo, edición, filtro, stats, reportes).
// El orden y los nombres son canónicos; el filtrado empareja por este TIPO base.
export const RAZONES_RETIRO = [
  "Hogar Solidario",
  "Retiro Voluntario",
  "Retiro Forzado",
  "Traslado",
  "Emergencia Médica",
  "Otra",
] as const;

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

// ── Lesiones / heridas / curas ──────────────────────────────────────────────
// Zona del cuerpo: lista anatómica FIJA (estable, no configurable). El "lado"
// (izq/der) y el detalle van en la nota de la cura.
export const ZONAS_CUERPO = [
  "Cabeza", "Cara", "Ojo", "Oído", "Nariz", "Boca / labios", "Cuello",
  "Hombro", "Brazo", "Codo", "Antebrazo", "Muñeca", "Mano", "Dedos de la mano",
  "Tórax", "Espalda", "Abdomen", "Pelvis", "Glúteos", "Región genital",
  "Cadera", "Muslo", "Rodilla", "Pierna", "Tobillo", "Pie", "Dedos del pie",
  "Otra",
];
// Estado evolutivo de la lesión.
export const ESTADO_LESION_OPTS = [
  { value: "NUEVA", label: "Nueva" },
  { value: "EN_TRATAMIENTO", label: "En tratamiento" },
  { value: "INFECTADA", label: "Infectada" },
  { value: "CICATRIZADA", label: "Cicatrizada" },
];
export const ESTADO_LESION_LABELS: Record<string, string> = {
  NUEVA: "Nueva",
  EN_TRATAMIENTO: "En tratamiento",
  INFECTADA: "Infectada",
  CICATRIZADA: "Cicatrizada",
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

// ── Caracterización: metadata de campos con catálogo (fuente única) ─────────
// Describe cada lista CERRADA de la ficha: en qué (modulo, campo) del catálogo
// general vive, su etiqueta, si es multi-selección, a qué nivel pertenece
// (hogar/persona) y en qué fase se muestra. La usan la UI de gestión del catálogo
// y el formulario de la ficha (así no se duplica la estructura). Los campos de
// texto/numéricos y los toggles SI/NO NO van aquí (se manejan directo en la ficha).
export type CaracNivel = "hogar" | "persona";
export interface CaracCampoMeta {
  modulo: string;   // agrupador del catálogo (VIVIENDA, TRIAJE…)
  campo: string;    // clave de la lista (tenencia, grupoSanguineo…)
  label: string;    // etiqueta visible
  nivel: CaracNivel;
  multi?: boolean;  // selección múltiple (array de ids)
  fase: 1 | 2;
}
export const CARAC_CAMPOS: CaracCampoMeta[] = [
  // Persona — Fase 1
  { modulo: "IDENTIDAD", campo: "estadoCivil", label: "Estado civil", nivel: "persona", fase: 1 },
  { modulo: "FAMILIA", campo: "parentesco", label: "Parentesco", nivel: "persona", fase: 1 },
  { modulo: "FAMILIA", campo: "vulnerabilidad", label: "Condición de vulnerabilidad", nivel: "persona", fase: 1 },
  { modulo: "TRIAJE", campo: "grupoSanguineo", label: "Grupo sanguíneo", nivel: "persona", fase: 1 },
  { modulo: "TRIAJE", campo: "alergia", label: "Alergias conocidas", nivel: "persona", multi: true, fase: 1 },
  { modulo: "TRIAJE", campo: "discapacidadTipo", label: "Tipo de discapacidad", nivel: "persona", fase: 1 },
  { modulo: "TRIAJE", campo: "vacunaAntitetanica", label: "Vacuna antitetánica", nivel: "persona", fase: 1 },
  { modulo: "NECESIDADES", campo: "tallaCamisa", label: "Talla de camisa", nivel: "persona", fase: 1 },
  { modulo: "NECESIDADES", campo: "tallaPantalon", label: "Talla de pantalón", nivel: "persona", fase: 1 },
  { modulo: "NECESIDADES", campo: "tallaCalzado", label: "Talla de calzado", nivel: "persona", fase: 1 },
  { modulo: "NECESIDADES", campo: "necesidad", label: "Necesidades urgentes", nivel: "persona", multi: true, fase: 1 },
  // Hogar — Fase 1
  { modulo: "VIVIENDA", campo: "tenencia", label: "Tenencia de la vivienda", nivel: "hogar", fase: 1 },
  { modulo: "VIVIENDA", campo: "tipoVivienda", label: "Tipo de vivienda", nivel: "hogar", fase: 1 },
  { modulo: "VIVIENDA", campo: "material", label: "Material predominante", nivel: "hogar", fase: 1 },
  { modulo: "VIVIENDA", campo: "nivelDano", label: "Nivel de daño", nivel: "hogar", fase: 1 },
  { modulo: "VIVIENDA", campo: "estadoEnseres", label: "Estado de enseres", nivel: "hogar", fase: 1 },
  { modulo: "ENTORNO", campo: "servicioAfectado", label: "Servicios afectados", nivel: "hogar", multi: true, fase: 1 },
  { modulo: "ENTORNO", campo: "riesgoEntorno", label: "Riesgos del entorno", nivel: "hogar", multi: true, fase: 1 },
  // Persona — Fase 2
  { modulo: "SOCIOECONOMICO", campo: "nivelEducativo", label: "Nivel educativo", nivel: "persona", fase: 2 },
  { modulo: "LABORAL", campo: "impactoLaboral", label: "Impacto laboral del sismo", nivel: "persona", fase: 2 },
  { modulo: "LABORAL", campo: "sectorEconomico", label: "Sector económico", nivel: "persona", fase: 2 },
  { modulo: "LABORAL", campo: "oficio", label: "Oficio / habilidad", nivel: "persona", fase: 2 },
  { modulo: "LABORAL", campo: "aptitudFisica", label: "Aptitud física para labores", nivel: "persona", fase: 2 },
  { modulo: "LABORAL", campo: "disponibilidad", label: "Disponibilidad de horario", nivel: "persona", fase: 2 },
  // Hogar — Fase 2
  { modulo: "SOCIOECONOMICO", campo: "rangoIngreso", label: "Rango de ingreso familiar", nivel: "hogar", fase: 2 },
  { modulo: "SOCIOECONOMICO", campo: "accesoPatria", label: "Acceso al Sistema Patria", nivel: "hogar", fase: 2 },
  { modulo: "SOCIOECONOMICO", campo: "bonoContingencia", label: "Bono de contingencia", nivel: "hogar", fase: 2 },
];
