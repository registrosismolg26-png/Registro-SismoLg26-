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

  // ── HOJA 2: Resumen Estadístico (Guiado 100% por Balance de Salud) ────────
  const ws2 = wb.addWorksheet("Resumen Estadístico", {
    views: [{ state: "normal" }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Anchos calculados para que el contenido quepa cómodamente en las celdas sin desbordar
  ws2.columns = [
    { width: 34 }, // A: Indicadores / Grupos de edad / Patologías / Medicamentos
    { width: 18 }, // B: Femenino / Casos / Cantidad
    { width: 18 }, // C: Masculino / Casos / Detalle
    { width: 18 }, // D: Total / Porcentaje
    { width: 18 }, // E: % del total / Detalle
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
  t2_2.value = "Campamentos Transitorios 2026 · Resumen de Balance de Salud";
  t2_2.font = { name: "Arial", size: 11, bold: true, color: { argb: "374151" } };
  t2_2.alignment = { vertical: "middle", horizontal: "left" };
  const t3_2 = ws2.getCell("C3");
  t3_2.value = `Campamento: ${refugio || "—"}   ·   Generado: ${generadoEn}   ·   Muestra: ${consultas.length} consultas`;
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

  const BORDER_ALL = {
    top: { style: "thin" as const, color: { argb: "CBD5E1" } },
    bottom: { style: "thin" as const, color: { argb: "CBD5E1" } },
    left: { style: "thin" as const, color: { argb: "CBD5E1" } },
    right: { style: "thin" as const, color: { argb: "CBD5E1" } },
  };
  const BORDER_HEAD = {
    top: { style: "thin" as const, color: { argb: "94A3B8" } },
    bottom: { style: "medium" as const, color: { argb: "64748B" } },
    left: { style: "thin" as const, color: { argb: "CBD5E1" } },
    right: { style: "thin" as const, color: { argb: "CBD5E1" } },
  };
  const BORDER_TOTAL = {
    top: { style: "thin" as const, color: { argb: "64748B" } },
    bottom: { style: "double" as const, color: { argb: "1E293B" } },
    left: { style: "thin" as const, color: { argb: "CBD5E1" } },
    right: { style: "thin" as const, color: { argb: "CBD5E1" } },
  };

  const styleRowCells = (r: any, fill: string, border: any) => {
    for (let c = 1; c <= 5; c++) {
      const cell = r.getCell(c);
      if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      if (border) cell.border = border;
    }
  };

  // Cálculo de métricas del Balance de Salud para la muestra exportada
  const patients = new Map<string, { genero: string; edad: number | null; conPat: boolean; embarazada: boolean }>();
  let totalMedsRecetados = 0;
  const patCount = new Map<string, number>();
  const medMap = new Map<string, number>();
  const tipoCount: Record<string, number> = { REFUGIADO: 0, APOYO_INSTITUCIONAL: 0, APOYO_COMUNITARIO: 0, EMERGENCIA: 0 };

  const embarazoIds = new Set(
    patologias.filter((p: any) => (p.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("embarazo")).map((p: any) => p.id)
  );
  const hasEmbarazo = (ids: any) => Array.isArray(ids) && ids.some((id: string) => embarazoIds.has(id));

  consultas.forEach((c) => {
    const d = c.data || {};
    const ced = (d.cedula || d.registroId || String(c.id)).replace(/\D/g, "") || String(c.id);
    const diagPat: string[] = Array.isArray(d.diagnosticoPatologiaIds) ? d.diagnosticoPatologiaIds : [];
    const antPat: string[] = Array.isArray(d.antecedentesPatologiaIds) ? d.antecedentesPatologiaIds : [];
    const diagMeds: any[] = Array.isArray(d.diagnosticoMedicamentoIds) ? d.diagnosticoMedicamentoIds : [];

    totalMedsRecetados += diagMeds.length;
    diagPat.forEach((id: string) => {
      const p = patologias.find((item) => item.id === id);
      const nombre = p ? p.nombre : "Otra patología";
      patCount.set(nombre, (patCount.get(nombre) || 0) + 1);
    });

    diagMeds.forEach((m: any) => {
      let nombre = "";
      if (typeof m === "string") {
        const item = predefinedMedicamentos.find((pm) => pm.id === m);
        nombre = item ? item.nombre : m;
      } else if (m && typeof m === "object") {
        const item = predefinedMedicamentos.find((pm) => pm.id === m.id);
        nombre = item ? item.nombre : m.nombre || "Medicamento";
      }
      if (nombre) medMap.set(nombre, (medMap.get(nombre) || 0) + 1);
    });

    const tp = d.tipoPaciente || "REFUGIADO";
    tipoCount[tp] = (tipoCount[tp] ?? 0) + 1;

    const genero = (d.genero || "").toUpperCase();
    let edad: number | null = d.edad != null && d.edad !== "" ? Number(d.edad) : null;
    if (isNaN(edad as any)) edad = null;
    const conPat = diagPat.length > 0 || antPat.length > 0;
    const embarazada = d.embarazo === "SI" || hasEmbarazo(antPat) || hasEmbarazo(diagPat);

    if (!patients.has(ced)) patients.set(ced, { genero, edad, conPat, embarazada });
    else {
      const p = patients.get(ced)!;
      if (!p.genero && genero) p.genero = genero;
      if (p.edad == null && edad != null) p.edad = edad;
      if (conPat) p.conPat = true;
      if (embarazada) p.embarazada = true;
    }
  });

  let sumEdad = 0, nEdad = 0, conPatCount = 0, embarazadasCount = 0;
  patients.forEach((p) => {
    if (p.conPat) conPatCount++;
    if (p.embarazada) embarazadasCount++;
    if (p.edad != null && !isNaN(p.edad)) { sumEdad += p.edad; nEdad++; }
  });
  const promedioEdad = nEdad > 0 ? Math.round(sumEdad / nEdad) : 0;
  const totalCons = consultas.length || 1;

  let currRow = 6;

  // ── SECCIÓN 1: INDICADORES DE MORBILIDAD (BALANCE DE SALUD) ──
  ws2.mergeCells(`A${currRow}:E${currRow}`);
  const sec1 = ws2.getCell(`A${currRow}`);
  sec1.value = "1. INDICADORES DE MORBILIDAD";
  sec1.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  sec1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  sec1.alignment = { vertical: "middle", horizontal: "left" };
  ws2.getRow(currRow).height = 26;
  currRow++;

  const rKpiHead = ws2.getRow(currRow);
  ws2.mergeCells(`C${currRow}:E${currRow}`);
  rKpiHead.getCell(1).value = "INDICADOR DE MORBILIDAD";
  rKpiHead.getCell(2).value = "CANTIDAD";
  rKpiHead.getCell(3).value = "DETALLE / PORCENTAJE";
  rKpiHead.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  rKpiHead.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
  rKpiHead.getCell(3).alignment = { vertical: "middle", horizontal: "left" };
  rKpiHead.font = { name: "Arial", size: 9, bold: true, color: { argb: "1E3A8A" } };
  styleRowCells(rKpiHead, "E2E8F0", BORDER_HEAD);
  rKpiHead.height = 22;
  currRow++;

  const kpisData = [
    ["Consultas registradas", consultas.length, "100.0% de las atenciones exportadas"],
    ["Pacientes atendidos", patients.size, `${((patients.size / totalCons) * 100).toFixed(1)}% (cédulas o pacientes únicos)`],
    ["Pacientes con patología", conPatCount, `${((conPatCount / (patients.size || 1)) * 100).toFixed(1)}% del total de pacientes`],
    ["Mujeres embarazadas", embarazadasCount, `${((embarazadasCount / totalCons) * 100).toFixed(1)}% de consultas (control prenatal)`],
    ["Medicamentos recetados", totalMedsRecetados, "Total de fórmulas farmacológicas prescritas"],
    ["Patologías distintas", patCount.size, "Variedad de diagnósticos registrados"],
    ["Edad promedio", promedioEdad ? `${promedioEdad} años` : "—", "Promedio general de edad de los pacientes"],
  ];

  kpisData.forEach(([label, val, det], idx) => {
    const r = ws2.getRow(currRow);
    ws2.mergeCells(`C${currRow}:E${currRow}`);
    r.getCell(1).value = label;
    r.getCell(2).value = val;
    r.getCell(3).value = det;
    r.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    r.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
    r.getCell(3).alignment = { vertical: "middle", horizontal: "left" };
    r.font = { name: "Arial", size: 9, bold: idx === 0 || idx === 1, color: { argb: idx === 3 && embarazadasCount > 0 ? "DB2777" : "1F2937" } };
    styleRowCells(r, idx % 2 === 1 ? ZEBRA : "FFFFFF", BORDER_ALL);
    r.height = 20;
    currRow++;
  });

  currRow++; // espaciador

  // ── SECCIÓN 2: DISTRIBUCIÓN POR EDAD Y GÉNERO (ADJUNTO 1) ──
  ws2.mergeCells(`A${currRow}:E${currRow}`);
  const sec2 = ws2.getCell(`A${currRow}`);
  sec2.value = "2. DISTRIBUCIÓN POR EDAD Y GÉNERO";
  sec2.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  sec2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  sec2.alignment = { vertical: "middle", horizontal: "left" };
  ws2.getRow(currRow).height = 26;
  currRow++;

  const demoHeaders = ["GRUPO DE EDAD", "FEMENINO", "MASCULINO", "TOTAL", "% DEL TOTAL"];
  const rDemoHead = ws2.getRow(currRow);
  demoHeaders.forEach((h, idx) => {
    const c = rDemoHead.getCell(idx + 1);
    c.value = h;
    c.alignment = { vertical: "middle", horizontal: idx === 0 ? "left" : "center" };
  });
  rDemoHead.font = { name: "Arial", size: 9, bold: true, color: { argb: "1E3A8A" } };
  styleRowCells(rDemoHead, "E2E8F0", BORDER_HEAD);
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
    const gIdx = gen === "FEMENINO" ? 0 : 1;
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
    r.getCell(1).value = grupoLabel;
    r.getCell(2).value = fem;
    r.getCell(3).value = masc;
    r.getCell(4).value = tot;
    r.getCell(5).value = pct;

    r.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    r.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
    r.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
    r.getCell(4).alignment = { vertical: "middle", horizontal: "center" };
    r.getCell(5).alignment = { vertical: "middle", horizontal: "center" };

    r.getCell(1).font = { name: "Arial", size: 9, bold: true, color: { argb: "1F2937" } };
    r.getCell(2).font = { name: "Arial", size: 9, bold: fem > 0, color: { argb: fem > 0 ? "831843" : "9CA3AF" } };
    r.getCell(3).font = { name: "Arial", size: 9, bold: masc > 0, color: { argb: masc > 0 ? "1E3A8A" : "9CA3AF" } };
    r.getCell(4).font = { name: "Arial", size: 9, bold: true, color: { argb: tot > 0 ? "0F172A" : "9CA3AF" } };
    r.getCell(5).font = { name: "Arial", size: 9, color: { argb: "475569" } };

    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF" } };
    r.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fem > 0 ? "FCE7F3" : "FDF2F8" } };
    r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: masc > 0 ? "DBEAFE" : "EFF6FF" } };
    r.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F1F5F9" } };
    r.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF" } };

    for (let c = 1; c <= 5; c++) r.getCell(c).border = BORDER_ALL;
    r.height = 22;
    currRow++;
  });

  // Fila Total de la tabla demográfica
  const rTotDemo = ws2.getRow(currRow);
  rTotDemo.getCell(1).value = "Total";
  rTotDemo.getCell(2).value = totalFem;
  rTotDemo.getCell(3).value = totalMasc;
  rTotDemo.getCell(4).value = totalFem + totalMasc;
  rTotDemo.getCell(5).value = "100.0%";

  rTotDemo.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  rTotDemo.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
  rTotDemo.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
  rTotDemo.getCell(4).alignment = { vertical: "middle", horizontal: "center" };
  rTotDemo.getCell(5).alignment = { vertical: "middle", horizontal: "center" };

  rTotDemo.getCell(1).font = { name: "Arial", size: 10, bold: true, color: { argb: "0F172A" } };
  rTotDemo.getCell(2).font = { name: "Arial", size: 10, bold: true, color: { argb: "831843" } };
  rTotDemo.getCell(3).font = { name: "Arial", size: 10, bold: true, color: { argb: "1E3A8A" } };
  rTotDemo.getCell(4).font = { name: "Arial", size: 10, bold: true, color: { argb: "0F172A" } };
  rTotDemo.getCell(5).font = { name: "Arial", size: 10, bold: true, color: { argb: "0F172A" } };

  rTotDemo.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E2E8F0" } };
  rTotDemo.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FBCFE8" } };
  rTotDemo.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "BFDBFE" } };
  rTotDemo.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "CBD5E1" } };
  rTotDemo.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E2E8F0" } };

  for (let c = 1; c <= 5; c++) rTotDemo.getCell(c).border = BORDER_TOTAL;
  rTotDemo.height = 24;
  currRow += 2; // espaciador

  // ── SECCIÓN 3: ATENCIONES POR TIPO DE PACIENTE ──
  ws2.mergeCells(`A${currRow}:E${currRow}`);
  const sec3 = ws2.getCell(`A${currRow}`);
  sec3.value = "3. ATENCIONES POR TIPO DE PACIENTE";
  sec3.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  sec3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  sec3.alignment = { vertical: "middle", horizontal: "left" };
  ws2.getRow(currRow).height = 26;
  currRow++;

  const rTipoHead = ws2.getRow(currRow);
  ws2.mergeCells(`A${currRow}:B${currRow}`);
  ws2.mergeCells(`D${currRow}:E${currRow}`);
  rTipoHead.getCell(1).value = "TIPO DE ATENCIÓN";
  rTipoHead.getCell(3).value = "CANTIDAD";
  rTipoHead.getCell(4).value = "% DEL TOTAL";
  rTipoHead.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  rTipoHead.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
  rTipoHead.getCell(4).alignment = { vertical: "middle", horizontal: "center" };
  rTipoHead.font = { name: "Arial", size: 9, bold: true, color: { argb: "1E3A8A" } };
  styleRowCells(rTipoHead, "E2E8F0", BORDER_HEAD);
  rTipoHead.height = 22;
  currRow++;

  const tiposData = [
    ["Refugiados", tipoCount["REFUGIADO"] || 0],
    ["Apoyo Institucional", tipoCount["APOYO_INSTITUCIONAL"] || 0],
    ["Apoyo Comunitario", tipoCount["APOYO_COMUNITARIO"] || 0],
    ["Emergencia", tipoCount["EMERGENCIA"] || 0],
  ];

  tiposData.forEach(([label, cnt], idx) => {
    const r = ws2.getRow(currRow);
    ws2.mergeCells(`A${currRow}:B${currRow}`);
    ws2.mergeCells(`D${currRow}:E${currRow}`);
    r.getCell(1).value = label;
    r.getCell(3).value = cnt;
    r.getCell(4).value = `${((Number(cnt) / totalCons) * 100).toFixed(1)}%`;
    r.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    r.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
    r.getCell(4).alignment = { vertical: "middle", horizontal: "center" };
    r.font = { name: "Arial", size: 9, bold: idx === 0 || Number(cnt) > 0, color: { argb: idx === 3 && Number(cnt) > 0 ? "DC2626" : "1F2937" } };
    styleRowCells(r, idx % 2 === 1 ? ZEBRA : "FFFFFF", BORDER_ALL);
    r.height = 20;
    currRow++;
  });

  const rTotTipo = ws2.getRow(currRow);
  ws2.mergeCells(`A${currRow}:B${currRow}`);
  ws2.mergeCells(`D${currRow}:E${currRow}`);
  rTotTipo.getCell(1).value = "Total de Atenciones";
  rTotTipo.getCell(3).value = totalCons;
  rTotTipo.getCell(4).value = "100.0%";
  rTotTipo.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  rTotTipo.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
  rTotTipo.getCell(4).alignment = { vertical: "middle", horizontal: "center" };
  rTotTipo.font = { name: "Arial", size: 10, bold: true, color: { argb: "0F172A" } };
  styleRowCells(rTotTipo, "E2E8F0", BORDER_TOTAL);
  rTotTipo.height = 24;
  currRow += 2; // espaciador

  // ── SECCIÓN 4: PATOLOGÍAS DIAGNOSTICADAS MÁS FRECUENTES (BALANCE DE SALUD) ──
  ws2.mergeCells(`A${currRow}:E${currRow}`);
  const sec4 = ws2.getCell(`A${currRow}`);
  sec4.value = "4. PATOLOGÍAS MÁS FRECUENTES (RANKING)";
  sec4.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  sec4.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  sec4.alignment = { vertical: "middle", horizontal: "left" };
  ws2.getRow(currRow).height = 26;
  currRow++;

  const rPatHead = ws2.getRow(currRow);
  ws2.mergeCells(`A${currRow}:B${currRow}`);
  ws2.mergeCells(`D${currRow}:E${currRow}`);
  rPatHead.getCell(1).value = "PATOLOGÍA DIAGNOSTICADA";
  rPatHead.getCell(3).value = "CASOS";
  rPatHead.getCell(4).value = "% DE INCIDENCIA";
  rPatHead.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  rPatHead.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
  rPatHead.getCell(4).alignment = { vertical: "middle", horizontal: "center" };
  rPatHead.font = { name: "Arial", size: 9, bold: true, color: { argb: "1E3A8A" } };
  styleRowCells(rPatHead, "E2E8F0", BORDER_HEAD);
  rPatHead.height = 22;
  currRow++;

  const topPats = Array.from(patCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (topPats.length === 0) {
    const r = ws2.getRow(currRow);
    ws2.mergeCells(`A${currRow}:E${currRow}`);
    r.getCell(1).value = "Sin patologías diagnosticadas en el período analizado.";
    r.getCell(1).font = { name: "Arial", size: 9, italic: true, color: { argb: "6B7280" } };
    r.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
    styleRowCells(r, "FFFFFF", BORDER_ALL);
    r.height = 22;
    currRow++;
  } else {
    let totalDiagPats = Array.from(patCount.values()).reduce((a, b) => a + b, 0) || 1;
    topPats.forEach(([nombre, cnt], idx) => {
      const r = ws2.getRow(currRow);
      ws2.mergeCells(`A${currRow}:B${currRow}`);
      ws2.mergeCells(`D${currRow}:E${currRow}`);
      r.getCell(1).value = `${idx + 1}. ${nombre}`;
      r.getCell(3).value = cnt;
      r.getCell(4).value = `${((cnt / totalDiagPats) * 100).toFixed(1)}%`;
      r.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
      r.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
      r.getCell(4).alignment = { vertical: "middle", horizontal: "center" };
      r.font = { name: "Arial", size: 9, bold: idx < 3, color: { argb: "1F2937" } };
      styleRowCells(r, idx % 2 === 1 ? ZEBRA : "FFFFFF", BORDER_ALL);
      r.height = 20;
      currRow++;
    });
  }

  currRow += 2; // espaciador

  // ── SECCIÓN 5: MEDICAMENTOS MÁS RECETADOS (BALANCE DE SALUD) ──
  ws2.mergeCells(`A${currRow}:E${currRow}`);
  const sec5 = ws2.getCell(`A${currRow}`);
  sec5.value = "5. MEDICAMENTOS Y TRATAMIENTOS MÁS RECETADOS";
  sec5.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  sec5.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  sec5.alignment = { vertical: "middle", horizontal: "left" };
  ws2.getRow(currRow).height = 26;
  currRow++;

  const rMedHead = ws2.getRow(currRow);
  ws2.mergeCells(`A${currRow}:B${currRow}`);
  ws2.mergeCells(`D${currRow}:E${currRow}`);
  rMedHead.getCell(1).value = "MEDICAMENTO / TRATAMIENTO PRESCRITO";
  rMedHead.getCell(3).value = "RECETAS";
  rMedHead.getCell(4).value = "% DE PRESCRIPCIONES";
  rMedHead.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  rMedHead.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
  rMedHead.getCell(4).alignment = { vertical: "middle", horizontal: "center" };
  rMedHead.font = { name: "Arial", size: 9, bold: true, color: { argb: "1E3A8A" } };
  styleRowCells(rMedHead, "E2E8F0", BORDER_HEAD);
  rMedHead.height = 22;
  currRow++;

  const topMeds = Array.from(medMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (topMeds.length === 0) {
    const r = ws2.getRow(currRow);
    ws2.mergeCells(`A${currRow}:E${currRow}`);
    r.getCell(1).value = "Sin medicamentos recetados en el período analizado.";
    r.getCell(1).font = { name: "Arial", size: 9, italic: true, color: { argb: "6B7280" } };
    r.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
    styleRowCells(r, "FFFFFF", BORDER_ALL);
    r.height = 22;
    currRow++;
  } else {
    let totalMedsAll = Array.from(medMap.values()).reduce((a, b) => a + b, 0) || 1;
    topMeds.forEach(([nombre, cnt], idx) => {
      const r = ws2.getRow(currRow);
      ws2.mergeCells(`A${currRow}:B${currRow}`);
      ws2.mergeCells(`D${currRow}:E${currRow}`);
      r.getCell(1).value = `${idx + 1}. ${nombre}`;
      r.getCell(3).value = cnt;
      r.getCell(4).value = `${((cnt / totalMedsAll) * 100).toFixed(1)}%`;
      r.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
      r.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
      r.getCell(4).alignment = { vertical: "middle", horizontal: "center" };
      r.font = { name: "Arial", size: 9, bold: idx < 3, color: { argb: "1F2937" } };
      styleRowCells(r, idx % 2 === 1 ? ZEBRA : "FFFFFF", BORDER_ALL);
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
