// ── Exportación XLSX por NÚCLEOS FAMILIARES ──────────────────────────────────
// Un Excel "bonito" agrupado por familia: el JEFE de familia resaltado (bold +
// tono más fuerte) y sus integrantes en las filas siguientes con el MISMO color;
// la siguiente familia va inmediatamente debajo, alternando de color para que se
// distingan de un vistazo. Mismo membrete institucional que el Excel general.
// exceljs se carga de forma PEREZOSA (dynamic import).

import { formatRoomLabel } from "@/lib/helpers";

const BRAND = "1E3A8A";
const BRAND_LIGHT = "E8EDF7";

// Dos paletas que se alternan por familia. Cada una: [jefe (más fuerte), integrante (suave)].
const PALETTES: [string, string][] = [
  ["C7D7EE", "E8EFF9"], // azul
  ["F5E3C9", "FBF3E6"], // durazno
];

const isoToDmy = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

interface FamiliasExportOpts {
  familias: any[][];     // grupos; cada grupo YA viene [jefe, ...integrantes]
  refugio: string;
  generadoEn: string;
  totalPersonas: number; // total de personas en las familias
}

const COLS: [string, number][] = [
  ["Familia", 8],
  ["Rol", 17],
  ["Cédula", 14],
  ["Nombre y Apellido", 28],
  ["Género", 11],
  ["F. Nacimiento", 15],
  ["Edad", 6],
  ["Parroquia", 16],
  ["Sector", 16],
  ["Comunidad", 18],
  ["Habitación / Salón", 20],
  ["Teléfono", 14],
  ["Estado físico", 13],
];

export async function exportFamiliasExcel(opts: FamiliasExportOpts): Promise<void> {
  const { familias, refugio, generadoEn, totalPersonas } = opts;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Registro-SismoLg26";
  const ws = wb.addWorksheet("Núcleos Familiares", {
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
  t2.value = "Campamentos Transitorios 2026 · Núcleos Familiares";
  t2.font = { name: "Arial", size: 11, bold: true, color: { argb: "374151" } };
  t2.alignment = { vertical: "middle", horizontal: "left" };
  const t3 = ws.getCell("C3");
  t3.value = `Campamento: ${refugio || "—"}   ·   Generado: ${generadoEn}`;
  t3.font = { name: "Arial", size: 9, color: { argb: "6B7280" } };
  t3.alignment = { vertical: "middle", horizontal: "left" };
  const t4 = ws.getCell("C4");
  t4.value = { richText: [
    { text: `Familias: ${familias.length}`, font: { name: "Arial", size: 9, bold: true, color: { argb: BRAND } } },
    { text: `   ·   Personas en familias: ${totalPersonas}`, font: { name: "Arial", size: 9, color: { argb: "374151" } } },
  ] };
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

  // ── Datos: familia por familia, con su color; el jefe resaltado ────────────
  const genLabel = (g: string) => {
    const G = (g || "").toUpperCase();
    return G === "FEMENINO" ? "Femenino" : G === "MASCULINO" ? "Masculino" : (g || "");
  };
  familias.forEach((familia, fIdx) => {
    const [jefeColor, miembroColor] = PALETTES[fIdx % PALETTES.length];
    familia.forEach((r, memberIdx) => {
      const esJefe = r.jefeFamilia === "SI" || memberIdx === 0;
      const values = [
        fIdx + 1,                                               // N° familia (en TODAS las filas → se puede filtrar por familia sin desorganizar)
        esJefe ? "Jefe de familia" : "Integrante",
        r.cedula || "",
        r.nombreApellido || "",
        genLabel(r.genero),
        isoToDmy(r.fechaNacimiento),
        r.edad ?? "",
        r.parroquia || "",
        r.sector || "",
        r.comunidad || "",
        r.cuarto ? formatRoomLabel(r.cuarto) : "Sin asignar",
        r.telefono || "",
        r.estadoFisico === "LESIONADO" ? "Lesionado" : r.estadoFisico === "ILESO" ? "Ileso" : (r.estadoFisico || ""),
      ];
      const row = ws.addRow(values);
      const bg = esJefe ? jefeColor : miembroColor;
      row.eachCell((cell, col) => {
        cell.font = { name: "Arial", size: 9, bold: esJefe, color: { argb: esJefe ? "111827" : "1F2937" } };
        cell.alignment = { vertical: "middle", horizontal: col === 1 || col === 3 || col === 7 ? "center" : "left", wrapText: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.border = {
          top: { style: "hair", color: { argb: "D1D5DB" } }, bottom: { style: "hair", color: { argb: "D1D5DB" } },
          left: { style: "hair", color: { argb: "E5E7EB" } }, right: { style: "hair", color: { argb: "E5E7EB" } },
        };
      });
      // Borde superior más marcado en la fila del jefe: separa visualmente cada familia.
      if (memberIdx === 0) {
        row.eachCell((cell) => {
          cell.border = { ...cell.border, top: { style: "medium", color: { argb: BRAND } } };
        });
      }
      if (r.estadoFisico === "LESIONADO") row.getCell(13).font = { name: "Arial", size: 9, bold: true, color: { argb: "DC2626" } };
    });
  });

  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: nCols } };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeRef = (refugio || "refugio").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40);
  a.href = url;
  a.download = `nucleos_familiares_${safeRef}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
