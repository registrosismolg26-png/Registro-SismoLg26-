// ── Formulario oficial MPPS: "REGISTRO DE PACIENTES ATENDIDOS EN CONSULTORIO ────
//    (SIS-02, EPI-10 y EPI-13)".
// En vez de reconstruirlo a mano (perdería bordes, fuentes, logos y las leyendas
// largas de etnias/nacionalidad), RELLENAMOS la PLANTILLA oficial guardada en
// `public/plantillas/registro-min-salud.xlsx`: se carga, se escriben los valores en
// sus celdas (sin tocar la estructura) y se descarga → el formato queda IDÉNTICO.
//
// El formulario es POR DÍA y tiene 25 filas de pacientes. Si un día supera 25
// consultas, se generan varias "partes" (una descarga por cada bloque de 25), cada
// una un formulario íntegro. exceljs se carga de forma perezosa (dynamic import).

import { patologiaNombres, medItemsText } from "@/lib/helpers";
import type { Patologia, MedicamentoPredefinido, Medicamento } from "@/types";

const TEMPLATE_URL = "/plantillas/registro-min-salud.xlsx";
// Estado y municipio son FIJOS del sistema (Gobernación del Estado La Guaira,
// municipio Vargas) — hardcode institucional autorizado por el dueño.
const ESTADO_FIJO = "LA GUAIRA";
const MUNICIPIO_FIJO = "VARGAS";
const ROWS_PER_PAGE = 25;
const FIRST_DATA_ROW = 10; // fila 10 = paciente #1 en la plantilla

// TODO se estandariza a MAYÚSCULAS (requisito del dueño para este reporte oficial).
const up = (s: any) => String(s ?? "").trim().toUpperCase();

// Nacionalidad por la cédula: "E-…" → E (extranjero); el resto (sin prefijo o "V-…")
// → V (venezolano por defecto — las cédulas nacionales suelen venir sin prefijo).
function nacionalidad(cedula: string): string {
  const c = up(cedula);
  if (c.startsWith("E")) return "E";
  return /\d/.test(c) ? "V" : "";
}

// Hora en formato 12h con AM/PM (evita ambigüedad mañana/tarde); vacío si no hay/está mal.
function horaDe(iso?: string | Date | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const min = String(d.getMinutes()).padStart(2, "0");
  let h = d.getHours();
  const ampm = h < 12 ? "AM" : "PM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${min} ${ampm}`;
}

// Tamaño de letra de los DATOS. La plantilla los trae a 10pt (muy grande para las
// filas/columnas estrechas); 8pt entra mejor conservando la fuente de la plantilla.
const DATA_FONT_SIZE = 8;

export interface MinSaludConsulta {
  data: any;          // objeto tipo ConsultaMedica (cedula, nombreApellido, registroId, …)
  createdAt: string;
  esPrimera: boolean; // true → PRIMERA consulta de esa cédula (columna P); false → SUCESIVA (S)
}

export interface MinSaludOpts {
  consultas: MinSaludConsulta[];              // consultas del día, ORDEN CRONOLÓGICO ascendente
  registros: any[];                           // censo (para resolver DIRECCIÓN vía registroId)
  patologias: Patologia[];
  predefinedMedicamentos: MedicamentoPredefinido[];
  dia: string;                                // yyyy-mm-dd elegido
  refugio: string;
  medico?: string;                            // Nombre del Médico (por defecto: usuario que descarga)
  establecimiento?: string;                   // Nombre del Establecimiento (por defecto: campamento)
  asic?: string;                              // Área de Salud Integral Comunitaria (vacío = a mano)
  parroquia?: string;                         // Parroquia del establecimiento (vacío = a mano)
  tipoConsulta?: string;                      // Tipo de consulta (vacío = a mano)
}

