// ── Informe Médico (PDF) ────────────────────────────────────────────────────
// Genera un INFORME MÉDICO en PDF con la identidad institucional del sistema
// (franja tricolor + logo de la Gobernación + membrete) a partir de UNA consulta
// de la tabla ConsultaMedica. pdfmake se carga de forma PEREZOSA (dynamic import)
// para no engordar el bundle base; solo se descarga cuando el médico pide el informe.
//
// Fuente ÚNICA de campos clínicos: las listas HCE_* viven en HistoriaClinicaExtendida
// (mismas que usan los formularios), así el informe nunca se desincroniza del modelo.

import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import { patologiaNombre, medLabel, duracionText } from "@/lib/helpers";
import { HCE_VITALES, HCE_FISICO } from "@/components/HistoriaClinicaExtendida";
import { TIPO_PACIENTE_LABELS, ESTADO_LESION_LABELS } from "@/lib/constants";
import { LOGO_GOB_PNG_BASE64 } from "@/lib/logoAsset";
import { LOGO_MPPPST_PNG_BASE64 } from "@/lib/logoMinisterioAsset";
import type { Patologia, MedicamentoPredefinido, TipoLesion, Medicamento, Lesion } from "@/types";

// Paleta institucional (misma azul que los Excel/censo) + tricolor de la bandera.
const NAVY = "#1E3A8A";
const NAVY_SOFT = "#E8EDF7";
const INK = "#0F172A";
const MUTED = "#475569";
const LINE = "#CBD5E1";
const TRI_AMARILLO = "#FCD116";
const TRI_AZUL = "#00247D";
const TRI_ROJO = "#CF142B";

const LOGO_DATA_URI = `data:image/png;base64,${LOGO_GOB_PNG_BASE64}`;
// Logo secundario (MPPPST): solo si el asset está cargado (si no, membrete con 1 logo).
const LOGO_MPPPST_DATA_URI = LOGO_MPPPST_PNG_BASE64
  ? `data:image/png;base64,${LOGO_MPPPST_PNG_BASE64}`
  : "";
const CONTENT_W = 515; // ancho útil A4 con márgenes de 40 (595.28 - 80 ≈ 515)

// ── helpers de datos ─────────────────────────────────────────────────────────
const val = (v: any): string => {
  if (v == null) return "";
  const s = String(v).trim();
  return s;
};
const dash = (v: any): string => val(v) || "—";

// Fecha larga en español: "viernes, 8 de agosto de 2025".
const fechaLarga = (iso?: string): string => {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "—";
  const s = d.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Edad a partir de la fecha de nacimiento (yyyy-mm-dd o ISO); "" si no hay.
const edadDe = (fn?: string): string => {
  if (!fn) return "";
  const d = new Date(fn);
  if (isNaN(d.getTime())) return "";
  const hoy = new Date();
  let e = hoy.getFullYear() - d.getFullYear();
  const m = hoy.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) e--;
  return e >= 0 && e < 130 ? String(e) : "";
};

// Líneas de medicamentos { id, dosis, periodo, duración } → texto legible por ítem.
const medLines = (items: Medicamento[] | undefined | null, catalogo: MedicamentoPredefinido[]): string[] =>
  (Array.isArray(items) ? items : [])
    .filter((m) => m?.id)
    .map((m) => {
      const base = medLabel(m.id, catalogo);
      const dur = duracionText(m);
      const extra = [m.dosis, m.periodo, dur ? `por ${dur}` : ""].map((s) => (s || "").trim()).filter(Boolean).join(" · ");
      return extra ? `${base} — ${extra}` : base;
    });

// Lesiones → líneas legibles.
const lesionLines = (lesiones: Lesion[] | undefined, tiposLesion: TipoLesion[]): string[] =>
  (Array.isArray(lesiones) ? lesiones : [])
    .filter((l) => l?.tipoId)
    .map((l) => {
      const t = tiposLesion.find((x) => x.id === l.tipoId)?.nombre ?? l.tipoId;
      const parts = [t];
      if (l.zona) parts.push(String(l.zona));
      if (l.estado && ESTADO_LESION_LABELS[l.estado]) parts.push(ESTADO_LESION_LABELS[l.estado]);
      const b = parts.join(" · ");
      return l.cura ? `${b} — Cura: ${l.cura}` : b;
    });

