// ── Exportación XLSX con membrete y estilo (Consultas Médicas / Morbilidad) ──────
// Genera un Excel "bonito": membrete institucional (logo + títulos), fila de encabezado
// con color, filas zebra, bordes, ancho de columnas, panel congelado y autofiltro.
// exceljs se carga de forma PEREZOSA (dynamic import) para no engordar el bundle base.

import { patologiaNombres, medItemsText, tipoLesionNombre } from "@/lib/helpers";
import { TIPO_PACIENTE_LABELS, ESTADO_LESION_LABELS } from "@/lib/constants";
import type { Patologia, MedicamentoPredefinido, TipoLesion, Medicamento, Lesion } from "@/types";

const BRAND = "1E3A8A";        // azul institucional (mismo del PDF del censo)
const BRAND_LIGHT = "E8EDF7";  // fondo claro para el membrete
const ZEBRA = "F1F5F9";        // fila alterna

const fmtFechaHora = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

const lesionesText = (lesiones: Lesion[] | undefined, tiposLesion: TipoLesion[]): string =>
  (Array.isArray(lesiones) ? lesiones : [])
    .filter((l) => l?.tipoId)
    .map((l) => {
      const parts = [tipoLesionNombre(l.tipoId, tiposLesion)];
      if (l.zona) parts.push(l.zona);
      if (ESTADO_LESION_LABELS[l.estado]) parts.push(ESTADO_LESION_LABELS[l.estado]);
      const base = parts.join(" · ");
      return l.cura ? `${base} — Cura: ${l.cura}` : base;
    })
    .join("\n");

interface ExportOpts {
  consultas: any[]; // lista (filtrada) de { data, createdAt }
  patologias: Patologia[];
  predefinedMedicamentos: MedicamentoPredefinido[];
  tiposLesion: TipoLesion[];
  refugio: string;
  generadoEn: string; // fecha-hora legible (se pasa desde el componente)
  filtros?: string;   // descripción legible de los filtros activos (vacío = sin filtros)
}

// Definición de columnas: [encabezado, ancho]
const COLS: [string, number][] = [
  ["N°", 5],
  ["Fecha y hora", 18],
  ["Cédula", 14],
  ["Paciente", 26],
  ["Género", 11],
  ["Edad", 6],
  ["Tipo de atención", 18],
  ["Estado físico", 13],
  ["Embarazo", 10],
  ["Antecedentes · Patologías", 30],
  ["Antecedentes · Medicamentos", 30],
  ["Diagnóstico · Patologías", 30],
  ["Diagnóstico · Medicamentos (receta)", 32],
  ["Lesiones / heridas / curas", 36],
  ["Notas del médico", 30],
  ["Refugio", 20],
];

