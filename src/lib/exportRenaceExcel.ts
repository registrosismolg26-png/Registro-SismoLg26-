// ── Exportación XLSX del Directorio VZLA Renace ──────────────────────────────
// Tres hojas: JEFES + GRUPO FAMILIAR + PLANTEAMIENTOS (detalle completo). Solo lo
// usan MASTER/ADMIN (gate `canExportRenace`). exceljs se carga PEREZOSAMENTE.

import { RENACE_PLANTEAMIENTO_TIPOS, RENACE_MODALIDAD_PLAN } from "@/lib/constants";
import type { RenaceJefe, RenaceMiembro, RenacePlanteamiento } from "@/types";

const BRAND = "1E3A8A";
const BRAND_LIGHT = "E8EDF7";
const ZEBRA = "F1F5F9";

const tipoLabel = (v: string | null) => (v ? RENACE_PLANTEAMIENTO_TIPOS.find((t) => t.value === v)?.label || v : "");
const modLabel = (v: string | null) => (v ? RENACE_MODALIDAD_PLAN.find((m) => m.value === v)?.label || v : "");
const dt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const S = (v: unknown) => (v === null || v === undefined ? "" : (v as any));

interface Opts {
  jefes: RenaceJefe[];
  miembros: RenaceMiembro[];
  planteamientos: RenacePlanteamiento[];
  refugio: string; // etiqueta del alcance (campamento o "Todos los campamentos")
  generadoEn: string;
}