export interface InformeMedicoOpts {
  consulta: any;                        // { data, createdAt } (consulta local/servidor)
  patologias: Patologia[];
  predefinedMedicamentos: MedicamentoPredefinido[];
  tiposLesion: TipoLesion[];
  registro?: any;                       // censo vinculado (dirección/teléfono) — opcional
  medicoNombre?: string;                // quién genera el informe (para la firma)
}

export async function exportInformeMedicoPdf(opts: InformeMedicoOpts): Promise<void> {
  const { consulta, patologias, predefinedMedicamentos, tiposLesion, registro } = opts;
  const d = consulta?.data || {};

  // ── Identidad del paciente ──────────────────────────────────────────────────
  const nombre = dash(d.nombreApellido);
  const cedula = val(d.cedula) ? val(d.cedula).replace(/\D/g, "") : "";
  const sexo = dash(d.genero);
  // Edad: la de la consulta; si no, se calcula de la fecha de nacimiento (consulta o censo).
  const fnac = val(d.fechaNacimiento) || val(registro?.fechaNacimiento);
  const edad = val(d.edad != null ? d.edad : "") || edadDe(fnac);
  // Dirección/teléfono: no viven en la consulta → se toman del censo vinculado si existe.
  const direccion = dash(
    val(registro?.direccionExacta) ||
      [registro?.sector, registro?.parroquia].map(val).filter(Boolean).join(", ")
  );
  const telefono = dash(
    [registro?.telefonoCod, registro?.telefonoNum].map(val).filter(Boolean).join(" ") ||
      registro?.telefono
  );
  const fechaConsultaIso = d.fechaConsulta || consulta?.createdAt;
  // Nombre del campamento para el membrete (dinámico, del refugio de la consulta).
  const refugioNombre = val(d.refugio).toUpperCase();

  // ── Bloques de contenido ────────────────────────────────────────────────────
  const content: Content[] = [];

  // Barra de título institucional (INFORME MÉDICO + fecha) — no texto suelto.
  content.push(titleBar("INFORME MÉDICO", `Fecha: ${fechaLarga(fechaConsultaIso)}`));

  // Datos de Identificación → CUADRO con banda de título.
  const idRows: Content[][] = [
    [cellLabel("Apellidos y Nombres"), cellVal(nombre), cellLabel("Cédula"), cellVal(cedula || "—")],
    [cellLabel("Edad"), cellVal(edad ? `${edad} años` : "—"), cellLabel("Sexo"), cellVal(sexo)],
    [cellLabel("Dirección de Habitación"), cellVal(direccion), cellLabel("Teléfono"), cellVal(telefono)],
  ];
  const tipoPac = TIPO_PACIENTE_LABELS[d.tipoPaciente] || d.tipoPaciente;
  if (tipoPac && d.tipoPaciente !== "REFUGIADO") {
    idRows.push([cellLabel("Tipo de atención"), cellVal(dash(tipoPac)), cellLabel("Nota"), cellVal(dash(d.tipoNota))]);
  }
  content.push(card("Datos de Identificación", [96, "*", 58, "*"], idRows, (_r, c) => (c === 0 || c === 2 ? NAVY_SOFT : null)));

  // Signos Vitales → CUADRO: fila de etiquetas (fondo suave) + fila de valores.
  const vitalesCon = HCE_VITALES.filter((f) => val(d[f.k]) !== "");
  if (vitalesCon.length) {
    const labels: Content[] = vitalesCon.map((f) => ({ text: f.l, style: "vitLabel" }));
    const values: Content[] = vitalesCon.map((f) => ({ text: val(d[f.k]), style: "vitVal" }));
    content.push(
      card("Signos Vitales y Antropometría", vitalesCon.map(() => "*"), [labels, values], (r) => (r === 1 ? NAVY_SOFT : null))
    );
  }

  // Motivo + Antecedentes → dos CUADROS lado a lado, MISMA ALTURA (una sola tabla).
  const motivoSpec = val(d.motivoConsulta)
    ? { title: "Motivo de Consulta", body: [paragraph(val(d.motivoConsulta))] }
    : null;
  const antPat = (Array.isArray(d.antecedentesPatologiaIds) ? d.antecedentesPatologiaIds : [])
    .map((id: string) => patologiaNombre(id, patologias));
  const antMed = medLines(d.antecedentesMedicamentoIds, predefinedMedicamentos);
  const antBody: Content[] = [];
  if (antPat.length) antBody.push(bullets("Patológicos", antPat));
  if (antMed.length) antBody.push(bullets("Medicamentos crónicos", antMed));
  const antSpec = antBody.length ? { title: "Antecedentes", body: antBody } : null;
  pushPair(content, motivoSpec, antSpec);

  // Examen Físico → CUADRO, dos sistemas por fila (tipo con fondo + descripción).
  const efCon = HCE_FISICO.filter((f) => val(d[f.k]) !== "");
  if (efCon.length) {
    const rows: Content[][] = [];
    for (let i = 0; i < efCon.length; i += 2) {
      const a = efCon[i];
      const b = efCon[i + 1];
      rows.push([
        cellLabel(a.l),
        cellVal(String(d[a.k]).trim()),
        b ? cellLabel(b.l) : cellVal(""),
        b ? cellVal(String(d[b.k]).trim()) : cellVal(""),
      ]);
    }
    content.push(card("Examen Físico", [78, "*", 78, "*"], rows, (_r, c) => (c === 0 || c === 2 ? NAVY_SOFT : null)));
  }

  // Lesiones / heridas → CUADRO (si hay)
  const lesLines = lesionLines(d.lesiones, tiposLesion);
  if (lesLines.length) content.push(cardText("Lesiones / Heridas", [bulletsPlain(lesLines)]));

  // Impresión + Plan → dos CUADROS lado a lado.
  const diagPat = (Array.isArray(d.diagnosticoPatologiaIds) ? d.diagnosticoPatologiaIds : [])
    .map((id: string) => patologiaNombre(id, patologias));
  const impBody: Content[] = [];
  if (diagPat.length) impBody.push(bulletsPlain(diagPat));
  if (val(d.impresionDiagnostica)) impBody.push(paragraph(val(d.impresionDiagnostica)));
  const impSpec = impBody.length ? { title: "Impresión Diagnóstica", body: impBody } : null;

  const receta = medLines(d.diagnosticoMedicamentoIds, predefinedMedicamentos);
  const planBody: Content[] = [];
  if (val(d.plan)) planBody.push(paragraph(val(d.plan)));
  if (receta.length) planBody.push(bullets("Indicaciones / Receta", receta));
  if (val(d.examenesParaclinicos)) planBody.push(bullets("Exámenes paraclínicos", [val(d.examenesParaclinicos)]));
  const planSpec = planBody.length ? { title: "Plan y Tratamiento", body: planBody } : null;
  pushPair(content, impSpec, planSpec);

  // Observaciones → CUADRO (si hay)
  if (val(d.notasDoctor)) content.push(cardText("Observaciones", [paragraph(val(d.notasDoctor))]));

  // Firma y sello → CUADRO a la derecha (banda "Médico Tratante").
  content.push({
    columns: [
      { width: "*", text: "" },
      { width: 250, stack: [firmaCard()] },
    ],
    margin: [0, 6, 0, 0],
  });

  // ── Documento ───────────────────────────────────────────────────────────────
  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [40, 92, 40, 50],
    info: {
      title: `Informe Médico - ${nombre}`,
      subject: "Informe médico de consulta",
    },
    // Membrete COMPACTO: logo de la Gobernación (izq) + campamento (centro) + logo
    // del Ministerio del Poder Popular para el Proceso Social de Trabajo (der).
    header: () => ({
      margin: [40, 12, 40, 0],
      stack: [
        {
          columns: [
            { width: 120, stack: [{ image: LOGO_DATA_URI, width: 40, height: 40 }] },
            {
              width: "*",
              alignment: "center",
              margin: [2, 6, 2, 0],
              stack: [
                { text: "CAMPAMENTO TRANSITORIO", style: "hdrKicker" },
                { text: refugioNombre || "—", style: "hdrTitle" },
              ],
            },
            LOGO_MPPPST_DATA_URI
              ? { width: 120, stack: [{ image: LOGO_MPPPST_DATA_URI, width: 116, alignment: "right", margin: [0, 6, 0, 0] }] }
              : { width: 120, text: "" },
          ],
        },
        {
          margin: [0, 6, 0, 0],
          canvas: [
            { type: "rect", x: 0, y: 0, w: CONTENT_W / 3, h: 3.2, color: TRI_AMARILLO },
            { type: "rect", x: CONTENT_W / 3, y: 0, w: CONTENT_W / 3, h: 3.2, color: TRI_AZUL },
            { type: "rect", x: (CONTENT_W / 3) * 2, y: 0, w: CONTENT_W / 3, h: 3.2, color: TRI_ROJO },
          ],
        },
      ],
    }),
    footer: (currentPage: number, pageCount: number) => ({
      margin: [40, 6, 40, 0],
      stack: [
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.5, lineColor: LINE }] },
        {
          margin: [0, 4, 0, 0],
          columns: [
            {
              width: "*",
              text: "Documento generado por el Sistema de Registro · Campamentos Transitorios",
              style: "footerText",
            },
            { width: "auto", text: `Página ${currentPage} de ${pageCount}`, style: "footerText", alignment: "right" },
          ],
        },
      ],
    }),
    content,
    defaultStyle: { font: "Roboto", fontSize: 9.5, color: INK, lineHeight: 1.12 },
    styles: {
      hdrKicker: { fontSize: 7.5, bold: true, color: MUTED, characterSpacing: 1.5, alignment: "center" },
      hdrTitle: { fontSize: 12.5, bold: true, color: NAVY, alignment: "center" },
      // Barra de título del documento (fondo azul, texto blanco).
      titleBar: { fontSize: 12.5, bold: true, color: "#FFFFFF" },
      titleBarRight: { fontSize: 8.5, color: "#FFFFFF", alignment: "right" },
      // Banda de título de cada CUADRO (fondo azul, texto blanco).
      cardBand: { fontSize: 8.5, bold: true, color: "#FFFFFF", characterSpacing: 0.4 },
      cellLabel: { fontSize: 8.4, bold: true, color: NAVY },
      cellVal: { fontSize: 9, color: INK },
      vitLabel: { fontSize: 7.6, bold: true, color: NAVY, alignment: "center" },
      vitVal: { fontSize: 9.5, bold: true, color: INK, alignment: "center" },
      para: { fontSize: 9, color: INK, alignment: "justify" },
      bulletHead: { fontSize: 8.4, bold: true, color: MUTED, margin: [0, 1, 0, 1] },
      firmaNombre: { fontSize: 9.5, bold: true, color: INK, alignment: "center" },
      firmaLabel: { fontSize: 8, color: MUTED, alignment: "center", margin: [0, 1, 0, 0] },
      footerText: { fontSize: 7.5, color: MUTED },
    },
  };

  // ── Render (pdfmake perezoso) ────────────────────────────────────────────────
  const pdfMakeMod: any = await import("pdfmake/build/pdfmake");
  const vfsMod: any = await import("pdfmake/build/vfs_fonts");
  const pdfMake = pdfMakeMod.default ?? pdfMakeMod;
  const vfs = vfsMod.default ?? vfsMod.vfs ?? vfsMod;
  if (vfs && !pdfMake.vfs) pdfMake.vfs = vfs;

  const nombreArchivo = `Informe_Medico_${(cedula || nombre).toString().replace(/[^\w]+/g, "_")}.pdf`;
  pdfMake.createPdf(docDefinition).download(nombreArchivo);
}

