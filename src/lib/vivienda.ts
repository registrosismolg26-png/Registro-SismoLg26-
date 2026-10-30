// Vivienda del JEFE (QR habitable + QR de colapso + Comisión Presidencial) para el cliente:
// tipo del registro que llega en la lista de Registrados y APLANADO de su contenido para
// el detalle y los Excel. Puro (sin red ni DOM) → sirve también offline y en exportaciones.
//
// habitable.gob.ve devuelve dos formas por la misma API de certificados:
//   · `tipo:"censo"`      → QR habitable (vivienda + grupo familiar + operador)
//   · `tipo:"inspeccion"` → QR de colapso (edificación evaluada: etiqueta, demolición, niveles)

export type ViviendaRegistro = {
  habitableUrl?: string | null;
  habitableData?: unknown | null;
  colapsoUrl?: string | null;
  colapsoData?: unknown | null;
  comisionEtiqueta?: string | null;
};

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : {});
const str = (x: unknown): string => (typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "");
const up = (x: unknown): string => str(x).toUpperCase();

const fechaCorta = (iso: unknown): string => {
  const s = str(iso);
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const lista = (x: unknown): string[] => (Array.isArray(x) ? x.map(str).filter(Boolean) : []);

export type ViviendaPlano = {
  // QR habitable (censo de la vivienda/familia)
  habUrl: string; habTipo: string; habEdificacion: string; habPisoApto: string; habDireccion: string;
  habParroquia: string; habCircuito: string; habEtiqueta: string; habPersonas: string;
  habMascotas: string; habFecha: string; habOperador: string;
  // QR de colapso (inspección de la edificación)
  colUrl: string; colEdificacion: string; colDireccion: string; colEtiqueta: string; colDemolicion: string;
  colUso: string; colPisos: string; colAnio: string; colNiveles: string; colMedidas: string;
  colInspector: string; colObservaciones: string;
  // Comisión Presidencial
  comision: string;
};

export const viviendaTieneDatos = (v?: ViviendaRegistro | null): boolean =>
  !!v && !!(v.habitableUrl || v.colapsoUrl || v.comisionEtiqueta);

/** Aplana el contenido guardado de cada QR a texto. Tolera contenido ausente (solo URL). */
export function flattenVivienda(v?: ViviendaRegistro | null): ViviendaPlano {
  const h = obj(v?.habitableData);
  const hu = obj(h.ubicacion);
  const c = obj(v?.colapsoData);
  const ce = obj(c.edificacion);
  const cn = obj(c.niveles);
  const ca = obj(c.acciones);

  const personas = Array.isArray(h.personas) ? (h.personas as unknown[]) : [];
  const grupo = personas
    .map((p) => {
      const o = obj(p);
      const nombre = [str(o.nombre), str(o.apellido)].filter(Boolean).join(" ");
      return [nombre, str(o.cedula)].filter(Boolean).join(" · ");
    })
    .filter(Boolean)
    .join("; ");
  const personasTxt = grupo
    ? `${typeof h.cantidad_personas === "number" ? h.cantidad_personas : personas.length}: ${grupo}`
    : (typeof h.cantidad_personas === "number" ? String(h.cantidad_personas) : "");

  const niveles = [
    str(cn.externo) && `Externo ${str(cn.externo)}`,
    str(cn.severo) && `Severo ${str(cn.severo)}`,
    str(cn.moderado) && `Moderado ${str(cn.moderado)}`,
    str(cn.componentes) && `Componentes ${str(cn.componentes)}`,
  ].filter(Boolean).join(" · ");

  const medidas = [...lista(ca.medidas), str(ca.medidaOtra)].filter(Boolean).join(", ");

  return {
    habUrl: str(v?.habitableUrl),
    habTipo: str(h.tipo_vivienda),
    habEdificacion: str(hu.nombre_edificacion),
    habPisoApto: [str(hu.piso) && `Piso ${str(hu.piso)}`, str(hu.apartamento) && `Apto ${str(hu.apartamento)}`, str(hu.numero_casa) && `Casa ${str(hu.numero_casa)}`]
      .filter(Boolean).join(" / "),
    habDireccion: str(hu.direccion),
    habParroquia: [str(hu.parroquia), str(hu.municipio)].filter(Boolean).join(", "),
    habCircuito: str(hu.circuito_comunal),
    habEtiqueta: up(h.etiqueta_inspeccion),
    habPersonas: personasTxt,
    habMascotas: h.tiene_mascotas === true ? (typeof h.cantidad_mascotas === "number" ? `Sí (${h.cantidad_mascotas})` : "Sí") : h.tiene_mascotas === false ? "No" : "",
    habFecha: fechaCorta(h.fecha_censo),
    habOperador: str(obj(h.operador).nombre),

    colUrl: str(v?.colapsoUrl),
    colEdificacion: str(ce.nombre),
    colDireccion: str(ce.direccion),
    colEtiqueta: up(c.etiqueta),
    colDemolicion: str(c.estatus_demolicion).replace(/_/g, " "),
    colUso: str(ce.uso),
    colPisos: str(ce.num_pisos),
    colAnio: str(ce.anio_construccion),
    colNiveles: niveles,
    colMedidas: medidas,
    colInspector: str(obj(c.inspector).nombre),
    colObservaciones: str(c.observaciones),

    comision: up(v?.comisionEtiqueta),
  };
}

// ── Excel (registros + núcleos familiares): columnas de vivienda en un solo lugar ──────────
// Mismo orden en `VIVIENDA_COLS` y en `viviendaCells`. Solo el JEFE trae valores; el resto
// de filas queda en blanco.
export const VIVIENDA_COLS: { label: string; width: number; key: keyof ViviendaPlano }[] = [
  { label: "Comisión Presidencial (etiqueta)", width: 18, key: "comision" },
  { label: "QR Habitable · Enlace", width: 34, key: "habUrl" },
  { label: "QR Habitable · Tipo de vivienda", width: 16, key: "habTipo" },
  { label: "QR Habitable · Edificación", width: 26, key: "habEdificacion" },
  { label: "QR Habitable · Piso / Apto", width: 14, key: "habPisoApto" },
  { label: "QR Habitable · Dirección", width: 28, key: "habDireccion" },
  { label: "QR Habitable · Parroquia / Municipio", width: 22, key: "habParroquia" },
  { label: "QR Habitable · Circuito comunal", width: 26, key: "habCircuito" },
  { label: "QR Habitable · Etiqueta de inspección", width: 16, key: "habEtiqueta" },
  { label: "QR Habitable · Grupo familiar", width: 40, key: "habPersonas" },
  { label: "QR Habitable · Mascotas", width: 12, key: "habMascotas" },
  { label: "QR Habitable · Fecha del censo", width: 14, key: "habFecha" },
  { label: "QR Habitable · Operador", width: 24, key: "habOperador" },
  { label: "QR Colapso · Enlace", width: 34, key: "colUrl" },
  { label: "QR Colapso · Edificación", width: 32, key: "colEdificacion" },
  { label: "QR Colapso · Dirección", width: 32, key: "colDireccion" },
  { label: "QR Colapso · Etiqueta", width: 14, key: "colEtiqueta" },
  { label: "QR Colapso · Estatus de demolición", width: 18, key: "colDemolicion" },
  { label: "QR Colapso · Uso", width: 16, key: "colUso" },
  { label: "QR Colapso · N.º de pisos", width: 10, key: "colPisos" },
  { label: "QR Colapso · Año de construcción", width: 12, key: "colAnio" },
  { label: "QR Colapso · Niveles de daño", width: 34, key: "colNiveles" },
  { label: "QR Colapso · Medidas", width: 30, key: "colMedidas" },
  { label: "QR Colapso · Inspector", width: 24, key: "colInspector" },
  { label: "QR Colapso · Observaciones", width: 30, key: "colObservaciones" },
];

/** Valores de las columnas de vivienda (mismo orden que VIVIENDA_COLS). Sin vivienda → vacíos. */
export function viviendaCells(v?: ViviendaRegistro | null): string[] {
  const f = flattenVivienda(v);
  return VIVIENDA_COLS.map((c) => f[c.key]);
}

/** Color (ARGB, sin '#') de relleno para una etiqueta VERDE/AMARILLA/ROJA/NEGRA (o su forma masculina). */
export function etiquetaFill(label: string): { fill: string; font: string } | null {
  const l = (label || "").toUpperCase();
  if (l.startsWith("VERDE")) return { fill: "16A34A", font: "FFFFFF" };
  if (l.startsWith("AMARILL")) return { fill: "FACC15", font: "1F2937" };
  if (l.startsWith("ROJ")) return { fill: "DC2626", font: "FFFFFF" };
  if (l.startsWith("NEGR")) return { fill: "1F2937", font: "FFFFFF" };
  return null;
}

/** Letra de columna de Excel (1→A, 26→Z, 27→AA). `String.fromCharCode(64+n)` falla pasando de 26. */
export function colLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}
