"use client";

import { useState, useEffect, useMemo } from "react";
import QRCode from "qrcode";
import type { ComedorBeneficiario } from "@/types";
import StyledSelect from "@/components/StyledSelect";
import { printHtml, downloadHtmlFile, generateBulkCarnetsHtml } from "@/lib/comedorPrint";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  beneficiarios: ComedorBeneficiario[];
  refugioActual: string;
  refugiosList: Array<{ id: string; nombre: string }>;
}

export default function ComedorBulkCarnetsModal({
  isOpen,
  onClose,
  beneficiarios,
  refugioActual,
  refugiosList,
}: Props) {
  const [selectedRefugio, setSelectedRefugio] = useState<string>(refugioActual || "TODOS");
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [busqueda, setBusqueda] = useState<string>("");

  // Estado de generación de QR en masa
  const [generandoQrs, setGenerandoQrs] = useState(false);
  const [progresoQr, setProgresoQr] = useState({ actual: 0, total: 0 });
  const [itemsConQr, setItemsConQr] = useState<Array<{ beneficiario: ComedorBeneficiario; qrDataUrl: string }>>([]);

  // Sincronizar refugio inicial cuando se abre
  useEffect(() => {
    if (isOpen) {
      setSelectedRefugio(refugioActual || "TODOS");
    }
  }, [isOpen, refugioActual]);

  // Beneficiarios filtrados para la impresión masiva
  const beneficiariosFiltrados = useMemo(() => {
    let list = beneficiarios;
    if (selectedRefugio && selectedRefugio !== "TODOS") {
      list = list.filter((b) => b.refugio === selectedRefugio);
    }
    if (filtroTipo) {
      list = list.filter((b) => b.tipoBeneficiario === filtroTipo);
    }
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      list = list.filter(
        (b) =>
          b.nombreApellido.toLowerCase().includes(q) ||
          b.cedula.toLowerCase().includes(q) ||
          (b.cuarto && b.cuarto.toLowerCase().includes(q))
      );
    }
    return list;
  }, [beneficiarios, selectedRefugio, filtroTipo, busqueda]);

  // Generar los códigos QR de todos los beneficiarios filtrados
  useEffect(() => {
    if (!isOpen) {
      setItemsConQr([]);
      return;
    }

    let isMounted = true;
    async function generarTodos() {
      setGenerandoQrs(true);
      const total = beneficiariosFiltrados.length;
      setProgresoQr({ actual: 0, total });

      const resultado: Array<{ beneficiario: ComedorBeneficiario; qrDataUrl: string }> = [];

      for (let i = 0; i < total; i++) {
        if (!isMounted) return;
        const b = beneficiariosFiltrados[i];
        try {
          const payload = `COMEDOR|${b.cedula}|${b.refugio}|${b.raciones}`;
          const qrDataUrl = await QRCode.toDataURL(payload, {
            width: 140,
            margin: 1,
            color: { dark: "#0f172a", light: "#ffffff" },
            errorCorrectionLevel: "M",
          });
          resultado.push({ beneficiario: b, qrDataUrl });
        } catch (err) {
          console.error("Error al generar QR masivo para:", b.cedula, err);
        }

        if (i % 10 === 0 || i === total - 1) {
          setProgresoQr({ actual: i + 1, total });
        }
      }

      if (isMounted) {
        setItemsConQr(resultado);
        setGenerandoQrs(false);
      }
    }

    generarTodos();

    return () => {
      isMounted = false;
    };
  }, [isOpen, beneficiariosFiltrados]);

  if (!isOpen) return null;

  const totalBeneficiarios = itemsConQr.length;
  const totalHojas = Math.ceil(totalBeneficiarios / 8);
  const campamentoLabel = selectedRefugio === "TODOS" ? "Todos los Campamentos" : selectedRefugio;

  const handleImprimir = () => {
    if (itemsConQr.length === 0) return;
    const html = generateBulkCarnetsHtml(itemsConQr, campamentoLabel);
    printHtml(html, `Carnets Comedor - ${campamentoLabel} (8 por hoja)`);
  };

  const handleDescargarHtml = () => {
    if (itemsConQr.length === 0) return;
    const html = generateBulkCarnetsHtml(itemsConQr, campamentoLabel);
    const cleanName = campamentoLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadHtmlFile(html, `Carnets_Comedor_${cleanName}_8_por_hoja.html`);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-content modal-content--detail"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "840px",
          width: "95%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          padding: "1.25rem",
          borderRadius: "16px",
          background: "var(--card-bg, #ffffff)",
          boxShadow: "0 20px 40px -10px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}
      >
        {/* Cabecera del modal */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: "0.75rem",
            borderBottom: "1px solid var(--border-color, #e2e8f0)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.4rem" }}>🖨️</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text-primary)" }}>
                Descarga e Impresión Masiva de Carnets (8 por Hoja)
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Organizados en cuadrícula de 2 columnas x 4 filas con líneas punteadas para recortar
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "1.2rem",
              color: "var(--text-secondary)",
              lineHeight: 1,
              padding: "4px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Filtros de selección */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "0.75rem",
            padding: "0.85rem 0",
            borderBottom: "1px solid var(--border-color, #e2e8f0)",
          }}
        >
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
              Campamento:
            </label>
            <StyledSelect
              value={selectedRefugio}
              onChange={setSelectedRefugio}
              ariaLabel="Seleccionar campamento para carnets masivos"
              options={[
                { value: "TODOS", label: "Todos los Campamentos" },
                ...(refugiosList || []).map((r) => ({ value: r.nombre, label: r.nombre })),
              ]}
            />
          </div>

          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
              Condición:
            </label>
            <StyledSelect
              value={filtroTipo}
              onChange={setFiltroTipo}
              ariaLabel="Filtrar condición"
              options={[
                { value: "", label: "Jefes y Personas Solas (Todos)" },
                { value: "JEFE", label: "Solo Jefes de Familia" },
                { value: "SOLO", label: "Solo Personas Solas" },
              ]}
            />
          </div>

          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
              Filtrar por texto:
            </label>
            <input
              type="text"
              placeholder="Buscar nombre o cédula..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ width: "100%", padding: "0.45rem 0.75rem", fontSize: "0.85rem" }}
            />
          </div>
        </div>

        {/* Tarjeta de Resumen y Métricas de Impresión */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
            padding: "0.75rem 1rem",
            margin: "0.75rem 0",
            background: "var(--bg-secondary, #f8fafc)",
            borderRadius: "10px",
            border: "1px solid var(--border-color, #e2e8f0)",
          }}
        >
          <div style={{ display: "flex", gap: "1.25rem", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block" }}>
                Total Beneficiarios:
              </span>
              <strong style={{ fontSize: "1.1rem", color: "var(--color-primary, #2563eb)" }}>
                {totalBeneficiarios}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block" }}>
                Hojas a Imprimir (8 por hoja):
              </span>
              <strong style={{ fontSize: "1.1rem", color: "#059669" }}>
                {totalHojas} {totalHojas === 1 ? "hoja" : "hojas"}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block" }}>
                Formato:
              </span>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Carta / A4 (Vertical)
              </span>
            </div>
          </div>

          {generandoQrs && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="spinner spinner-sm" />
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Generando códigos QR ({progresoQr.actual}/{progresoQr.total})...
              </span>
            </div>
          )}
        </div>

        {/* Vista previa compacta de la primera hoja */}
        <div
          style={{
            flex: 1,
            minHeight: "220px",
            overflowY: "auto",
            padding: "0.5rem",
            background: "#e2e8f0",
            borderRadius: "10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {totalBeneficiarios === 0 && !generandoQrs ? (
            <div style={{ margin: "auto", textAlign: "center", color: "#64748b", padding: "2rem" }}>
              <span style={{ fontSize: "2rem", display: "block" }}>📭</span>
              <strong>No hay beneficiarios para este filtro.</strong>
            </div>
          ) : (
            <div
              style={{
                width: "100%",
                maxWidth: "700px",
                background: "#ffffff",
                padding: "12px",
                borderRadius: "6px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: "#64748b",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>VISTA PREVIA DE CARNETS RECORTABLES (HOJA 1)</span>
                <span>8 CARNETS POR HOJA</span>
              </div>

              {/* Grid 2 columnas x 4 filas representativo */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "6px",
                }}
              >
                {itemsConQr.slice(0, 8).map(({ beneficiario: b, qrDataUrl }, idx) => (
                  <div
                    key={b.id || idx}
                    style={{
                      border: "1px dashed #94a3b8",
                      borderRadius: "6px",
                      padding: "8px",
                      background: "#ffffff",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "8px", fontWeight: 800, color: "#0284c7" }}>
                        COMEDOR • {b.refugio}
                      </span>
                      <span
                        style={{
                          fontSize: "7px",
                          fontWeight: 800,
                          padding: "1px 5px",
                          borderRadius: "999px",
                          background: b.tipoBeneficiario === "JEFE" ? "#0284c7" : "#059669",
                          color: "#ffffff",
                        }}
                      >
                        {b.tipoBeneficiario === "JEFE" ? "JEFE" : "SOLO"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "10px",
                            fontWeight: 800,
                            color: "#0f172a",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {b.nombreApellido}
                        </div>
                        <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#334155" }}>
                          CI: {b.cedula}
                        </div>
                        {b.telefono && (
                          <div style={{ fontSize: "7.5px", color: "#64748b" }}>
                            TLF: {b.telefono}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: "8px",
                            fontWeight: 800,
                            color: "#0284c7",
                            background: "#e0f2fe",
                            padding: "1px 4px",
                            borderRadius: "3px",
                            width: "fit-content",
                            marginTop: "2px",
                          }}
                        >
                          🍽️ {b.raciones} {b.raciones === 1 ? "ración" : "raciones"}
                        </div>
                      </div>

                      <div style={{ textAlign: "center", flexShrink: 0 }}>
                        <img
                          src={qrDataUrl}
                          alt="QR"
                          style={{ width: "48px", height: "48px", display: "block" }}
                        />
                        <span style={{ fontSize: "7px", fontWeight: 700, color: "#0f172a" }}>
                          {b.cedula}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {totalBeneficiarios > 8 && (
                <div style={{ textAlign: "center", fontSize: "0.75rem", color: "#64748b", marginTop: "8px" }}>
                  + {totalBeneficiarios - 8} carnets adicionales distribuidos en las siguientes {totalHojas - 1} hojas...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "1rem",
            paddingTop: "0.75rem",
            borderTop: "1px solid var(--border-color, #e2e8f0)",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Tip: Al hacer clic en <strong>Imprimir</strong>, el navegador permite seleccionar tu impresora o la opción <strong>Guardar como PDF</strong>.
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="toolbar-btn"
              onClick={handleDescargarHtml}
              disabled={generandoQrs || totalBeneficiarios === 0}
              style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
              title="Descargar archivo HTML autocontenido para imprimir sin conexión"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Descargar Archivo HTML
            </button>

            <button
              type="button"
              className="btn-submit"
              onClick={handleImprimir}
              disabled={generandoQrs || totalBeneficiarios === 0}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.55rem 1.15rem",
                fontSize: "0.88rem",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Imprimir Carnets (8 por hoja)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