// ── Componentes de layout (ficha institucional: TODO en cuadros con marcos) ───
const BORDER = "#B4C0D8"; // línea de rejilla azulada (aspecto de formato de ente público)

const cellLabel = (t: string): Content => ({ text: t, style: "cellLabel" });
const cellVal = (t: string): Content => ({ text: t, style: "cellVal" });
const paragraph = (t: string): Content => ({ text: t, style: "para", margin: [0, 0, 0, 0] });

// Lista con subtítulo.
const bullets = (head: string, items: string[]): Content => ({
  stack: [
    { text: head, style: "bulletHead" },
    { ul: items, fontSize: 9, margin: [2, 0, 0, 0] },
  ],
});
// Lista sin subtítulo.
const bulletsPlain = (items: string[]): Content => ({ ul: items, fontSize: 9, margin: [2, 0, 0, 0] });

// Barra de título del documento: fila azul con el nombre (izq) + fecha (der).
const titleBar = (titulo: string, derecha: string): Content => ({
  table: {
    widths: ["*", "auto"],
    body: [[{ text: titulo, style: "titleBar" }, { text: derecha, style: "titleBarRight" }]],
  },
  layout: {
    hLineWidth: () => 0.6,
    vLineWidth: () => 0,
    hLineColor: () => BORDER,
    fillColor: () => NAVY,
    paddingLeft: () => 7,
    paddingRight: () => 7,
    paddingTop: () => 4,
    paddingBottom: () => 4,
  },
  margin: [0, 0, 0, 6],
});

