import type { ComedorBeneficiario } from "@/types";

/**
 * Imprime contenido HTML en un iframe invisible para evitar interferencias
 * con estilos globales (@media print) de la aplicación principal.
 */
export function printHtml(htmlContent: string, title = "Impresión de Carnets"): void {
  // Crear iframe oculto
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    window.print();
    return;
  }

  doc.open();
  doc.write(htmlContent);
  doc.close();

  // Esperar a que las imágenes y fuentes se carguen
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error("Error al imprimir iframe:", err);
    } finally {
      // Limpiar iframe tras un retraso prudente
      setTimeout(() => {
        try {
          iframe.remove();
        } catch (_) {}
      }, 2000);
    }
  }, 400);
}

/**
 * Descarga una cadena HTML como archivo local .html
 */
export function downloadHtmlFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Genera el HTML de un carnet individual de alta resolución para imprimir
 */
export function generateSingleCarnetHtml(
  beneficiario: ComedorBeneficiario,
  qrDataUrl: string
): string {
  const isJefe = beneficiario.tipoBeneficiario === "JEFE";
  const racionesText =
    beneficiario.raciones === 1 ? "1 Ración / Plato" : `${beneficiario.raciones} Raciones / Platos`;

  const miembrosHtml =
    beneficiario.integrantes && beneficiario.integrantes.length > 1
      ? `
      <div class="card-members">
        <div class="members-title">NÚCLEO FAMILIAR (${beneficiario.integrantes.length} INTEGRANTES):</div>
        <div class="members-list">
          ${beneficiario.integrantes
            .map(
              (m) =>
                `<span class="member-tag"><strong>${escapeHtml(m.nombreApellido)}</strong> (${escapeHtml(m.cedula)})</span>`
            )
            .join(" ")}
        </div>
      </div>
    `
      : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Carnet Comedor - ${escapeHtml(beneficiario.cedula)}</title>
  <style>
    @page {
      size: auto;
      margin: 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      display: flex;
      justify-content: center;
      padding: 20px;
    }
    .carnet-wrap {
      width: 100%;
      max-width: 520px;
      background: #ffffff;
      border: 2px solid #0f172a;
      border-radius: 14px;
      padding: 18px 20px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.08);
      position: relative;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .org-subtitle {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #64748b;
      text-transform: uppercase;
    }
    .main-title {
      font-size: 17px;
      font-weight: 900;
      color: #0369a1;
      letter-spacing: 0.5px;
    }
    .badge {
      font-size: 11px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 999px;
      text-transform: uppercase;
      background: ${isJefe ? "#0284c7" : "#059669"};
      color: #ffffff;
    }
    .body {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .info {
      flex: 1;
      min-width: 0;
    }
    .label {
      font-size: 9px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .name {
      font-size: 16px;
      font-weight: 900;
      color: #0f172a;
      margin-bottom: 8px;
      line-height: 1.2;
    }
    .data-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 12px;
      margin-bottom: 8px;
    }
    .data-val {
      font-size: 13px;
      font-weight: 700;
      color: #1e293b;
    }
    .raciones-box {
      background: #f0f9ff;
      border: 1.5px solid #0284c7;
      border-radius: 8px;
      padding: 8px 12px;
      margin-top: 10px;
    }
    .raciones-label {
      font-size: 9px;
      font-weight: 800;
      color: #0369a1;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .raciones-val {
      font-size: 18px;
      font-weight: 900;
      color: #0284c7;
      margin-top: 2px;
    }
    .qr-side {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      border: 1.5px solid #cbd5e1;
      border-radius: 12px;
      padding: 10px;
      width: 140px;
      flex-shrink: 0;
    }
    .qr-side img {
      width: 120px;
      height: 120px;
      display: block;
    }
    .qr-cedula {
      font-size: 11px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 4px;
    }
    .card-members {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px dashed #cbd5e1;
    }
    .members-title {
      font-size: 9px;
      font-weight: 800;
      color: #475569;
      margin-bottom: 4px;
    }
    .members-list {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .member-tag {
      font-size: 9px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      padding: 2px 6px;
      border-radius: 4px;
      color: #334155;
    }
    .footer-note {
      margin-top: 12px;
      font-size: 8px;
      color: #94a3b8;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }
      .carnet-wrap {
        box-shadow: none;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="carnet-wrap">
    <div class="header">
      <div>
        <div class="org-subtitle">SISTEMA DE GESTIÓN DE CAMPAMENTOS</div>
        <div class="main-title">CARNET DE COMEDOR</div>
      </div>
      <div class="badge">${isJefe ? "Jefe de Familia" : "Persona Sola"}</div>
    </div>

    <div class="body">
      <div class="info">
        <div class="label">Beneficiario Titular</div>
        <div class="name">${escapeHtml(beneficiario.nombreApellido)}</div>

        <div class="data-grid">
          <div>
            <div class="label">Cédula</div>
            <div class="data-val">${escapeHtml(beneficiario.cedula)}</div>
          </div>
          <div>
            <div class="label">Teléfono</div>
            <div class="data-val">${escapeHtml(beneficiario.telefono || "No registrado")}</div>
          </div>
          <div>
            <div class="label">Campamento</div>
            <div class="data-val">${escapeHtml(beneficiario.refugio)}</div>
          </div>
          <div>
            <div class="label">Alojamiento</div>
            <div class="data-val">${escapeHtml(beneficiario.cuarto || "Sin asignar")}</div>
          </div>
        </div>

        <div class="raciones-box">
          <div class="raciones-label">Raciones Autorizadas por Servicio:</div>
          <div class="raciones-val">${racionesText}</div>
        </div>
      </div>

      <div class="qr-side">
        <img src="${qrDataUrl}" alt="QR ${escapeHtml(beneficiario.cedula)}" />
        <div class="qr-cedula">${escapeHtml(beneficiario.cedula)}</div>
      </div>
    </div>

    ${miembrosHtml}

    <div class="footer-note">
      Válido para Desayuno, Almuerzo y Cena • Presentar al momento del retiro
    </div>
  </div>
</body>
</html>`;
}

/**
 * Genera el documento HTML completo para impresión masiva con exactamente
 * 8 carnets por hoja (2 columnas x 4 filas) en tamaño Carta/A4.
 */
export function generateBulkCarnetsHtml(
  items: Array<{ beneficiario: ComedorBeneficiario; qrDataUrl: string }>,
  campamentoNombre: string
): string {
  // Dividir en grupos de 8 carnets por página
  const pages: Array<Array<{ beneficiario: ComedorBeneficiario; qrDataUrl: string }>> = [];
  for (let i = 0; i < items.length; i += 8) {
    pages.push(items.slice(i, i + 8));
  }

  const pagesHtml = pages
    .map((pageItems, pageIdx) => {
      const cardsHtml = pageItems
        .map(({ beneficiario, qrDataUrl }) => {
          const isJefe = beneficiario.tipoBeneficiario === "JEFE";
          const racionesCount = beneficiario.raciones || 1;
          const racionesBadge =
            racionesCount === 1 ? "1 RACIÓN" : `${racionesCount} RACIONES`;

          // Resumen breve de integrantes
          let miembrosResumen = "";
          if (beneficiario.integrantes && beneficiario.integrantes.length > 1) {
            const otros = beneficiario.integrantes
              .filter((m) => m.cedula !== beneficiario.cedula)
              .map((m) => m.nombreApellido.split(" ")[0])
              .slice(0, 3)
              .join(", ");
            miembrosResumen = `Carga: ${beneficiario.integrantes.length} pers. (${otros}${
              beneficiario.integrantes.length > 4 ? "..." : ""
            })`;
          }

          return `
          <div class="compact-card">
            <div class="card-top">
              <div class="card-org">COMEDOR • ${escapeHtml(beneficiario.refugio)}</div>
              <div class="card-badge ${isJefe ? "badge-jefe" : "badge-solo"}">
                ${isJefe ? "JEFE FAMILIA" : "SOLO"}
              </div>
            </div>

            <div class="card-middle">
              <div class="card-details">
                <div class="b-name" title="${escapeHtml(beneficiario.nombreApellido)}">
                  ${escapeHtml(beneficiario.nombreApellido)}
                </div>
                <div class="b-row">
                  <span class="b-label">CI:</span>
                  <span class="b-val b-ci">${escapeHtml(beneficiario.cedula)}</span>
                </div>
                ${
                  beneficiario.telefono
                    ? `<div class="b-row">
                        <span class="b-label">TLF:</span>
                        <span class="b-val">${escapeHtml(beneficiario.telefono)}</span>
                      </div>`
                    : ""
                }
                ${
                  beneficiario.cuarto
                    ? `<div class="b-row">
                        <span class="b-label">HAB:</span>
                        <span class="b-val">${escapeHtml(beneficiario.cuarto)}</span>
                      </div>`
                    : ""
                }

                <div class="raciones-pill">
                  🍽️ <strong>${racionesBadge}</strong>
                </div>
              </div>

              <div class="card-qr">
                <img src="${qrDataUrl}" alt="${escapeHtml(beneficiario.cedula)}" />
                <span class="qr-ci">${escapeHtml(beneficiario.cedula)}</span>
              </div>
            </div>

            <div class="card-bottom">
              ${
                miembrosResumen
                  ? `<div class="b-members">${escapeHtml(miembrosResumen)}</div>`
                  : `<div class="b-valido">Válido Desayuno / Almuerzo / Cena</div>`
              }
            </div>
          </div>
        `;
        })
        .join("\n");

      return `
      <div class="sheet-page">
        <div class="sheet-header-print">
          <span>CAMPAMENTO: <strong>${escapeHtml(campamentoNombre)}</strong></span>
          <span>HOJA ${pageIdx + 1} DE ${pages.length} (${items.length} BENEFICIARIOS)</span>
        </div>
        <div class="sheet-grid">
          ${cardsHtml}
        </div>
      </div>
    `;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Carnets Comedor - ${escapeHtml(campamentoNombre)} (8 por hoja)</title>
  <style>
    /* Configuración de página de impresión: 8 carnets por hoja (2 columnas x 4 filas) */
    @page {
      size: letter portrait;
      margin: 6mm 6mm 6mm 6mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      padding: 10px;
    }

    .sheet-page {
      width: 198mm;
      height: 266mm;
      margin: 0 auto 12mm auto;
      background: #ffffff;
      padding: 4mm;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
      page-break-after: always;
      break-after: page;
      position: relative;
    }

    .sheet-header-print {
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      font-weight: 700;
      color: #64748b;
      margin-bottom: 2mm;
      padding-bottom: 1mm;
      border-bottom: 1px solid #cbd5e1;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Grilla de 2 columnas por 4 filas = 8 carnets */
    .sheet-grid {
      display: grid;
      grid-template-columns: repeat(2, 94mm);
      grid-template-rows: repeat(4, 63mm);
      gap: 2mm 2mm;
      justify-content: center;
      align-content: start;
      flex: 1;
    }

    /* Tarjeta compacta para recortar con tijera */
    .compact-card {
      width: 94mm;
      height: 63mm;
      border: 1px dashed #64748b;
      border-radius: 5px;
      padding: 2.5mm 3.5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #ffffff;
      position: relative;
      overflow: hidden;
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #0284c7;
      padding-bottom: 1.5mm;
      margin-bottom: 1.5mm;
    }
    .card-org {
      font-size: 7.5px;
      font-weight: 800;
      color: #0369a1;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 65mm;
    }
    .card-badge {
      font-size: 7px;
      font-weight: 800;
      padding: 1.5px 5px;
      border-radius: 999px;
      text-transform: uppercase;
      color: #ffffff;
      flex-shrink: 0;
    }
    .badge-jefe {
      background: #0284c7;
    }
    .badge-solo {
      background: #059669;
    }

    .card-middle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2mm;
      flex: 1;
      min-height: 0;
    }

    .card-details {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1mm;
    }
    .b-name {
      font-size: 10px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.15;
      max-height: 22px;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .b-row {
      font-size: 8px;
      display: flex;
      align-items: center;
      gap: 3px;
      line-height: 1;
    }
    .b-label {
      font-weight: 700;
      color: #64748b;
    }
    .b-val {
      font-weight: 600;
      color: #1e293b;
    }
    .b-ci {
      font-weight: 800;
      color: #0f172a;
      font-size: 9px;
    }

    .raciones-pill {
      display: inline-flex;
      align-items: center;
      background: #e0f2fe;
      border: 1px solid #0284c7;
      color: #0369a1;
      padding: 1.5px 6px;
      border-radius: 4px;
      font-size: 8.5px;
      width: fit-content;
      margin-top: 1mm;
    }

    .card-qr {
      width: 25mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .card-qr img {
      width: 21mm;
      height: 21mm;
      display: block;
    }
    .qr-ci {
      font-size: 7.5px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 1px;
      text-align: center;
    }

    .card-bottom {
      border-top: 1px dashed #cbd5e1;
      padding-top: 1mm;
      margin-top: 1mm;
    }
    .b-members {
      font-size: 7px;
      color: #475569;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .b-valido {
      font-size: 6.5px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }
      .sheet-page {
        margin: 0;
        box-shadow: none;
        width: 100%;
        height: 100%;
        padding: 0;
      }
      .sheet-grid {
        gap: 2mm 2mm;
      }
    }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