export async function exportMorbilidadExcel(opts: ExportOpts): Promise<void> {
  const { consultas, patologias, predefinedMedicamentos, tiposLesion, refugio, generadoEn, filtros } = opts;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Registro-SismoLg26";
  const ws = wb.addWorksheet("Consultas Médicas", {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const nCols = COLS.length;
  const lastColLetter = String.fromCharCode(64 + nCols); // 16 → 'P'

  // Anchos de columna
  ws.columns = COLS.map(([, w]) => ({ width: w }));

  // ── Membrete (filas 1–4) ──────────────────────────────────────────────────
  ws.mergeCells(`C1:${lastColLetter}1`);
  ws.mergeCells(`C2:${lastColLetter}2`);
  ws.mergeCells(`C3:${lastColLetter}3`);
  ws.mergeCells(`C4:${lastColLetter}4`);
  ws.mergeCells("A1:B4"); // hueco para el logo
  const t1 = ws.getCell("C1");
  t1.value = "GOBERNACIÓN DEL ESTADO LA GUAIRA";
  t1.font = { name: "Arial", size: 15, bold: true, color: { argb: BRAND } };
  t1.alignment = { vertical: "middle", horizontal: "left" };
  const t2 = ws.getCell("C2");
  t2.value = "Campamentos Transitorios 2026 · Consultas Médicas (Morbilidad)";
  t2.font = { name: "Arial", size: 11, bold: true, color: { argb: "374151" } };
  t2.alignment = { vertical: "middle", horizontal: "left" };
  const t3 = ws.getCell("C3");
  t3.value = `Campamento: ${refugio || "—"}   ·   Generado: ${generadoEn}   ·   Total de consultas: ${consultas.length}`;
  t3.font = { name: "Arial", size: 9, color: { argb: "6B7280" } };
  t3.alignment = { vertical: "middle", horizontal: "left" };
  // Fila 4: estado del filtro — discreto pero visible (label en negrita azul + detalle).
  const t4 = ws.getCell("C4");
  const filtrosTxt = (filtros || "").trim();
  t4.value = filtrosTxt
    ? { richText: [
        { text: "Filtros aplicados:  ", font: { name: "Arial", size: 9, bold: true, color: { argb: BRAND } } },
        { text: filtrosTxt, font: { name: "Arial", size: 9, color: { argb: "374151" } } },
      ] }
    : { richText: [{ text: "Sin filtros — reporte completo", font: { name: "Arial", size: 9, italic: true, color: { argb: "9CA3AF" } } }] };
  t4.alignment = { vertical: "middle", horizontal: "left" };
  // Banda de fondo del membrete + borde inferior azul
  for (let r = 1; r <= 4; r++) {
    ws.getRow(r).height = r === 1 ? 24 : r === 4 ? 16 : 18;
    for (let c = 1; c <= nCols; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
      if (r === 4) cell.border = { bottom: { style: "medium", color: { argb: BRAND } } };
    }
  }

  // Logo (best-effort; si falla, se omite y el archivo se genera igual).
  try {
    const res = await fetch("/logo_gob_push.png");
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const imgId = wb.addImage({ buffer: buf as any, extension: "png" });
      ws.addImage(imgId, { tl: { col: 0.25, row: 0.2 } as any, ext: { width: 92, height: 60 } });
    }
  } catch { /* sin logo */ }

  // Fila 5: espaciador delgado
  ws.getRow(5).height = 6;

  // ── Fila de encabezado (fila 6) ───────────────────────────────────────────
  const headerRow = ws.getRow(6);
  COLS.forEach(([label], i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = label;
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: BRAND } }, bottom: { style: "thin", color: { argb: BRAND } },
      left: { style: "thin", color: { argb: "FFFFFF" } }, right: { style: "thin", color: { argb: "FFFFFF" } },
    };
  });
  headerRow.height = 30;

  // ── Filas de datos ────────────────────────────────────────────────────────
  consultas.forEach((c, idx) => {
    const d = c.data || {};
    const genero = (d.genero || "").toUpperCase();
    const embarazoTxt = genero === "FEMENINO" ? (d.embarazo === "SI" ? "Sí" : "No") : "—";
    const values = [
      idx + 1,
      fmtFechaHora(d.fechaConsulta || c.createdAt),
      d.cedula || "",
      d.nombreApellido || "",
      genero === "FEMENINO" ? "Femenino" : genero === "MASCULINO" ? "Masculino" : (d.genero || ""),
      d.edad ?? "",
      TIPO_PACIENTE_LABELS[d.tipoPaciente] || d.tipoPaciente || "Refugiado",
      d.estadoFisico === "LESIONADO" ? "Lesionado" : d.estadoFisico === "ILESO" ? "Ileso" : "",
      embarazoTxt,
      patologiaNombres(d.antecedentesPatologiaIds, patologias).join(", "),
      medItemsText(d.antecedentesMedicamentoIds as Medicamento[], predefinedMedicamentos),
      patologiaNombres(d.diagnosticoPatologiaIds, patologias).join(", "),
      medItemsText(d.diagnosticoMedicamentoIds as Medicamento[], predefinedMedicamentos),
      lesionesText(d.lesiones, tiposLesion),
      d.notasDoctor || "",
      d.refugio || refugio || "",
    ];
    const row = ws.addRow(values);
    const zebra = idx % 2 === 1;
    row.eachCell((cell, col) => {
      cell.font = { name: "Arial", size: 9, color: { argb: "1F2937" } };
      cell.alignment = { vertical: "top", horizontal: col <= 2 || col === 6 || col === 9 ? "center" : "left", wrapText: true };
      cell.border = {
        top: { style: "hair", color: { argb: "D1D5DB" } }, bottom: { style: "hair", color: { argb: "D1D5DB" } },
        left: { style: "hair", color: { argb: "E5E7EB" } }, right: { style: "hair", color: { argb: "E5E7EB" } },
      };
      if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    });
    // Resalta "Lesionado" en rojo y "Sí" (embarazo) en rosa.
    if (d.estadoFisico === "LESIONADO") row.getCell(8).font = { name: "Arial", size: 9, bold: true, color: { argb: "DC2626" } };
    if (embarazoTxt === "Sí") row.getCell(9).font = { name: "Arial", size: 9, bold: true, color: { argb: "DB2777" } };
  });

  // Autofiltro sobre el encabezado.
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: nCols } };

  // ── Descarga ──────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeRef = (refugio || "refugio").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40);
  a.href = url;
  a.download = `consultas_morbilidad_${safeRef}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
