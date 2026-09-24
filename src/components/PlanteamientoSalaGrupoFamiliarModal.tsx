"use client";

import { useAnimatedModal } from "@/components/useAnimatedModal";
import type { PlanteamientoSalaItem, PlanteamientoCargaFamiliarItem } from "@/types";
import { TIPO_OPCION_PLANTEAMIENTO_OPTIONS } from "@/lib/constants";

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

const getParentescoStyle = (parentesco: string) => {
  const p = (parentesco || "").toUpperCase();
  if (["ESPOSA", "ESPOSO", "CONYUGE"].includes(p)) {
    return { bg: "rgba(236, 72, 153, 0.12)", color: "#db2777", border: "rgba(236, 72, 153, 0.25)" };
  }
  if (["HIJO", "HIJA"].includes(p)) {
    return { bg: "rgba(59, 130, 246, 0.12)", color: "#2563eb", border: "rgba(59, 130, 246, 0.25)" };
  }
  if (["HERMANO", "HERMANA"].includes(p)) {
    return { bg: "rgba(16, 185, 129, 0.12)", color: "#059669", border: "rgba(16, 185, 129, 0.25)" };
  }
  if (["NIETO", "NIETA"].includes(p)) {
    return { bg: "rgba(245, 158, 11, 0.12)", color: "#d97706", border: "rgba(245, 158, 11, 0.25)" };
  }
  return { bg: "rgba(107, 114, 128, 0.12)", color: "#4b5563", border: "rgba(107, 114, 128, 0.25)" };
};

