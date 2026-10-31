// ── Reporte Ejecutivo / Presentación en PDF: Módulo de Comedor ──────────────
// Genera un reporte oficial de presentación con doble logotipo:
// 1) Gobernación de La Guaira (izquierda)
// 2) Ministerio del Poder Popular para la Alimentación (derecha)
// Franja tricolor institucional, tarjetas de KPIs colorizadas,
// desglose de servicios, evolución diaria y firmas institucionales.
// Soporta tanto impresión directa (.print()) como descarga (.download()).

import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import { LOGO_GOB_PNG_BASE64 } from "@/lib/logoAsset";
import { LOGO_MIN_ALIMENTACION_JPG_BASE64 } from "@/lib/logoMinAlimentacionAsset";
import type { ComedorStats } from "@/types";

export interface ComedorPdfOpts {
  stats: ComedorStats;
  refugio: string;
  periodoLabel: string;
  desde?: string;
  hasta?: string;
  generadoPor?: string;
  action?: "print" | "download";
}

const NAVY = "#1E3A8A";
const NAVY_DARK = "#0F172A";
const NAVY_LIGHT = "#EFF6FF";
const MUTED = "#475569";
const BORDER = "#CBD5E1";
const AMBER = "#D97706";
const SKY = "#0284C7";
const PURPLE = "#7C3AED";
const EMERALD = "#059669";

// Bandera tricolor de Venezuela
const TRI_AMARILLO = "#FCD116";
const TRI_AZUL = "#00247D";
const TRI_ROJO = "#CF142B";

const LOGO_GOB_URI = `data:image/png;base64,${LOGO_GOB_PNG_BASE64}`;
const LOGO_MIN_URI = LOGO_MIN_ALIMENTACION_JPG_BASE64;