// CUADRO institucional: tabla enmarcada con BANDA de título (fila azul, texto blanco,
// colSpan = nº de columnas) + las filas de datos. `fill(rowIndex, colIndex)` tiñe celdas
// de las filas de datos (etiquetas/tipos con fondo suave). Es la pieza base de la ficha.
const card = (
  title: string,
  widths: (number | string)[],
  rows: Content[][],
  fill?: (rowIndex: number, colIndex: number) => string | null,
): Content => {
  const ncol = widths.length;
  // Celdas de tabla (colSpan no está en el tipo `Content`) → tipado suelto.
  const band: any[] = [
    { text: title.toUpperCase(), style: "cardBand", colSpan: ncol },
    ...Array.from({ length: ncol - 1 }, () => ({})),
  ];
  return {
    table: { widths, headerRows: 1, body: [band, ...rows] as any },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      hLineColor: () => BORDER,
      vLineColor: () => BORDER,
      fillColor: (rowIndex: number, _node: any, colIndex: number) =>
        rowIndex === 0 ? NAVY : fill ? fill(rowIndex, colIndex) : null,
      paddingLeft: () => 5,
      paddingRight: () => 5,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    margin: [0, 0, 0, 6],
  };
};

// CUADRO de una columna cuyo cuerpo es texto/listas (Motivo, Antecedentes, Plan, etc.).
const cardText = (title: string, body: Content[]): Content =>
  card(title, ["*"], [[{ stack: body }]]);