export default function PlanteamientoSalaGrupoFamiliarModal({
  isOpen,
  onClose,
  item,
  onEdit,
}: Props) {
  const modal = useAnimatedModal(isOpen);

  if (!modal.mounted || !item) return null;

  const cargaFamiliar: PlanteamientoCargaFamiliarItem[] = Array.isArray(item.cargaFamiliar)
    ? item.cargaFamiliar
    : [];

  const opcionMeta =
    TIPO_OPCION_PLANTEAMIENTO_OPTIONS.find((o) => o.value === item.tipoOpcion) ||
    TIPO_OPCION_PLANTEAMIENTO_OPTIONS[0];

  return (
    <div
      className={`modal-overlay${modal.closing ? " modal-overlay--closing" : ""}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`modal-content pill-form sala-grupo-familiar-modal${modal.closing ? " modal-content--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "760px", maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* Cabecera del Modal */}
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
                  background: "#2563eb",
                  color: "#ffffff",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  padding: "3px 10px",
                  borderRadius: "999px",
                  textTransform: "uppercase",
                  letterSpacing: "0.4px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>Grupo Familiar</span>
              </span>
              <span
                style={{
                  background: opcionMeta.bg,
                  color: opcionMeta.color,
                  border: `1px solid ${opcionMeta.border}`,
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "999px",
                }}
              >
                {opcionMeta.shortLabel}
              </span>
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
            <p style={{ margin: "4px 0 0", fontSize: "0.86rem", color: "var(--text-secondary)" }}>
              Detalle de integrantes familiares dependientes registrados para el expediente de planteamiento.
            </p>
          </div>

          <button
            type="button"
            className="toolbar-btn"
            onClick={onClose}
            aria-label="Cerrar modal"
            style={{ width: "32px", height: "32px", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Ficha Resumen del Titular */}
        <div
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "14px",
            padding: "0.9rem 1.1rem",
            marginBottom: "1.25rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: "1rem",
                flexShrink: 0,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.74rem", fontWeight: 800, color: "#2563eb", textTransform: "uppercase" }}>
                  Titular del Expediente
                </span>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  {item.nombreApellido}
                </span>
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                Cédula: <b>{item.cedula}</b>
                {item.genero ? ` · ${item.genero}` : ""}
                {item.edad != null ? ` · ${item.edad} años` : ""}
                {item.fechaNacimiento ? ` (Nac: ${formatDateDisplay(item.fechaNacimiento)})` : ""}
                {item.telefono ? ` · Telf: ${item.telefono}` : ""}
              </div>
            </div>
          </div>

          <div
            style={{
              background: cargaFamiliar.length > 0 ? "rgba(37,99,235,0.12)" : "rgba(0,0,0,0.06)",
              color: cargaFamiliar.length > 0 ? "#2563eb" : "var(--text-secondary)",
              border: cargaFamiliar.length > 0 ? "1px solid rgba(37,99,235,0.25)" : "1px solid var(--border-color)",
              padding: "5px 12px",
              borderRadius: "999px",
              fontWeight: 800,
              fontSize: "0.82rem",
              whiteSpace: "nowrap",
            }}
          >
            {cargaFamiliar.length === 0
              ? "0 familiares registrados"
              : cargaFamiliar.length === 1
              ? "1 familiar registrado"
              : `${cargaFamiliar.length} familiares registrados`}
          </div>
        </div>

        {/* Listado de Miembros del Grupo Familiar */}
        {cargaFamiliar.length === 0 ? (
          <div
            style={{
              padding: "2.5rem 1.5rem",
              textAlign: "center",
              background: "var(--bg-secondary)",
              borderRadius: "14px",
              border: "1px dashed var(--border-color)",
              marginBottom: "1.25rem",
            }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "56px", height: "56px", borderRadius: "50%", background: "rgba(37,99,235,0.08)", color: "#2563eb", marginBottom: "0.75rem" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h4 style={{ margin: "0 0 0.4rem", fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
              No posee carga familiar registrada
            </h4>
            <p style={{ margin: "0 auto 1.25rem", maxWidth: "460px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Este titular no cuenta con integrantes familiares dependientes cargados en el planteamiento. Puede incorporarlos editando el expediente.
            </p>
            {onEdit && (
              <button
                type="button"
                className="toolbar-btn toolbar-btn--primary"
                onClick={() => {
                  onClose();
                  onEdit(item);
                }}
                style={{
                  background: "#2563eb",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  padding: "0.55rem 1.3rem",
                  borderRadius: "8px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Agregar Carga Familiar</span>
              </button>
            )}
          </div>
        ) : (
          <div style={{ marginBottom: "1.25rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.85rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 800,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.4px",
                }}
              >
                Integrantes del Grupo Familiar ({cargaFamiliar.length})
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {cargaFamiliar.map((fam, idx) => {
                const parentescoMeta = getParentescoStyle(fam.parentesco);

                return (
                  <div
                    key={fam.id || idx}
                    style={{
                      background: "var(--bg-primary)",
                      border: "1.5px solid var(--border-color)",
                      borderRadius: "14px",
                      padding: "0.95rem 1.15rem",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                    }}
                  >
                    {/* Fila Superior: Badge #, Nombre y Parentesco */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "8px",
                        marginBottom: "0.6rem",
                        paddingBottom: "0.5rem",
                        borderBottom: "1px solid var(--border-color)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            background: "rgba(0,0,0,0.05)",
                            color: "var(--text-secondary)",
                            fontWeight: 800,
                            fontSize: "0.72rem",
                            padding: "2px 7px",
                            borderRadius: "6px",
                          }}
                        >
                          #{idx + 1}
                        </span>
                        <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text-primary)" }}>
                          {fam.nombreApellido || "SIN NOMBRE ESPECIFICADO"}
                        </span>
                      </div>

                      <span
                        style={{
                          fontSize: "0.76rem",
                          fontWeight: 800,
                          padding: "3px 10px",
                          borderRadius: "999px",
                          background: parentescoMeta.bg,
                          color: parentescoMeta.color,
                          border: `1px solid ${parentescoMeta.border}`,
                          textTransform: "uppercase",
                          letterSpacing: "0.3px",
                        }}
                      >
                        {fam.parentesco || "OTRO"}
                      </span>
                    </div>

                    {/* Grilla de Datos Personales del Familiar */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: "0.65rem 1rem",
                        fontSize: "0.82rem",
                      }}
                    >
                      {/* Cédula */}
                      <div>
                        <span style={{ display: "block", fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
                          Cédula de Identidad
                        </span>
                        <span style={{ fontWeight: 800, color: "var(--text-primary)" }}>
                          {fam.cedula ? `C.I. ${fam.cedula}` : "—"}
                        </span>
                      </div>

                      {/* Género */}
                      <div>
                        <span style={{ display: "block", fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
                          Género
                        </span>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {fam.genero || "—"}
                        </span>
                      </div>

                      {/* Fecha de Nacimiento */}
                      <div>
                        <span style={{ display: "block", fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
                          Fecha de Nacimiento
                        </span>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {formatDateDisplay(fam.fechaNacimiento)}
                        </span>
                      </div>

                      {/* Edad */}
                      <div>
                        <span style={{ display: "block", fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
                          Edad
                        </span>
                        <span style={{ fontWeight: 700, color: "#2563eb" }}>
                          {fam.edad != null ? `${fam.edad} años` : "—"}
                        </span>
                      </div>

                      {/* Teléfono */}
                      <div>
                        <span style={{ display: "block", fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
                          Teléfono
                        </span>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {fam.telefono || "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
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
                fontWeight: 600,
                fontSize: "0.84rem",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>Editar Carga Familiar</span>
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
