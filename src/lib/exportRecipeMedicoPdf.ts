// ── Recipe Médico + Indicaciones (PDF) ──────────────────────────────────────
// Documento HORIZONTAL (landscape), UNA hoja, con la identidad institucional:
//   · IZQUIERDA  = INDICACIONES MÉDICAS (cada fármaco con su posología: período + duración)
//   · DERECHA    = RECIPE (lista numerada de fármacos + concentración, para la farmacia)
// Ambos paneles comparten fecha, datos del paciente y "Firma y sello del médico".
// Se arma con los MEDICAMENTOS DIAGNOSTICADOS (receta) de la consulta. pdfmake perezoso.

import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import { medLabel, duracionText } from "@/lib/helpers";
import { LOGO_GOB_PNG_BASE64 } from "@/lib/logoAsset";
import { LOGO_MPPPST_PNG_BASE64 } from "@/lib/logoMinisterioAsset";
import type { MedicamentoPredefinido, Medicamento } from "@/types";

const NAVY = "#1E3A8A";
const NAVY_SOFT = "#E8EDF7";
const INK = "#0F172A";
const MUTED = "#475569";
const BORDER = "#B4C0D8";
const TRI_A = "#FCD116";
const TRI_B = "#00247D";
const TRI_R = "#CF142B";

const LOGO_GOB = `data:image/png;base64,${LOGO_GOB_PNG_BASE64}`;
const LOGO_MPPPST = LOGO_MPPPST_PNG_BASE64 ? `data:image/png;base64,${LOGO_MPPPST_PNG_BASE64}` : "";
const SLIP_INNER = 370; // ancho útil aprox. dentro de cada volante (tricolor/líneas)

const val = (v: any): string => (v == null ? "" : String(v).trim());
const dash = (v: any): string => val(v) || "—";