// Rellena UNA hoja (un formulario) con la cabecera + hasta 25 consultas.
function fillSheet(ws: any, page: MinSaludConsulta[], opts: MinSaludOpts) {
  const { registros, patologias, predefinedMedicamentos, dia } = opts;

  // ── Cabecera (se escribe en la ANCLA de cada celda combinada; conserva su estilo) ──
  const tipo = up(opts.tipoConsulta);
  ws.getCell("T2").value = tipo ? `TIPO DE CONSULTA: ${tipo}` : "TIPO DE CONSULTA:";
  ws.getCell("A6").value = `NOMBRE DEL MÉDICO: ${up(opts.medico)}`.trimEnd();
  ws.getCell("E6").value = `ASIC: ${up(opts.asic)}`.trimEnd();
  ws.getCell("L6").value = `MUNICIPIO: ${MUNICIPIO_FIJO}`;
  ws.getCell("P6").value = `ESTADO: ${ESTADO_FIJO}`;
  ws.getCell("A7").value = `NOMBRE DEL ESTABLECIMIENTO: ${up(opts.establecimiento)}`.trimEnd();
  ws.getCell("L7").value = `PARROQUIA: ${up(opts.parroquia)}`.trimEnd();

  // Fecha (día/mes/año) en las casillas bajo DIA / MES / AÑO.
  const [yyyy, mm, dd] = String(dia || "").split("-");
  if (dd) ws.getCell("T7").value = dd;
  if (mm) ws.getCell("U7").value = mm;
  if (yyyy) ws.getCell("V7").value = yyyy;

  // La plantilla trae estas columnas MUY angostas (pensadas para escribir a mano):
  // tanto que Excel OCULTA la hora y muestra "#" en la edad (el número no cabe). Se
  // ensanchan lo justo para que el dato SE VEA, sin alterar el resto del formato.
  // OJO: A (FILA) y B (HORA) comparten UN rango de ancho en la plantilla y ExcelJS solo
  // lo respeta si AMBAS reciben el MISMO ancho (fijar solo B lo descarta al guardar);
  // por eso FILA queda un poco más ancha — es el precio de que la HORA se vea.
  ws.getColumn(1).width = 7;   // FILA (comparte rango con HORA)
  ws.getColumn(2).width = 7;   // HORA ("2:45 PM")
  ws.getColumn(6).width = 5;   // EDAD (antes mostraba "#")
  ws.getColumn(10).width = 4;  // NACIONALIDAD (V / E)

  // Escribe un valor en una celda de datos REDUCIENDO el tamaño de letra a DATA_FONT_SIZE
  // (conserva familia/color/negrita de la plantilla). El ajuste de texto (wrapText) ya
  // viene activo en la plantilla.
  const setData = (addr: string, value: any) => {
    const cell = ws.getCell(addr);
    cell.value = value;
    cell.font = { ...(cell.font || {}), size: DATA_FONT_SIZE };
  };

  // ── Filas de pacientes (10..34) ──────────────────────────────────────────────
  page.forEach((c, i) => {
    const d = c.data || {};
    const r = FIRST_DATA_ROW + i;
    const reg = d.registroId ? registros.find((x) => x.id === d.registroId) : null;

    const sexoUp = up(d.genero);
    const sexo = sexoUp.startsWith("F") ? "F" : sexoUp.startsWith("M") ? "M" : "";

    const diag = patologiaNombres(d.diagnosticoPatologiaIds, patologias)
      .filter((n) => n && n !== "(no disponible)")
      .join(", ");
    const notas = String(d.notasDoctor || "").trim();
    // En el DIAGNÓSTICO se SUMAN las notas del doctor (requisito del dueño).
    const diagFull = up([diag, notas].filter(Boolean).join(diag && notas ? " — " : ""));

    const tratamiento = up(medItemsText(d.diagnosticoMedicamentoIds as Medicamento[], predefinedMedicamentos));
    const direccion = reg ? up([reg.direccionExacta, reg.parroquia].filter(Boolean).join(", ")) : "";
    const nombre = up(d.nombreApellido);

    setData(`B${r}`, horaDe(d.fechaConsulta || c.createdAt));
    setData(`C${r}`, nombre);
    setData(`D${r}`, up(d.cedula));                     // D:E combinadas → ancla D
    // Edad como TEXTO (no número): un número en columna angosta se ve como "#".
    if (d.edad != null && d.edad !== "") setData(`F${r}`, String(d.edad));
    setData(`G${r}`, sexo);
    // INDÍGENA: no se registra en el sistema → se marca NO por defecto (columna I).
    setData(`I${r}`, "X");
    setData(`J${r}`, nacionalidad(d.cedula));
    setData(`K${r}`, direccion);                        // K:L combinadas → ancla K
    // CONSULTA: P (primera) o S (sucesiva); X (nuevo hallazgo) no lo sabemos → en blanco.
    setData(`${c.esPrimera ? "M" : "N"}${r}`, "X");
    setData(`P${r}`, diagFull);
    // DIAGNÓSTICO S/C: no se distingue → se marca CONFIRMADO por defecto (columna R).
    setData(`R${r}`, "X");
    setData(`S${r}`, tratamiento);                      // S:V combinadas → ancla S

    // Evita que el DIAGNÓSTICO (o tratamiento/dirección/nombre) se CORTE: como el texto
    // se ajusta (wrap) pero la fila de la plantilla es baja, se agranda la altura según
    // el campo más largo, para que se vea completo en varias líneas. (cpl = chars/línea
    // estimados por columna, conservador → altura de sobra, nunca trunca.)
    const linesFor = (t: string, cpl: number) => Math.max(1, Math.ceil((t || "").length / cpl));
    const lines = Math.max(
      linesFor(nombre, 20),
      linesFor(direccion, 24),
      linesFor(diagFull, 26),
      linesFor(tratamiento, 34),
    );
    ws.getRow(r).height = Math.min(140, Math.max(11.45, lines * 10.5));
  });
}