export async function exportComedorPdf(opts: ComedorPdfOpts): Promise<void> {
  const { stats, refugio, periodoLabel, generadoPor, action = "print" } = opts;

  const fechaEmision = new Date().toLocaleDateString("es-VE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const horaEmision = new Date().toLocaleTimeString("es-VE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const desR = stats.desayunoRaciones || 0;
  const almR = stats.almuerzoRaciones || 0;
  const cenR = stats.cenaRaciones || 0;
  const totR = stats.totalRaciones || 0;
  const totA = stats.totalAtendidos || 0;

  const desPct = totR > 0 ? ((desR / totR) * 100).toFixed(1) : "0.0";
  const almPct = totR > 0 ? ((almR / totR) * 100).toFixed(1) : "0.0";
  const cenPct = totR > 0 ? ((cenR / totR) * 100).toFixed(1) : "0.0";

  const promDia = stats.promedios?.racionesPorDia ?? (stats.porDia?.length ? (totR / stats.porDia.length).toFixed(1) : 0);
  const promPersona = stats.promedios?.racionesPorPersona ?? (totA > 0 ? (totR / totA).toFixed(1) : 0);

  // ── Contenido del documento ───────────────────────────────────────────────
  const content: Content[] = [];

  // 1. ENCABEZADO CON DOBLE LOGO (Gobernación + Min. Alimentación)
  content.push({
    table: {
      widths: [80, "*", 150],
      body: [
        [
          // Logo Gobernación (izquierda)
          {
            image: LOGO_GOB_URI,
            width: 70,
            fit: [75, 48],
            alignment: "left",
            margin: [0, 0, 0, 0],
          },
          // Título central institucional
          {
            stack: [
              { text: "REPÚBLICA BOLIVARIANA DE VENEZUELA", fontSize: 8.5, bold: true, color: "#64748B", alignment: "center" },
              { text: "GOBERNACIÓN DEL ESTADO LA GUAIRA", fontSize: 11, bold: true, color: NAVY, alignment: "center", margin: [0, 1, 0, 1] },
              { text: "SISTEMA INTEGRAL DE CONTROL Y REGISTRO DE COMEDOR", fontSize: 10, bold: true, color: NAVY_DARK, alignment: "center" },
              { text: "BALANCE OPERATIVO Y ESTADÍSTICAS DE ALIMENTACIÓN", fontSize: 9, bold: true, color: EMERALD, alignment: "center", margin: [0, 1, 0, 0] },
            ],
            alignment: "center",
          },
          // Logo Ministerio de Alimentación (derecha)
          {
            image: LOGO_MIN_URI,
            width: 145,
            fit: [145, 48],
            alignment: "right",
            margin: [0, 0, 0, 0],
          },
        ],
      ],
    },
    layout: "noBorders",
    margin: [0, 0, 0, 6],
  });

  // Franja tricolor de Venezuela
  content.push({
    table: {
      widths: ["*"],
      body: [
        [{ text: "", fillColor: TRI_AMARILLO, border: [false, false, false, false], margin: [0, 0, 0, 0] }],
        [{ text: "", fillColor: TRI_AZUL, border: [false, false, false, false], margin: [0, 0, 0, 0] }],
        [{ text: "", fillColor: TRI_ROJO, border: [false, false, false, false], margin: [0, 0, 0, 0] }],
      ],
    },
    layout: {
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0.7,
      paddingBottom: () => 0.7,
    },
    margin: [0, 0, 0, 8],
  });

  // 2. CINTILLO / METADATOS DEL REPORTE
  content.push({
    table: {
      widths: ["*", "*", "*"],
      body: [
        [
          {
            stack: [
              { text: "CAMPAMENTO / REFUGIO:", fontSize: 7, bold: true, color: MUTED },
              { text: (refugio || "TODOS LOS CAMPAMENTOS").toUpperCase(), fontSize: 9.5, bold: true, color: NAVY },
            ],
            fillColor: NAVY_LIGHT,
            border: [true, true, false, true],
          },
          {
            stack: [
              { text: "PERÍODO CONSULTADO:", fontSize: 7, bold: true, color: MUTED },
              { text: periodoLabel || "Historico Completo", fontSize: 9.5, bold: true, color: NAVY_DARK },
            ],
            fillColor: NAVY_LIGHT,
            border: [false, true, false, true],
          },
          {
            stack: [
              { text: "EMISIÓN:", fontSize: 7, bold: true, color: MUTED },
              { text: `${fechaEmision} (${horaEmision})`, fontSize: 8.5, bold: true, color: NAVY_DARK },
            ],
            fillColor: NAVY_LIGHT,
            border: [false, true, true, true],
          },
        ],
      ],
    },
    layout: {
      hLineColor: () => BORDER,
      vLineColor: () => BORDER,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 0, 0, 10],
  });

  // 3. TARJETAS DE INDICADORES CLAVE (KPIs estilo presentación ejecutiva)
  content.push({
    table: {
      widths: ["*", "*", "*", "*", "*", "*"],
      body: [
        [
          // TOTAL RACIONES
          {
            stack: [
              { text: "TOTAL RACIONES", fontSize: 7, bold: true, color: "#1D4ED8" },
              { text: totR.toLocaleString("es-VE"), fontSize: 14, bold: true, color: "#1D4ED8", margin: [0, 2, 0, 1] },
              { text: "Platos servidos", fontSize: 6.8, color: MUTED },
            ],
            fillColor: "#EFF6FF",
            border: [true, true, true, true],
          },
          // ATENCIONES
          {
            stack: [
              { text: "ATENCIONES", fontSize: 7, bold: true, color: EMERALD },
              { text: totA.toLocaleString("es-VE"), fontSize: 14, bold: true, color: EMERALD, margin: [0, 2, 0, 1] },
              { text: "Jefes / Personas", fontSize: 6.8, color: MUTED },
            ],
            fillColor: "#ECFDF5",
            border: [true, true, true, true],
          },
          // DESAYUNOS
          {
            stack: [
              { text: "☀️ DESAYUNO", fontSize: 7, bold: true, color: AMBER },
              { text: desR.toLocaleString("es-VE"), fontSize: 14, bold: true, color: AMBER, margin: [0, 2, 0, 1] },
              { text: `${desPct}% del volumen`, fontSize: 6.8, color: MUTED },
            ],
            fillColor: "#FFFBEB",
            border: [true, true, true, true],
          },
          // ALMUERZOS
          {
            stack: [
              { text: "🍽️ ALMUERZO", fontSize: 7, bold: true, color: SKY },
              { text: almR.toLocaleString("es-VE"), fontSize: 14, bold: true, color: SKY, margin: [0, 2, 0, 1] },
              { text: `${almPct}% del volumen`, fontSize: 6.8, color: MUTED },
            ],
            fillColor: "#F0F9FF",
            border: [true, true, true, true],
          },
          // CENAS
          {
            stack: [
              { text: "🌙 CENA", fontSize: 7, bold: true, color: PURPLE },
              { text: cenR.toLocaleString("es-VE"), fontSize: 14, bold: true, color: PURPLE, margin: [0, 2, 0, 1] },
              { text: `${cenPct}% del volumen`, fontSize: 6.8, color: MUTED },
            ],
            fillColor: "#F5F3FF",
            border: [true, true, true, true],
          },
          // PROMEDIOS
          {
            stack: [
              { text: "PROMEDIOS", fontSize: 7, bold: true, color: NAVY },
              { text: `${promDia} / día`, fontSize: 12, bold: true, color: NAVY, margin: [0, 3, 0, 1] },
              { text: `${promPersona} platos/pers.`, fontSize: 6.8, color: MUTED },
            ],
            fillColor: "#F8FAFC",
            border: [true, true, true, true],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => BORDER,
      vLineColor: () => BORDER,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    margin: [0, 0, 0, 10],
  });

  // 4. BLOQUE DE TABLAS: DESGLOSE POR SERVICIO Y DISTRIBUCIÓN
  const srvTableBody: any[] = [
    [
      { text: "Servicio", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY },
      { text: "Raciones", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
      { text: "% Volumen", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
      { text: "Atenciones", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
      { text: "Platos/Atenc.", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
    ],
    [
      { text: "☀️ Desayuno", fontSize: 8, bold: true, color: AMBER },
      { text: desR.toLocaleString("es-VE"), fontSize: 8, bold: true, color: AMBER, alignment: "right" },
      { text: `${desPct}%`, fontSize: 8, alignment: "right" },
      { text: (stats.desayunoAtendidos || 0).toLocaleString("es-VE"), fontSize: 8, alignment: "right" },
      { text: stats.desayunoAtendidos ? (desR / stats.desayunoAtendidos).toFixed(1) : "0", fontSize: 8, alignment: "right" },
    ],
    [
      { text: "🍽️ Almuerzo", fontSize: 8, bold: true, color: SKY },
      { text: almR.toLocaleString("es-VE"), fontSize: 8, bold: true, color: SKY, alignment: "right" },
      { text: `${almPct}%`, fontSize: 8, alignment: "right" },
      { text: (stats.almuerzoAtendidos || 0).toLocaleString("es-VE"), fontSize: 8, alignment: "right" },
      { text: stats.almuerzoAtendidos ? (almR / stats.almuerzoAtendidos).toFixed(1) : "0", fontSize: 8, alignment: "right" },
    ],
    [
      { text: "🌙 Cena", fontSize: 8, bold: true, color: PURPLE },
      { text: cenR.toLocaleString("es-VE"), fontSize: 8, bold: true, color: PURPLE, alignment: "right" },
      { text: `${cenPct}%`, fontSize: 8, alignment: "right" },
      { text: (stats.cenaAtendidos || 0).toLocaleString("es-VE"), fontSize: 8, alignment: "right" },
      { text: stats.cenaAtendidos ? (cenR / stats.cenaAtendidos).toFixed(1) : "0", fontSize: 8, alignment: "right" },
    ],
    [
      { text: "TOTAL GENERAL", fontSize: 8, bold: true, color: NAVY, fillColor: NAVY_LIGHT },
      { text: totR.toLocaleString("es-VE"), fontSize: 8, bold: true, color: NAVY, fillColor: NAVY_LIGHT, alignment: "right" },
      { text: "100.0%", fontSize: 8, bold: true, color: NAVY, fillColor: NAVY_LIGHT, alignment: "right" },
      { text: totA.toLocaleString("es-VE"), fontSize: 8, bold: true, color: NAVY, fillColor: NAVY_LIGHT, alignment: "right" },
      { text: totA > 0 ? (totR / totA).toFixed(1) : "0", fontSize: 8, bold: true, color: NAVY, fillColor: NAVY_LIGHT, alignment: "right" },
    ],
  ];

  content.push({
    table: {
      widths: ["*", 10, "*"],
      body: [
        [
          // Columna Izquierda: Tabla por Servicio
          {
            stack: [
              { text: "BALANCE OPERATIVO POR SERVICIO", fontSize: 8.5, bold: true, color: NAVY, margin: [0, 0, 0, 4] },
              {
                table: {
                  widths: ["*", 48, 48, 50, 52],
                  body: srvTableBody,
                },
                layout: {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => BORDER,
                  vLineColor: () => BORDER,
                  paddingTop: () => 3,
                  paddingBottom: () => 3,
                },
              },
            ],
          },
          // Separador transparente
          { text: "" },
          // Columna Derecha: Resumen de Beneficiarios o Campamentos
          {
            stack: [
              {
                text: stats.porRefugio && stats.porRefugio.length > 1
                  ? "DISTRIBUCIÓN POR CAMPAMENTO / REFUGIO"
                  : "DISTRIBUCIÓN POR TIPO DE BENEFICIARIO",
                fontSize: 8.5,
                bold: true,
                color: NAVY,
                margin: [0, 0, 0, 4],
              },
              stats.porRefugio && stats.porRefugio.length > 1
                ? {
                    table: {
                      widths: ["*", 50, 50, 50],
                      body: ([
                        [
                          { text: "Campamento", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY },
                          { text: "Raciones", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
                          { text: "Atenciones", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
                          { text: "% Afluencia", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
                        ],
                        ...stats.porRefugio.slice(0, 5).map((rf) => [
                          { text: rf.refugio, fontSize: 7.5, bold: true, color: "#1E293B" },
                          { text: rf.raciones.toLocaleString("es-VE"), fontSize: 7.5, alignment: "right", color: SKY, bold: true },
                          { text: rf.atenciones.toLocaleString("es-VE"), fontSize: 7.5, alignment: "right" },
                          { text: `${totR > 0 ? ((rf.raciones / totR) * 100).toFixed(1) : 0}%`, fontSize: 7.5, alignment: "right" },
                        ]),
                      ] as any),
                    },
                    layout: {
                      hLineWidth: () => 0.5,
                      vLineWidth: () => 0.5,
                      hLineColor: () => BORDER,
                      vLineColor: () => BORDER,
                      paddingTop: () => 3,
                      paddingBottom: () => 3,
                    },
                  }
                : {
                    table: {
                      widths: ["*", 55, 55, 55],
                      body: ([
                        [
                          { text: "Categoría", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY },
                          { text: "Raciones", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
                          { text: "Atenciones", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
                          { text: "% Raciones", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
                        ],
                        ...(stats.porTipoBeneficiario || [
                          { tipo: "Jefe de Familia (Núcleos)", raciones: totR, atenciones: totA, porcentaje: 100 },
                        ]).map((tp) => [
                          { text: tp.tipo, fontSize: 7.8, bold: true, color: "#1E293B" },
                          { text: tp.raciones.toLocaleString("es-VE"), fontSize: 7.8, alignment: "right", color: SKY, bold: true },
                          { text: tp.atenciones.toLocaleString("es-VE"), fontSize: 7.8, alignment: "right" },
                          { text: `${tp.porcentaje}%`, fontSize: 7.8, alignment: "right" },
                        ]),
                      ] as any),
                    },
                    layout: {
                      hLineWidth: () => 0.5,
                      vLineWidth: () => 0.5,
                      hLineColor: () => BORDER,
                      vLineColor: () => BORDER,
                      paddingTop: () => 3,
                      paddingBottom: () => 3,
                    },
                  },
            ],
          },
        ],
      ],
    },
    layout: "noBorders",
    margin: [0, 0, 0, 10],
  });

  // 5. CONSOLIDADO HISTÓRICO POR DÍA (Tabla detallada de afluencia)
  const dias = stats.porDia || [];
  const diasRows = dias.slice(-14).map((d) => [
    { text: d.fecha, fontSize: 7.5, bold: true, color: "#1E293B" },
    { text: d.desayuno.toLocaleString("es-VE"), fontSize: 7.5, alignment: "right", color: AMBER },
    { text: d.almuerzo.toLocaleString("es-VE"), fontSize: 7.5, alignment: "right", color: SKY },
    { text: d.cena.toLocaleString("es-VE"), fontSize: 7.5, alignment: "right", color: PURPLE },
    { text: d.total.toLocaleString("es-VE"), fontSize: 7.5, bold: true, alignment: "right", color: NAVY },
    { text: d.beneficiarios.toLocaleString("es-VE"), fontSize: 7.5, alignment: "right", color: EMERALD },
    { text: d.beneficiarios > 0 ? (d.total / d.beneficiarios).toFixed(1) : "0", fontSize: 7.5, alignment: "right", color: MUTED },
  ]);

  if (diasRows.length > 0) {
    content.push({
      stack: [
        {
          text: `CONSOLIDADO HISTÓRICO DE AFLUENCIA (${dias.length > 14 ? "Últimos 14 días registrados" : "Evolución por fecha"})`,
          fontSize: 8.5,
          bold: true,
          color: NAVY,
          margin: [0, 0, 0, 4],
        },
        {
          table: {
            widths: ["*", 80, 80, 80, 85, 80, 85],
            body: ([
              [
                { text: "Fecha", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY },
                { text: "☀️ Desayuno", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
                { text: "🍽️ Almuerzo", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
                { text: "🌙 Cena", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
                { text: "🍲 Total Raciones", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
                { text: "👥 Atenciones", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
                { text: "Platos/Persona", bold: true, fontSize: 8, color: "#FFFFFF", fillColor: NAVY, alignment: "right" },
              ],
              ...diasRows,
            ] as any),
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => BORDER,
            vLineColor: () => BORDER,
            paddingTop: () => 2.5,
            paddingBottom: () => 2.5,
          },
        },
      ],
      margin: [0, 0, 0, 14],
    });
  }

  // 6. FIRMAS INSTITUCIONALES (3 Firmas: Comedor, Campamento, Supervisión)
  content.push({
    table: {
      widths: ["*", 30, "*", 30, "*"],
      body: [
        [
          {
            stack: [
              { text: "", margin: [0, 18, 0, 0] },
              { text: "____________________________________", alignment: "center", fontSize: 8, color: MUTED },
              { text: "RESPONSABLE OPERATIVO", alignment: "center", fontSize: 8, bold: true, color: NAVY },
              { text: "Módulo Comedor / Alimentación", alignment: "center", fontSize: 7, color: MUTED },
            ],
          },
          { text: "" },
          {
            stack: [
              { text: "", margin: [0, 18, 0, 0] },
              { text: "____________________________________", alignment: "center", fontSize: 8, color: MUTED },
              { text: "COORDINADOR GENERAL", alignment: "center", fontSize: 8, bold: true, color: NAVY },
              { text: "Campamento Transitorio / Refugio", alignment: "center", fontSize: 7, color: MUTED },
            ],
          },
          { text: "" },
          {
            stack: [
              { text: "", margin: [0, 18, 0, 0] },
              { text: "____________________________________", alignment: "center", fontSize: 8, color: MUTED },
              { text: "SUPERVISIÓN INSTITUCIONAL", alignment: "center", fontSize: 8, bold: true, color: NAVY },
              { text: "Gobernación / Min. Alimentación", alignment: "center", fontSize: 7, color: MUTED },
            ],
          },
        ],
      ],
    },
    layout: "noBorders",
    margin: [0, 8, 0, 0],
  });

  // ── Document Definition (A4 Landscape) ────────────────────────────────────
  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [32, 28, 32, 26],
    content,
    footer: (currentPage: number, pageCount: number) => ({
      table: {
        widths: ["*", "*"],
        body: [
          [
            {
              text: `Sistema Integral de Control de Comedor · ${refugio || "Todos"} · Impreso: ${fechaEmision} ${horaEmision}${generadoPor ? ` por ${generadoPor}` : ""}`,
              fontSize: 7,
              color: MUTED,
            },
            {
              text: `Página ${currentPage} de ${pageCount}`,
              fontSize: 7,
              alignment: "right",
              color: MUTED,
            },
          ],
        ],
      },
      layout: "noBorders",
      margin: [32, 4, 32, 0],
    }),
    styles: {
      headCountry: { fontSize: 8.5, bold: true, color: "#64748B" },
      headState: { fontSize: 11, bold: true, color: NAVY },
      headMin: { fontSize: 9.5, bold: true, color: NAVY },
      headSystem: { fontSize: 10, bold: true, color: NAVY_DARK },
      headReport: { fontSize: 9, bold: true, color: EMERALD },
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: 8.5,
      color: NAVY_DARK,
    },
  };

  // ── Renderización dinámica con pdfmake ────────────────────────────────────
  const pdfMakeMod: any = await import("pdfmake/build/pdfmake");
  const vfsMod: any = await import("pdfmake/build/vfs_fonts");
  const pdfMake = pdfMakeMod.default ?? pdfMakeMod;
  const vfs = vfsMod.default ?? vfsMod.vfs ?? vfsMod;
  if (vfs && !pdfMake.vfs) pdfMake.vfs = vfs;

  const safeRef = (refugio || "refugio").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 30);
  const safePeriodo = (periodoLabel || "periodo").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 20);
  const nombreArchivo = `Comedor_Presentacion_${safeRef}_${safePeriodo}_${Date.now()}.pdf`;

  const pdfDoc = pdfMake.createPdf(docDefinition);

  if (action === "download") {
    pdfDoc.download(nombreArchivo);
  } else {
    // Imprimir de manera directa tipo presentación (abre diálogo nativo de impresión)
    pdfDoc.print();
  }
}
