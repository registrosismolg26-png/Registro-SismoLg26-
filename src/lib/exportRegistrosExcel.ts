// ── Exportación XLSX con membrete y estilo (Registro de Afectados / Censo) ───────
// Mismo lenguaje visual que el Excel de Morbilidad: membrete institucional (logo +
// títulos), encabezado con color de marca, filas zebra, bordes, anchos, panel
// congelado y autofiltro. exceljs se carga de forma PEREZOSA (dynamic import).

import { patologiaNombres, medItemsText, formatRoomLabel } from "@/lib/helpers";
import type { Patologia, MedicamentoPredefinido, Medicamento } from "@/types";

const BRAND = "1E3A8A";
const BRAND_LIGHT = "E8EDF7";
const ZEBRA = "F1F5F9";

const isoToDmy = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

interface ExportOpts {
  registros: any[]; // lista (filtrada) de registros del censo
  patologias: Patologia[];
  predefinedMedicamentos: MedicamentoPredefinido[];
  refugio: string;
  generadoEn: string;
  filtros?: string;   // descripción legible de los filtros activos (vacío = sin filtros)
}

const COLS: [string, number][] = [
  ["N°", 5],
  ["Cédula", 14],
  ["Nombre y Apellido", 26],
  ["Género", 11],
  ["Fecha de Nacimiento", 16],
  ["Edad", 6],
  ["Parroquia", 16],
  ["Sector", 16],
  ["Comunidad", 18],
  ["Dirección exacta", 30],
  ["Teléfono", 14],
  ["Habitación / Salón", 20],
  ["Estado físico", 13],
  ["Embarazo", 10],
  ["Jefe de familia", 12],
  ["Cédula del jefe", 14],
  ["¿Patología?", 11],
  ["Patologías", 30],
  ["Medicamentos", 30],
  ["Intermitente", 16],
  ["Estatus", 12],
  ["Razón de retiro", 26],
  ["Fecha de registro", 18],
  ["Registrador", 22],
];

export async function exportRegistrosExcel(opts: ExportOpts): Promise<void> {
  const { registros, patologias, predefinedMedicamentos, refugio, generadoEn, filtros } = opts;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Registro-SismoLg26";
  const ws = wb.addWorksheet("Registro de Afectados", {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const nCols = COLS.length;
  const lastColLetter = String.fromCharCode(64 + nCols);
  ws.columns = COLS.map(([, w]) => ({ width: w }));

  // ── Membrete (filas 1–4) ──────────────────────────────────────────────────
  ws.mergeCells(`C1:${lastColLetter}1`);
  ws.mergeCells(`C2:${lastColLetter}2`);
  ws.mergeCells(`C3:${lastColLetter}3`);
  ws.mergeCells(`C4:${lastColLetter}4`);
  ws.mergeCells("A1:B4");
  const t1 = ws.getCell("C1");
  t1.value = "GOBERNACIÓN DEL ESTADO LA GUAIRA";
  t1.font = { name: "Arial", size: 15, bold: true, color: { argb: BRAND } };
  t1.alignment = { vertical: "middle", horizontal: "left" };
  const t2 = ws.getCell("C2");
  t2.value = "Campamentos Transitorios 2026 · Registro de Afectados (Censo)";
  t2.font = { name: "Arial", size: 11, bold: true, color: { argb: "374151" } };
  t2.alignment = { vertical: "middle", horizontal: "left" };
  const t3 = ws.getCell("C3");
  t3.value = `Campamento: ${refugio || "—"}   ·   Generado: ${generadoEn}   ·   Total de registros: ${registros.length}`;
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
  for (let r = 1; r <= 4; r++) {
    ws.getRow(r).height = r === 1 ? 24 : r === 4 ? 16 : 18;
    for (let c = 1; c <= nCols; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
      if (r === 4) cell.border = { bottom: { style: "medium", color: { argb: BRAND } } };
    }
  }

  try {
    const res = await fetch("/logo_gob_push.png");
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const imgId = wb.addImage({ buffer: buf as any, extension: "png" });
      ws.addImage(imgId, { tl: { col: 0.25, row: 0.2 } as any, ext: { width: 92, height: 60 } });
    }
  } catch { /* sin logo */ }

  ws.getRow(5).height = 6;

  // ── Encabezado ────────────────────────────────────────────────────────────
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

  // ── Datos ─────────────────────────────────────────────────────────────────
  registros.forEach((r, idx) => {
    const genero = (r.genero || "").toUpperCase();
    const embarazoTxt = genero === "FEMENINO" ? (r.embarazo === "SI" ? "Sí" : "No") : "—";
    const retirado = r.retirado === "SI";
    const intermitente = r.intermitente === "SI" ? (r.motivoIntermitente ? `Sí — ${r.motivoIntermitente}` : "Sí") : "No";
    const values = [
      idx + 1,
      r.cedula || "",
      r.nombreApellido || "",
      genero === "FEMENINO" ? "Femenino" : genero === "MASCULINO" ? "Masculino" : (r.genero || ""),
      isoToDmy(r.fechaNacimiento),
      r.edad ?? "",
      r.parroquia || "",
      r.sector || "",
      r.comunidad || "",
      r.direccionExacta || "",
      r.telefono || "",
      r.cuarto ? formatRoomLabel(r.cuarto) : "Sin asignar",
      r.estadoFisico === "LESIONADO" ? "Lesionado" : r.estadoFisico === "ILESO" ? "Ileso" : (r.estadoFisico || ""),
      embarazoTxt,
      r.jefeFamilia === "SI" ? "Sí" : "No",
      r.cedulaJefeFamilia || "",
      r.patologia === "SI" ? "Sí" : "No",
      patologiaNombres(r.patologiaIds, patologias).join(", "),
      medItemsText(r.medicamentoIds as Medicamento[], predefinedMedicamentos),
      intermitente,
      retirado ? "Retirado" : "Presente",
      retirado ? (r.retiradoRazon || "—") : "—",
      r.createdAt ? new Date(r.createdAt).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "",
      r.registrador || "—",
    ];
    const row = ws.addRow(values);
    const zebra = idx % 2 === 1;
    row.eachCell((cell, col) => {
      cell.font = { name: "Arial", size: 9, color: { argb: "1F2937" } };
      cell.alignment = { vertical: "top", horizontal: col <= 2 || col === 6 || col === 14 || col === 17 || col === 21 ? "center" : "left", wrapText: true };
      cell.border = {
        top: { style: "hair", color: { argb: "D1D5DB" } }, bottom: { style: "hair", color: { argb: "D1D5DB" } },
        left: { style: "hair", color: { argb: "E5E7EB" } }, right: { style: "hair", color: { argb: "E5E7EB" } },
      };
      if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    });
    // Resalta Lesionado (rojo), Embarazo "Sí" (rosa) y Retirado (gris).
    if (r.estadoFisico === "LESIONADO") row.getCell(13).font = { name: "Arial", size: 9, bold: true, color: { argb: "DC2626" } };
    if (embarazoTxt === "Sí") row.getCell(14).font = { name: "Arial", size: 9, bold: true, color: { argb: "DB2777" } };
    if (retirado) row.getCell(21).font = { name: "Arial", size: 9, bold: true, color: { argb: "9CA3AF" } };
  });

  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: nCols } };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeRef = (refugio || "refugio").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40);
  a.href = url;
  a.download = `registro_afectados_${safeRef}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
