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

// Estados de Venezuela (23 estados + Distrito Capital). Reference data FIJA
// (como PARROQUIAS), en MAYÚSCULA. Se usa en VZLA RENACE ("Estado de preferencia").
export const VENEZUELA_ESTADOS = [
  "AMAZONAS", "ANZOÁTEGUI", "APURE", "ARAGUA", "BARINAS", "BOLÍVAR", "CARABOBO",
  "COJEDES", "DELTA AMACURO", "DISTRITO CAPITAL", "FALCÓN", "GUÁRICO", "LA GUAIRA",
  "LARA", "MÉRIDA", "MIRANDA", "MONAGAS", "NUEVA ESPARTA", "PORTUGUESA", "SUCRE",
  "TÁCHIRA", "TRUJILLO", "YARACUY", "ZULIA",
];

// Municipios de Venezuela POR estado (select dependiente en VZLA RENACE — dirección
// de compra/alquiler). Reference data FIJA en MAYÚSCULA (fuente: el Excel oficial
// Estados_Municipios_Venezuela.xlsx). Las claves coinciden EXACTO con VENEZUELA_ESTADOS.
export const VENEZUELA_MUNICIPIOS: Record<string, string[]> = {
  "AMAZONAS": ["ALTO ORINOCO", "ATABAPO", "ATURES", "AUTANA", "MANAPIARE", "MAROA", "RÍO NEGRO"],
  "ANZOÁTEGUI": ["ANACO", "ARAGUA", "DIEGO BAUTISTA URBANEJA", "FERNANDO DE PEÑALVER", "FRANCISCO DE MIRANDA", "FRANCISCO DEL CARMEN CARVAJAL", "GUANTA", "INDEPENDENCIA", "JOSÉ GREGORIO MONAGAS", "JUAN ANTONIO SOTILLO", "JUAN MANUEL CAJIGAL", "LIBERTAD", "MANUEL EZEQUIEL BRUZUAL", "PEDRO MARÍA FREITES", "PÍRITU", "SAN JOSÉ DE GUANIPA", "SAN JUAN DE CAPISTRANO", "SANTA ANA", "SIMÓN BOLÍVAR", "SIMÓN RODRÍGUEZ", "SIR ARTHUR MCGREGOR"],
  "APURE": ["ACHAGUAS", "BIRUACA", "MUÑOZ", "PEDRO CAMEJO", "PÁEZ", "RÓMULO GALLEGOS", "SAN FERNANDO"],
  "ARAGUA": ["BOLÍVAR", "CAMATAGUA", "FRANCISCO LINARES ALCÁNTARA", "GIRARDOT", "JOSÉ FÉLIX RIBAS", "JOSÉ RAFAEL REVENGA", "JOSÉ ÁNGEL LAMAS", "LIBERTADOR", "MARIO BRICEÑO IRAGORRY", "OCUMARE DE LA COSTA DE ORO", "SAN CASIMIRO", "SAN SEBASTIÁN", "SANTIAGO MARIÑO", "SUCRE", "TOVAR", "URDANETA", "ZAMORA"],
  "BARINAS": ["ALBERTO ARVELO TORREALBA", "ANDRÉS ELOY BLANCO", "ANTONIO JOSÉ DE SUCRE", "ARISMENDI", "BARINAS", "BOLÍVAR", "CRUZ PAREDES", "EZEQUIEL ZAMORA", "OBISPOS", "PEDRAZA", "ROJAS", "SOSA"],
  "BOLÍVAR": ["ANGOSTURA DEL ORINOCO (HERES)", "BOLIVARIANO ANGOSTURA", "CARONÍ", "CEDEÑO", "CHIEN", "EL CALLAO", "GRAN SABANA", "PIAR", "ROSCIO", "SIFONTES", "SUCRE"],
  "CARABOBO": ["BEJUMA", "CARLOS ARVELO", "DIEGO IBARRA", "GUACARA", "JUAN JOSÉ MORA", "LIBERTADOR", "LOS GUAYOS", "MIRANDA", "MONTALBÁN", "NAGUANAGUA", "PUERTO CABELLO", "SAN DIEGO", "SAN JOAQUÍN", "VALENCIA"],
  "COJEDES": ["ANZOÁTEGUI", "FALCÓN", "GIRARDOT", "LIMA BLANCO", "PAO DE SAN JUAN BAUTISTA", "RICAURTE", "RÓMULO GALLEGOS", "SAN CARLOS", "TINACO"],
  "DELTA AMACURO": ["ANTONIO DÍAZ", "CASACOIMA", "PEDERNALES", "TUCUPITA"],
  "DISTRITO CAPITAL": ["LIBERTADOR"],
  "FALCÓN": ["ACOSTA", "BOLÍVAR", "BUCHIVACOA", "CACIQUE MANAURE", "CARIRUBANA", "COLINA", "DABAJURO", "DEMOCRACIA", "FALCÓN", "FEDERACIÓN", "JACURA", "LOS TAQUES", "MAUROA", "MIRANDA", "MONSEÑOR ITURRIZA", "PALMASOLA", "PETIT", "PÍRITU", "SAN FRANCISCO", "SILVA", "SUCRE", "TOCÓPERO", "UNIÓN", "URUMACO", "ZAMORA"],
  "GUÁRICO": ["CAMAGUÁN", "CHAGUARAMAS", "EL SOCORRO", "FRANCISCO DE MIRANDA", "JOSÉ FÉLIX RIBAS", "JOSÉ TADEO MONAGAS", "JUAN GERMÁN ROSCIO", "JULIÁN MELLADO", "LAS MERCEDES", "LEONARDO INFANTE", "ORTIZ", "PEDRO ZARAZA", "SAN GERÓNIMO DE GUAYABAL", "SAN JOSÉ DE GUARIBE", "SANTA MARÍA DE IPIRE"],
  "LA GUAIRA": ["VARGAS"],
  "LARA": ["ANDRÉS ELOY BLANCO", "CRESPO", "IRIBARREN", "JIMÉNEZ", "MORÁN", "PALAVECINO", "SIMÓN PLANAS", "TORRES", "URDANETA"],
  "MIRANDA": ["ACEVEDO", "ANDRÉS BELLO", "BARUTA", "BRIÓN", "BUROZ", "CARRIZAL", "CHACAO", "CRISTÓBAL ROJAS", "EL HATILLO", "GUAICAIPURO", "INDEPENDENCIA", "LANDER", "LOS SALIAS", "PAZ CASTILLO", "PEDRO GUAL", "PLAZA", "PÁEZ", "SIMÓN BOLÍVAR", "SUCRE", "URDANETA", "ZAMORA"],
  "MONAGAS": ["ACOSTA", "AGUASAY", "BOLÍVAR", "CARIPE", "CEDEÑO", "EZEQUIEL ZAMORA", "LIBERTADOR", "MATURÍN", "PIAR", "PUNCERES", "SANTA BÁRBARA", "SOTILLO", "URACOA"],
  "MÉRIDA": ["ALBERTO ADRIANI", "ANDRÉS BELLO", "ANTONIO PINTO SALINAS", "ARICAGUA", "ARZOBISPO CHACÓN", "CAMPO ELÍAS", "CARACCIOLO PARRA OLMEDO", "CARDENAL QUINTERO", "GUARAQUE", "JULIO CÉSAR SALAS", "JUSTO BRICEÑO", "LIBERTADOR", "MIRANDA", "OBISPO RAMOS DE LORA", "PADRE NOGUERA", "PUEBLO LLANO", "RANGEL", "RIVAS DÁVILA", "SANTOS MARQUINA", "SUCRE", "TOVAR", "TULIO FEBRES CORDERO", "ZEA"],
  "NUEVA ESPARTA": ["ANTOLÍN DEL CAMPO", "ARISMENDI", "DÍAZ", "GARCÍA", "GÓMEZ", "MANEIRO", "MARCANO", "MARIÑO", "PENÍNSULA DE MACANAO", "TUBORES", "VILLALBA"],
  "PORTUGUESA": ["AGUA BLANCA", "ARAURE", "ESTELLER", "GUANARE", "GUANARITO", "MONSEÑOR JOSÉ VICENTE DE UNDA", "OSPINO", "PAPELÓN", "PÁEZ", "SAN GENARO DE BOCONOÍTO", "SAN RAFAEL DE ONOTO", "SANTA ROSALÍA", "SUCRE", "TURÉN"],
  "SUCRE": ["ANDRÉS ELOY BLANCO", "ANDRÉS MATA", "ARISMENDI", "BENÍTEZ", "BERMÚDEZ", "BOLÍVAR", "CAJIGAL", "CRUZ SALMERÓN ACOSTA", "LIBERTADOR", "MARIÑO", "MEJÍA", "MONTES", "RIBERO", "SUCRE", "VALDEZ"],
  "TÁCHIRA": ["ANDRÉS BELLO", "ANTONIO RÓMULO COSTA", "AYACUCHO", "BOLÍVAR", "CÁRDENAS", "CÓRDOBA", "FERNÁNDEZ FEO", "FRANCISCO DE MIRANDA", "GARCÍA DE HEVIA", "GUÁSIMOS", "INDEPENDENCIA", "JOSÉ MARÍA VARGAS", "JUNÍN", "JÁUREGUI", "LIBERTAD", "LIBERTADOR", "LOBATERA", "MICHELENA", "PANAMERICANO", "PEDRO MARÍA UREÑA", "RAFAEL URDANETA", "SAMUEL DARÍO MALDONADO", "SAN CRISTÓBAL", "SAN JUDAS TADEO", "SEBORUCO", "SIMÓN RODRÍGUEZ", "SUCRE", "TORBES", "URIBANTE"],
  "TRUJILLO": ["ANDRÉS BELLO", "BOCONÓ", "BOLÍVAR", "CANDELARIA", "CARACHE", "ESCUQUE", "JOSÉ FELIPE MÁRQUEZ CAÑIZALES", "JUAN VICENTE CAMPO ELÍAS", "LA CEIBA", "MIRANDA", "MONTE CARMELO", "MOTATÁN", "PAMPANITO", "PAMPÁN", "RAFAEL RANGEL", "SAN RAFAEL DE CARVAJAL", "SUCRE", "TRUJILLO", "URDANETA", "VALERA"],
  "YARACUY": ["ARISTIDES BASTIDAS", "BOLÍVAR", "BRUZUAL", "COCOROTE", "INDEPENDENCIA", "JOSÉ ANTONIO PÁEZ", "LA TRINIDAD", "MANUEL MONGE", "NIRGUA", "PEÑA", "SAN FELIPE", "SUCRE", "URACHICHE", "VEROES"],
  "ZULIA": ["ALMIRANTE PADILLA", "BARALT", "CABIMAS", "CATATUMBO", "COLÓN", "FRANCISCO JAVIER PULGAR", "GUAJIRA", "JESÚS ENRIQUE LOSSADA", "JESÚS MARÍA SEMPRÚN", "LA CAÑADA DE URDANETA", "LAGUNILLAS", "MACHIQUES DE PERIJÁ", "MARA", "MARACAIBO", "MIRANDA", "ROSARIO DE PERIJÁ", "SAN FRANCISCO", "SANTA RITA", "SIMÓN BOLÍVAR", "SUCRE", "VALMORE RODRÍGUEZ"],
};

