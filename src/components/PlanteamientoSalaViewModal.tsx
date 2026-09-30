"use client";

import { createPortal } from "react-dom";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import {
  ESTATUS_SALA_OPTIONS,
  TITULO_CASA_OPTIONS,
  TIPO_OPCION_PLANTEAMIENTO_OPTIONS,
} from "@/lib/constants";
import type { PlanteamientoSalaItem } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  item: PlanteamientoSalaItem | null;
  onEdit?: (item: PlanteamientoSalaItem) => void;
}

function formatDateDisplay(dStr?: string | null): string {
  if (!dStr) return "—";
  const clean = dStr.slice(0, 10);
  const parts = clean.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return clean;
}

function formatDateTimeDisplay(isoStr?: string | null): string {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr.slice(0, 10);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} a las ${hours}:${mins}`;
  } catch {
    return isoStr.slice(0, 10);
  }
}

export default function PlanteamientoSalaViewModal({
  isOpen,
  onClose,
  item,
  onEdit,
}: Props) {
  const modal = useAnimatedModal(isOpen && item ? item : null);
  const activeItem = modal.data;

  if (!modal.mounted || !activeItem || typeof document === "undefined") return null;

  const estatusMeta =
    ESTATUS_SALA_OPTIONS.find((e) => e.value === activeItem.estatus) || {
      label: activeItem.estatus,
      color: "#2563eb",
      bg: "rgba(37, 99, 235, 0.12)",
    };

  const tipo = activeItem.tipoOpcion || "MERCADO_SECUNDARIO";
  const opcionMeta =
    TIPO_OPCION_PLANTEAMIENTO_OPTIONS.find((o) => o.value === tipo) ||
    TIPO_OPCION_PLANTEAMIENTO_OPTIONS[0];

  const tituloLabel =
    TITULO_CASA_OPTIONS.find((t) => t.value === activeItem.tituloCasa)?.label ||
    activeItem.tituloCasa;

  // Requisitos dinámicos según modalidad
  let requisitos: { num: number; label: string; cumplido: boolean; desc: string }[] = [];
  let totalRequisitos = 9;
  let cumplidosCount = 0;

  if (tipo === "ALQUILER") {
    totalRequisitos = 7;
    requisitos = [
      {
        num: 1,
        label: "Carta de Compromiso",
        cumplido: activeItem.cartaCompromiso === "SI",
        desc: activeItem.cartaCompromiso === "SI" ? "Documento consignado" : "Pendiente por entregar",
      },
      {
        num: 2,
        label: "Fotos del Alquiler",
        cumplido: activeItem.fotosAlquiler === "SI" || (activeItem.cantidadFotosAlquiler !== undefined && activeItem.cantidadFotosAlquiler !== null && activeItem.cantidadFotosAlquiler > 0),
        desc:
          activeItem.fotosAlquiler === "SI" || (activeItem.cantidadFotosAlquiler || 0) > 0
            ? `Consignadas (${activeItem.cantidadFotosAlquiler || 0} foto${activeItem.cantidadFotosAlquiler === 1 ? "" : "s"})`
            : "No posee fotos",
      },
      {
        num: 3,
        label: "Referencia Bancaria del que Alquila",
        cumplido: activeItem.referenciaBancariaAlquiler === "SI",
        desc: activeItem.referenciaBancariaAlquiler === "SI" ? "Referencia válida consignada" : "Pendiente por consignar",
      },
      {
        num: 4,
        label: "Cédula de Identidad del Arrendador",
        cumplido: activeItem.cedulaArrendador === "SI",
        desc: activeItem.cedulaArrendador === "SI" ? "Copia consignada" : "Falta copia",
      },
      {
        num: 5,
        label: "Cédula de Identidad del Arrendatario",
        cumplido: activeItem.cedulaArrendatario === "SI",
        desc: activeItem.cedulaArrendatario === "SI" ? "Copia consignada" : "Falta copia",
      },
      {
        num: 6,
        label: "RIF del Arrendador",
        cumplido: activeItem.rifArrendador === "SI",
        desc: activeItem.rifArrendador === "SI" ? "RIF vigente consignado" : "Falta RIF",
      },
      {
        num: 7,
        label: "RIF del Arrendatario",
        cumplido: activeItem.rifArrendatario === "SI",
        desc: activeItem.rifArrendatario === "SI" ? "RIF vigente consignado" : "Falta RIF",
      },
    ];
    cumplidosCount = requisitos.filter((r) => r.cumplido).length;
  } else if (tipo === "PLAN_VENEZUELA_RENACE") {
    totalRequisitos = 3;
    const hasMaterials = Boolean(
      (activeItem.sacosCemento && activeItem.sacosCemento > 0) ||
      (activeItem.metrosArena && activeItem.metrosArena > 0) ||
      (activeItem.bloques && activeItem.bloques > 0) ||
      (activeItem.cabillas && activeItem.cabillas > 0) ||
      (activeItem.pego && activeItem.pego > 0)
    );

    requisitos = [
      {
        num: 1,
        label: "RIF de la Vivienda con Daños",
        cumplido: activeItem.rifViviendaDanos === "SI",
        desc: activeItem.rifViviendaDanos === "SI" ? "Constancia / RIF consignado" : "Pendiente por entregar",
      },
      {
        num: 2,
        label: "Fotos de la Vivienda",
        cumplido: activeItem.fotosViviendaRenace === "SI" || (activeItem.cantidadFotosRenace !== undefined && activeItem.cantidadFotosRenace !== null && activeItem.cantidadFotosRenace > 0),
        desc:
          activeItem.fotosViviendaRenace === "SI" || (activeItem.cantidadFotosRenace || 0) > 0
            ? `Consignadas (${activeItem.cantidadFotosRenace || 0} foto${activeItem.cantidadFotosRenace === 1 ? "" : "s"})`
            : "No posee fotos de daños",
      },
      {
        num: 3,
        label: "Insumos y Materiales Solicitados",
        cumplido: hasMaterials,
        desc: hasMaterials ? "Materiales asignados para rehabilitación" : "Sin asignación de materiales",
      },
    ];
    cumplidosCount = requisitos.filter((r) => r.cumplido).length;
  } else if (tipo === "CAMPAMENTO_MAYOR_PERMANENCIA") {
    totalRequisitos = 1;
    requisitos = [
      {
        num: 1,
        label: "Permanencia en Campamento",
        cumplido: true,
        desc: `Asignado en ${activeItem.refugio}`,
      },
    ];
    cumplidosCount = 1;
  } else {
    // MERCADO_SECUNDARIO
    totalRequisitos = 10;
    requisitos = [
      {
        num: 1,
        label: "Planilla de Caracterización",
        cumplido: activeItem.planillaCaracterizacion === "SI",
        desc: activeItem.planillaCaracterizacion === "SI" ? "Posee planilla" : "No posee planilla",
      },
      {
        num: 2,
        label: "Cédula Catastral",
        cumplido: activeItem.cedulaCatastral === "SI",
        desc: activeItem.cedulaCatastral === "SI" ? "Posee cédula catastral" : "Pendiente por entregar",
      },
      {
        num: 3,
        label: "Título de Casa",
        cumplido: Boolean(activeItem.tituloCasa && activeItem.tituloCasa !== "NINGUNO"),
        desc: tituloLabel || activeItem.tituloCasa,
      },
      {
        num: 4,
        label: "Referencia Bancaria del Vendedor",
        cumplido: activeItem.referenciaBancariaVendedor === "SI",
        desc: activeItem.referenciaBancariaVendedor === "SI" ? "Consignada" : "No consignada",
      },
      {
        num: 5,
        label: "QR de Hábitat y Vivienda",
        cumplido: activeItem.qrHabitatVivienda === "SI",
        desc: activeItem.qrHabitatVivienda === "SI" ? "Posee código QR" : "No posee QR",
      },
      {
        num: 6,
        label: "Cédula de Identidad del Vendedor",
        cumplido: activeItem.cedulaVendedor === "SI",
        desc: activeItem.cedulaVendedor === "SI" ? "Copia consignada" : "Falta copia",
      },
      {
        num: 7,
        label: "Cédula de Identidad del Comprador",
        cumplido: activeItem.cedulaComprador === "SI",
        desc: activeItem.cedulaComprador === "SI" ? "Copia consignada" : "Falta copia",
      },
      {
        num: 8,
        label: "Fotos Impresas de la Vivienda",
        cumplido: activeItem.fotosVivienda === "SI" || (activeItem.cantidadFotos !== null && activeItem.cantidadFotos > 0),
        desc:
          activeItem.fotosVivienda === "SI" || (activeItem.cantidadFotos || 0) > 0
            ? `Consignadas (${activeItem.cantidadFotos || 0} foto${activeItem.cantidadFotos === 1 ? "" : "s"})`
            : "No posee fotos impresas",
      },
      {
        num: 9,
        label: "El Vendedor Posee Patria",
        cumplido: activeItem.vendedorPoseePatria === "SI",
        desc: activeItem.vendedorPoseePatria === "SI" ? "Verificado en Patria" : "No posee o sin verificar",
      },
      {
        num: 10,
        label: "QR de Colapso de Vivienda",
        cumplido: activeItem.qrColapsoVivienda === "SI",
        desc: activeItem.qrColapsoVivienda === "SI" ? "Posee QR de Colapso" : "No posee QR de Colapso",
      },
    ];
    cumplidosCount = requisitos.filter((r) => r.cumplido).length;
  }

  const handlePrint = () => {
    window.print();
  };

  return createPortal(
    <div
      className={`modal-overlay modal-overlay--sala${modal.closing ? " modal-overlay--closing" : ""}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`modal-content pill-form sala-view-modal${modal.closing ? " modal-content--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="sala-modal__head">
          <div className="msheet__grip" aria-hidden />

          {/* Fila superior: Badges + Botones de Acción */}
          <div className="sala-head-top">
            <div className="sala-head-badges">
              <span
                style={{
                  background: opcionMeta.bg,
                  color: opcionMeta.color,
                  border: `1px solid ${opcionMeta.border}`,
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  padding: "3px 10px",
                  borderRadius: "999px",
                  textTransform: "uppercase",
                  letterSpacing: "0.3px",
                }}
              >
                {opcionMeta.label}
              </span>

              {activeItem.refugio && (
                <span
                  style={{
                    background: "rgba(0,0,0,0.06)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "999px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    maxWidth: "200px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={activeItem.refugio}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeItem.refugio}</span>
                </span>
              )}
            </div>

            <div className="sala-head-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={handlePrint}
                title="Imprimir ficha de planteamiento"
                style={{ height: "32px", padding: "0 10px", fontSize: "0.76rem", display: "inline-flex", alignItems: "center", gap: "4px", width: "auto" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span className="btn-txt-collapsible">Imprimir</span>
              </button>
              <button
                type="button"
                className="modal-close"
                onClick={onClose}
                aria-label="Cerrar modal"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Fila intermedia: Nombre del Titular a ancho completo */}
          <h3 className="sala-head-name">
            {activeItem.nombreApellido}
          </h3>

          {/* Fila inferior: Chips estructurados con información del titular */}
          <div className="sala-head-chips">
            <span className="sala-chip">
              <strong>C.I.</strong> {activeItem.cedula}
            </span>
            {activeItem.genero && (
              <span className="sala-chip">
                {activeItem.genero}
              </span>
            )}
            {activeItem.edad != null && (
              <span className="sala-chip">
                {activeItem.edad} años
              </span>
            )}
            {activeItem.fechaNacimiento && (
              <span className="sala-chip">
                Nac: {formatDateDisplay(activeItem.fechaNacimiento)}
              </span>
            )}
            {activeItem.telefono && (
              <span className="sala-chip sala-chip--accent">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span>{activeItem.telefono}</span>
              </span>
            )}
          </div>
        </div>

        <div className="sala-modal__body">
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

            {/* Observaciones del Expediente */}
            <div
              style={{
                fontSize: "0.88rem",
                background: "var(--bg-primary)",
                padding: "0.85rem 1.1rem",
                borderRadius: "12px",
                border: "1px solid var(--border-color)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-primary)" }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <b style={{ fontSize: "0.78rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Observaciones del Expediente:
                </b>
              </div>
              {activeItem.observacion ? (
                <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--text-primary)", lineHeight: 1.5, fontSize: "0.9rem" }}>
                  {activeItem.observacion}
                </p>
              ) : (
                <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                  Sin observaciones registradas para este expediente.
                </span>
              )}
            </div>
          </div>

          {/* Trazabilidad y Fechas de Avance del Planteamiento */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "0.85rem",
              background: "var(--bg-secondary)",
              padding: "1rem",
              borderRadius: "14px",
              border: "1px solid var(--border-color)",
            }}
          >
            {/* Fecha de Entrega de Carpeta */}
            <div
              style={{
                background: "var(--bg-primary)",
                padding: "0.85rem 1rem",
                borderRadius: "12px",
                border: "1px solid var(--border-color)",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)", fontSize: "0.76rem", fontWeight: 700, textTransform: "uppercase" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span>Fecha de Entrega de Carpeta</span>
              </div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                {formatDateDisplay(activeItem.fechaEntregaCarpeta || activeItem.createdAt)}
              </div>
              <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                Registro creado el {formatDateTimeDisplay(activeItem.createdAt)}
              </div>
            </div>

            {/* Fecha de Entrega de Subsidio */}
            <div
              style={{
                background: "var(--bg-primary)",
                padding: "0.85rem 1rem",
                borderRadius: "12px",
                border: "1px solid var(--border-color)",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)", fontSize: "0.76rem", fontWeight: 700, textTransform: "uppercase" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
                <span>Fecha de Entrega de Subsidio</span>
              </div>
              {activeItem.estatus === "CREDITO ENTREGADO" ? (
                <>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#059669" }}>
                    {formatDateDisplay(activeItem.fechaEntregaSubsidio || activeItem.updatedAt || activeItem.createdAt)}
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#059669", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Crédito entregado al beneficiario</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Pendiente
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                    Subsidio no entregado aún (Estatus: {activeItem.estatus})
                  </div>
                </>
              )}
            </div>
          </div>

          {/* VIVIENDA CENSADA (DATOS EXTRAÍDOS VÍA QR) */}
          {(activeItem.viviendaDireccion || activeItem.viviendaTipo || activeItem.viviendaEdificacion) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1rem",
              }}
            >
              {/* Card 1: Vivienda censada */}
              <div
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "14px",
                  padding: "1.1rem 1.25rem",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
                  <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    Vivienda censada
                  </h4>
                  <span style={{ fontSize: "0.72rem", background: "rgba(37,99,235,0.1)", color: "#2563eb", fontWeight: 700, padding: "2px 10px", borderRadius: "999px" }}>
                    Código QR
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", fontSize: "0.86rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Tipo</span>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)", textAlign: "right" }}>{activeItem.viviendaTipo || "—"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Edificación</span>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)", textAlign: "right" }}>{activeItem.viviendaEdificacion || "—"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Piso / Apto</span>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)", textAlign: "right" }}>{activeItem.viviendaPisoApto || "—"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Dirección</span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)", textAlign: "right" }}>{activeItem.viviendaDireccion || "—"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Zona</span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)", textAlign: "right" }}>{activeItem.viviendaZona || "—"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Circuito comunal</span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)", textAlign: "right" }}>{activeItem.viviendaCircuitoComunal || "—"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>GPS</span>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace", textAlign: "right" }}>{activeItem.viviendaGps || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Grupo familiar del QR */}
              {Array.isArray(activeItem.viviendaQrFamilia) && activeItem.viviendaQrFamilia.length > 0 && (
                <div
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "14px",
                    padding: "1.1rem 1.25rem",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
                    <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                      Grupo familiar ({activeItem.viviendaQrFamilia.length} {activeItem.viviendaQrFamilia.length === 1 ? "persona" : "personas"})
                    </h4>
                    <span style={{ fontSize: "0.72rem", background: "#f1f5f9", color: "var(--text-secondary)", fontWeight: 700, padding: "2px 10px", borderRadius: "999px" }}>
                      Censo de Vivienda
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {activeItem.viviendaQrFamilia.map((fam: any, fIdx: number) => (
                      <div
                        key={fIdx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "0.85rem",
                          padding: "5px 0",
                          borderBottom: fIdx < activeItem.viviendaQrFamilia!.length - 1 ? "1px dashed var(--border-color)" : "none",
                        }}
                      >
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {fIdx + 1}. {fam.nombre}
                        </span>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                          {fam.cedula}
                        </span>
                      </div>
                    ))}
                  </div>

                  {activeItem.viviendaOperador && (
                    <div
                      style={{
                        marginTop: "1rem",
                        paddingTop: "0.75rem",
                        borderTop: "1px solid var(--border-color)",
                        fontSize: "0.82rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <b style={{ color: "var(--text-primary)" }}>Operador de censo:</b>
                      <div>Nombre: {activeItem.viviendaOperador}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Carga Familiar */}
          {Array.isArray(activeItem.cargaFamiliar) && activeItem.cargaFamiliar.length > 0 && (
            <div
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                borderRadius: "14px",
                padding: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "999px", background: "rgba(37,99,235,0.1)", color: "#2563eb" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Carga Familiar del Titular ({activeItem.cargaFamiliar.length} integrante{activeItem.cargaFamiliar.length === 1 ? "" : "s"})
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "2px 10px",
                    borderRadius: "999px",
                    background: "rgba(37,99,235,0.1)",
                    color: "#2563eb",
                  }}
                >
                  Núcleo Familiar Registrado
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.6rem" }}>
                {activeItem.cargaFamiliar.map((fam, idx) => (
                  <div
                    key={fam.id || idx}
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "14px",
                      padding: "0.65rem 0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", marginBottom: "3px" }}>
                      <b style={{ fontSize: "0.86rem", color: "var(--text-primary)" }}>
                        {fam.nombreApellido}
                      </b>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          padding: "1px 7px",
                          borderRadius: "999px",
                          background: "var(--color-primary-light, rgba(37,99,235,0.12))",
                          color: "var(--color-primary, #2563eb)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fam.parentesco}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                      <div>C.I. <b>{fam.cedula}</b>{fam.genero ? ` · ${fam.genero}` : ""}</div>
                      <div>
                        {fam.edad != null ? `${fam.edad} años` : ""}
                        {fam.fechaNacimiento ? ` (Nac: ${fam.fechaNacimiento.slice(0, 10)})` : ""}
                        {fam.telefono ? ` · Telf: ${fam.telefono}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Barra de Progreso */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Cumplimiento de Requisitos:
              </span>
              <span style={{ fontSize: "0.84rem", fontWeight: 800, color: "var(--color-primary)" }}>
                {cumplidosCount} de {totalRequisitos}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%" }}>
              <div
                style={{
                  flex: "1 1 auto",
                  minWidth: 0,
                  height: "8px",
                  borderRadius: "999px",
                  background: "var(--border-color)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${activeItem.porcentajeProgreso}%`,
                    height: "100%",
                    background:
                      activeItem.porcentajeProgreso === 100
                        ? "#059669"
                        : activeItem.porcentajeProgreso >= 50
                        ? "linear-gradient(90deg, #2563eb, #3b82f6)"
                        : "#d97706",
                    borderRadius: "999px",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>

              <span
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 800,
                  color:
                    activeItem.porcentajeProgreso === 100
                      ? "#059669"
                      : activeItem.porcentajeProgreso >= 50
                      ? "#2563eb"
                      : "#d97706",
                  flexShrink: 0,
                  minWidth: "38px",
                  textAlign: "right",
                }}
              >
                {activeItem.porcentajeProgreso}%
              </span>
            </div>
          </div>

          {/* Cuadrícula con los Requisitos según Modalidad */}
          <div>
            <h4 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Detalle de Requisitos Documentales ({opcionMeta.label})
            </h4>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
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
                    {r.cumplido ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      r.num
                    )}
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

          {/* Tarjeta de Materiales asignados en caso de PLAN_VENEZUELA_RENACE */}
          {tipo === "PLAN_VENEZUELA_RENACE" && (
            <div
              style={{
                background: "rgba(124, 58, 237, 0.04)",
                border: "1px solid rgba(124, 58, 237, 0.2)",
                borderRadius: "14px",
                padding: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "0.75rem" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b21a8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                <span style={{ fontSize: "0.92rem", fontWeight: 800, color: "#6b21a8" }}>
                  Materiales e Insumos Asignados
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                <div style={{ background: "var(--bg-primary)", padding: "0.6rem 0.75rem", borderRadius: "10px", textAlign: "center", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>Cemento</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#6b21a8", marginTop: "2px" }}>
                    {activeItem.sacosCemento || 0} <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>sacos</span>
                  </div>
                </div>

                <div style={{ background: "var(--bg-primary)", padding: "0.6rem 0.75rem", borderRadius: "10px", textAlign: "center", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>Arena</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#6b21a8", marginTop: "2px" }}>
                    {activeItem.metrosArena || 0} <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>m³</span>
                  </div>
                </div>

                <div style={{ background: "var(--bg-primary)", padding: "0.6rem 0.75rem", borderRadius: "10px", textAlign: "center", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>Bloques</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#6b21a8", marginTop: "2px" }}>
                    {activeItem.bloques || 0} <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>uds</span>
                  </div>
                </div>

                <div style={{ background: "var(--bg-primary)", padding: "0.6rem 0.75rem", borderRadius: "10px", textAlign: "center", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>Cabillas</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#6b21a8", marginTop: "2px" }}>
                    {activeItem.cabillas || 0} <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>uds</span>
                  </div>
                </div>

                <div style={{ background: "var(--bg-primary)", padding: "0.6rem 0.75rem", borderRadius: "10px", textAlign: "center", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>Pego</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#6b21a8", marginTop: "2px" }}>
                    {activeItem.pego || 0} <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>sacos</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer / Botones */}
        <div className="sala-modal__foot">
          {onEdit && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                onClose();
                onEdit(activeItem);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                width: "auto",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>Editar Planteamiento</span>
            </button>
          )}

          <button
            type="button"
            className="btn-submit"
            onClick={onClose}
            style={{ width: "auto", minWidth: "110px" }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
