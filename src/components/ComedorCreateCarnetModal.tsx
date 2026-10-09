"use client";

import { useState, useEffect } from "react";
import StyledSelect from "@/components/StyledSelect";
import type { ComedorBeneficiario, ComedorFamiliarMember } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (beneficiario: ComedorBeneficiario) => void;
  refugioActual: string;
  refugiosList: Array<{ id: string; nombre: string }>;
  initialData?: ComedorBeneficiario | null; // Si se abre para editar
}

interface IntegranteDraft {
  id?: string;
  nombreApellido: string;
  cedula?: string;
  parentesco?: string;
}

export default function ComedorCreateCarnetModal({
  isOpen,
  onClose,
  onSuccess,
  refugioActual,
  refugiosList,
  initialData,
}: Props) {
  const isEditing = Boolean(initialData);

  // Campos principales
  const [nacionalidad, setNacionalidad] = useState<"V" | "E">("V");
  const [cedulaNumero, setCedulaNumero] = useState("");
  const [nombreApellido, setNombreApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [refugio, setRefugio] = useState(refugioActual && refugioActual !== "TODOS" ? refugioActual : (refugiosList[0]?.nombre || ""));
  const [tipoBeneficiario, setTipoBeneficiario] = useState<"JEFE" | "SOLO">("JEFE");
  const [observacion, setObservacion] = useState("");

  // Integrantes del núcleo familiar
  const [integrantes, setIntegrantes] = useState<IntegranteDraft[]>([]);
  const [racionesCustom, setRacionesCustom] = useState<number | null>(null);

  // Formulario temporal de nuevo integrante
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaCedula, setNuevaCedula] = useState("");
  const [nuevoParentesco, setNuevoParentesco] = useState("Hijo/a");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Cargar datos al abrir o cambiar initialData
  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      const parts = (initialData.cedula || "").split("-");
      if (parts.length > 1 && ["V", "E"].includes(parts[0])) {
        setNacionalidad(parts[0] as "V" | "E");
        setCedulaNumero(parts[1]);
      } else {
        setCedulaNumero(initialData.cedula || "");
      }
      setNombreApellido(initialData.nombreApellido || "");
      setTelefono(initialData.telefono || "");
      setRefugio(initialData.refugio || (refugiosList[0]?.nombre || ""));
      setTipoBeneficiario(initialData.tipoBeneficiario || "JEFE");
      setObservacion(initialData.observacion || "");

      // Filtrar el jefe si viene en integrantes
      const nonJefe = (initialData.integrantes || []).filter(
        (m) => m.id !== initialData.id && m.cedula !== initialData.cedula
      );
      setIntegrantes(
        nonJefe.map((m) => ({
          id: m.id,
          nombreApellido: m.nombreApellido,
          cedula: m.cedula || "",
          parentesco: m.parentesco || "Familiar",
        }))
      );
      setRacionesCustom(initialData.raciones || null);
    } else {
      setNacionalidad("V");
      setCedulaNumero("");
      setNombreApellido("");
      setTelefono("");
      setRefugio(refugioActual && refugioActual !== "TODOS" ? refugioActual : (refugiosList[0]?.nombre || ""));
      setTipoBeneficiario("JEFE");
      setObservacion("");
      setIntegrantes([]);
      setRacionesCustom(null);
    }
    setNuevoNombre("");
    setNuevaCedula("");
    setNuevoParentesco("Hijo/a");
    setErrorMsg("");
  }, [isOpen, initialData, refugioActual, refugiosList]);

  if (!isOpen) return null;

  // Cálculo de raciones totales
  const racionesCalculadas =
    tipoBeneficiario === "SOLO"
      ? 1
      : racionesCustom !== null && racionesCustom > 0
      ? racionesCustom
      : integrantes.length + 1; // 1 (jefe) + integrantes

  const handleAddIntegrante = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim()) {
      return;
    }
    setIntegrantes((prev) => [
      ...prev,
      {
        nombreApellido: nuevoNombre.trim(),
        cedula: nuevaCedula.trim() ? nuevaCedula.trim().toUpperCase() : undefined,
        parentesco: nuevoParentesco,
      },
    ]);
    setNuevoNombre("");
    setNuevaCedula("");
    setNuevoParentesco("Hijo/a");
    // Al agregar integrantes, actualizar el contador si no está forzado
    setRacionesCustom(null);
  };

  const handleRemoveIntegrante = (index: number) => {
    setIntegrantes((prev) => prev.filter((_, i) => i !== index));
    setRacionesCustom(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const cleanCedulaNum = cedulaNumero.trim();
    if (!cleanCedulaNum) {
      setErrorMsg("Debe ingresar el número de cédula del beneficiario.");
      return;
    }
    if (!nombreApellido.trim()) {
      setErrorMsg("Debe ingresar el nombre y apellido del beneficiario.");
      return;
    }
    if (!refugio) {
      setErrorMsg("Debe seleccionar un campamento / refugio.");
      return;
    }

    const fullCedula = isEditing && initialData?.cedula
      ? initialData.cedula
      : `${nacionalidad}-${cleanCedulaNum.replace(/\D/g, "")}`;

    setSaving(true);
    try {
      const payload: any = {
        action: isEditing ? "update_beneficiario" : "create_beneficiario",
        cedula: fullCedula,
        nombreApellido: nombreApellido.trim(),
        telefono: telefono.trim() || null,
        refugio,
        tipoBeneficiario,
        raciones: racionesCalculadas,
        integrantes: tipoBeneficiario === "JEFE" ? integrantes : [],
        observacion: observacion.trim() || null,
      };

      if (isEditing && initialData?.id) {
        payload.id = initialData.id;
      }

      const res = await fetch("/api/comedor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al guardar el carnet de comedor.");
      }

      onSuccess(data.beneficiario);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Error al procesar la solicitud.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-content modal-content--detail"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "640px",
          width: "95%",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "1.5rem",
          borderRadius: "18px",
          background: "var(--card-bg, #ffffff)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.35)",
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "1rem",
            paddingBottom: "0.85rem",
            borderBottom: "1px solid var(--border-color, #e2e8f0)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.4rem" }}>🪪</span>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                {isEditing ? "Editar Carnet QR de Comedor" : "Crear Carnet QR (Exclusivo Comedor)"}
              </h2>
            </div>
            <p
              style={{
                margin: "0.35rem 0 0",
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                lineHeight: 1.4,
              }}
            >
              Registro independiente para el módulo de Comedor. No altera ni modifica la base de datos del censo de afectados.
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            disabled={saving}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "1.3rem",
              color: "var(--text-secondary)",
              lineHeight: 1,
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "8px",
              padding: "0.75rem 1rem",
              marginBottom: "1rem",
              fontSize: "0.88rem",
              fontWeight: 600,
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* SECCIÓN 1: DATOS DEL TITULAR / BENEFICIARIO */}
          <div
            style={{
              background: "var(--bg-primary, #f8fafc)",
              border: "1px solid var(--border-color, #e2e8f0)",
              borderRadius: "12px",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span>👤</span>
              <span>Datos del Titular</span>
            </div>

            {/* Cédula y Nombre */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "0.75rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Cédula *
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={initialData?.cedula || ""}
                    disabled
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      fontSize: "0.88rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      background: "rgba(0,0,0,0.05)",
                      color: "var(--text-secondary)",
                    }}
                  />
                ) : (
                  <div style={{ display: "flex", gap: "4px" }}>
                    <select
                      value={nacionalidad}
                      onChange={(e) => setNacionalidad(e.target.value as "V" | "E")}
                      style={{
                        padding: "0.55rem 0.5rem",
                        fontSize: "0.88rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        background: "var(--card-bg)",
                        color: "var(--text-primary)",
                        fontWeight: 700,
                      }}
                    >
                      <option value="V">V-</option>
                      <option value="E">E-</option>
                    </select>
                    <input
                      type="text"
                      placeholder="12345678"
                      value={cedulaNumero}
                      onChange={(e) => setCedulaNumero(e.target.value.replace(/\D/g, "").slice(0, 9))}
                      required
                      style={{
                        flex: 1,
                        padding: "0.55rem 0.75rem",
                        fontSize: "0.88rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        background: "var(--card-bg)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Nombre y Apellido *
                </label>
                <input
                  type="text"
                  placeholder="Ej. Juan Pérez"
                  value={nombreApellido}
                  onChange={(e) => setNombreApellido(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "0.55rem 0.75rem",
                    fontSize: "0.88rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--card-bg)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            </div>

            {/* Teléfono y Campamento */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Teléfono (opcional)
                </label>
                <input
                  type="text"
                  placeholder="0412-1234567"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.55rem 0.75rem",
                    fontSize: "0.88rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--card-bg)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Campamento / Refugio *
                </label>
                <StyledSelect
                  value={refugio}
                  onChange={setRefugio}
                  ariaLabel="Campamento"
                  options={refugiosList.map((r) => ({ value: r.nombre, label: r.nombre }))}
                />
              </div>
            </div>

            {/* Condición: Jefe de Familia vs Persona Sola */}
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px" }}>
                Condición del Beneficiario *
              </label>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setTipoBeneficiario("JEFE")}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                    padding: "0.6rem 0.85rem",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    border: tipoBeneficiario === "JEFE" ? "2px solid #6366f1" : "1px solid var(--border-color)",
                    background: tipoBeneficiario === "JEFE" ? "rgba(99, 102, 241, 0.12)" : "var(--card-bg)",
                    color: tipoBeneficiario === "JEFE" ? "#6366f1" : "var(--text-primary)",
                  }}
                >
                  <span>👨‍👩‍👧‍👦</span>
                  <span>Jefe de Familia (con carga)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTipoBeneficiario("SOLO");
                    setIntegrantes([]);
                    setRacionesCustom(1);
                  }}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                    padding: "0.6rem 0.85rem",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    border: tipoBeneficiario === "SOLO" ? "2px solid #0284c7" : "1px solid var(--border-color)",
                    background: tipoBeneficiario === "SOLO" ? "rgba(2, 132, 199, 0.12)" : "var(--card-bg)",
                    color: tipoBeneficiario === "SOLO" ? "#0284c7" : "var(--text-primary)",
                  }}
                >
                  <span>👤</span>
                  <span>Persona Sola (1 ración)</span>
                </button>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: CARGA FAMILIAR / NÚCLEO (Solo si es Jefe) */}
          {tipoBeneficiario === "JEFE" && (
            <div
              style={{
                background: "var(--bg-primary, #f8fafc)",
                border: "1px solid var(--border-color, #e2e8f0)",
                borderRadius: "12px",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span>👨‍👩‍👧‍👦</span>
                  <span>Personas del Núcleo Familiar</span>
                </div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#8b5cf6",
                    background: "rgba(139, 92, 246, 0.12)",
                    padding: "3px 8px",
                    borderRadius: "999px",
                  }}
                >
                  {integrantes.length} integrante{integrantes.length === 1 ? "" : "s"} agregado{integrantes.length === 1 ? "" : "s"}
                </div>
              </div>

              {/* Formulario rápido para agregar integrante */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 1fr 1fr auto",
                  gap: "0.5rem",
                  alignItems: "end",
                  background: "var(--card-bg)",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  border: "1px dashed var(--border-color)",
                }}
              >
                <div>
                  <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "3px" }}>
                    Nombre y Apellido
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. María Pérez"
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.65rem",
                      fontSize: "0.82rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "3px" }}>
                    Cédula (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="V-20123456"
                    value={nuevaCedula}
                    onChange={(e) => setNuevaCedula(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.65rem",
                      fontSize: "0.82rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "3px" }}>
                    Parentesco
                  </label>
                  <select
                    value={nuevoParentesco}
                    onChange={(e) => setNuevoParentesco(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.5rem",
                      fontSize: "0.82rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                      background: "var(--card-bg)",
                    }}
                  >
                    <option value="Cónyuge">Cónyuge / Pareja</option>
                    <option value="Hijo/a">Hijo / Hija</option>
                    <option value="Madre/Padre">Madre / Padre</option>
                    <option value="Hermano/a">Hermano / Hermana</option>
                    <option value="Abuelo/a">Abuelo / Abuela</option>
                    <option value="Nieto/a">Nieto / Nieta</option>
                    <option value="Familiar">Otro Familiar</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleAddIntegrante}
                  disabled={!nuevoNombre.trim()}
                  style={{
                    padding: "0.48rem 0.75rem",
                    borderRadius: "6px",
                    background: nuevoNombre.trim() ? "var(--accent, #6366f1)" : "var(--border-color)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    border: "none",
                    cursor: nuevoNombre.trim() ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap",
                  }}
                >
                  ➕ Agregar
                </button>
              </div>

              {/* Lista de integrantes agregados */}
              {integrantes.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "160px", overflowY: "auto" }}>
                  {integrantes.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "var(--card-bg)",
                        padding: "0.45rem 0.75rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        fontSize: "0.82rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{item.nombreApellido}</span>
                        {item.cedula && (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            ({item.cedula})
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: "0.72rem",
                            background: "rgba(99, 102, 241, 0.1)",
                            color: "#6366f1",
                            padding: "1px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          {item.parentesco}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveIntegrante(idx)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: "1rem",
                          padding: "2px 6px",
                        }}
                        title="Quitar familiar"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--text-secondary)",
                    fontStyle: "italic",
                    textAlign: "center",
                    padding: "0.5rem",
                  }}
                >
                  No has agregado familiares adicionales al núcleo (se contará únicamente la ración del jefe a menos que agregues más personas o ajustes las raciones abajo).
                </div>
              )}

              {/* RACIONES TOTALES Y AJUSTE MANUAL */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.6rem 0.85rem",
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "8px",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#059669" }}>
                    🍽️ Total Raciones a Retirar: {racionesCalculadas} plato{racionesCalculadas === 1 ? "" : "s"}
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                    1 Jefe de Familia + {integrantes.length} integrante{integrantes.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <label style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                    Ajuste:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={racionesCalculadas}
                    onChange={(e) => setRacionesCustom(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{
                      width: "60px",
                      padding: "3px 6px",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                      textAlign: "center",
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* SECCIÓN 3: OBSERVACIONES */}
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
              Observación (opcional)
            </label>
            <textarea
              placeholder="Ej. Personal de logística, dieta blanda, autorización especial..."
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              rows={2}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                fontSize: "0.85rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                resize: "vertical",
              }}
            />
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
              marginTop: "0.5rem",
              paddingTop: "0.85rem",
              borderTop: "1px solid var(--border-color, #e2e8f0)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="toolbar-btn"
              style={{ padding: "0.6rem 1.25rem", fontSize: "0.88rem" }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="btn-submit"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.6rem 1.4rem",
                fontSize: "0.88rem",
                background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              }}
            >
              {saving ? (
                <>
                  <span className="spinner spinner-sm" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <span>🪪</span>
                  <span>{isEditing ? "Guardar Cambios" : "Guardar y Generar Carnet QR"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
