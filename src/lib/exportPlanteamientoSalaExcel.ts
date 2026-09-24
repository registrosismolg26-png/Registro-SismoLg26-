// ── Exportación XLSX para Planteamiento Sala ──────────────────────────────────
// Genera archivos Excel institucionales con membrete, estilos, anchos optimizados,
// bordes y formato zebra para cada modalidad:
// 1. Compra de Vivienda (Mercado Secundario)
// 2. Alquiler
// 3. Plan Venezuela Renace
// exceljs se carga dinámicamente de forma perezosa.

import type { PlanteamientoSalaItem, TipoOpcionPlanteamiento } from "@/types";

const BRAND = "1E3A8A";
const BRAND_LIGHT = "E8EDF7";
const ZEBRA = "F8FAFC";
const BORDER_COLOR = "CBD5E1";

const formatDateDisplay = (dStr?: string | null): string => {
  if (!dStr) return "—";
  const clean = dStr.slice(0, 10);
  const parts = clean.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return clean;
};

const formatDateTimeDisplay = (isoStr?: string | null): string => {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr.slice(0, 10);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch {
    return isoStr.slice(0, 10);
  }
};

const formatTituloCasa = (t?: string | null): string => {
  switch (t) {
    case "TITULO_PROPIEDAD":
      return "Título de Propiedad";
    case "TITULO_SUPLETORIO":
      return "Título Supletorio";
    case "COMPRA_VENTA":
      return "Documento Compra-Venta";
    case "NINGUNO":
      return "Ninguno";
    default:
      return t || "Ninguno";
  }
};

const formatCargaFamiliarSummary = (carga?: any[] | null): string => {
  if (!Array.isArray(carga) || carga.length === 0) return "Sin carga familiar";
  return carga
    .map((m) => {
      const parts = [m.nombreApellido || "SIN NOMBRE"];
      if (m.cedula) parts.push(`V-${m.cedula}`);
      if (m.parentesco) parts.push(m.parentesco);
      if (m.edad != null) parts.push(`${m.edad}a`);
      return parts.join(" (") + (parts.length > 1 ? ")" : "");
    })
    .join(" ; ");
};

interface ExportPlanteamientoOpts {
  items: PlanteamientoSalaItem[];
  modalidad: TipoOpcionPlanteamiento;
  refugio: string;
  generadoEn: string;
  filtros?: string;
}

