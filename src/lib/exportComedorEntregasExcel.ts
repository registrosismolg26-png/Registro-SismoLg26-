// ── Exportación a Excel: Detalle de Personas que Retiraron Comidas (Comedor) ──
// Reporte operativo por fecha y servicio (Desayuno, Almuerzo, Cena)
// Nombre por nombre, cédula por cédula, enfocado en los Jefes y Responsables que retiran.
// Carga exceljs de forma perezosa (dynamic import).

import type { ComedorRegistroItem, ComedorServicio } from "@/types";

export interface ExportComedorEntregasOpts {
  entregas: ComedorRegistroItem[];
  fecha?: string;
  desde?: string;
  hasta?: string;
  refugio: string;
  servicioFiltro?: string; // "TODOS" | "DESAYUNO" | "ALMUERZO" | "CENA"
  generadoPor?: string;
}

const BRAND = "1E3A8A"; // Navy institucional Gobernación
const BRAND_LIGHT = "F1F5F9"; // Gris muy suave
const ACCENT_AMBER = "D97706"; // Desayuno
const ACCENT_SKY = "0284C7"; // Almuerzo
const ACCENT_PURPLE = "7C3AED"; // Cena
const ACCENT_GREEN = "059669"; // Raciones / Éxito
const BORDER_COLOR = "CBD5E1";

const borderThin = {
  top: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  left: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  bottom: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  right: { style: "thin" as const, color: { argb: BORDER_COLOR } },
};

