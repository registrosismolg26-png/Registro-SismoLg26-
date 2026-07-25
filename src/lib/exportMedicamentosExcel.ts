// ── Exportación XLSX de MEDICAMENTOS de los registrados ─────────────────────
// Dos hojas:
//   1) "Medicamentos por persona": datos básicos de cada registrado que tiene
//      medicamentos (identidad + ubicación geográfica + habitación/carpa) y la
//      lista de sus medicamentos con viñetas (nombre · presentación · dosis · período).
//   2) "Resumen de medicamentos": agrupado por (medicamento, dosis/posología,
//      presentación) con la cantidad de personas y de indicaciones.
// Mismo lenguaje visual que exportRegistrosExcel (membrete + marca). exceljs perezoso.

import { formatRoomLabel } from "@/lib/helpers";
import type { MedicamentoPredefinido, Medicamento } from "@/types";

const BRAND = "1E3A8A";
const BRAND_LIGHT = "E8EDF7";
const ZEBRA = "F1F5F9";

interface ExportOpts {
  registros: any[];                        // lista (filtrada) de registros del censo
  predefinedMedicamentos: MedicamentoPredefinido[];
  refugio: string;
  generadoEn: string;
  filtros?: string;
}

const medCat = (id: string, cat: MedicamentoPredefinido[]) => cat.find((m) => m.id === id);