const fechaLarga = (iso?: string): string => {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "—";
  const s = d.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

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

export interface RecipeMedicoOpts {
  consulta: any; // { data, createdAt }
  predefinedMedicamentos: MedicamentoPredefinido[];
  registro?: any;
}

export async function exportRecipeMedicoPdf(opts: RecipeMedicoOpts): Promise<void> {
  const { consulta, predefinedMedicamentos, registro } = opts;
  const d = consulta?.data || {};

  const nombre = dash(d.nombreApellido);
  const cedula = val(d.cedula) ? val(d.cedula).replace(/\D/g, "") : "—";
  const sexo = dash(d.genero);
  const fnac = val(d.fechaNacimiento) || val(registro?.fechaNacimiento);
  const edad = val(d.edad != null ? d.edad : "") || edadDe(fnac);
  const fecha = fechaLarga(d.fechaConsulta || consulta?.createdAt);
  const refugioNombre = val(d.refugio).toUpperCase();

  // Medicamentos de la receta (diagnóstico).
  const meds: Medicamento[] = (Array.isArray(d.diagnosticoMedicamentoIds) ? d.diagnosticoMedicamentoIds : []).filter(
    (m: Medicamento) => m?.id
  );
  const medName = (m: Medicamento) => {
    const base = medLabel(m.id, predefinedMedicamentos);
    return val(m.dosis) ? `${base} — ${val(m.dosis)}` : base;
  };
  const medPosologia = (m: Medicamento) => {
    const dur = duracionText(m);
    return [val(m.periodo), dur ? `por ${dur}` : ""].filter(Boolean).join(" · ");
  };

  // Nº de renglones: al menos 6, o los que haya (para que la farmacia pueda añadir a mano).
  // Al menos 10 renglones numerados (para escribir hasta ~10 a mano); crece si hay más.
  const SLOTS = Math.max(10, meds.length);

  // ── RECIPE (derecha): tabla numerada de renglones (fármaco + concentración) ──
  const recipeRows: any[][] = [];
  for (let i = 0; i < SLOTS; i++) {
    const m = meds[i];
    recipeRows.push([
      { text: `${i + 1}.`, style: "num" },
      { text: m ? medName(m) : "", style: "recipeItem" },
    ]);
  }
  const recipeList: Content = {
    table: { widths: [16, "*"], body: recipeRows },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 ? 0 : i === node.table.body.length ? 0 : 0.6),
      vLineWidth: () => 0,
      hLineColor: () => BORDER,
      paddingLeft: () => 2,
      paddingRight: () => 4,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  };

  // ── INDICACIONES (izquierda): fármaco + posología por renglón ──
  const indRows: any[][] = [];
  for (let i = 0; i < SLOTS; i++) {
    const m = meds[i];
    indRows.push([
      { text: `${i + 1}.`, style: "num" },
      m
        ? { stack: [{ text: medName(m), style: "indName" }, ...(medPosologia(m) ? [{ text: medPosologia(m), style: "indPos" }] : [])] }
        : { text: "" },
    ]);
  }
  const indList: Content = {
    table: { widths: [16, "*"], body: indRows },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 ? 0 : i === node.table.body.length ? 0 : 0.6),
      vLineWidth: () => 0,
      hLineColor: () => BORDER,
      paddingLeft: () => 2,
      paddingRight: () => 4,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  };

  // Cuadro de identidad (compacto) reutilizable en ambos paneles.
  const identidad = (): Content => ({
    table: {
      widths: [52, "*", 34, 62],
      body: [
        [cl("Paciente"), { text: nombre, style: "cv", colSpan: 3 }, {}, {}],
        [cl("Edad"), cv(edad ? `${edad} años` : "—"), cl("Sexo"), cv(sexo)],
        [cl("Cédula"), { text: cedula, style: "cv", colSpan: 3 }, {}, {}],
      ] as any,
    },
    layout: framed,
    margin: [0, 0, 0, 6],
  });

  const firma = (): Content => ({
    margin: [0, 14, 0, 0],
    stack: [
      { text: " ", margin: [0, 0, 0, 14] },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.7, lineColor: INK }], alignment: "center" },
      { text: "Firma y sello del médico", style: "firmaLabel" },
    ],
  });

  // ── Membrete COMPACTO por volante (se repite en cada mitad para poder RECORTAR): logo
  //    Gobernación + campamento + logo MPPPST + tricolor, al ancho de la mitad. ──
  const membrete = (): Content => ({
    margin: [0, 0, 0, 5],
    stack: [
      {
        columns: [
          { width: 34, stack: [{ image: LOGO_GOB, width: 30, height: 30 }] },
          {
            width: "*",
            alignment: "center",
            margin: [2, 3, 2, 0],
            stack: [
              { text: "CAMPAMENTO TRANSITORIO", style: "kicker" },
              { text: refugioNombre || "—", style: "campamento" },
            ],
          },
          LOGO_MPPPST
            ? { width: 78, stack: [{ image: LOGO_MPPPST, width: 74, alignment: "right", margin: [0, 4, 0, 0] }] }
            : { width: 78, text: "" },
        ],
        columnGap: 4,
      },
      {
        margin: [0, 4, 0, 0],
        canvas: [
          { type: "rect", x: 0, y: 0, w: SLIP_INNER / 3, h: 2.5, color: TRI_A },
          { type: "rect", x: SLIP_INNER / 3, y: 0, w: SLIP_INNER / 3, h: 2.5, color: TRI_B },
          { type: "rect", x: (SLIP_INNER / 3) * 2, y: 0, w: SLIP_INNER / 3, h: 2.5, color: TRI_R },
        ],
      },
    ],
  });

  // Barra de título (navy) con el nombre del volante + fecha.
  const titleStrip = (title: string): Content => ({
    table: {
      widths: ["*"],
      body: [[{ columns: [{ text: title, style: "panelTitle", width: "*" }, { text: `Fecha: ${fecha}`, style: "panelFecha", width: "auto" }], fillColor: NAVY }]] as any,
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 3.5, paddingBottom: () => 3.5 },
    margin: [0, 0, 0, 5],
  });

  // Un volante COMPLETO (membrete + título + identidad + lista + firma) → cada mitad se
  // corta y queda autónoma.
  const slipBody = (title: string, listNode: Content): Content[] => [membrete(), titleStrip(title), identidad(), listNode, firma()];

  // Los dos volantes lado a lado; la línea VERTICAL del centro va PUNTEADA (guía de corte).
  const twoSlips: Content = {
    table: {
      widths: ["*", "*"],
      body: [[
        { stack: slipBody("INDICACIONES MÉDICAS", indList), border: [true, true, true, true] },
        { stack: slipBody("RECIPE MÉDICO", recipeList), border: [true, true, true, true] },
      ]] as any,
    },
    layout: {
      hLineWidth: () => 0.8,
      vLineWidth: () => 0.8,
      hLineColor: () => "#64748b",
      vLineColor: () => "#94a3b8",
      vLineStyle: (i: number) => (i === 1 ? { dash: { length: 4, space: 3 } } : null),
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: () => 8,
      paddingBottom: () => 8,
    },
  };

  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [20, 20, 20, 34],
    info: { title: `Recipe Médico - ${nombre}`, subject: "Recipe médico e indicaciones" },
    footer: () => ({
      margin: [20, 4, 20, 0],
      text: "Recorte por la línea central punteada — RECIPE (farmacia)  ·  INDICACIONES (paciente).",
      alignment: "center",
      style: "cutNote",
    }),
    content: [twoSlips],
    defaultStyle: { font: "Roboto", fontSize: 9.5, color: INK, lineHeight: 1.12 },
    styles: {
      kicker: { fontSize: 7.5, bold: true, color: MUTED, characterSpacing: 1.5, alignment: "center" },
      campamento: { fontSize: 12, bold: true, color: NAVY, alignment: "center" },
      panelTitle: { fontSize: 11, bold: true, color: "#FFFFFF" },
      panelFecha: { fontSize: 8, color: "#FFFFFF", alignment: "right" },
      sectionMini: { fontSize: 8.5, bold: true, color: NAVY, margin: [0, 2, 0, 3], characterSpacing: 0.5 },
      cl: { fontSize: 8, bold: true, color: NAVY },
      cv: { fontSize: 9, color: INK },
      num: { fontSize: 9, bold: true, color: MUTED },
      recipeItem: { fontSize: 10, color: INK },
      indName: { fontSize: 10, bold: true, color: INK },
      indPos: { fontSize: 8.5, color: MUTED, margin: [0, 1, 0, 0] },
      firmaLabel: { fontSize: 8, color: MUTED, alignment: "center", margin: [0, 2, 0, 0] },
      cutNote: { fontSize: 7.5, color: MUTED, italics: true },
    },
  };

  const pdfMakeMod: any = await import("pdfmake/build/pdfmake");
  const vfsMod: any = await import("pdfmake/build/vfs_fonts");
  const pdfMake = pdfMakeMod.default ?? pdfMakeMod;
  const vfs = vfsMod.default ?? vfsMod.vfs ?? vfsMod;
  if (vfs && !pdfMake.vfs) pdfMake.vfs = vfs;

  const nombreArchivo = `Recipe_Medico_${(cedula || nombre).toString().replace(/[^\w]+/g, "_")}.pdf`;
  pdfMake.createPdf(docDefinition).download(nombreArchivo);
}

// ── Helpers de layout ────────────────────────────────────────────────────────
const cl = (t: string): Content => ({ text: t, style: "cl" });
const cv = (t: string): Content => ({ text: t, style: "cv" });
const sectionMini = (t: string): Content => ({ text: t, style: "sectionMini" });

const framed = {
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => BORDER,
  vLineColor: () => BORDER,
  fillColor: (_r: number, _n: any, c: number) => (c === 0 || c === 2 ? NAVY_SOFT : null),
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 2.5,
  paddingBottom: () => 2.5,
};
