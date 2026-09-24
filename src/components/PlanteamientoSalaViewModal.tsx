"use client";

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
  const modal = useAnimatedModal(isOpen);

  if (!modal.mounted || !item) return null;

  const estatusMeta =
    ESTATUS_SALA_OPTIONS.find((e) => e.value === item.estatus) || {
      label: item.estatus,
      color: "#2563eb",
      bg: "rgba(37, 99, 235, 0.12)",
    };

  const tipo = item.tipoOpcion || "MERCADO_SECUNDARIO";
  const opcionMeta =
    TIPO_OPCION_PLANTEAMIENTO_OPTIONS.find((o) => o.value === tipo) ||
    TIPO_OPCION_PLANTEAMIENTO_OPTIONS[0];

  const tituloLabel =
    TITULO_CASA_OPTIONS.find((t) => t.value === item.tituloCasa)?.label ||
    item.tituloCasa;

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
        cumplido: item.cartaCompromiso === "SI",
        desc: item.cartaCompromiso === "SI" ? "Documento consignado" : "Pendiente por entregar",
      },
      {
        num: 2,
        label: "Fotos del Alquiler",
        cumplido: item.fotosAlquiler === "SI" || (item.cantidadFotosAlquiler !== undefined && item.cantidadFotosAlquiler !== null && item.cantidadFotosAlquiler > 0),
        desc:
          item.fotosAlquiler === "SI" || (item.cantidadFotosAlquiler || 0) > 0
            ? `Consignadas (${item.cantidadFotosAlquiler || 0} foto${item.cantidadFotosAlquiler === 1 ? "" : "s"})`
            : "No posee fotos",
      },
      {
        num: 3,
        label: "Referencia Bancaria del que Alquila",
        cumplido: item.referenciaBancariaAlquiler === "SI",
        desc: item.referenciaBancariaAlquiler === "SI" ? "Referencia válida consignada" : "Pendiente por consignar",
      },
      {
        num: 4,
        label: "Cédula de Identidad del Arrendador",
        cumplido: item.cedulaArrendador === "SI",
        desc: item.cedulaArrendador === "SI" ? "Copia consignada" : "Falta copia",
      },
      {
        num: 5,
        label: "Cédula de Identidad del Arrendatario",
        cumplido: item.cedulaArrendatario === "SI",
        desc: item.cedulaArrendatario === "SI" ? "Copia consignada" : "Falta copia",
      },
      {
        num: 6,
        label: "RIF del Arrendador",
        cumplido: item.rifArrendador === "SI",
        desc: item.rifArrendador === "SI" ? "RIF vigente consignado" : "Falta RIF",
      },
      {
        num: 7,
        label: "RIF del Arrendatario",
        cumplido: item.rifArrendatario === "SI",
        desc: item.rifArrendatario === "SI" ? "RIF vigente consignado" : "Falta RIF",
      },
    ];
    cumplidosCount = requisitos.filter((r) => r.cumplido).length;
  } else if (tipo === "PLAN_VENEZUELA_RENACE") {
    totalRequisitos = 3;
    const hasMaterials = Boolean(
      (item.sacosCemento && item.sacosCemento > 0) ||
      (item.metrosArena && item.metrosArena > 0) ||
      (item.bloques && item.bloques > 0) ||
      (item.cabillas && item.cabillas > 0) ||
      (item.pego && item.pego > 0)
    );

    requisitos = [
      {
        num: 1,
        label: "RIF de la Vivienda con Daños",
        cumplido: item.rifViviendaDanos === "SI",
        desc: item.rifViviendaDanos === "SI" ? "Constancia / RIF consignado" : "Pendiente por entregar",
      },
      {
        num: 2,
        label: "Fotos de la Vivienda",
        cumplido: item.fotosViviendaRenace === "SI" || (item.cantidadFotosRenace !== undefined && item.cantidadFotosRenace !== null && item.cantidadFotosRenace > 0),
        desc:
          item.fotosViviendaRenace === "SI" || (item.cantidadFotosRenace || 0) > 0
            ? `Consignadas (${item.cantidadFotosRenace || 0} foto${item.cantidadFotosRenace === 1 ? "" : "s"})`
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
  } else {
    // MERCADO_SECUNDARIO
    totalRequisitos = 10;
    requisitos = [
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
        desc: tituloLabel || item.tituloCasa,
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
        desc:
          item.fotosVivienda === "SI" || (item.cantidadFotos || 0) > 0
            ? `Consignadas (${item.cantidadFotos || 0} foto${item.cantidadFotos === 1 ? "" : "s"})`
            : "No posee fotos impresas",
      },
      {
        num: 9,
        label: "El Vendedor Posee Patria",
        cumplido: item.vendedorPoseePatria === "SI",
        desc: item.vendedorPoseePatria === "SI" ? "Verificado en Patria" : "No posee o sin verificar",
      },
      {
        num: 10,
        label: "QR de Colapso de Vivienda",
        cumplido: item.qrColapsoVivienda === "SI",
        desc: item.qrColapsoVivienda === "SI" ? "Posee QR de Colapso" : "No posee QR de Colapso",
      },
    ];
    cumplidosCount = requisitos.filter((r) => r.cumplido).length;
  }

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
                  background: opcionMeta.bg,
                  color: opcionMeta.color,
                  border: `1px solid ${opcionMeta.border}`,
                  fontSize: "0.74rem",
                  fontWeight: 800,
                  padding: "3px 10px",
                  borderRadius: "999px",
                  textTransform: "uppercase",
                  letterSpacing: "0.3px",
                }}
              >
                {opcionMeta.label}
              </span>
              <span
                style={{
                  background: "rgba(0,0,0,0.06)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>{item.refugio}</span>
              </span>
            </div>
            <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "var(--text-primary)" }}>
              {item.nombreApellido}
            </h3>
            <p style={{ margin: "3px 0 0", fontSize: "0.88rem", color: "var(--text-secondary)" }}>
              C.I. <b>{item.cedula}</b>
              {item.genero ? ` · ${item.genero}` : ""}
              {item.edad != null ? ` · ${item.edad} años` : ""}
              {item.fechaNacimiento ? ` (Nac: ${item.fechaNacimiento.slice(0, 10)})` : ""}
              {item.telefono ? ` · Telf: ${item.telefono}` : ""}
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
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
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
            {item.observacion ? (
              <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--text-primary)", lineHeight: 1.5, fontSize: "0.9rem" }}>
                {item.observacion}
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
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "0.85rem",
            background: "var(--bg-secondary)",
            padding: "1rem",
            borderRadius: "14px",
            border: "1px solid var(--border-color)",
            marginBottom: "1.25rem",
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
              {formatDateDisplay(item.fechaEntregaCarpeta || item.createdAt)}
            </div>
            <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>
              Registro creado el {formatDateTimeDisplay(item.createdAt)}
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
            {item.estatus === "CREDITO ENTREGADO" ? (
              <>
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#059669" }}>
                  {formatDateDisplay(item.fechaEntregaSubsidio || item.updatedAt || item.createdAt)}
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
                  Subsidio no entregado aún (Estatus: {item.estatus})
                </div>
              </>
            )}
          </div>
        </div>

        {/* Carga Familiar */}
        {Array.isArray(item.cargaFamiliar) && item.cargaFamiliar.length > 0 && (
          <div
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "14px",
              padding: "1rem",
              marginBottom: "1.25rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px", borderRadius: "6px", background: "rgba(37,99,235,0.1)", color: "#2563eb" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Carga Familiar del Titular ({item.cargaFamiliar.length} integrante{item.cargaFamiliar.length === 1 ? "" : "s"})
                </span>
              </div>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  background: "rgba(37,99,235,0.1)",
                  color: "#2563eb",
                }}
              >
                Núcleo Familiar Registrado
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.6rem" }}>
              {item.cargaFamiliar.map((fam, idx) => (
                <div
                  key={fam.id || idx}
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "10px",
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
                        background: "#eff6ff",
                        color: "#2563eb",
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
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
            <span style={{ fontSize: "0.88rem", fontWeight: 700 }}>
              Cumplimiento de Requisitos ({cumplidosCount} de {totalRequisitos})
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

        {/* Cuadrícula con los Requisitos según Modalidad */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h4 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
            Detalle de Requisitos Documentales ({opcionMeta.label})
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
              marginBottom: "1.5rem",
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
                  {item.sacosCemento || 0} <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>sacos</span>
                </div>
              </div>

              <div style={{ background: "var(--bg-primary)", padding: "0.6rem 0.75rem", borderRadius: "10px", textAlign: "center", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>Arena</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#6b21a8", marginTop: "2px" }}>
                  {item.metrosArena || 0} <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>m³</span>
                </div>
              </div>

              <div style={{ background: "var(--bg-primary)", padding: "0.6rem 0.75rem", borderRadius: "10px", textAlign: "center", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>Bloques</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#6b21a8", marginTop: "2px" }}>
                  {item.bloques || 0} <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>uds</span>
                </div>
              </div>

              <div style={{ background: "var(--bg-primary)", padding: "0.6rem 0.75rem", borderRadius: "10px", textAlign: "center", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>Cabillas</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#6b21a8", marginTop: "2px" }}>
                  {item.cabillas || 0} <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>uds</span>
                </div>
              </div>

              <div style={{ background: "var(--bg-primary)", padding: "0.6rem 0.75rem", borderRadius: "10px", textAlign: "center", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>Pego</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#6b21a8", marginTop: "2px" }}>
                  {item.pego || 0} <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>sacos</span>
                </div>
              </div>
            </div>
          </div>
        )}

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