export async function exportPlanteamientoModalidadExcel(opts: ExportPlanteamientoOpts): Promise<void> {
  const { items, modalidad, refugio, generadoEn, filtros } = opts;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Registro-SismoLg26";

  let sheetName = "Compra de Vivienda";
  let modalidadLabel = "Compra de Vivienda (Mercado Secundario)";
  let filePrefix = "planteamiento_compra_vivienda";

  if (modalidad === "ALQUILER") {
    sheetName = "Alquiler";
    modalidadLabel = "Alquiler";
    filePrefix = "planteamiento_alquiler";
  } else if (modalidad === "PLAN_VENEZUELA_RENACE") {
    sheetName = "Venezuela Renace";
    modalidadLabel = "Plan Venezuela Renace";
    filePrefix = "planteamiento_venezuela_renace";
  }

  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Definición de columnas según modalidad
  let cols: [string, number][] = [];

  if (modalidad === "MERCADO_SECUNDARIO") {
    cols = [
      ["N°", 6],
      ["Campamento", 26],
      ["Cédula", 14],
      ["Nombre y Apellido", 28],
      ["Género", 12],
      ["Fecha de Nacimiento", 18],
      ["Edad", 7],
      ["Teléfono", 15],
      ["Cant. Carga", 12],
      ["Carga Familiar", 35],
      ["F. Entrega Carpeta", 18],
      ["Estatus", 19],
      ["F. Entrega Subsidio", 18],
      ["Progreso", 11],
      ["1. Planilla Caracterización", 18],
      ["2. Cédula Catastral", 16],
      ["3. Título de la Casa", 24],
      ["4. Ref. Bancaria Vendedor", 18],
      ["5. QR Hábitat y Vivienda", 18],
      ["6. C.I. Vendedor", 15],
      ["7. C.I. Comprador", 15],
      ["8. Fotos Vivienda", 15],
      ["Cant. Fotos", 12],
      ["9. Vendedor Posee Patria", 18],
      ["10. QR Colapso Vivienda", 18],
      ["Observaciones", 32],
      ["Registrado por", 22],
      ["Fecha de Registro", 18],
    ];
  } else if (modalidad === "ALQUILER") {
    cols = [
      ["N°", 6],
      ["Campamento", 26],
      ["Cédula", 14],
      ["Nombre y Apellido", 28],
      ["Género", 12],
      ["Fecha de Nacimiento", 18],
      ["Edad", 7],
      ["Teléfono", 15],
      ["Cant. Carga", 12],
      ["Carga Familiar", 35],
      ["F. Entrega Carpeta", 18],
      ["Estatus", 19],
      ["F. Entrega Subsidio", 18],
      ["Progreso", 11],
      ["1. Carta de Compromiso", 18],
      ["2. Fotos de Alquiler", 15],
      ["Cant. Fotos", 12],
      ["3. Ref. Bancaria que Alquila", 20],
      ["4. C.I. Arrendador", 15],
      ["5. C.I. Arrendatario", 15],
      ["6. RIF Arrendador", 15],
      ["7. RIF Arrendatario", 15],
      ["Observaciones", 32],
      ["Registrado por", 22],
      ["Fecha de Registro", 18],
    ];
  } else {
    // PLAN_VENEZUELA_RENACE
    cols = [
      ["N°", 6],
      ["Campamento", 26],
      ["Cédula", 14],
      ["Nombre y Apellido", 28],
      ["Género", 12],
      ["Fecha de Nacimiento", 18],
      ["Edad", 7],
      ["Teléfono", 15],
      ["Cant. Carga", 12],
      ["Carga Familiar", 35],
      ["F. Entrega Carpeta", 18],
      ["Estatus", 19],
      ["F. Entrega Subsidio", 18],
      ["Progreso", 11],
      ["1. RIF Vivienda Daños", 18],
      ["2. Fotos de Vivienda", 16],
      ["Cant. Fotos", 12],
      ["Sacos de Cemento", 16],
      ["Metros de Arena", 15],
      ["Bloques", 12],
      ["Cabillas", 12],
      ["Pego (sacos)", 13],
      ["Observaciones", 32],
      ["Registrado por", 22],
      ["Fecha de Registro", 18],
    ];
  }

  const nCols = cols.length;
  const lastColLetter = ws.getColumn(nCols).letter;
  ws.columns = cols.map(([, w]) => ({ width: w }));

  // ── Membrete Institucional (Filas 1-4) ─────────────────────────────────────
  ws.mergeCells(`C1:${lastColLetter}1`);
  ws.mergeCells(`C2:${lastColLetter}2`);
  ws.mergeCells(`C3:${lastColLetter}3`);
  ws.mergeCells(`C4:${lastColLetter}4`);
  ws.mergeCells("A1:B4");

  const t1 = ws.getCell("C1");
  t1.value = "GOBERNACIÓN DEL ESTADO LA GUAIRA";
  t1.font = { name: "Arial", size: 14, bold: true, color: { argb: BRAND } };
  t1.alignment = { vertical: "middle", horizontal: "left" };

  const t2 = ws.getCell("C2");
  t2.value = `Planteamiento Sala · Modalidad: ${modalidadLabel}`;
  t2.font = { name: "Arial", size: 11, bold: true, color: { argb: "374151" } };
  t2.alignment = { vertical: "middle", horizontal: "left" };

  const t3 = ws.getCell("C3");
  t3.value = `Campamento: ${refugio || "Todos los campamentos"}   ·   Generado: ${generadoEn}   ·   Total de expedientes: ${items.length}`;
  t3.font = { name: "Arial", size: 9, color: { argb: "6B7280" } };
  t3.alignment = { vertical: "middle", horizontal: "left" };

  const t4 = ws.getCell("C4");
  const filtrosTxt = (filtros || "").trim();
  t4.value = filtrosTxt
    ? {
        richText: [
          { text: "Filtros aplicados:  ", font: { name: "Arial", size: 9, bold: true, color: { argb: BRAND } } },
          { text: filtrosTxt, font: { name: "Arial", size: 9, color: { argb: "374151" } } },
        ],
      }
    : { richText: [{ text: "Reporte consolidado completo", font: { name: "Arial", size: 9, italic: true, color: { argb: "9CA3AF" } } }] };
  t4.alignment = { vertical: "middle", horizontal: "left" };

  for (let r = 1; r <= 4; r++) {
    ws.getRow(r).height = r === 1 ? 24 : r === 4 ? 16 : 18;
    for (let c = 1; c <= nCols; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
      if (r === 4) cell.border = { bottom: { style: "medium", color: { argb: BRAND } } };
    }
  }

  // Intento de logo institucional
  try {
    const res = await fetch("/logo_gob_push.png");
    if (res.ok) {
      const imgBuffer = await res.arrayBuffer();
      const imageId = wb.addImage({
        buffer: imgBuffer,
        extension: "png",
      });
      ws.addImage(imageId, {
        tl: { col: 0.15, row: 0.2 },
        ext: { width: 95, height: 60 },
      });
    }
  } catch {
    // Si no carga el logo, continúa limpiamente
  }

  // ── Encabezado de la Tabla (Fila 5) ─────────────────────────────────────────
  const headerRow = ws.getRow(5);
  headerRow.height = 26;
  cols.forEach(([label], idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = label;
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "medium", color: { argb: BRAND } },
      bottom: { style: "medium", color: { argb: BRAND } },
      left: { style: "thin", color: { argb: "3B82F6" } },
      right: { style: "thin", color: { argb: "3B82F6" } },
    };
  });

  // ── Filas de Datos (Fila 6 en adelante) ────────────────────────────────────
  items.forEach((item, index) => {
    const rIdx = index + 6;
    const row = ws.getRow(rIdx);
    row.height = 20;
    const isEven = index % 2 === 1;
    const bg = isEven ? ZEBRA : "FFFFFF";

    let values: (string | number)[] = [];

    const cantCarga = Array.isArray(item.cargaFamiliar) ? item.cargaFamiliar.length : 0;
    const detalleCarga = formatCargaFamiliarSummary(item.cargaFamiliar);

    const baseValues = [
      index + 1,
      item.refugio || "—",
      item.cedula || "—",
      item.nombreApellido || "—",
      item.genero || "—",
      formatDateDisplay(item.fechaNacimiento),
      item.edad != null ? item.edad : "—",
      item.telefono || "—",
      cantCarga,
      detalleCarga,
      formatDateDisplay(item.fechaEntregaCarpeta || item.createdAt),
      item.estatus || "EN PROCESO",
      formatDateDisplay(item.fechaEntregaSubsidio),
      `${item.porcentajeProgreso || 0}%`,
    ];

    if (modalidad === "MERCADO_SECUNDARIO") {
      values = [
        ...baseValues,
        item.planillaCaracterizacion || "NO",
        item.cedulaCatastral || "NO",
        formatTituloCasa(item.tituloCasa),
        item.referenciaBancariaVendedor || "NO",
        item.qrHabitatVivienda || "NO",
        item.cedulaVendedor || "NO",
        item.cedulaComprador || "NO",
        item.fotosVivienda || "NO",
        item.cantidadFotos || 0,
        item.vendedorPoseePatria || "NO",
        item.qrColapsoVivienda || "NO",
        item.observacion || "—",
        item.createdBy || "—",
        formatDateTimeDisplay(item.createdAt),
      ];
    } else if (modalidad === "ALQUILER") {
      values = [
        ...baseValues,
        item.cartaCompromiso || "NO",
        item.fotosAlquiler || "NO",
        item.cantidadFotosAlquiler || 0,
        item.referenciaBancariaAlquiler || "NO",
        item.cedulaArrendador || "NO",
        item.cedulaArrendatario || "NO",
        item.rifArrendador || "NO",
        item.rifArrendatario || "NO",
        item.observacion || "—",
        item.createdBy || "—",
        formatDateTimeDisplay(item.createdAt),
      ];
    } else {
      // PLAN_VENEZUELA_RENACE
      values = [
        ...baseValues,
        item.rifViviendaDanos || "NO",
        item.fotosViviendaRenace || "NO",
        item.cantidadFotosRenace || 0,
        item.sacosCemento || 0,
        item.metrosArena || 0,
        item.bloques || 0,
        item.cabillas || 0,
        item.pego || 0,
        item.observacion || "—",
        item.createdBy || "—",
        formatDateTimeDisplay(item.createdAt),
      ];
    }

    values.forEach((v, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = v;
      cell.font = { name: "Arial", size: 8.5 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.border = {
        top: { style: "thin", color: { argb: BORDER_COLOR } },
        bottom: { style: "thin", color: { argb: BORDER_COLOR } },
        left: { style: "thin", color: { argb: BORDER_COLOR } },
        right: { style: "thin", color: { argb: BORDER_COLOR } },
      };

      // Alineación
      if (cIdx === 0 || cIdx === 2 || cIdx === 4 || cIdx === 5 || cIdx === 6 || cIdx === 8 || cIdx === 10 || cIdx === 12 || cIdx === 13) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else if (typeof v === "number" || v === "SI" || v === "NO") {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      }

      // Resalte si es SI
      if (v === "SI") {
        cell.font = { name: "Arial", size: 8.5, bold: true, color: { argb: "059669" } };
      } else if (v === "NO") {
        cell.font = { name: "Arial", size: 8.5, color: { argb: "94A3B8" } };
      }

      // Resalte de estatus
      if (cIdx === 11) {
        if (v === "CREDITO ENTREGADO") {
          cell.font = { name: "Arial", size: 8.5, bold: true, color: { argb: "059669" } };
        } else if (v === "EN PROCESO") {
          cell.font = { name: "Arial", size: 8.5, bold: true, color: { argb: "2563EB" } };
        } else if (v === "CARPETA RETORNADA") {
          cell.font = { name: "Arial", size: 8.5, bold: true, color: { argb: "D97706" } };
        } else if (v === "CON NOVEDAD EN LA SEDE") {
          cell.font = { name: "Arial", size: 8.5, bold: true, color: { argb: "DC2626" } };
        }
      }
    });
  });

  // Habilitar AutoFiltro
  if (items.length > 0) {
    ws.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: items.length + 5, column: nCols },
    };
  }

  // ── Descargar Blob ────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeCamp = (refugio || "todos").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 30);
  const nowStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filePrefix}_${safeCamp}_${nowStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
