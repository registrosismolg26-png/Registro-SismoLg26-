// ── Exportación a Excel: Módulo de Comedor ──────────────────────────────────
// Reporte ejecutivo con resumen estadístico, KPIs, desglose por servicio,
// distribución por refugio y consolidado histórico por fecha.
// Se carga exceljs de forma PEREZOSA (dynamic import).

import type { ComedorStats } from "@/types";

export interface ComedorExportOpts {
  stats: ComedorStats;
  refugio: string;
  periodoLabel: string;
  desde?: string;
  hasta?: string;
  generadoPor?: string;
}

const BRAND = "1E3A8A"; // Navy institucional Gobernación
const BRAND_LIGHT = "F1F5F9"; // Gris muy suave
const ACCENT_AMBER = "D97706"; // Desayuno
const ACCENT_SKY = "0284C7"; // Almuerzo
const ACCENT_PURPLE = "7C3AED"; // Cena
const ACCENT_GREEN = "059669"; // Atenciones / Total
const BORDER_COLOR = "CBD5E1";

const borderThin = {
  top: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  left: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  bottom: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  right: { style: "thin" as const, color: { argb: BORDER_COLOR } },
};

export async function exportComedorExcel(opts: ComedorExportOpts): Promise<void> {
  const { stats, refugio, periodoLabel, generadoPor } = opts;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Registro-SismoLg26 - Módulo Comedor";
  wb.created = new Date();

  // ══════════════════════════════════════════════════════════════════════════
  // HOJA 1: RESUMEN Y ESTADÍSTICAS OPERATIVAS
  // ══════════════════════════════════════════════════════════════════════════
  const wsResumen = wb.addWorksheet("Resumen Ejecutivo", {
    views: [{ showGridLines: true }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1 },
  });

  wsResumen.columns = [
    { width: 4 },  // A (margen)
    { width: 28 }, // B
    { width: 18 }, // C
    { width: 18 }, // D
    { width: 18 }, // E
    { width: 20 }, // F
  ];

  // Membrete
  wsResumen.mergeCells("B2:F2");
  const t1 = wsResumen.getCell("B2");
  t1.value = "REPÚBLICA BOLIVARIANA DE VENEZUELA";
  t1.font = { name: "Arial", size: 10, bold: true, color: { argb: "64748B" } };
  t1.alignment = { horizontal: "center", vertical: "middle" };

  wsResumen.mergeCells("B3:F3");
  const t2 = wsResumen.getCell("B3");
  t2.value = "GOBERNACIÓN DEL ESTADO LA GUAIRA · MINISTERIO DEL PODER POPULAR PARA LA ALIMENTACIÓN";
  t2.font = { name: "Arial", size: 11, bold: true, color: { argb: BRAND } };
  t2.alignment = { horizontal: "center", vertical: "middle" };

  wsResumen.mergeCells("B4:F4");
  const t3 = wsResumen.getCell("B4");
  t3.value = "SISTEMA INTEGRAL DE CONTROL Y REGISTRO DE COMEDOR — BALANCE GENERAL";
  t3.font = { name: "Arial", size: 13, bold: true, color: { argb: BRAND } };
  t3.alignment = { horizontal: "center", vertical: "middle" };

  // Metadatos
  wsResumen.getCell("B5").value = `Campamento / Refugio: ${refugio || "TODOS LOS CAMPAMENTOS"}`;
  wsResumen.getCell("B5").font = { name: "Arial", size: 10, bold: true, color: { argb: "1E293B" } };
  wsResumen.getCell("E5").value = `Período: ${periodoLabel || "Todos los registros"}`;
  wsResumen.getCell("E5").font = { name: "Arial", size: 10, bold: true, color: { argb: "1E293B" } };
  wsResumen.getCell("B6").value = `Fecha de emisión: ${new Date().toLocaleDateString("es-VE", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  wsResumen.getCell("B6").font = { name: "Arial", size: 9, italic: true, color: { argb: "64748B" } };
  if (generadoPor) {
    wsResumen.getCell("E6").value = `Generado por: ${generadoPor}`;
    wsResumen.getCell("E6").font = { name: "Arial", size: 9, italic: true, color: { argb: "64748B" } };
  }

  // 1. INDICADORES CLAVE (KPIs)
  wsResumen.mergeCells("B8:F8");
  const sec1 = wsResumen.getCell("B8");
  sec1.value = "1. INDICADORES CLAVE DE DESEMPEÑO (KPIs)";
  sec1.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFF" } };
  sec1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  sec1.alignment = { vertical: "middle", indent: 1 };

  const kpis = [
    { metrica: "Total Raciones Servidas (Platos)", valor: stats.totalRaciones, color: "2563EB", nota: "Platos entregados en el periodo" },
    { metrica: "Total de Atenciones Realizadas", valor: stats.totalAtendidos, color: "059669", nota: "Jefes y personas solas registradas" },
    { metrica: "Raciones de Desayuno", valor: stats.desayunoRaciones, color: ACCENT_AMBER, nota: `${stats.desayunoAtendidos} atenciones (${stats.tasasServicio?.desayunoPct ?? 0}%)` },
    { metrica: "Raciones de Almuerzo", valor: stats.almuerzoRaciones, color: ACCENT_SKY, nota: `${stats.almuerzoAtendidos} atenciones (${stats.tasasServicio?.almuerzoPct ?? 0}%)` },
    { metrica: "Raciones de Cena", valor: stats.cenaRaciones, color: ACCENT_PURPLE, nota: `${stats.cenaAtendidos} atenciones (${stats.tasasServicio?.cenaPct ?? 0}%)` },
    { metrica: "Promedio Diario de Raciones", valor: stats.promedios?.racionesPorDia ?? 0, color: "0F172A", nota: "Platos servidos por día operativo" },
    { metrica: "Promedio Raciones por Persona", valor: stats.promedios?.racionesPorPersona ?? 0, color: "0F172A", nota: "Platos por cada beneficiario atendido" },
  ];

  let curRow = 9;
  wsResumen.getCell(`B${curRow}`).value = "Métrica Operativa";
  wsResumen.getCell(`C${curRow}`).value = "Valor";
  wsResumen.mergeCells(`D${curRow}:F${curRow}`);
  wsResumen.getCell(`D${curRow}`).value = "Detalle / Proporción";
  ["B", "C", "D", "E", "F"].forEach((col) => {
    const c = wsResumen.getCell(`${col}${curRow}`);
    c.font = { name: "Arial", size: 9.5, bold: true, color: { argb: "1E293B" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
    c.border = borderThin;
  });

  kpis.forEach((k) => {
    curRow++;
    wsResumen.getCell(`B${curRow}`).value = k.metrica;
    wsResumen.getCell(`B${curRow}`).font = { name: "Arial", size: 9.5, bold: true, color: { argb: "1E293B" } };
    wsResumen.getCell(`B${curRow}`).border = borderThin;

    const valCell = wsResumen.getCell(`C${curRow}`);
    valCell.value = k.valor;
    valCell.numFmt = typeof k.valor === "number" && k.valor % 1 !== 0 ? "#,##0.0" : "#,##0";
    valCell.font = { name: "Arial", size: 10.5, bold: true, color: { argb: k.color } };
    valCell.alignment = { horizontal: "right" };
    valCell.border = borderThin;

    wsResumen.mergeCells(`D${curRow}:F${curRow}`);
    const detCell = wsResumen.getCell(`D${curRow}`);
    detCell.value = k.nota;
    detCell.font = { name: "Arial", size: 9, color: { argb: "475569" } };
    detCell.border = borderThin;
    ["E", "F"].forEach((col) => { wsResumen.getCell(`${col}${curRow}`).border = borderThin; });
  });

  // 2. DISTRIBUCIÓN POR SERVICIO
  curRow += 2;
  wsResumen.mergeCells(`B${curRow}:F${curRow}`);
  const sec2 = wsResumen.getCell(`B${curRow}`);
  sec2.value = "2. DISTRIBUCIÓN POR SERVICIO (DESAYUNO / ALMUERZO / CENA)";
  sec2.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFF" } };
  sec2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  sec2.alignment = { vertical: "middle", indent: 1 };

  curRow++;
  const srvHeaders = ["Servicio", "Raciones", "% Raciones", "Atenciones", "Promedio"];
  ["B", "C", "D", "E", "F"].forEach((col, i) => {
    const c = wsResumen.getCell(`${col}${curRow}`);
    c.value = srvHeaders[i];
    c.font = { name: "Arial", size: 9.5, bold: true, color: { argb: "1E293B" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
    c.border = borderThin;
    c.alignment = { horizontal: i === 0 ? "left" : "right" };
  });

  const srvRows = [
    {
      nombre: "Desayuno",
      raciones: stats.desayunoRaciones,
      pct: (stats.tasasServicio?.desayunoPct ?? 0) / 100,
      atenciones: stats.desayunoAtendidos,
      prom: stats.desayunoAtendidos > 0 ? stats.desayunoRaciones / stats.desayunoAtendidos : 0,
      color: ACCENT_AMBER,
    },
    {
      nombre: "Almuerzo",
      raciones: stats.almuerzoRaciones,
      pct: (stats.tasasServicio?.almuerzoPct ?? 0) / 100,
      atenciones: stats.almuerzoAtendidos,
      prom: stats.almuerzoAtendidos > 0 ? stats.almuerzoRaciones / stats.almuerzoAtendidos : 0,
      color: ACCENT_SKY,
    },
    {
      nombre: "Cena",
      raciones: stats.cenaRaciones,
      pct: (stats.tasasServicio?.cenaPct ?? 0) / 100,
      atenciones: stats.cenaAtendidos,
      prom: stats.cenaAtendidos > 0 ? stats.cenaRaciones / stats.cenaAtendidos : 0,
      color: ACCENT_PURPLE,
    },
  ];

  srvRows.forEach((sr) => {
    curRow++;
    const c1 = wsResumen.getCell(`B${curRow}`);
    c1.value = sr.nombre;
    c1.font = { name: "Arial", size: 9.5, bold: true, color: { argb: sr.color } };
    c1.border = borderThin;

    const c2 = wsResumen.getCell(`C${curRow}`);
    c2.value = sr.raciones;
    c2.numFmt = "#,##0";
    c2.font = { name: "Arial", size: 9.5, bold: true, color: { argb: sr.color } };
    c2.alignment = { horizontal: "right" };
    c2.border = borderThin;

    const c3 = wsResumen.getCell(`D${curRow}`);
    c3.value = sr.pct;
    c3.numFmt = "0.0%";
    c3.font = { name: "Arial", size: 9.5, color: { argb: "1E293B" } };
    c3.alignment = { horizontal: "right" };
    c3.border = borderThin;

    const c4 = wsResumen.getCell(`E${curRow}`);
    c4.value = sr.atenciones;
    c4.numFmt = "#,##0";
    c4.font = { name: "Arial", size: 9.5, color: { argb: "1E293B" } };
    c4.alignment = { horizontal: "right" };
    c4.border = borderThin;

    const c5 = wsResumen.getCell(`F${curRow}`);
    c5.value = sr.prom;
    c5.numFmt = "#,##0.0";
    c5.font = { name: "Arial", size: 9.5, color: { argb: "475569" } };
    c5.alignment = { horizontal: "right" };
    c5.border = borderThin;
  });

  // Total de servicios
  curRow++;
  wsResumen.getCell(`B${curRow}`).value = "TOTAL SERVICIOS";
  wsResumen.getCell(`B${curRow}`).font = { name: "Arial", size: 10, bold: true, color: { argb: BRAND } };
  wsResumen.getCell(`B${curRow}`).border = borderThin;

  const totR = wsResumen.getCell(`C${curRow}`);
  totR.value = stats.totalRaciones;
  totR.numFmt = "#,##0";
  totR.font = { name: "Arial", size: 10, bold: true, color: { argb: BRAND } };
  totR.alignment = { horizontal: "right" };
  totR.border = borderThin;

  const totP = wsResumen.getCell(`D${curRow}`);
  totP.value = 1;
  totP.numFmt = "0.0%";
  totP.font = { name: "Arial", size: 10, bold: true, color: { argb: BRAND } };
  totP.alignment = { horizontal: "right" };
  totP.border = borderThin;

  const totA = wsResumen.getCell(`E${curRow}`);
  totA.value = stats.totalAtendidos;
  totA.numFmt = "#,##0";
  totA.font = { name: "Arial", size: 10, bold: true, color: { argb: BRAND } };
  totA.alignment = { horizontal: "right" };
  totA.border = borderThin;

  const totProm = wsResumen.getCell(`F${curRow}`);
  totProm.value = stats.totalAtendidos > 0 ? stats.totalRaciones / stats.totalAtendidos : 0;
  totProm.numFmt = "#,##0.0";
  totProm.font = { name: "Arial", size: 10, bold: true, color: { argb: BRAND } };
  totProm.alignment = { horizontal: "right" };
  totProm.border = borderThin;

  // 3. DISTRIBUCIÓN POR CAMPAMENTO / REFUGIO
  if (stats.porRefugio && stats.porRefugio.length > 0) {
    curRow += 2;
    wsResumen.mergeCells(`B${curRow}:F${curRow}`);
    const sec3 = wsResumen.getCell(`B${curRow}`);
    sec3.value = "3. DISTRIBUCIÓN POR CAMPAMENTO / REFUGIO";
    sec3.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFF" } };
    sec3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    sec3.alignment = { vertical: "middle", indent: 1 };

    curRow++;
    wsResumen.mergeCells(`B${curRow}:C${curRow}`);
    wsResumen.getCell(`B${curRow}`).value = "Campamento / Refugio";
    wsResumen.getCell(`D${curRow}`).value = "Raciones";
    wsResumen.getCell(`E${curRow}`).value = "Atenciones";
    wsResumen.getCell(`F${curRow}`).value = "% Afluencia";
    ["B", "C", "D", "E", "F"].forEach((col) => {
      const c = wsResumen.getCell(`${col}${curRow}`);
      c.font = { name: "Arial", size: 9.5, bold: true, color: { argb: "1E293B" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
      c.border = borderThin;
    });

    stats.porRefugio.forEach((ref) => {
      curRow++;
      wsResumen.mergeCells(`B${curRow}:C${curRow}`);
      wsResumen.getCell(`B${curRow}`).value = ref.refugio;
      wsResumen.getCell(`B${curRow}`).font = { name: "Arial", size: 9, bold: true, color: { argb: "1E293B" } };
      wsResumen.getCell(`B${curRow}`).border = borderThin;
      wsResumen.getCell(`C${curRow}`).border = borderThin;

      const rCell = wsResumen.getCell(`D${curRow}`);
      rCell.value = ref.raciones;
      rCell.numFmt = "#,##0";
      rCell.font = { name: "Arial", size: 9, bold: true, color: { argb: "0284C7" } };
      rCell.alignment = { horizontal: "right" };
      rCell.border = borderThin;

      const aCell = wsResumen.getCell(`E${curRow}`);
      aCell.value = ref.atenciones;
      aCell.numFmt = "#,##0";
      aCell.font = { name: "Arial", size: 9, color: { argb: "1E293B" } };
      aCell.alignment = { horizontal: "right" };
      aCell.border = borderThin;

      const pCell = wsResumen.getCell(`F${curRow}`);
      pCell.value = stats.totalRaciones > 0 ? ref.raciones / stats.totalRaciones : 0;
      pCell.numFmt = "0.0%";
      pCell.font = { name: "Arial", size: 9, color: { argb: "475569" } };
      pCell.alignment = { horizontal: "right" };
      pCell.border = borderThin;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HOJA 2: CONSOLIDADO HISTÓRICO POR DÍA
  // ══════════════════════════════════════════════════════════════════════════
  const wsDiario = wb.addWorksheet("Consolidado Diario", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: true }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  const diarioCols = [
    { header: "Fecha", width: 14 },
    { header: "Día", width: 15 },
    { header: "☀️ Desayuno", width: 16 },
    { header: "🍽️ Almuerzo", width: 16 },
    { header: "🌙 Cena", width: 16 },
    { header: "🍲 Total Raciones", width: 18 },
    { header: "👥 Atenciones", width: 16 },
    { header: "Promedio Platos/Persona", width: 24 },
  ];
  wsDiario.columns = diarioCols.map((c) => ({ width: c.width }));

  // Encabezado Hoja 2
  wsDiario.mergeCells("A1:H1");
  const dHead = wsDiario.getCell("A1");
  dHead.value = "CONSOLIDADO HISTÓRICO POR FECHA — ENTREGAS DE COMEDOR";
  dHead.font = { name: "Arial", size: 12, bold: true, color: { argb: BRAND } };
  dHead.alignment = { horizontal: "center", vertical: "middle" };

  wsDiario.mergeCells("A2:H2");
  const dSub = wsDiario.getCell("A2");
  dSub.value = `Campamento: ${refugio || "TODOS"}  ·  Período: ${periodoLabel}  ·  Total Raciones: ${stats.totalRaciones.toLocaleString("es-VE")}  ·  Total Atenciones: ${stats.totalAtendidos.toLocaleString("es-VE")}`;
  dSub.font = { name: "Arial", size: 9.5, italic: true, color: { argb: "475569" } };
  dSub.alignment = { horizontal: "center", vertical: "middle" };

  // Fila de encabezado de tabla (Fila 5)
  const headerRow = wsDiario.getRow(5);
  diarioCols.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: "Arial", size: 9.5, bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { horizontal: idx >= 2 ? "right" : "left", vertical: "middle" };
    cell.border = borderThin;
  });
  headerRow.height = 24;

  const dias = stats.porDia || [];
  dias.forEach((d, idx) => {
    const rIdx = 6 + idx;
    const row = wsDiario.getRow(rIdx);
    const dateObj = new Date(d.fecha + "T12:00:00");
    const diaNombre = isNaN(dateObj.getTime())
      ? ""
      : dateObj.toLocaleDateString("es-VE", { weekday: "long" });

    row.getCell(1).value = d.fecha;
    row.getCell(1).font = { name: "Arial", size: 9, bold: true, color: { argb: "1E293B" } };
    row.getCell(1).border = borderThin;

    row.getCell(2).value = diaNombre ? diaNombre.charAt(0).toUpperCase() + diaNombre.slice(1) : "—";
    row.getCell(2).font = { name: "Arial", size: 9, color: { argb: "64748B" } };
    row.getCell(2).border = borderThin;

    row.getCell(3).value = d.desayuno;
    row.getCell(3).numFmt = "#,##0";
    row.getCell(3).font = { name: "Arial", size: 9, color: { argb: ACCENT_AMBER } };
    row.getCell(3).alignment = { horizontal: "right" };
    row.getCell(3).border = borderThin;

    row.getCell(4).value = d.almuerzo;
    row.getCell(4).numFmt = "#,##0";
    row.getCell(4).font = { name: "Arial", size: 9, color: { argb: ACCENT_SKY } };
    row.getCell(4).alignment = { horizontal: "right" };
    row.getCell(4).border = borderThin;

    row.getCell(5).value = d.cena;
    row.getCell(5).numFmt = "#,##0";
    row.getCell(5).font = { name: "Arial", size: 9, color: { argb: ACCENT_PURPLE } };
    row.getCell(5).alignment = { horizontal: "right" };
    row.getCell(5).border = borderThin;

    row.getCell(6).value = d.total;
    row.getCell(6).numFmt = "#,##0";
    row.getCell(6).font = { name: "Arial", size: 9.5, bold: true, color: { argb: BRAND } };
    row.getCell(6).alignment = { horizontal: "right" };
    row.getCell(6).border = borderThin;

    row.getCell(7).value = d.beneficiarios;
    row.getCell(7).numFmt = "#,##0";
    row.getCell(7).font = { name: "Arial", size: 9, color: { argb: "059669" } };
    row.getCell(7).alignment = { horizontal: "right" };
    row.getCell(7).border = borderThin;

    const prom = d.beneficiarios > 0 ? d.total / d.beneficiarios : 0;
    row.getCell(8).value = prom;
    row.getCell(8).numFmt = "#,##0.0";
    row.getCell(8).font = { name: "Arial", size: 9, color: { argb: "475569" } };
    row.getCell(8).alignment = { horizontal: "right" };
    row.getCell(8).border = borderThin;

    // Fila cebra suave
    if (idx % 2 === 1) {
      for (let c = 1; c <= 8; c++) {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFC" } };
      }
    }
  });

  // Fila de Totales en Hoja 2
  const totRowIdx = 6 + dias.length;
  const totRow = wsDiario.getRow(totRowIdx);
  totRow.getCell(1).value = "TOTALES";
  totRow.getCell(2).value = `${dias.length} DÍAS`;
  totRow.getCell(3).value = stats.desayunoRaciones;
  totRow.getCell(3).numFmt = "#,##0";
  totRow.getCell(4).value = stats.almuerzoRaciones;
  totRow.getCell(4).numFmt = "#,##0";
  totRow.getCell(5).value = stats.cenaRaciones;
  totRow.getCell(5).numFmt = "#,##0";
  totRow.getCell(6).value = stats.totalRaciones;
  totRow.getCell(6).numFmt = "#,##0";
  totRow.getCell(7).value = stats.totalAtendidos;
  totRow.getCell(7).numFmt = "#,##0";
  totRow.getCell(8).value = stats.totalAtendidos > 0 ? stats.totalRaciones / stats.totalAtendidos : 0;
  totRow.getCell(8).numFmt = "#,##0.0";

  for (let c = 1; c <= 8; c++) {
    const cell = totRow.getCell(c);
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: BRAND } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E2E8F0" } };
    cell.border = borderThin;
    if (c >= 3) cell.alignment = { horizontal: "right" };
  }
  totRow.height = 22;

  // Filtro automático
  wsDiario.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 8 } };

  // Descarga en navegador
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeRef = (refugio || "refugio").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 30);
  const safePeriodo = (periodoLabel || "periodo").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 20);
  a.href = url;
  a.download = `Comedor_Estadisticas_${safeRef}_${safePeriodo}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
