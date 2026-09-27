// ── Generador y Parser de Plantilla Excel para Carga Masiva en Planteamiento Sala ──
// Permite descargar una plantilla oficial estilizada (.xlsx) con instrucciones,
// catálogo de parentescos y modalidades, y parsear archivos cargados con titulares
// y sus grupos familiares asociados.

export interface BulkTitularParsed {
  cedula: string;
  nombreApellido: string;
  telefono: string;
  tipoOpcion: string;
  observacion?: string;
  cargaFamiliar: BulkFamiliarParsed[];
}

export interface BulkFamiliarParsed {
  id?: string;
  cedula: string;
  nombreApellido: string;
  parentesco: string;
  genero: string;
  fechaNacimiento: string;
  edad?: number | null;
  telefono: string;
}

export interface ParseResult {
  titulares: BulkTitularParsed[];
  totalFamiliares: number;
  warnings: string[];
}

const BRAND = "1E3A8A";
const BRAND_LIGHT = "E8EDF7";
const ZEBRA = "F8FAFC";
const BORDER_COLOR = "CBD5E1";

// ── 1. DESCARGA DE LA PLANTILLA OFICIAL ───────────────────────────────────────
export async function descargarPlantillaPlanteamientoSala(refugioNombre?: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema Sala Situacional";
  wb.created = new Date();

  const thinBorder = {
    top: { style: "thin" as const, color: { argb: BORDER_COLOR } },
    bottom: { style: "thin" as const, color: { argb: BORDER_COLOR } },
    left: { style: "thin" as const, color: { argb: BORDER_COLOR } },
    right: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  };

  // ──────────────────────────────────────────────────────────────────────────
  // HOJA 1: GUÍA E INSTRUCCIONES
  // ──────────────────────────────────────────────────────────────────────────
  const wsGuia = wb.addWorksheet("Instrucciones de Uso", {
    views: [{ showGridLines: true }],
  });

  wsGuia.columns = [
    { width: 5 },
    { width: 28 },
    { width: 65 },
    { width: 30 },
  ];

  // Título
  wsGuia.mergeCells("B2:D2");
  const cellTitulo = wsGuia.getCell("B2");
  cellTitulo.value = "GUÍA OFICIAL: CARGA MASIVA DE PERSONAS Y GRUPO FAMILIAR";
  cellTitulo.font = { name: "Arial", size: 14, bold: true, color: { argb: BRAND } };
  cellTitulo.alignment = { vertical: "middle", horizontal: "left" };

  wsGuia.mergeCells("B3:D3");
  const cellSub = wsGuia.getCell("B3");
  cellSub.value = `Módulo: Planteamiento Sala | ${refugioNombre ? `Campamento sugerido: ${refugioNombre}` : "Todos los campamentos"}`;
  cellSub.font = { name: "Arial", size: 10, italic: true, color: { argb: "475569" } };

  // Sección 1: Funcionamiento general
  wsGuia.getCell("B5").value = "1. ¿CÓMO FUNCIONA?";
  wsGuia.getCell("B5").font = { name: "Arial", size: 11, bold: true, color: { argb: BRAND } };

  const guiaTextos = [
    ["Hoja 'Titulares':", "Contiene la lista de personas titulares / jefes del planteamiento habitacional. Solo la Cédula es obligatoria."],
    ["Búsqueda Automática CNE:", "Si dejas la columna 'Nombre y Apellido' en blanco, el sistema consultará automáticamente el CNE y Padrón Electoral."],
    ["Hoja 'Carga Familiar':", "Contiene los integrantes del núcleo familiar. Se enlazan con el titular mediante la columna 'Cédula Titular'."],
    ["Menores sin Cédula:", "En la hoja de familiares, los menores pueden no tener cédula; en ese caso se requiere su Nombre y Fecha de Nacimiento."],
    ["Formato de Teléfonos:", "Escríbelos con o sin cero (ej. 04141234567 o 4141234567), el sistema los normalizará automáticamente."],
  ];

  guiaTextos.forEach(([etiqueta, desc], idx) => {
    const row = 6 + idx;
    wsGuia.getCell(`B${row}`).value = etiqueta;
    wsGuia.getCell(`B${row}`).font = { name: "Arial", size: 9.5, bold: true, color: { argb: "1E293B" } };
    wsGuia.getCell(`C${row}`).value = desc;
    wsGuia.getCell(`C${row}`).font = { name: "Arial", size: 9.5, color: { argb: "334155" } };
  });

  // Sección 2: Catálogos de valores permitidos
  const startCat = 12;
  wsGuia.getCell(`B${startCat}`).value = "2. VALORES VÁLIDOS PARA MODALIDADES Y PARENTESCOS";
  wsGuia.getCell(`B${startCat}`).font = { name: "Arial", size: 11, bold: true, color: { argb: BRAND } };

  const catalogos = [
    ["Modalidades:", "MERCADO_SECUNDARIO (por defecto), ALQUILER, o PLAN_VENEZUELA_RENACE"],
    ["Parentescos:", "Hijo, Hija, Esposa, Esposo, Madre, Padre, Hermano, Hermana, Nieto, Nieta, Otro"],
    ["Géneros:", "MASCULINO o FEMENINO (si se omite, se infiere del parentesco o del CNE)"],
    ["Fechas:", "Formato AAAA-MM-DD (ej: 1990-08-25) o DD/MM/AAAA (ej: 25/08/1990)"],
  ];

  catalogos.forEach(([etiqueta, desc], idx) => {
    const row = startCat + 1 + idx;
    wsGuia.getCell(`B${row}`).value = etiqueta;
    wsGuia.getCell(`B${row}`).font = { name: "Arial", size: 9.5, bold: true, color: { argb: "1E293B" } };
    wsGuia.getCell(`C${row}`).value = desc;
    wsGuia.getCell(`C${row}`).font = { name: "Arial", size: 9.5, color: { argb: "334155" } };
  });

  // Borde para la guía
  for (let r = 5; r <= startCat + 5; r++) {
    wsGuia.getRow(r).height = 20;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HOJA 2: TITULARES
  // ──────────────────────────────────────────────────────────────────────────
  const wsTitulares = wb.addWorksheet("Titulares", {
    views: [{ showGridLines: true }],
  });

  wsTitulares.columns = [
    { key: "cedula", width: 22 },
    { key: "nombre", width: 36 },
    { key: "telefono", width: 20 },
    { key: "modalidad", width: 28 },
    { key: "observacion", width: 34 },
  ];

  // Membrete / Instrucción superior
  wsTitulares.mergeCells("A1:E1");
  const ban1 = wsTitulares.getCell("A1");
  ban1.value = "HOJA 1: TITULARES / JEFES DE EXPEDIENTE (Si dejas Nombre vacío, se busca automáticamente en CNE)";
  ban1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
  ban1.font = { name: "Arial", size: 9.5, bold: true, color: { argb: BRAND } };
  ban1.alignment = { vertical: "middle", horizontal: "left" };
  wsTitulares.getRow(1).height = 26;

  // Cabeceras de columnas
  const headersTitulares = [
    "Cédula Titular *",
    "Nombre y Apellido (Opcional - CNE)",
    "Teléfono (Opcional)",
    "Modalidad (Opcional)",
    "Observaciones (Opcional)",
  ];

  const headerRowTit = wsTitulares.getRow(2);
  headerRowTit.values = headersTitulares;
  headerRowTit.height = 26;
  headerRowTit.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder;
  });

  // Filas de Ejemplo
  const ejemplosTitulares = [
    ["1446136", "", "04142493493", "MERCADO_SECUNDARIO", "Caso prioridad sector oeste"],
    ["18324248", "MARIA JOSEFINA PEREZ", "04149016903", "ALQUILER", ""],
    ["12459271", "", "04241463602", "PLAN_VENEZUELA_RENACE", "Vivienda con afectación"],
  ];

  ejemplosTitulares.forEach((rowVals, idx) => {
    const r = wsTitulares.addRow(rowVals);
    r.height = 21;
    r.eachCell((cell, colNumber) => {
      cell.font = { name: "Arial", size: 9.5, color: { argb: "1E293B" } };
      cell.alignment = { vertical: "middle", horizontal: colNumber === 1 || colNumber === 3 ? "center" : "left" };
      cell.border = thinBorder;
      if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // HOJA 3: CARGA FAMILIAR
  // ──────────────────────────────────────────────────────────────────────────
  const wsFamilia = wb.addWorksheet("Carga Familiar", {
    views: [{ showGridLines: true }],
  });

  wsFamilia.columns = [
    { key: "cedulaTitular", width: 22 },
    { key: "cedulaFamiliar", width: 22 },
    { key: "nombreFamiliar", width: 36 },
    { key: "parentesco", width: 18 },
    { key: "genero", width: 18 },
    { key: "fechaNacimiento", width: 22 },
    { key: "telefono", width: 20 },
  ];

  // Membrete Hoja Familiar
  wsFamilia.mergeCells("A1:G1");
  const ban2 = wsFamilia.getCell("A1");
  ban2.value = "HOJA 2: CARGA FAMILIAR (Enlaza con el titular mediante la Cédula del Titular en la primera columna)";
  ban2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
  ban2.font = { name: "Arial", size: 9.5, bold: true, color: { argb: BRAND } };
  ban2.alignment = { vertical: "middle", horizontal: "left" };
  wsFamilia.getRow(1).height = 26;

  // Cabeceras de columnas
  const headersFamilia = [
    "Cédula Titular *",
    "Cédula Familiar (Opcional)",
    "Nombre y Apellido Familiar",
    "Parentesco *",
    "Género (Opcional)",
    "Fecha Nacimiento (Opcional)",
    "Teléfono Familiar (Opcional)",
  ];

  const headerRowFam = wsFamilia.getRow(2);
  headerRowFam.values = headersFamilia;
  headerRowFam.height = 26;
  headerRowFam.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder;
  });

  // Filas de Ejemplo Carga Familiar
  const ejemplosFamilia = [
    ["1446136", "26123456", "", "Hijo", "MASCULINO", "2000-05-15", "04121234567"],
    ["1446136", "15987654", "ANA HERNANDEZ", "Esposa", "FEMENINO", "1980-11-20", "04149876543"],
    ["18324248", "", "CARLITOS PEREZ", "Hijo", "MASCULINO", "2018-03-10", ""],
    ["18324248", "22334455", "", "Hermana", "FEMENINO", "1995-07-22", ""],
    ["12459271", "28112233", "", "Hija", "FEMENINO", "2004-12-01", ""],
  ];

  ejemplosFamilia.forEach((rowVals, idx) => {
    const r = wsFamilia.addRow(rowVals);
    r.height = 21;
    r.eachCell((cell, colNumber) => {
      cell.font = { name: "Arial", size: 9.5, color: { argb: "1E293B" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: [1, 2, 4, 5, 6, 7].includes(colNumber) ? "center" : "left",
      };
      cell.border = thinBorder;
      if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
    });
  });

  // Generar y Descargar Blob
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const filename = "Plantilla_Carga_Masiva_Planteamiento_Sala.xlsx";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── 2. PARSER INTELIGENTE DEL ARCHIVO XLSX ───────────────────────────────────
export async function parsePlanteamientoSalaXlsx(file: File): Promise<ParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const warnings: string[] = [];
  const cleanDigits = (v: any) => String(v ?? "").replace(/\D/g, "");
  const cleanText = (v: any) => String(v ?? "").trim();

  const normalizePhone = (raw: string): string => {
    const d = cleanDigits(raw);
    if (!d) return "";
    if (d.length === 10 && d.startsWith("4")) return "0" + d;
    if (d.length === 11 && d.startsWith("0")) return d;
    return d;
  };

  const parseDateStr = (val: any): string => {
    if (!val) return "";
    if (val instanceof Date) {
      if (!isNaN(val.getTime())) return val.toISOString().slice(0, 10);
    }
    if (typeof val === "number") {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const parts = s.split(/[\/\-\.]/);
    if (parts.length === 3) {
      if (parts[0].length <= 2 && parts[2].length === 4) {
        // DD/MM/YYYY
        return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
    }
    return "";
  };

  const normModalidad = (raw: string): string => {
    const up = raw.toUpperCase();
    if (up.includes("ALQUILER")) return "ALQUILER";
    if (up.includes("RENACE")) return "PLAN_VENEZUELA_RENACE";
    return "MERCADO_SECUNDARIO";
  };

  const normParentesco = (raw: string): string => {
    const t = raw.trim();
    if (!t) return "Otro";
    const up = t.toUpperCase();
    if (up.includes("HIJO")) return "Hijo";
    if (up.includes("HIJA")) return "Hija";
    if (up.includes("ESPOSO") || up.includes("CONYUGE") || up.includes("CONCUBINO")) return "Esposo";
    if (up.includes("ESPOSA") || up.includes("CONCUBINA")) return "Esposa";
    if (up.includes("MADRE") || up.includes("MAMA")) return "Madre";
    if (up.includes("PADRE") || up.includes("PAPA")) return "Padre";
    if (up.includes("HERMANO")) return "Hermano";
    if (up.includes("HERMANA")) return "Hermana";
    if (up.includes("NIETO")) return "Nieto";
    if (up.includes("NIETA")) return "Nieta";
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  };

  // Buscar hojas
  let titularesWs: any = null;
  let familiaWs: any = null;

  wb.eachSheet((ws) => {
    const n = ws.name.toLowerCase();
    if (!titularesWs && (n.includes("titular") || n.includes("jefe") || n.includes("persona"))) {
      titularesWs = ws;
    }
    if (!familiaWs && (n.includes("carga") || n.includes("familiar") || n.includes("miembro") || n.includes("grupo"))) {
      familiaWs = ws;
    }
  });

  // Si no se encontraron por nombre específico, usamos las hojas por posición si hay al menos 2
  if (!titularesWs && wb.worksheets.length >= 2) {
    // Si la hoja 1 es "instrucciones", la hoja 2 puede ser titulares y la 3 familia
    if (wb.worksheets[0].name.toLowerCase().includes("instrucc")) {
      titularesWs = wb.worksheets[1];
      if (wb.worksheets.length >= 3) familiaWs = wb.worksheets[2];
    } else {
      titularesWs = wb.worksheets[0];
      familiaWs = wb.worksheets[1];
    }
  } else if (!titularesWs && wb.worksheets.length === 1) {
    titularesWs = wb.worksheets[0];
  }

  const titularesMap = new Map<string, BulkTitularParsed>();

  // 1. Parsear Hoja Titulares
  if (titularesWs) {
    // Localizar fila de encabezados (usualmente fila 1 o 2)
    let headerRowIdx = 1;
    for (let r = 1; r <= Math.min(5, titularesWs.rowCount); r++) {
      const row = titularesWs.getRow(r);
      const rowStr = row.values ? JSON.stringify(row.values).toLowerCase() : "";
      if (rowStr.includes("cedula") || rowStr.includes("cédula") || rowStr.includes("titular")) {
        headerRowIdx = r;
        break;
      }
    }

    const headerRow = titularesWs.getRow(headerRowIdx);
    const colMap: Record<string, number> = {};
    for (let c = 1; c <= titularesWs.columnCount; c++) {
      const val = cleanText(headerRow.getCell(c).value).toLowerCase();
      if (!val) continue;
      if (val.includes("cedula") || val.includes("cédula")) {
        if (!colMap.cedula) colMap.cedula = c;
      }
      if (val.includes("nombre") || val.includes("apellido")) {
        if (!colMap.nombre) colMap.nombre = c;
      }
      if (val.includes("tel") || val.includes("cel")) {
        if (!colMap.telefono) colMap.telefono = c;
      }
      if (val.includes("modalidad") || val.includes("opcion") || val.includes("opción")) {
        if (!colMap.modalidad) colMap.modalidad = c;
      }
      if (val.includes("observ") || val.includes("nota")) {
        if (!colMap.observacion) colMap.observacion = c;
      }
    }

    const cCed = colMap.cedula || 1;
    const cNom = colMap.nombre || 2;
    const cTel = colMap.telefono || 3;
    const cMod = colMap.modalidad || 4;
    const cObs = colMap.observacion || 5;

    for (let r = headerRowIdx + 1; r <= titularesWs.rowCount; r++) {
      const row = titularesWs.getRow(r);
      const rawCed = cleanText(row.getCell(cCed).value);
      const cedula = cleanDigits(rawCed);
      if (!cedula) continue;

      const rawNom = cleanText(row.getCell(cNom).value);
      const rawTel = cleanText(row.getCell(cTel).value);
      const rawMod = cleanText(row.getCell(cMod).value);
      const rawObs = cleanText(row.getCell(cObs).value);

      if (!titularesMap.has(cedula)) {
        titularesMap.set(cedula, {
          cedula,
          nombreApellido: rawNom.toUpperCase(),
          telefono: normalizePhone(rawTel),
          tipoOpcion: normModalidad(rawMod),
          observacion: rawObs || undefined,
          cargaFamiliar: [],
        });
      }
    }
  }

  // 2. Parsear Hoja Carga Familiar
  let totalFamiliares = 0;
  if (familiaWs && familiaWs !== titularesWs) {
    let headerRowIdx = 1;
    for (let r = 1; r <= Math.min(5, familiaWs.rowCount); r++) {
      const row = familiaWs.getRow(r);
      const rowStr = row.values ? JSON.stringify(row.values).toLowerCase() : "";
      if (rowStr.includes("titular") || rowStr.includes("parentesco") || rowStr.includes("familiar")) {
        headerRowIdx = r;
        break;
      }
    }

    const headerRow = familiaWs.getRow(headerRowIdx);
    const colMap: Record<string, number> = {};
    for (let c = 1; c <= familiaWs.columnCount; c++) {
      const val = cleanText(headerRow.getCell(c).value).toLowerCase();
      if (!val) continue;
      if (val.includes("titular") && (val.includes("cedula") || val.includes("cédula"))) {
        colMap.cedulaTitular = c;
      } else if (val.includes("familiar") && (val.includes("cedula") || val.includes("cédula"))) {
        colMap.cedulaFamiliar = c;
      } else if (val.includes("parentesco")) {
        colMap.parentesco = c;
      } else if (val.includes("nombre")) {
        colMap.nombre = c;
      } else if (val.includes("genero") || val.includes("género") || val.includes("sexo")) {
        colMap.genero = c;
      } else if (val.includes("nacimiento") || val.includes("fecha")) {
        colMap.fechaNacimiento = c;
      } else if (val.includes("tel") || val.includes("cel")) {
        colMap.telefono = c;
      }
    }

    const cCedTit = colMap.cedulaTitular || 1;
    const cCedFam = colMap.cedulaFamiliar || 2;
    const cNom = colMap.nombre || 3;
    const cPar = colMap.parentesco || 4;
    const cGen = colMap.genero || 5;
    const cFn = colMap.fechaNacimiento || 6;
    const cTel = colMap.telefono || 7;

    for (let r = headerRowIdx + 1; r <= familiaWs.rowCount; r++) {
      const row = familiaWs.getRow(r);
      const rawCedTit = cleanText(row.getCell(cCedTit).value);
      const cedulaTitular = cleanDigits(rawCedTit);
      if (!cedulaTitular) continue;

      const rawCedFam = cleanText(row.getCell(cCedFam).value);
      const cedulaFamiliar = cleanDigits(rawCedFam);
      const rawNom = cleanText(row.getCell(cNom).value);
      const rawPar = cleanText(row.getCell(cPar).value);
      const rawGen = cleanText(row.getCell(cGen).value).toUpperCase();
      const rawFn = parseDateStr(row.getCell(cFn).value);
      const rawTel = cleanText(row.getCell(cTel).value);

      if (!cedulaFamiliar && !rawNom) continue;

      let generoFinal = "";
      if (rawGen.startsWith("M")) generoFinal = "MASCULINO";
      else if (rawGen.startsWith("F")) generoFinal = "FEMENINO";

      const familiarObj: BulkFamiliarParsed = {
        cedula: cedulaFamiliar,
        nombreApellido: rawNom.toUpperCase(),
        parentesco: normParentesco(rawPar),
        genero: generoFinal,
        fechaNacimiento: rawFn,
        telefono: normalizePhone(rawTel),
      };

      // Si el titular no estaba en la hoja de titulares, lo registramos automáticamente
      if (!titularesMap.has(cedulaTitular)) {
        titularesMap.set(cedulaTitular, {
          cedula: cedulaTitular,
          nombreApellido: "",
          telefono: "",
          tipoOpcion: "MERCADO_SECUNDARIO",
          cargaFamiliar: [familiarObj],
        });
      } else {
        titularesMap.get(cedulaTitular)!.cargaFamiliar.push(familiarObj);
      }
      totalFamiliares++;
    }
  }

  const titulares = Array.from(titularesMap.values());
  if (titulares.length === 0) {
    warnings.push("No se encontraron registros de cédula válidos en el archivo.");
  }

  return {
    titulares,
    totalFamiliares,
    warnings,
  };
}