// Parroquias POR estado — SOLO donde el dueño las definió (VZLA RENACE):
//  - LA GUAIRA: las 11 del estado = PARROQUIAS del censo SIN el comodín "CARACAS".
//  - DISTRITO CAPITAL: las 22 del Municipio Libertador (Caracas).
// El resto de estados NO trae lista → la parroquia queda como TEXTO LIBRE.
export const PARROQUIAS_POR_ESTADO: Record<string, string[]> = {
  "LA GUAIRA": PARROQUIAS.filter((p) => p !== "CARACAS"),
  "DISTRITO CAPITAL": [
    "23 DE ENERO", "ALTAGRACIA", "ANTÍMANO", "CARICUAO", "CATEDRAL", "COCHE",
    "EL JUNQUITO", "EL PARAÍSO", "EL RECREO", "EL VALLE", "LA CANDELARIA",
    "LA PASTORA", "LA VEGA", "MACARAO", "SAN AGUSTÍN", "SAN BERNARDINO",
    "SAN JOSÉ", "SAN JUAN", "SAN PEDRO", "SANTA ROSALÍA", "SANTA TERESA", "SUCRE",
  ],
};

// VZLA RENACE — planteamiento de solución habitacional por núcleo (para StyledSelect).
export const RENACE_PLANTEAMIENTO_TIPOS = [
  { value: "COMPRA", label: "COMPRA" },
  { value: "ALQUILER", label: "ALQUILER" },
  { value: "GMVV_INTERIOR", label: "GMVV – INTERIOR DEL PAÍS" },
  { value: "PLAN_RENACE", label: "PLAN VZLA RENACE" },
] as const;
export const RENACE_MODALIDAD_PLAN = [
  { value: "REPARACION_VIVIENDA", label: "REPARACIÓN DE VIVIENDA" },
  { value: "ENTREGA_MATERIALES", label: "ENTREGA DE MATERIALES" },
] as const;