export async function exportRenaceExcel(opts: Opts): Promise<void> {
  const { jefes, miembros, planteamientos, refugio, generadoEn } = opts;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Registro-SismoLg26";

  const planByNro = new Map(planteamientos.map((p) => [p.jefeNro, p]));
  const jefeNombre = new Map(jefes.map((j) => [j.nro, j.nombres]));
  // Conteo REAL de miembros por núcleo (reemplaza el `cantMiembros` del Excel). INCLUYE al
  // jefe una sola vez: se suma 1 solo si su cédula NO aparece ya entre los miembros (en
  // unos campamentos el jefe quedó como miembro y en otros no). Clave por refugio+nro.
  const cedDigits = (s?: string | null) => (s || "").replace(/\D/g, "");
  const nucleoInfo = new Map<string, { count: number; ced: Set<string> }>();
  for (const m of miembros) {
    const k = m.jefeCedula ? `${m.refugioId}::C:${cedDigits(m.jefeCedula)}` : `${m.refugioId}::N:${m.jefeNro}`;
    let e = nucleoInfo.get(k);
    if (!e) { e = { count: 0, ced: new Set<string>() }; nucleoInfo.set(k, e); }
    e.count++;
    const d = cedDigits(m.cedula);
    if (d) e.ced.add(d);
  }
  const memberCount = (j: RenaceJefe) => {
    const e = nucleoInfo.get(`${j.refugioId}::C:${cedDigits(j.cedula)}`) || nucleoInfo.get(`${j.refugioId}::N:${j.nro}`);
    const base = e?.count || 0;
    return base + (e && e.ced.has(cedDigits(j.cedula)) ? 0 : 1);
  };

  // Arma una hoja con membrete (filas 1-2), encabezado (fila 3, congelado) y filas.
  const buildSheet = (name: string, subtitle: string, cols: [string, number][], rows: (string | number)[][]) => {
    const ws = wb.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 3 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const nCols = cols.length;
    const lastCol = String.fromCharCode(64 + nCols); // hojas con ≤ 26 columnas
    ws.columns = cols.map(([, w]) => ({ width: w }));

    // Membrete (filas 1-2)
    ws.mergeCells(`A1:${lastCol}1`);
    ws.mergeCells(`A2:${lastCol}2`);
    const t1 = ws.getCell("A1");
    t1.value = `VZLA RENACE · ${subtitle}`;
    t1.font = { name: "Arial", size: 13, bold: true, color: { argb: BRAND } };
    t1.alignment = { vertical: "middle", horizontal: "left" };
    const t2 = ws.getCell("A2");
    t2.value = `Campamento: ${refugio || "—"}   ·   Generado: ${generadoEn}   ·   Total: ${rows.length}`;
    t2.font = { name: "Arial", size: 9, color: { argb: "6B7280" } };
    t2.alignment = { vertical: "middle", horizontal: "left" };
    for (let r = 1; r <= 2; r++) {
      ws.getRow(r).height = r === 1 ? 22 : 16;
      for (let c = 1; c <= nCols; c++) {
        const cell = ws.getRow(r).getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
        if (r === 2) cell.border = { bottom: { style: "medium", color: { argb: BRAND } } };
      }
    }

    // Encabezado (fila 3)
    const headerRow = ws.getRow(3);
    cols.forEach(([label], i) => {
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
    headerRow.height = 28;

    // Datos
    rows.forEach((values, idx) => {
      const row = ws.addRow(values);
      const zebra = idx % 2 === 1;
      row.eachCell((cell) => {
        cell.font = { name: "Arial", size: 9, color: { argb: "1F2937" } };
        cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
        cell.border = {
          top: { style: "hair", color: { argb: "D1D5DB" } }, bottom: { style: "hair", color: { argb: "D1D5DB" } },
          left: { style: "hair", color: { argb: "E5E7EB" } }, right: { style: "hair", color: { argb: "E5E7EB" } },
        };
        if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      });
    });
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: nCols } };
  };

  // ── Hoja JEFES ──────────────────────────────────────────────────────────────
  const jefesCols: [string, number][] = [
    ["N°", 6], ["Cédula", 14], ["Nombres", 28], ["Sexo", 8], ["F. Nac.", 12], ["Edad", 6],
    ["Teléfono", 14], ["Profesión", 18], ["Estado proc.", 16], ["Parroquia proc.", 18],
    ["Tipo afectación", 18], ["Condición vivienda", 18], ["N° certificado", 14], ["Miembros", 9],
    ["Planteamiento", 13],
  ];
  const jefesRows = [...jefes]
    .sort((a, b) => a.nro - b.nro)
    .map((j) => [
      j.nro, S(j.cedula), S(j.nombres), S(j.sexo), S(j.fechaNacimiento), S(j.edad),
      S(j.telefono), S(j.profesion), S(j.estadoProcedencia), S(j.parroquiaProcedencia),
      S(j.tipoAfectacion), S(j.condicionVivienda), S(j.numeroCertificado), memberCount(j),
      planByNro.has(j.nro) ? "Sí" : "No",
    ] as (string | number)[]);
  buildSheet("Jefes", "Jefes de familia", jefesCols, jefesRows);

  // ── Hoja GRUPO FAMILIAR ───────────────────────────────────────────────────────
  const miembrosCols: [string, number][] = [
    ["N° núcleo", 9], ["Cédula", 14], ["Nombres", 28], ["Parentesco", 16], ["Sexo", 8],
    ["F. Nac.", 12], ["Edad", 6], ["Teléfono", 14], ["Profesión", 18], ["Estado proc.", 16], ["Parroquia proc.", 18],
  ];
  const miembrosRows = [...miembros]
    .sort((a, b) => a.jefeNro - b.jefeNro || a.nombres.localeCompare(b.nombres))
    .map((m) => [
      m.jefeNro, S(m.cedula), S(m.nombres), S(m.parentesco), S(m.sexo), S(m.fechaNacimiento),
      S(m.edad), S(m.telefono), S(m.profesion), S(m.estadoProcedencia), S(m.parroquiaProcedencia),
    ] as (string | number)[]);
  buildSheet("Grupo familiar", "Grupo familiar", miembrosCols, miembrosRows);

  // ── Hoja PLANTEAMIENTOS (detalle completo) ────────────────────────────────────
  const planCols: [string, number][] = [
    ["N° núcleo", 9], ["Jefe", 26], ["Tipo", 20], ["Modalidad", 20], ["Precio/Cánon", 14],
    ["Contraparte", 22], ["Céd. contraparte", 14], ["Contacto", 14], ["Contacto 2°", 14],
    ["Estado", 16], ["Municipio", 16], ["Parroquia", 16], ["Dirección", 30], ["Estado preferencia", 18],
    ["Observación", 34], ["Registrado por", 22], ["Fecha", 18],
  ];
  const planRows = [...planteamientos]
    .sort((a, b) => a.jefeNro - b.jefeNro)
    .map((p) => [
      p.jefeNro, S(jefeNombre.get(p.jefeNro)), tipoLabel(p.tipo), modLabel(p.modalidadPlan),
      S(p.precioOCanon), S(p.nombreContraparte), S(p.cedulaContraparte), S(p.contacto), S(p.contactoSecundario),
      S(p.estado), S(p.municipio), S(p.parroquia), S(p.direccionEspecifica), S(p.estadoPreferencia),
      S(p.observacion), S(p.createdBy), dt(p.createdAt),
    ] as (string | number)[]);
  buildSheet("Planteamientos", "Planteamientos registrados", planCols, planRows);

  // ── Descargar ─────────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeRef = (refugio || "renace").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40);
  a.href = url;
  a.download = `directorio_renace_${safeRef}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