// Descarga un workbook como .xlsx.
async function downloadWorkbook(wb: any, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Duplica la ÚNICA hoja de la plantilla en `n` hojas IDÉNTICAS dentro del MISMO libro,
// a nivel del .xlsx (zip): copia sheet + su drawing (logos) + rels, y las registra en
// workbook.xml / rels / [Content_Types]. Cada hoja conserva membrete, logos (media
// compartida), combinaciones y leyendas. Luego ExcelJS carga ese libro y rellena cada
// hoja. (Se hace así porque ExcelJS no clona hojas con estilos/combinaciones de forma
// fiable, y cargar la plantilla varias veces reemplazaría el libro entero.)
async function buildMultiSheetTemplate(templateBuf: ArrayBuffer, n: number): Promise<ArrayBuffer> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(templateBuf);
  const read = (p: string) => zip.file(p)!.async("string");
  const sheet1 = await read("xl/worksheets/sheet1.xml");
  const sheet1Rels = await read("xl/worksheets/_rels/sheet1.xml.rels");
  const drawing1 = await read("xl/drawings/drawing1.xml");
  const drawing1Rels = await read("xl/drawings/_rels/drawing1.xml.rels");
  let ct = await read("[Content_Types].xml");
  let wbXml = await read("xl/workbook.xml");
  let wbRels = await read("xl/_rels/workbook.xml.rels");

  const ctOverrides: string[] = [];
  const wbRelsAdd: string[] = [];
  const sheetTags: string[] = [`<sheet name="Pág. 1" sheetId="1" r:id="rId1" />`];
  for (let k = 2; k <= n; k++) {
    zip.file(`xl/worksheets/sheet${k}.xml`, sheet1);
    // Cada hoja apunta a su PROPIO drawing (una hoja no puede compartir el drawing de otra).
    zip.file(`xl/worksheets/_rels/sheet${k}.xml.rels`, sheet1Rels.replace("drawing1.xml", `drawing${k}.xml`));
    zip.file(`xl/drawings/drawing${k}.xml`, drawing1);
    zip.file(`xl/drawings/_rels/drawing${k}.xml.rels`, drawing1Rels); // los logos (media) SÍ se comparten
    ctOverrides.push(`<Override PartName="/xl/worksheets/sheet${k}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" />`);
    ctOverrides.push(`<Override PartName="/xl/drawings/drawing${k}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml" />`);
    const rid = `rId${4 + (k - 1)}`; // rId1..rId4 ya usados (worksheet/theme/styles/sharedStrings)
    wbRelsAdd.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k}.xml" />`);
    sheetTags.push(`<sheet name="Pág. ${k}" sheetId="${k}" r:id="${rid}" />`);
  }
  ct = ct.replace("</Types>", ctOverrides.join("") + "</Types>");
  wbRels = wbRels.replace("</Relationships>", wbRelsAdd.join("") + "</Relationships>");
  wbXml = wbXml.replace(/<sheets>.*?<\/sheets>/, `<sheets>${sheetTags.join("")}</sheets>`);
  zip.file("[Content_Types].xml", ct);
  zip.file("xl/workbook.xml", wbXml);
  zip.file("xl/_rels/workbook.xml.rels", wbRels);
  return zip.generateAsync({ type: "arraybuffer" });
}

export async function exportRegistroMinSaludExcel(opts: MinSaludOpts): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;

  // La plantilla se sirve desde /public; se descarga una sola vez.
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error(`No se pudo cargar la plantilla (${res.status})`);
  const templateBuf = await res.arrayBuffer();

  // Partir en páginas de 25 (el formulario oficial es de 25 filas). Cada página es una
  // HOJA del MISMO archivo (no varios archivos).
  const pages: MinSaludConsulta[][] = [];
  for (let i = 0; i < opts.consultas.length; i += ROWS_PER_PAGE) {
    pages.push(opts.consultas.slice(i, i + ROWS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]); // día sin consultas → un formulario en blanco

  const wb = new ExcelJS.Workbook();
  if (pages.length === 1) {
    await wb.xlsx.load(templateBuf);                               // una sola hoja: plantilla tal cual
  } else {
    await wb.xlsx.load(await buildMultiSheetTemplate(templateBuf, pages.length)); // varias hojas
  }

  // Rellenar cada hoja con su página (el orden de wb.worksheets = Pág. 1, 2, 3…).
  wb.worksheets.forEach((ws, p) => fillSheet(ws, pages[p] || [], opts));

  const safeRef = (opts.refugio || "campamento").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40);
  await downloadWorkbook(wb, `SIS-02_${safeRef}_${opts.dia}.xlsx`);
}