export async function exportMedicamentosExcel(opts: ExportOpts): Promise<void> {
  const { registros, predefinedMedicamentos, refugio, generadoEn, filtros } = opts;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Registro-SismoLg26";

  // Solo los registrados PRESENTES con al menos un medicamento.
  const conMeds = registros
    .filter((r) => r.retirado !== "SI" && Array.isArray(r.medicamentoIds) && r.medicamentoIds.length > 0)
    .map((r) => ({
      ...r,
      meds: (r.medicamentoIds as Medicamento[]).filter((m) => m && m.id),
    }))
    .filter((r) => r.meds.length > 0);

  // ── Membrete reutilizable ──────────────────────────────────────────────────
  const membrete = (ws: any, nCols: number, subtitulo: string, total: number) => {
    const lastCol = String.fromCharCode(64 + nCols);
    ws.mergeCells(`C1:${lastCol}1`); ws.mergeCells(`C2:${lastCol}2`);
    ws.mergeCells(`C3:${lastCol}3`); ws.mergeCells(`C4:${lastCol}4`); ws.mergeCells("A1:B4");
    const t1 = ws.getCell("C1"); t1.value = "GOBERNACIÓN DEL ESTADO LA GUAIRA";
    t1.font = { name: "Arial", size: 15, bold: true, color: { argb: BRAND } };
    t1.alignment = { vertical: "middle", horizontal: "left" };
    const t2 = ws.getCell("C2"); t2.value = `Campamentos Transitorios 2026 · ${subtitulo}`;
    t2.font = { name: "Arial", size: 11, bold: true, color: { argb: "374151" } };
    t2.alignment = { vertical: "middle", horizontal: "left" };
    const t3 = ws.getCell("C3");
    t3.value = `Campamento: ${refugio || "—"}   ·   Generado: ${generadoEn}   ·   Personas con medicamentos: ${total}`;
    t3.font = { name: "Arial", size: 9, color: { argb: "6B7280" } };
    t3.alignment = { vertical: "middle", horizontal: "left" };
    const t4 = ws.getCell("C4");
    const fx = (filtros || "").trim();
    t4.value = fx
      ? { richText: [
          { text: "Filtros aplicados:  ", font: { name: "Arial", size: 9, bold: true, color: { argb: BRAND } } },
          { text: fx, font: { name: "Arial", size: 9, color: { argb: "374151" } } },
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
    ws.getRow(5).height = 6;
  };

  const headerRow = (ws: any, cols: [string, number][]) => {
    const row = ws.getRow(6);
    cols.forEach(([label], i) => {
      const cell = row.getCell(i + 1);
      cell.value = label;
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: BRAND } }, bottom: { style: "thin", color: { argb: BRAND } },
        left: { style: "thin", color: { argb: "FFFFFF" } }, right: { style: "thin", color: { argb: "FFFFFF" } },
      };
    });
    row.height = 26;
  };

  const logo = async () => {
    try {
      const res = await fetch("/logo_gob_push.png");
      if (res.ok) return wb.addImage({ buffer: (await res.arrayBuffer()) as any, extension: "png" });
    } catch { /* sin logo */ }
    return null;
  };
  const imgId = await logo();

  // ══ HOJA 1: Medicamentos por persona ═══════════════════════════════════════
  const COLS1: [string, number][] = [
    ["N°", 5], ["Cédula", 14], ["Nombre y Apellido", 26], ["Género", 10], ["Edad", 6],
    ["Parroquia", 15], ["Sector", 15], ["Comunidad", 16], ["Dirección exacta", 26],
    ["Teléfono", 13], ["Habitación / Carpa", 24], ["Medicamentos", 46],
  ];
  const ws1 = wb.addWorksheet("Medicamentos por persona", {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws1.columns = COLS1.map(([, w]) => ({ width: w }));
  membrete(ws1, COLS1.length, "Medicamentos por persona", conMeds.length);
  if (imgId !== null) ws1.addImage(imgId, { tl: { col: 0.25, row: 0.2 } as any, ext: { width: 92, height: 60 } });
  headerRow(ws1, COLS1);

  conMeds.forEach((r, idx) => {
    const g = (r.genero || "").toUpperCase();
    // Lista de medicamentos con viñetas, una por línea (wrapText).
    const listaMeds = r.meds
      .map((m: Medicamento) => {
        const cat = medCat(m.id, predefinedMedicamentos);
        const nombre = cat ? [cat.nombre, cat.concentracion].filter(Boolean).join(" ") : "(no disponible)";
        const pres = cat?.presentacion ? ` · ${cat.presentacion}` : "";
        const poso = [m.dosis, m.periodo].map((s) => (s || "").trim()).filter(Boolean).join(" · ");
        return `•  ${nombre}${pres}${poso ? `  (${poso})` : ""}`;
      })
      .join("\n");

    const values = [
      idx + 1,
      r.cedula || "",
      r.nombreApellido || "",
      g === "FEMENINO" ? "Femenino" : g === "MASCULINO" ? "Masculino" : (r.genero || ""),
      r.edad ?? "",
      r.parroquia || "",
      r.sector || "",
      r.comunidad || "",
      r.direccionExacta || "",
      r.telefono || "",
      r.cuarto ? formatRoomLabel(r.cuarto) : "Sin asignar",
      listaMeds,
    ];
    const row = ws1.addRow(values);
    const zebra = idx % 2 === 1;
    row.eachCell((cell: any, col: number) => {
      cell.font = { name: "Arial", size: 9, color: { argb: "1F2937" } };
      cell.alignment = { vertical: "top", horizontal: col === 1 || col === 5 ? "center" : "left", wrapText: true };
      cell.border = {
        top: { style: "hair", color: { argb: "D1D5DB" } }, bottom: { style: "hair", color: { argb: "D1D5DB" } },
        left: { style: "hair", color: { argb: "E5E7EB" } }, right: { style: "hair", color: { argb: "E5E7EB" } },
      };
      if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    });
    // Alto de fila según la cantidad de medicamentos (para que la viñeta se vea completa).
    row.height = Math.max(16, r.meds.length * 13);
  });
  ws1.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: COLS1.length } };

  // ══ HOJA 2: Resumen de medicamentos ════════════════════════════════════════
  // Agrupado por (medicamento + concentración, posología/dosis, presentación).
  type Grp = { nombre: string; concentracion: string; presentacion: string; dosis: string; periodo: string; personas: number; indicaciones: number };
  const grupos = new Map<string, Grp>();
  conMeds.forEach((r) => {
    const vistosPorPersona = new Set<string>();
    r.meds.forEach((m: Medicamento) => {
      const cat = medCat(m.id, predefinedMedicamentos);
      const nombre = cat?.nombre || "(no disponible)";
      const concentracion = cat?.concentracion || "";
      const presentacion = cat?.presentacion || "";
      const dosis = (m.dosis || "").trim();
      const periodo = (m.periodo || "").trim();
      const key = [nombre, concentracion, presentacion, dosis, periodo].join("¬").toUpperCase();
      if (!grupos.has(key)) grupos.set(key, { nombre, concentracion, presentacion, dosis, periodo, personas: 0, indicaciones: 0 });
      const grp = grupos.get(key)!;
      grp.indicaciones++;
      if (!vistosPorPersona.has(key)) { grp.personas++; vistosPorPersona.add(key); }
    });
  });
  const filas = [...grupos.values()].sort(
    (a, b) => b.personas - a.personas || a.nombre.localeCompare(b.nombre),
  );

  const COLS2: [string, number][] = [
    ["N°", 5], ["Medicamento", 30], ["Concentración", 16], ["Presentación", 18],
    ["Dosis / Posología", 20], ["Período", 18], ["N.º personas", 12], ["N.º indicaciones", 14],
  ];
  const ws2 = wb.addWorksheet("Resumen de medicamentos", {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws2.columns = COLS2.map(([, w]) => ({ width: w }));
  membrete(ws2, COLS2.length, "Resumen de medicamentos (cantidades)", conMeds.length);
  if (imgId !== null) ws2.addImage(imgId, { tl: { col: 0.25, row: 0.2 } as any, ext: { width: 92, height: 60 } });
  headerRow(ws2, COLS2);

  filas.forEach((g, idx) => {
    const values = [idx + 1, g.nombre, g.concentracion, g.presentacion, g.dosis || "—", g.periodo || "—", g.personas, g.indicaciones];
    const row = ws2.addRow(values);
    const zebra = idx % 2 === 1;
    row.eachCell((cell: any, col: number) => {
      cell.font = { name: "Arial", size: 9, color: { argb: "1F2937" } };
      cell.alignment = { vertical: "middle", horizontal: col === 1 || col >= 7 ? "center" : "left", wrapText: true };
      cell.border = {
        top: { style: "hair", color: { argb: "D1D5DB" } }, bottom: { style: "hair", color: { argb: "D1D5DB" } },
        left: { style: "hair", color: { argb: "E5E7EB" } }, right: { style: "hair", color: { argb: "E5E7EB" } },
      };
      if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      if (col >= 7) cell.font = { name: "Arial", size: 9, bold: true, color: { argb: BRAND } };
    });
  });
  // Fila TOTAL de indicaciones/personas.
  const totalRow = ws2.addRow(["", "TOTAL", "", "", "", "", filas.reduce((s, g) => s + g.personas, 0), filas.reduce((s, g) => s + g.indicaciones, 0)]);
  totalRow.eachCell((cell: any, col: number) => {
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "111827" } };
    cell.alignment = { vertical: "middle", horizontal: col === 1 || col >= 7 ? "center" : "left" };
    cell.border = { top: { style: "medium", color: { argb: BRAND } } };
  });
  ws2.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: COLS2.length } };

  // ── Descargar ───────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeRef = (refugio || "refugio").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40);
  a.href = url;
  a.download = `medicamentos_${safeRef}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