// CUADRO de firma (banda "Médico Tratante" + espacio EN BLANCO para firmar/sellar a
// mano). No se imprime el nombre del médico (queda solo el espacio y la leyenda).
const firmaCard = (): Content =>
  card("Médico Tratante", ["*"], [[{
    stack: [
      { text: " ", margin: [0, 0, 0, 26] },
      { text: "Firma y sello del médico", style: "firmaLabel" },
    ],
  }]]);

// Spec de un CUADRO para emparejar (título + cuerpo).
type CardSpec = { title: string; body: Content[] };

// Dos CUADROS lado a lado con la MISMA ALTURA: van en UNA sola tabla de 3 columnas
// (A | separador | B). Como pertenecen a la misma fila, la fila toma el alto del mayor
// y ambos cuerpos se estiran a esa altura. Bordes por-celda (el separador sin bordes →
// deja el hueco visual entre ambos cuadros).
const pairCards = (a: CardSpec, b: CardSpec): Content => {
  const GAP = 10;
  const allB = [true, true, true, true];
  const noB = [false, false, false, false];
  const band = (t: string): any => ({ text: t.toUpperCase(), style: "cardBand", fillColor: NAVY, border: allB });
  const bodyCell = (nodes: Content[]): any => ({ stack: nodes, border: allB });
  const gap: any = { text: "", border: noB };
  return {
    table: {
      widths: ["*", GAP, "*"],
      body: [
        [band(a.title), gap, band(b.title)],
        [bodyCell(a.body), gap, bodyCell(b.body)],
      ] as any,
    },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      hLineColor: () => BORDER,
      vLineColor: () => BORDER,
      paddingLeft: (i: number) => (i === 1 ? 0 : 5),
      paddingRight: (i: number) => (i === 1 ? 0 : 5),
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    margin: [0, 0, 0, 6],
  };
};

// Empareja dos CUADROS a igual altura; si solo hay uno, va a ancho completo; si ninguno, nada.
const pushPair = (content: Content[], a: CardSpec | null, b: CardSpec | null): void => {
  if (a && b) content.push(pairCards(a, b));
  else if (a) content.push(cardText(a.title, a.body));
  else if (b) content.push(cardText(b.title, b.body));
};
