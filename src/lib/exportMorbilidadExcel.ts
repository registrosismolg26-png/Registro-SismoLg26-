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
  alcance?: string;   // ej: "Reporte del día: 27/07/2026" o "Reporte completo"
  diaExport?: string; // yyyy-mm-dd opcional para nombrar el archivo
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
  const { consultas, patologias, predefinedMedicamentos, tiposLesion, refugio, generadoEn, filtros, alcance, diaExport } = opts;
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
  t3.value = `Campamento: ${refugio || "—"}   ·   Generado: ${generadoEn}   ·   Total de consultas: ${consultas.length}${alcance ? `   ·   Alcance: ${alcance}` : ""}`;
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
  let logoImgId: any = null;
  try {
    const res = await fetch("/logo_gob_push.png");
    if (res.ok) {
      const buf = await res.arrayBuffer();
      logoImgId = wb.addImage({ buffer: buf as any, extension: "png" });
      ws.addImage(logoImgId, { tl: { col: 0.25, row: 0.2 } as any, ext: { width: 92, height: 60 } });
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

  // ── HOJA 2: Resumen Estadístico ───────────────────────────────────────────
  const ws2 = wb.addWorksheet("Resumen Estadístico", {
    views: [{ state: "normal" }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws2.columns = [
    { width: 32 }, // A: Categorías / Indicadores / Grupos de edad
    { width: 18 }, // B: Femenino / Cantidad / Casos
    { width: 18 }, // C: Masculino / Porcentaje / Tasa
    { width: 18 }, // D: Total / Estatus / Clasificación
    { width: 28 }, // E: Observación / Detalle
  ];

  // Membrete Hoja 2 (filas 1-4)
  ws2.mergeCells("C1:E1");
  ws2.mergeCells("C2:E2");
  ws2.mergeCells("C3:E3");
  ws2.mergeCells("C4:E4");
  ws2.mergeCells("A1:B4");
  const t1_2 = ws2.getCell("C1");
  t1_2.value = "GOBERNACIÓN DEL ESTADO LA GUAIRA";
  t1_2.font = { name: "Arial", size: 15, bold: true, color: { argb: BRAND } };
  t1_2.alignment = { vertical: "middle", horizontal: "left" };
  const t2_2 = ws2.getCell("C2");
  t2_2.value = "Campamentos Transitorios 2026 · Resumen Estadístico de Morbilidad";
  t2_2.font = { name: "Arial", size: 11, bold: true, color: { argb: "374151" } };
  t2_2.alignment = { vertical: "middle", horizontal: "left" };
  const t3_2 = ws2.getCell("C3");
  t3_2.value = `Campamento: ${refugio || "—"}   ·   Generado: ${generadoEn}   ·   Muestra analizada: ${consultas.length} consultas`;
  t3_2.font = { name: "Arial", size: 9, color: { argb: "6B7280" } };
  t3_2.alignment = { vertical: "middle", horizontal: "left" };
  const t4_2 = ws2.getCell("C4");
  t4_2.value = filtrosTxt
    ? { richText: [
        { text: "Alcance y Filtros:  ", font: { name: "Arial", size: 9, bold: true, color: { argb: BRAND } } },
        { text: `${alcance ? `${alcance}   ·   ` : ""}${filtrosTxt}`, font: { name: "Arial", size: 9, color: { argb: "374151" } } },
      ] }
    : { richText: [{ text: `Reporte estadístico — ${alcance || "Historial completo"}`, font: { name: "Arial", size: 9, italic: true, color: { argb: "9CA3AF" } } }] };
  t4_2.alignment = { vertical: "middle", horizontal: "left" };

  for (let r = 1; r <= 4; r++) {
    ws2.getRow(r).height = r === 1 ? 24 : r === 4 ? 16 : 18;
    for (let c = 1; c <= 5; c++) {
      const cell = ws2.getRow(r).getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
      if (r === 4) cell.border = { bottom: { style: "medium", color: { argb: BRAND } } };
    }
  }

  if (logoImgId) {
    try { ws2.addImage(logoImgId, { tl: { col: 0.25, row: 0.2 } as any, ext: { width: 92, height: 60 } }); } catch {}
  }

  const styleCell = (cell: any, s: { font?: any; align?: any; fill?: string; border?: any }) => {
    if (s.font) cell.font = s.font;
    if (s.align) cell.alignment = s.align;
    if (s.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: s.fill } };
    if (s.border) cell.border = s.border;
  };

  let currRow = 6;

  // ── SECCIÓN 1: INDICADORES CLAVE DE MORBILIDAD ──
  ws2.mergeCells(`A${currRow}:E${currRow}`);
  const sec1 = ws2.getCell(`A${currRow}`);
  sec1.value = "1. INDICADORES CLAVE DE ATENCIÓN MÉDICA";
  styleCell(sec1, { font: { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } }, fill: BRAND, align: { vertical: "middle", horizontal: "left" } });
  ws2.getRow(currRow).height = 26;
  currRow++;

  const kpiHeaders = ["INDICADOR CLAVE", "CANTIDAD", "PORCENTAJE / TASA", "CLASIFICACIÓN", "OBSERVACIÓN"];
  const rKpiHead = ws2.getRow(currRow);
  kpiHeaders.forEach((h, idx) => {
    const c = rKpiHead.getCell(idx + 1);
    c.value = h;
    styleCell(c, { font: { name: "Arial", size: 9, bold: true, color: { argb: "1E3A8A" } }, fill: "E2E8F0", align: { vertical: "middle", horizontal: idx === 0 ? "left" : "center" }, border: { top: { style: "thin", color: { argb: "CBD5E1" } }, bottom: { style: "thin", color: { argb: "CBD5E1" } } } });
  });
  rKpiHead.height = 22;
  currRow++;

  const totalCons = consultas.length || 1;
  const uniqueCedulas = new Set(consultas.map((c) => String(c.data?.cedula || c.data?.registroId || c.id).trim().toUpperCase())).size;
  const lesionadosCnt = consultas.filter((c) => c.data?.estadoFisico === "LESIONADO").length;
  const embaCnt = consultas.filter((c) => c.data?.genero === "FEMENINO" && c.data?.embarazo === "SI").length;
  const conRecetaCnt = consultas.filter((c) => Array.isArray(c.data?.diagnosticoMedicamentoIds) && c.data.diagnosticoMedicamentoIds.length > 0).length;
  const conCuraCnt = consultas.filter((c) => Array.isArray(c.data?.lesiones) && c.data.lesiones.some((l: any) => l?.cura)).length;

  const kpisData = [
    ["Total de Consultas Atendidas", consultas.length, "100.0%", "Atención Médica", "Muestra total del reporte actual"],
    ["Pacientes Únicos Atendidos", uniqueCedulas, `${((uniqueCedulas / totalCons) * 100).toFixed(1)}%`, "Cobertura", "Cédulas o historiales clínicos distintos"],
    ["Pacientes en Estado Lesionado", lesionadosCnt, `${((lesionadosCnt / totalCons) * 100).toFixed(1)}%`, lesionadosCnt > 0 ? "Alerta Médica" : "Normal", "Consultas por emergencia o lesión física"],
    ["Mujeres Embarazadas Atendidas", embaCnt, `${((embaCnt / totalCons) * 100).toFixed(1)}%`, embaCnt > 0 ? "Atención Prioritaria" : "Normal", "Control y monitoreo prenatal en refugio"],
    ["Consultas con Receta (Medicamento)", conRecetaCnt, `${((conRecetaCnt / totalCons) * 100).toFixed(1)}%`, "Farmacia", "Prescripciones de medicamentos entregadas"],
    ["Consultas con Curas / Tratamientos", conCuraCnt, `${((conCuraCnt / totalCons) * 100).toFixed(1)}%`, "Enfermería", "Heridas curadas o tratamientos tópicos"],
  ];

  kpisData.forEach((rowVals, idx) => {
    const r = ws2.getRow(currRow);
    rowVals.forEach((val, cIdx) => {
      const cell = r.getCell(cIdx + 1);
      cell.value = val;
      const zebraFill = idx % 2 === 1 ? ZEBRA : "FFFFFF";
      styleCell(cell, {
        font: { name: "Arial", size: 9, bold: cIdx === 1, color: { argb: cIdx === 1 && (idx === 2 && lesionadosCnt > 0 ? "DC2626" : idx === 3 && embaCnt > 0 ? "DB2777" : "1F2937") } },
        fill: zebraFill,
        align: { vertical: "middle", horizontal: cIdx === 0 || cIdx === 4 ? "left" : "center" },
        border: { bottom: { style: "hair", color: { argb: "E5E7EB" } }, left: { style: "hair", color: { argb: "F3F4F6" } }, right: { style: "hair", color: { argb: "F3F4F6" } } },
      });
    });
    r.height = 20;
    currRow++;
  });

  currRow++; // espaciador

  // ── SECCIÓN 2: DISTRIBUCIÓN POR EDAD Y GÉNERO (ADJUNTO 1) ──
  ws2.mergeCells(`A${currRow}:E${currRow}`);
  const sec2 = ws2.getCell(`A${currRow}`);
  sec2.value = "2. DISTRIBUCIÓN POR EDAD Y GÉNERO";
  styleCell(sec2, { font: { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } }, fill: BRAND, align: { vertical: "middle", horizontal: "left" } });
  ws2.getRow(currRow).height = 26;
  currRow++;

  const demoHeaders = ["GRUPO DE EDAD", "FEMENINO", "MASCULINO", "TOTAL", "PORCENTAJE"];
  const rDemoHead = ws2.getRow(currRow);
  demoHeaders.forEach((h, idx) => {
    const c = rDemoHead.getCell(idx + 1);
    c.value = h;
    styleCell(c, { font: { name: "Arial", size: 9, bold: true, color: { argb: "1E3A8A" } }, fill: "E2E8F0", align: { vertical: "middle", horizontal: idx === 0 ? "left" : "center" }, border: { top: { style: "thin", color: { argb: "CBD5E1" } }, bottom: { style: "thin", color: { argb: "CBD5E1" } } } });
  });
  rDemoHead.height = 24;
  currRow++;

  const GRUPOS_EDAD_LABELS = [
    "Lactante Menor (<1)",
    "Lactante Mayor (1–2)",
    "Preescolar (3–5)",
    "Escolar (6–11)",
    "Adolescente (12–17)",
    "Adulto (18–59)",
    "Adulto Mayor (60+)",
  ];

  const getGrupoIdx = (c: any): number => {
    const d = c.data || {};
    let ageNum = -1;
    if (d.fechaNacimiento) {
      const fn = new Date(d.fechaNacimiento.length === 10 ? d.fechaNacimiento + "T00:00:00" : d.fechaNacimiento);
      if (!isNaN(fn.getTime())) {
        const t = new Date(d.fechaConsulta || c.createdAt || Date.now());
        ageNum = t.getFullYear() - fn.getFullYear();
        const m = t.getMonth() - fn.getMonth();
        if (m < 0 || (m === 0 && t.getDate() < fn.getDate())) ageNum--;
      }
    }
    if (ageNum < 0 && d.edad !== undefined && d.edad !== null && d.edad !== "") {
      const s = String(d.edad).trim();
      if (s.toLowerCase().includes("mes") || s === "<1" || s === "0") return 0;
      const n = parseInt(s, 10);
      if (!isNaN(n)) ageNum = n;
    }
    if (ageNum < 0) return 5; // fallback Adulto
    if (ageNum < 1) return 0;
    if (ageNum <= 2) return 1;
    if (ageNum <= 5) return 2;
    if (ageNum <= 11) return 3;
    if (ageNum <= 17) return 4;
    return 6;
  };

  const matrix = Array.from({ length: 7 }, () => [0, 0]); // [fem, masc]
  consultas.forEach((c) => {
    const gen = (c.data?.genero || "").toUpperCase();
    const gIdx = gen === "FEMENINO" ? 0 : 1; // masculino u otro va en col 1
    const eIdx = getGrupoIdx(c);
    matrix[eIdx][gIdx]++;
  });

  let totalFem = 0;
  let totalMasc = 0;

  GRUPOS_EDAD_LABELS.forEach((grupoLabel, i) => {
    const fem = matrix[i][0];
    const masc = matrix[i][1];
    const tot = fem + masc;
    totalFem += fem;
    totalMasc += masc;
    const pct = `${((tot / totalCons) * 100).toFixed(1)}%`;

    const r = ws2.getRow(currRow);
    styleCell(r.getCell(1), { font: { name: "Arial", size: 9, bold: true, color: { argb: "1F2937" } }, fill: "FFFFFF", align: { vertical: "middle", horizontal: "left" }, border: { bottom: { style: "hair", color: { argb: "E5E7EB" } }, left: { style: "hair", color: { argb: "F3F4F6" } }, right: { style: "hair", color: { argb: "F3F4F6" } } } });
    r.getCell(1).value = grupoLabel;

    styleCell(r.getCell(2), { font: { name: "Arial", size: 10, bold: fem > 0, color: { argb: fem > 0 ? "831843" : "9CA3AF" } }, fill: fem > 0 ? "FCE7F3" : "FDF2F8", align: { vertical: "middle", horizontal: "center" }, border: { bottom: { style: "hair", color: { argb: "E5E7EB" } }, left: { style: "hair", color: { argb: "FBCFE8" } }, right: { style: "hair", color: { argb: "FBCFE8" } } } });
    r.getCell(2).value = fem;

    styleCell(r.getCell(3), { font: { name: "Arial", size: 10, bold: masc > 0, color: { argb: masc > 0 ? "1E3A8A" : "9CA3AF" } }, fill: masc > 0 ? "DBEAFE" : "EFF6FF", align: { vertical: "middle", horizontal: "center" }, border: { bottom: { style: "hair", color: { argb: "E5E7EB" } }, left: { style: "hair", color: { argb: "BFDBFE" } }, right: { style: "hair", color: { argb: "BFDBFE" } } } });
    r.getCell(3).value = masc;

    styleCell(r.getCell(4), { font: { name: "Arial", size: 10, bold: true, color: { argb: tot > 0 ? "0F172A" : "9CA3AF" } }, fill: "F1F5F9", align: { vertical: "middle", horizontal: "center" }, border: { bottom: { style: "hair", color: { argb: "E5E7EB" } }, left: { style: "hair", color: { argb: "E2E8F0" } }, right: { style: "hair", color: { argb: "E2E8F0" } } } });
    r.getCell(4).value = tot;

    styleCell(r.getCell(5), { font: { name: "Arial", size: 9, color: { argb: "475569" } }, fill: "FFFFFF", align: { vertical: "middle", horizontal: "center" }, border: { bottom: { style: "hair", color: { argb: "E5E7EB" } } } });
    r.getCell(5).value = pct;

    r.height = 22;
    currRow++;
  });

  // Fila Total de la tabla demográfica
  const rTotDemo = ws2.getRow(currRow);
  styleCell(rTotDemo.getCell(1), { font: { name: "Arial", size: 10, bold: true, color: { argb: "0F172A" } }, fill: "E2E8F0", align: { vertical: "middle", horizontal: "left" }, border: { top: { style: "medium", color: { argb: "64748B" } }, bottom: { style: "double", color: { argb: "64748B" } } } });
  rTotDemo.getCell(1).value = "Total";

  styleCell(rTotDemo.getCell(2), { font: { name: "Arial", size: 11, bold: true, color: { argb: "831843" } }, fill: "FBCFE8", align: { vertical: "middle", horizontal: "center" }, border: { top: { style: "medium", color: { argb: "F472B6" } }, bottom: { style: "double", color: { argb: "F472B6" } } } });
  rTotDemo.getCell(2).value = totalFem;

  styleCell(rTotDemo.getCell(3), { font: { name: "Arial", size: 11, bold: true, color: { argb: "1E3A8A" } }, fill: "BFDBFE", align: { vertical: "middle", horizontal: "center" }, border: { top: { style: "medium", color: { argb: "60A5FA" } }, bottom: { style: "double", color: { argb: "60A5FA" } } } });
  rTotDemo.getCell(3).value = totalMasc;

  styleCell(rTotDemo.getCell(4), { font: { name: "Arial", size: 11, bold: true, color: { argb: "0F172A" } }, fill: "CBD5E1", align: { vertical: "middle", horizontal: "center" }, border: { top: { style: "medium", color: { argb: "64748B" } }, bottom: { style: "double", color: { argb: "64748B" } } } });
  rTotDemo.getCell(4).value = totalFem + totalMasc;

  styleCell(rTotDemo.getCell(5), { font: { name: "Arial", size: 10, bold: true, color: { argb: "0F172A" } }, fill: "E2E8F0", align: { vertical: "middle", horizontal: "center" }, border: { top: { style: "medium", color: { argb: "64748B" } }, bottom: { style: "double", color: { argb: "64748B" } } } });
  rTotDemo.getCell(5).value = "100.0%";
  rTotDemo.height = 24;
  currRow += 2; // espaciador

  // ── SECCIÓN 3: TOP 5 PATOLOGÍAS DIAGNOSTICADAS ──
  ws2.mergeCells(`A${currRow}:E${currRow}`);
  const sec3 = ws2.getCell(`A${currRow}`);
  sec3.value = "3. PATOLOGÍAS DIAGNOSTICADAS MÁS FRECUENTES (TOP 5)";
  styleCell(sec3, { font: { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } }, fill: BRAND, align: { vertical: "middle", horizontal: "left" } });
  ws2.getRow(currRow).height = 26;
  currRow++;

  const patHead = ["PATOLOGÍA DIAGNOSTICADA", "CASOS REGISTRADOS", "% DEL TOTAL", "CLASIFICACIÓN", "TENDENCIA"];
  const rPatHead = ws2.getRow(currRow);
  patHead.forEach((h, idx) => {
    const c = rPatHead.getCell(idx + 1);
    c.value = h;
    styleCell(c, { font: { name: "Arial", size: 9, bold: true, color: { argb: "1E3A8A" } }, fill: "E2E8F0", align: { vertical: "middle", horizontal: idx === 0 ? "left" : "center" }, border: { top: { style: "thin", color: { argb: "CBD5E1" } }, bottom: { style: "thin", color: { argb: "CBD5E1" } } } });
  });
  rPatHead.height = 22;
  currRow++;

  const patMap = new Map<string, number>();
  let totalDiagPats = 0;
  consultas.forEach((c) => {
    const ids = Array.isArray(c.data?.diagnosticoPatologiaIds) ? c.data.diagnosticoPatologiaIds : [];
    ids.forEach((id: string) => {
      const p = patologias.find((item) => item.id === id);
      const nombre = p ? p.nombre : "Otra patología";
      patMap.set(nombre, (patMap.get(nombre) || 0) + 1);
      totalDiagPats++;
    });
  });

  const topPats = Array.from(patMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topPats.length === 0) {
    const r = ws2.getRow(currRow);
    ws2.mergeCells(`A${currRow}:E${currRow}`);
    r.getCell(1).value = "Sin diagnósticos patológicos registrados en el período analizado.";
    styleCell(r.getCell(1), { font: { name: "Arial", size: 9, italic: true, color: { argb: "6B7280" } }, fill: "FFFFFF", align: { vertical: "middle", horizontal: "center" }, border: { bottom: { style: "hair", color: { argb: "E5E7EB" } } } });
    r.height = 22;
    currRow++;
  } else {
    topPats.forEach(([nombre, cnt], idx) => {
      const r = ws2.getRow(currRow);
      const pct = `${((cnt / (totalDiagPats || 1)) * 100).toFixed(1)}%`;
      const zebraFill = idx % 2 === 1 ? ZEBRA : "FFFFFF";
      r.getCell(1).value = `${idx + 1}. ${nombre}`;
      r.getCell(2).value = cnt;
      r.getCell(3).value = pct;
      r.getCell(4).value = "Diagnóstico Médico";
      r.getCell(5).value = idx === 0 ? "Mayor incidencia" : "Incidencia frecuente";
      [1, 2, 3, 4, 5].forEach((cIdx) => {
        styleCell(r.getCell(cIdx), {
          font: { name: "Arial", size: 9, bold: cIdx === 1 || cIdx === 2, color: { argb: cIdx === 2 ? "1E3A8A" : "1F2937" } },
          fill: zebraFill,
          align: { vertical: "middle", horizontal: cIdx === 1 ? "left" : "center" },
          border: { bottom: { style: "hair", color: { argb: "E5E7EB" } }, left: { style: "hair", color: { argb: "F3F4F6" } }, right: { style: "hair", color: { argb: "F3F4F6" } } },
        });
      });
      r.height = 20;
      currRow++;
    });
  }

  currRow++; // espaciador

  // ── SECCIÓN 4: TOP 5 MEDICAMENTOS MÁS RECETADOS ──
  ws2.mergeCells(`A${currRow}:E${currRow}`);
  const sec4 = ws2.getCell(`A${currRow}`);
  sec4.value = "4. MEDICAMENTOS Y TRATAMIENTOS MÁS PRESCRITOS (TOP 5)";
  styleCell(sec4, { font: { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } }, fill: BRAND, align: { vertical: "middle", horizontal: "left" } });
  ws2.getRow(currRow).height = 26;
  currRow++;

  const medHead = ["MEDICAMENTO / TRATAMIENTO", "RECETAS EMITIDAS", "% DE PRESCRIPCIONES", "TIPO / VÍA", "DISPONIBILIDAD"];
  const rMedHead = ws2.getRow(currRow);
  medHead.forEach((h, idx) => {
    const c = rMedHead.getCell(idx + 1);
    c.value = h;
    styleCell(c, { font: { name: "Arial", size: 9, bold: true, color: { argb: "1E3A8A" } }, fill: "E2E8F0", align: { vertical: "middle", horizontal: idx === 0 ? "left" : "center" }, border: { top: { style: "thin", color: { argb: "CBD5E1" } }, bottom: { style: "thin", color: { argb: "CBD5E1" } } } });
  });
  rMedHead.height = 22;
  currRow++;

  const medMap = new Map<string, number>();
  let totalMeds = 0;
  consultas.forEach((c) => {
    const meds = Array.isArray(c.data?.diagnosticoMedicamentoIds) ? c.data.diagnosticoMedicamentoIds : [];
    meds.forEach((m: any) => {
      let nombre = "";
      if (typeof m === "string") {
        const item = predefinedMedicamentos.find((pm) => pm.id === m);
        nombre = item ? item.nombre : m;
      } else if (m && typeof m === "object") {
        const item = predefinedMedicamentos.find((pm) => pm.id === m.id);
        nombre = item ? item.nombre : m.nombre || "Medicamento";
      }
      if (nombre) {
        medMap.set(nombre, (medMap.get(nombre) || 0) + 1);
        totalMeds++;
      }
    });
  });

  const topMeds = Array.from(medMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topMeds.length === 0) {
    const r = ws2.getRow(currRow);
    ws2.mergeCells(`A${currRow}:E${currRow}`);
    r.getCell(1).value = "Sin medicamentos recetados registrados en el período analizado.";
    styleCell(r.getCell(1), { font: { name: "Arial", size: 9, italic: true, color: { argb: "6B7280" } }, fill: "FFFFFF", align: { vertical: "middle", horizontal: "center" }, border: { bottom: { style: "hair", color: { argb: "E5E7EB" } } } });
    r.height = 22;
    currRow++;
  } else {
    topMeds.forEach(([nombre, cnt], idx) => {
      const r = ws2.getRow(currRow);
      const pct = `${((cnt / (totalMeds || 1)) * 100).toFixed(1)}%`;
      const zebraFill = idx % 2 === 1 ? ZEBRA : "FFFFFF";
      r.getCell(1).value = `${idx + 1}. ${nombre}`;
      r.getCell(2).value = cnt;
      r.getCell(3).value = pct;
      r.getCell(4).value = "Tratamiento Farmacológico";
      r.getCell(5).value = "Entregado por Farmacia";
      [1, 2, 3, 4, 5].forEach((cIdx) => {
        styleCell(r.getCell(cIdx), {
          font: { name: "Arial", size: 9, bold: cIdx === 1 || cIdx === 2, color: { argb: cIdx === 2 ? "1E3A8A" : "1F2937" } },
          fill: zebraFill,
          align: { vertical: "middle", horizontal: cIdx === 1 ? "left" : "center" },
          border: { bottom: { style: "hair", color: { argb: "E5E7EB" } }, left: { style: "hair", color: { argb: "F3F4F6" } }, right: { style: "hair", color: { argb: "F3F4F6" } } },
        });
      });
      r.height = 20;
      currRow++;
    });
  }

  // ── Descarga ──────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeRef = (refugio || "refugio").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40);
  const safeDia = diaExport ? `_dia_${diaExport.replace(/-/g, "")}` : "";
  a.href = url;
  a.download = `consultas_morbilidad_${safeRef}${safeDia}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