// Listas cerradas del DIRECTORIO (edición del jefe). En MAYÚSCULA (convención del módulo)
// con ortografía corregida. El valor guardado en el jefe es exactamente el texto.
export const RENACE_TIPO_AFECTACION = [
  "SIN VIVIENDA PREVIA",
  "VIVIENDA A DEMOLER O COLAPSO TOTAL",
  "VIVIENDA CON DAÑOS REPARABLES",
  "VIVIENDA NO AFECTADA O CON DAÑOS MENORES",
];
export const RENACE_CONDICION_VIVIENDA = [
  "ALQUILADA",
  "PROPIA",
  "AL CUIDO/EN PRÉSTAMO O DE UN FAMILIAR",
  "ARRIMADO",
  "EN CONDICIÓN DE CALLE",
];
export const RENACE_PLANTEAMIENTO_AFECTACION = [
  "ASIGNACIÓN DE VIVIENDA POR PARTE DE LA GMVV",
  "PAGO DE ALQUILER",
  "REPARACIÓN DE VIVIENDA EN ARTICULACIÓN CON EL PLAN VENEZUELA RENACE",
  "SUBSIDIO PARA LA COMPRA DE ACUERDO A LA SITUACIÓN PARTICULAR",
  "TRASLADO A CAMPAMENTO TRANSITORIO DE MAYOR PERMANENCIA",
  "CASO NEGRA HIPÓLITA",
  "INCIDENCIA A EVALUAR",
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
  "Por alquiler",
  "Por compra de vivienda",
  "Por asignación GMVV",
  "Vivienda reparada Plan Vzla Renace",
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

// Unidades de DURACIÓN del tratamiento (para "por N días/semanas/meses"). Fuente
// ÚNICA: `singular`/`plural` para pluralizar según el número (1 → singular).
export const DURACION_UNIDADES = [
  { value: "dias", singular: "día", plural: "días" },
  { value: "semanas", singular: "semana", plural: "semanas" },
  { value: "meses", singular: "mes", plural: "meses" },
] as const;

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
