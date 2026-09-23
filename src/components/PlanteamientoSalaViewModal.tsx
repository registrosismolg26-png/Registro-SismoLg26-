"use client";

import { useAnimatedModal } from "@/components/useAnimatedModal";
import { ESTATUS_SALA_OPTIONS, TITULO_CASA_OPTIONS } from "@/lib/constants";
import type { PlanteamientoSalaItem } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  item: PlanteamientoSalaItem | null;
  onEdit?: (item: PlanteamientoSalaItem) => void;
}

export default function PlanteamientoSalaViewModal({
  isOpen,
  onClose,
  item,
  onEdit,
}: Props) {
  const modal = useAnimatedModal(isOpen);

  if (!modal.mounted || !item) return null;

  const estatusMeta =
    ESTATUS_SALA_OPTIONS.find((e) => e.value === item.estatus) || {
      label: item.estatus,
      color: "#2563eb",
      bg: "rgba(37, 99, 235, 0.12)",
    };

  const tituloLabel =
    TITULO_CASA_OPTIONS.find((t) => t.value === item.tituloCasa)?.label ||
    item.tituloCasa;

  const cumplidos = Math.round((item.porcentajeProgreso / 100) * 9);

  const requisitos = [
    {
      num: 1,
      label: "Planilla de Caracterización",
      cumplido: item.planillaCaracterizacion === "SI",
      desc: item.planillaCaracterizacion === "SI" ? "Posee planilla" : "No posee planilla",
    },
    {
      num: 2,
      label: "Cédula Catastral",
      cumplido: item.cedulaCatastral === "SI",
      desc: item.cedulaCatastral === "SI" ? "Posee cédula catastral" : "Pendiente por entregar",
    },
    {
      num: 3,
      label: "Título de Casa",
      cumplido: Boolean(item.tituloCasa && item.tituloCasa !== "NINGUNO"),
      desc: tituloLabel,
      extra: item.tituloCasa !== "NINGUNO" ? "Documento válido" : "Sin título",
    },
    {
      num: 4,
      label: "Referencia Bancaria del Vendedor",
      cumplido: item.referenciaBancariaVendedor === "SI",
      desc: item.referenciaBancariaVendedor === "SI" ? "Consignada" : "No consignada",
    },
    {
      num: 5,
      label: "QR de Hábitat y Vivienda",
      cumplido: item.qrHabitatVivienda === "SI",
      desc: item.qrHabitatVivienda === "SI" ? "Posee código QR" : "No posee QR",
    },
    {
      num: 6,
      label: "Cédula de Identidad del Vendedor",
      cumplido: item.cedulaVendedor === "SI",
      desc: item.cedulaVendedor === "SI" ? "Copia consignada" : "Falta copia",
    },
    {
      num: 7,
      label: "Cédula de Identidad del Comprador",
      cumplido: item.cedulaComprador === "SI",
      desc: item.cedulaComprador === "SI" ? "Copia consignada" : "Falta copia",
    },
    {
      num: 8,
      label: "Fotos Impresas de la Vivienda",
      cumplido: item.fotosVivienda === "SI" || (item.cantidadFotos !== null && item.cantidadFotos > 0),
      desc: item.fotosVivienda === "SI" || item.cantidadFotos > 0
        ? `Consignadas (${item.cantidadFotos || 0} foto${item.cantidadFotos === 1 ? "" : "s"})`
        : "No posee fotos impresas",
    },
    {
      num: 9,
      label: "El Vendedor Posee Patria",
      cumplido: item.vendedorPoseePatria === "SI",
      desc: item.vendedorPoseePatria === "SI" ? "Verificado en Patria" : "No posee o sin verificar",
    },
  ];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className={`modal-overlay${modal.closing ? " modal-overlay--closing" : ""}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`modal-content pill-form sala-view-modal${modal.closing ? " modal-content--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "720px", maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* Cabecera */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            marginBottom: "1.25rem",
            paddingBottom: "0.85rem",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
              <span
                style={{
                  background: "var(--color-primary)",
                  color: "#fff",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  textTransform: "uppercase",
                }}
              >
                Ficha de Planteamiento
              </span>
              <span
                style={{
                  background: "rgba(0,0,0,0.06)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "999px",
                }}
              >
                📍 {item.refugio}
              </span>
            </div>
            <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "var(--text-primary)" }}>
              {item.nombreApellido}
            </h3>
            <p style={{ margin: "3px 0 0", fontSize: "0.88rem", color: "var(--text-secondary)" }}>
              C.I. <b>{item.cedula}</b> {item.telefono ? `· Telf: ${item.telefono}` : ""}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              className="toolbar-btn"
              onClick={handlePrint}
              title="Imprimir ficha de planteamiento"
              style={{ height: "32px", padding: "0 10px", fontSize: "0.8rem" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "4px" }}>
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Imprimir
            </button>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Cerrar"
              style={{ background: "transparent", border: "none", fontSize: "1.3rem", cursor: "pointer", color: "var(--text-secondary)" }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Estatus & Observaciones */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            background: "var(--bg-secondary)",
            padding: "1rem",
            borderRadius: "14px",
            border: "1px solid var(--border-color)",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
              ESTATUS ACTUAL DEL EXPEDIENTE:
            </span>
            <span
              style={{
                padding: "5px 14px",
                borderRadius: "999px",
                fontWeight: 800,
                fontSize: "0.85rem",
                background: estatusMeta.bg,
                color: estatusMeta.color,
                letterSpacing: "0.3px",
              }}
            >
              {estatusMeta.label}
            </span>
          </div>

          {item.observacion && (
            <div style={{ fontSize: "0.88rem", background: "var(--bg-primary)", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
              <b style={{ display: "block", marginBottom: "3px", fontSize: "0.78rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                Observación / Novedad Registrada:
              </b>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>{item.observacion}</p>
            </div>
          )}
        </div>

        {/* Barra de Progreso */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
            <span style={{ fontSize: "0.88rem", fontWeight: 700 }}>
              Cumplimiento de Requisitos ({cumplidos} de 9)
            </span>
            <span
              style={{
                fontSize: "1.1rem",
                fontWeight: 800,
                color:
                  item.porcentajeProgreso === 100
                    ? "#059669"
                    : item.porcentajeProgreso >= 50
                    ? "#2563eb"
                    : "#d97706",
              }}
            >
              {item.porcentajeProgreso}%
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "10px",
              borderRadius: "999px",
              background: "var(--border-color)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${item.porcentajeProgreso}%`,
                height: "100%",
                background:
                  item.porcentajeProgreso === 100
                    ? "#059669"
                    : item.porcentajeProgreso >= 50
                    ? "linear-gradient(90deg, #2563eb, #3b82f6)"
                    : "#d97706",
                borderRadius: "999px",
              }}
            />
          </div>
        </div>

        {/* Cuadrícula con los 9 Requisitos */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h4 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
            Detalle de Requisitos Documentales
          </h4>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {requisitos.map((r) => (
              <div
                key={r.num}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  padding: "0.85rem",
                  borderRadius: "12px",
                  background: r.cumplido ? "rgba(5, 150, 105, 0.04)" : "rgba(220, 38, 38, 0.03)",
                  border: `1px solid ${r.cumplido ? "rgba(5, 150, 105, 0.2)" : "var(--border-color)"}`,
                }}
              >
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    flexShrink: 0,
                    background: r.cumplido ? "#059669" : "#e5e7eb",
                    color: r.cumplido ? "#ffffff" : "#6b7280",
                  }}
                >
                  {r.cumplido ? "✓" : r.num}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {r.label}
                    </span>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: "999px",
                        background: r.cumplido ? "rgba(5, 150, 105, 0.12)" : "rgba(220, 38, 38, 0.08)",
                        color: r.cumplido ? "#059669" : "#dc2626",
                      }}
                    >
                      {r.cumplido ? "SI" : "NO"}
                    </span>
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    {r.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer / Botones */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "0.75rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          {onEdit && (
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => {
                onClose();
                onEdit(item);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "var(--bg-secondary)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Editar Planteamiento
            </button>
          )}

          <button
            type="button"
            className="btn-guardar-censo"
            onClick={onClose}
            style={{ minWidth: "100px" }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