export async function exportComedorEntregasExcel(opts: ExportComedorEntregasOpts): Promise<void> {
  const { entregas, fecha, desde, hasta, refugio, servicioFiltro, generadoPor } = opts;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Registro-SismoLg26 - Módulo Comedor";
  wb.created = new Date();

  // Periodo label
  let periodoLabel = "Todos los registros";
  if (fecha) {
    periodoLabel = `Día: ${fecha}`;
  } else if (desde && hasta) {
    periodoLabel = `Del ${desde} al ${hasta}`;
  } else if (desde) {
    periodoLabel = `Desde ${desde}`;
  } else if (hasta) {
    periodoLabel = `Hasta ${hasta}`;
  }

  // Desglosar entregas por servicio
  const desayunos = entregas.filter((e) => e.servicio === "DESAYUNO");
  const almuerzos = entregas.filter((e) => e.servicio === "ALMUERZO");
  const cenas = entregas.filter((e) => e.servicio === "CENA");

  const totalRaciones = entregas.reduce((acc, e) => acc + (e.raciones || 1), 0);
  const desayunoRaciones = desayunos.reduce((acc, e) => acc + (e.raciones || 1), 0);
  const almuerzoRaciones = almuerzos.reduce((acc, e) => acc + (e.raciones || 1), 0);
  const cenaRaciones = cenas.reduce((acc, e) => acc + (e.raciones || 1), 0);

  // Mapa de Jefes únicos para la Matriz Consolidada
  // Clave: cédula normalizada
  const jefesMap = new Map<
    string,
    {
      cedula: string;
      nombre: string;
      condicion: string;
      telefono: string;
      refugio: string;
      desayuno?: ComedorRegistroItem;
      almuerzo?: ComedorRegistroItem;
      cena?: ComedorRegistroItem;
      totalPlatos: number;
      comidasCount: number;
    }
  >();

  entregas.forEach((e) => {
    const k = (e.cedula || "").trim().toUpperCase();
    if (!jefesMap.has(k)) {
      jefesMap.set(k, {
        cedula: e.cedula,
        nombre: e.nombre,
        condicion: e.tipoBeneficiario === "JEFE" ? "Jefe de Familia" : "Persona Sola",
        telefono: e.telefono || "—",
        refugio: e.refugio,
        totalPlatos: 0,
        comidasCount: 0,
      });
    }
    const item = jefesMap.get(k)!;
    const r = e.raciones || 1;
    item.totalPlatos += r;

    if (e.servicio === "DESAYUNO") {
      item.desayuno = e;
      item.comidasCount++;
    } else if (e.servicio === "ALMUERZO") {
      item.almuerzo = e;
      item.comidasCount++;
    } else if (e.servicio === "CENA") {
      item.cena = e;
      item.comidasCount++;
    }
  });

  const jefesLista = Array.from(jefesMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

  // ══════════════════════════════════════════════════════════════════════════
  // HOJA 1: MATRIZ DE RETIROS POR JEFE (DESAYUNO + ALMUERZO + CENA EN UNA SOLA VISTA)
  // ══════════════════════════════════════════════════════════════════════════
  const wsMatriz = wb.addWorksheet("Matriz de Retiros por Jefe", {
    views: [{ state: "frozen", ySplit: 11, showGridLines: true }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  const matrizCols = [
    { header: "#", width: 6 },
    { header: "Cédula del Jefe / Responsable", width: 20 },
    { header: "Nombre y Apellido", width: 32 },
    { header: "Condición", width: 18 },
    { header: "Teléfono", width: 16 },
    { header: "Campamento / Refugio", width: 24 },
    { header: "☀️ Desayuno (Hora / Platos)", width: 26 },
    { header: "🍽️ Almuerzo (Hora / Platos)", width: 26 },
    { header: "🌙 Cena (Hora / Platos)", width: 26 },
    { header: "Total Platos", width: 16 },
    { header: "Estatus de Retiro", width: 22 },
  ];
  wsMatriz.columns = matrizCols.map((c) => ({ width: c.width }));

  // Membrete
  wsMatriz.mergeCells("A2:K2");
  const m1 = wsMatriz.getCell("A2");
  m1.value = "REPÚBLICA BOLIVARIANA DE VENEZUELA";
  m1.font = { name: "Arial", size: 10, bold: true, color: { argb: "64748B" } };
  m1.alignment = { horizontal: "center", vertical: "middle" };

  wsMatriz.mergeCells("A3:K3");
  const m2 = wsMatriz.getCell("A3");
  m2.value = "GOBERNACIÓN DEL ESTADO LA GUAIRA · MINISTERIO DEL PODER POPULAR PARA LA ALIMENTACIÓN";
  m2.font = { name: "Arial", size: 11, bold: true, color: { argb: BRAND } };
  m2.alignment = { horizontal: "center", vertical: "middle" };

  wsMatriz.mergeCells("A4:K4");
  const m3 = wsMatriz.getCell("A4");
  m3.value = "CONTROL DIARIO DE COMEDOR — LISTADO DE JEFES Y RESPONSABLES QUE RETIRARON COMIDA";
  m3.font = { name: "Arial", size: 13, bold: true, color: { argb: BRAND } };
  m3.alignment = { horizontal: "center", vertical: "middle" };

  // Metadatos
  wsMatriz.mergeCells("A5:E5");
  wsMatriz.getCell("A5").value = `Campamento: ${refugio || "TODOS LOS CAMPAMENTOS"}`;
  wsMatriz.getCell("A5").font = { name: "Arial", size: 10, bold: true, color: { argb: "1E293B" } };

  wsMatriz.mergeCells("F5:K5");
  wsMatriz.getCell("F5").value = `Período / Fecha: ${periodoLabel}`;
  wsMatriz.getCell("F5").font = { name: "Arial", size: 10, bold: true, color: { argb: "1E293B" } };

  wsMatriz.mergeCells("A6:E6");
  wsMatriz.getCell("A6").value = `Emisión: ${new Date().toLocaleDateString("es-VE", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  wsMatriz.getCell("A6").font = { name: "Arial", size: 9, italic: true, color: { argb: "64748B" } };

  if (generadoPor) {
    wsMatriz.mergeCells("F6:K6");
    wsMatriz.getCell("F6").value = `Operador / Registrado por: ${generadoPor}`;
    wsMatriz.getCell("F6").font = { name: "Arial", size: 9, italic: true, color: { argb: "64748B" } };
  }

  // Resumen de KPIs en bloque
  wsMatriz.mergeCells("A8:K8");
  const kpiTitle = wsMatriz.getCell("A8");
  kpiTitle.value = "RESUMEN CONSOLIDADO DE PLATOS Y ATENCIONES";
  kpiTitle.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  kpiTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  kpiTitle.alignment = { vertical: "middle", indent: 1 };

  // Fila 9: Tarjetas de resumen
  const kpiRowLabels = [
    { col: "A:B", title: "Total Platos Servidos", val: `${totalRaciones} platos`, color: "2563EB" },
    { col: "C:D", title: "Jefes / Responsables Atendidos", val: `${jefesLista.length} personas`, color: ACCENT_GREEN },
    { col: "E:F", title: "☀️ Desayunos Retirados", val: `${desayunoRaciones} platos (${desayunos.length} atenciones)`, color: ACCENT_AMBER },
    { col: "G:H", title: "🍽️ Almuerzos Retirados", val: `${almuerzoRaciones} platos (${almuerzos.length} atenciones)`, color: ACCENT_SKY },
    { col: "I:K", title: "🌙 Cenas Retiradas", val: `${cenaRaciones} platos (${cenas.length} atenciones)`, color: ACCENT_PURPLE },
  ];

  kpiRowLabels.forEach((kpi) => {
    wsMatriz.mergeCells(`${kpi.col.split(":")[0]}9:${kpi.col.split(":")[1]}9`);
    const c = wsMatriz.getCell(`${kpi.col.split(":")[0]}9`);
    c.value = `${kpi.title}: ${kpi.val}`;
    c.font = { name: "Arial", size: 9.5, bold: true, color: { argb: kpi.color } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = borderThin;
  });

  // Fila 11: Encabezados de tabla
  const hRowMatriz = wsMatriz.getRow(11);
  matrizCols.forEach((col, idx) => {
    const cell = hRowMatriz.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: "Arial", size: 9.5, bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { horizontal: idx >= 6 && idx <= 9 ? "center" : idx === 0 ? "center" : "left", vertical: "middle" };
    cell.border = borderThin;
  });
  hRowMatriz.height = 24;

  let rIdx = 12;
  jefesLista.forEach((jefe, idx) => {
    const row = wsMatriz.getRow(rIdx);

    const desTxt = jefe.desayuno ? `✓ ${jefe.desayuno.raciones} platos (${jefe.desayuno.hora})` : "— No retiró —";
    const almTxt = jefe.almuerzo ? `✓ ${jefe.almuerzo.raciones} platos (${jefe.almuerzo.hora})` : "— No retiró —";
    const cenTxt = jefe.cena ? `✓ ${jefe.cena.raciones} platos (${jefe.cena.hora})` : "— No retiró —";

    let estatus = `${jefe.comidasCount} / 3 comidas`;
    if (jefe.comidasCount === 3) estatus = "Completó 3 comidas";
    else if (jefe.comidasCount === 2) estatus = "Retiró 2 comidas";
    else if (jefe.comidasCount === 1) estatus = "Retiró 1 comida";

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = jefe.cedula;
    row.getCell(3).value = jefe.nombre;
    row.getCell(4).value = jefe.condicion;
    row.getCell(5).value = jefe.telefono;
    row.getCell(6).value = jefe.refugio;
    row.getCell(7).value = desTxt;
    row.getCell(8).value = almTxt;
    row.getCell(9).value = cenTxt;
    row.getCell(10).value = jefe.totalPlatos;
    row.getCell(11).value = estatus;

    // Estilos de celdas
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(2).font = { name: "Arial", size: 9.5, bold: true, color: { argb: "1E293B" } };
    row.getCell(3).font = { name: "Arial", size: 9.5, bold: true, color: { argb: "0F172A" } };
    row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(4).font = { name: "Arial", size: 9, color: { argb: jefe.condicion === "Jefe de Familia" ? "0284C7" : "059669" } };

    // Desayuno
    row.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(7).font = { name: "Arial", size: 9, bold: !!jefe.desayuno, color: { argb: jefe.desayuno ? ACCENT_AMBER : "94A3B8" } };

    // Almuerzo
    row.getCell(8).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(8).font = { name: "Arial", size: 9, bold: !!jefe.almuerzo, color: { argb: jefe.almuerzo ? ACCENT_SKY : "94A3B8" } };

    // Cena
    row.getCell(9).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(9).font = { name: "Arial", size: 9, bold: !!jefe.cena, color: { argb: jefe.cena ? ACCENT_PURPLE : "94A3B8" } };

    // Total platos
    row.getCell(10).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(10).font = { name: "Arial", size: 10, bold: true, color: { argb: ACCENT_GREEN } };
    row.getCell(10).numFmt = "#,##0";

    // Estatus
    row.getCell(11).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(11).font = {
      name: "Arial",
      size: 9,
      bold: true,
      color: { argb: jefe.comidasCount === 3 ? "059669" : jefe.comidasCount === 2 ? "0284C7" : "D97706" },
    };

    // Bordes y zebra
    for (let c = 1; c <= 11; c++) {
      const cell = row.getCell(c);
      cell.border = borderThin;
      if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFC" } };
      }
    }
    row.height = 20;
    rIdx++;
  });

  // Fila de Totales de la Matriz
  const totRowMatriz = wsMatriz.getRow(rIdx);
  totRowMatriz.getCell(1).value = "";
  totRowMatriz.getCell(2).value = "TOTALES CONSOLIDADOS:";
  totRowMatriz.getCell(2).font = { name: "Arial", size: 10, bold: true, color: { argb: BRAND } };
  totRowMatriz.getCell(3).value = `${jefesLista.length} Jefes / Solos atendidos`;
  totRowMatriz.getCell(3).font = { name: "Arial", size: 10, bold: true, color: { argb: BRAND } };
  totRowMatriz.getCell(7).value = `${desayunoRaciones} platos`;
  totRowMatriz.getCell(7).font = { name: "Arial", size: 10, bold: true, color: { argb: ACCENT_AMBER } };
  totRowMatriz.getCell(7).alignment = { horizontal: "center" };
  totRowMatriz.getCell(8).value = `${almuerzoRaciones} platos`;
  totRowMatriz.getCell(8).font = { name: "Arial", size: 10, bold: true, color: { argb: ACCENT_SKY } };
  totRowMatriz.getCell(8).alignment = { horizontal: "center" };
  totRowMatriz.getCell(9).value = `${cenaRaciones} platos`;
  totRowMatriz.getCell(9).font = { name: "Arial", size: 10, bold: true, color: { argb: ACCENT_PURPLE } };
  totRowMatriz.getCell(9).alignment = { horizontal: "center" };
  totRowMatriz.getCell(10).value = totalRaciones;
  totRowMatriz.getCell(10).font = { name: "Arial", size: 11, bold: true, color: { argb: ACCENT_GREEN } };
  totRowMatriz.getCell(10).alignment = { horizontal: "center" };
  totRowMatriz.getCell(10).numFmt = "#,##0";
  totRowMatriz.getCell(11).value = `${entregas.length} entregas totales`;
  totRowMatriz.getCell(11).font = { name: "Arial", size: 9.5, bold: true, color: { argb: BRAND } };
  totRowMatriz.getCell(11).alignment = { horizontal: "center" };

  for (let c = 1; c <= 11; c++) {
    const cell = totRowMatriz.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E2E8F0" } };
    cell.border = borderThin;
  }
  totRowMatriz.height = 24;

  if (jefesLista.length > 0) {
    wsMatriz.autoFilter = { from: { row: 11, column: 1 }, to: { row: 11, column: 11 } };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPER PARA HOJAS DE DETALLE (TODAS, DESAYUNO, ALMUERZO, CENA)
  // ══════════════════════════════════════════════════════════════════════════
  const buildDetalleSheet = (
    sheetName: string,
    items: ComedorRegistroItem[],
    tituloHeader: string,
    accentColor: string
  ) => {
    const ws = wb.addWorksheet(sheetName, {
      views: [{ state: "frozen", ySplit: 6, showGridLines: true }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });

    const cols = [
      { header: "#", width: 6 },
      { header: "Fecha", width: 14 },
      { header: "Servicio", width: 15 },
      { header: "Hora Retiro", width: 14 },
      { header: "Cédula del Jefe / Responsable", width: 22 },
      { header: "Nombre y Apellido", width: 32 },
      { header: "Condición", width: 18 },
      { header: "Raciones (Platos)", width: 18 },
      { header: "Teléfono", width: 16 },
      { header: "Campamento / Refugio", width: 24 },
      { header: "Registrado por", width: 22 },
      { header: "Observaciones", width: 26 },
    ];
    ws.columns = cols.map((c) => ({ width: c.width }));

    // Membrete
    ws.mergeCells("A1:L1");
    const h1 = ws.getCell("A1");
    h1.value = tituloHeader;
    h1.font = { name: "Arial", size: 12, bold: true, color: { argb: BRAND } };
    h1.alignment = { horizontal: "center", vertical: "middle" };

    ws.mergeCells("A2:L2");
    const h2 = ws.getCell("A2");
    h2.value = `Campamento: ${refugio || "TODOS"}  ·  Período: ${periodoLabel}  ·  Total Atenciones: ${items.length}  ·  Total Platos: ${items.reduce((acc, i) => acc + (i.raciones || 1), 0)}`;
    h2.font = { name: "Arial", size: 9.5, italic: true, color: { argb: "475569" } };
    h2.alignment = { horizontal: "center", vertical: "middle" };

    // Fila 6: Encabezados de tabla
    const hRow = ws.getRow(6);
    cols.forEach((col, idx) => {
      const cell = hRow.getCell(idx + 1);
      cell.value = col.header;
      cell.font = { name: "Arial", size: 9.5, bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accentColor } };
      cell.alignment = { horizontal: idx === 0 || idx === 1 || idx === 2 || idx === 3 || idx === 6 || idx === 7 ? "center" : "left", vertical: "middle" };
      cell.border = borderThin;
    });
    hRow.height = 24;

    let rowNum = 7;
    items.forEach((item, idx) => {
      const r = ws.getRow(rowNum);
      const platos = item.raciones || 1;

      r.getCell(1).value = idx + 1;
      r.getCell(2).value = item.fecha;
      r.getCell(3).value = item.servicio;
      r.getCell(4).value = item.hora;
      r.getCell(5).value = item.cedula;
      r.getCell(6).value = item.nombre;
      r.getCell(7).value = item.tipoBeneficiario === "JEFE" ? "Jefe de Familia" : "Persona Sola";
      r.getCell(8).value = platos;
      r.getCell(9).value = item.telefono || "—";
      r.getCell(10).value = item.refugio;
      r.getCell(11).value = item.registradoPor || "Master";
      r.getCell(12).value = item.observacion || "—";

      // Formato
      r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      r.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
      r.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
      r.getCell(3).font = { name: "Arial", size: 9, bold: true, color: { argb: item.servicio === "DESAYUNO" ? ACCENT_AMBER : item.servicio === "ALMUERZO" ? ACCENT_SKY : ACCENT_PURPLE } };
      r.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
      r.getCell(4).font = { name: "Arial", size: 9.5, bold: true, color: { argb: "1E293B" } };
      r.getCell(5).font = { name: "Arial", size: 9.5, bold: true, color: { argb: "0F172A" } };
      r.getCell(6).font = { name: "Arial", size: 9.5, bold: true, color: { argb: "0F172A" } };
      r.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
      r.getCell(8).alignment = { horizontal: "center", vertical: "middle" };
      r.getCell(8).font = { name: "Arial", size: 10, bold: true, color: { argb: ACCENT_GREEN } };
      r.getCell(8).numFmt = "#,##0";

      for (let c = 1; c <= 12; c++) {
        const cell = r.getCell(c);
        cell.border = borderThin;
        if (idx % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFC" } };
        }
      }
      r.height = 19;
      rowNum++;
    });

    // Fila total
    const totRow = ws.getRow(rowNum);
    totRow.getCell(1).value = "";
    totRow.getCell(2).value = "TOTAL:";
    totRow.getCell(2).font = { name: "Arial", size: 10, bold: true, color: { argb: BRAND } };
    totRow.getCell(5).value = `${items.length} retiros registrados`;
    totRow.getCell(5).font = { name: "Arial", size: 10, bold: true, color: { argb: BRAND } };
    totRow.getCell(8).value = items.reduce((acc, i) => acc + (i.raciones || 1), 0);
    totRow.getCell(8).font = { name: "Arial", size: 11, bold: true, color: { argb: ACCENT_GREEN } };
    totRow.getCell(8).alignment = { horizontal: "center" };
    totRow.getCell(8).numFmt = "#,##0";

    for (let c = 1; c <= 12; c++) {
      const cell = totRow.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E2E8F0" } };
      cell.border = borderThin;
    }
    totRow.height = 22;

    if (items.length > 0) {
      ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: 12 } };
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // HOJA 2: TODAS LAS ENTREGAS CRONOLÓGICAS
  // ══════════════════════════════════════════════════════════════════════════
  buildDetalleSheet(
    "Todas las Entregas",
    entregas,
    "REGISTRO GENERAL CRONOLÓGICO DE ENTREGAS DE COMIDA",
    BRAND
  );

  // ══════════════════════════════════════════════════════════════════════════
  // HOJA 3: ☀️ DESAYUNOS
  // ══════════════════════════════════════════════════════════════════════════
  buildDetalleSheet(
    "☀️ Desayunos",
    desayunos,
    "REPORTE DE PERSONAS QUE RETIRARON DESAYUNO",
    ACCENT_AMBER
  );

  // ══════════════════════════════════════════════════════════════════════════
  // HOJA 4: 🍽️ ALMUERZOS
  // ══════════════════════════════════════════════════════════════════════════
  buildDetalleSheet(
    "🍽️ Almuerzos",
    almuerzos,
    "REPORTE DE PERSONAS QUE RETIRARON ALMUERZO",
    ACCENT_SKY
  );

  // ══════════════════════════════════════════════════════════════════════════
  // HOJA 5: 🌙 CENAS
  // ══════════════════════════════════════════════════════════════════════════
  buildDetalleSheet(
    "🌙 Cenas",
    cenas,
    "REPORTE DE PERSONAS QUE RETIRARON CENA",
    ACCENT_PURPLE
  );

  // ══════════════════════════════════════════════════════════════════════════
  // DESCARGA EN NAVEGADOR
  // ══════════════════════════════════════════════════════════════════════════
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeRef = (refugio || "Refugio").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 25);
  const safeFecha = (fecha || desde || "fecha").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 20);
  a.href = url;
  a.download = `Comedor_Retiros_${safeRef}_${safeFecha}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
