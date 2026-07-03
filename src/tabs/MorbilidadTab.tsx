"use client";

import { useState, useMemo } from "react";
import { useAppContext } from "@/context/AppContext";
import { saveLocalConsulta, buscarCedulaEnCliente } from "@/lib/db";
import type { Medicamento } from "@/types";

export default function MorbilidadTab() {
  const {
    currentUser,
    registros,
    patologias,
    consultas,
    localConsultas,
    refreshLocalConsultas,
    triggerSync,
    showToast,
    effectiveRefugio,
  } = useAppContext();

  // Búsqueda y formulario
  const [searchCedula, setSearchCedula] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Datos Básicos del Paciente
  const [cedula, setCedula] = useState("");
  const [nombreApellido, setNombreApellido] = useState("");
  const [genero, setGenero] = useState("MASCULINO");
  const [edad, setEdad] = useState("");
  const [refugio, setRefugio] = useState(effectiveRefugio || "");

  // Antecedentes (Solo lectura, cargados del censo)
  const [antecedentesPatologia, setAntecedentesPatologia] = useState("Ninguna");
  const [antecedentesMedicamentos, setAntecedentesMedicamentos] = useState<Medicamento[]>([]);

  // Diagnóstico de esta consulta (Modificable)
  const [diagnosticoPatologia, setDiagnosticoPatologia] = useState("");
  const [diagnosticoMedicamentos, setDiagnosticoMedicamentos] = useState<Medicamento[]>([]);
  const [notasDoctor, setNotasDoctor] = useState("");

  const [saving, setSaving] = useState(false);

  // --- BÚSQUEDA ---
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCedula = searchCedula.replace(/\D/g, "");
    if (!cleanCedula) {
      showToast("Ingrese una cédula para buscar.", "warning");
      return;
    }

    setSearching(true);
    setSearched(true);
    setCedula(cleanCedula);

    // 1. Buscar en registros locales censados (estado registros)
    const localMatch = registros.find(
      (r) => r.cedula.replace(/\D/g, "") === cleanCedula && r.retirado !== "SI"
    );

    if (localMatch) {
      setNombreApellido(localMatch.nombreApellido);
      setGenero(localMatch.genero);
      setEdad(String(localMatch.edad));
      setRefugio(localMatch.refugio);
      setAntecedentesPatologia(
        localMatch.patologia === "SI" ? (localMatch.patologiaDescripcion || "Sí, sin descripción") : "Ninguna"
      );
      setAntecedentesMedicamentos(Array.isArray(localMatch.medicamentos) ? localMatch.medicamentos : []);
      showToast("Paciente encontrado en el Censo.", "success");
    } else {
      // 2. Buscar en Padrón Electoral local en IndexedDB
      try {
        const padronMatch = await buscarCedulaEnCliente(cleanCedula);
        if (padronMatch) {
          setNombreApellido(padronMatch.nombreCompleto);
          setGenero(padronMatch.sexo === "M" ? "MASCULINO" : "FEMENINO");
          
          // Calcular edad aproximada
          if (padronMatch.fechaNacimiento) {
            const diff = Date.now() - new Date(padronMatch.fechaNacimiento).getTime();
            const calcEdad = Math.floor(Math.abs(new Date(diff).getUTCFullYear() - 1970));
            setEdad(String(calcEdad));
          } else {
            setEdad("");
          }
          setRefugio(effectiveRefugio || currentUser?.campamentoTransitorio || "");
          setAntecedentesPatologia("Ninguna");
          setAntecedentesMedicamentos([]);
          showToast("Paciente encontrado en el Padrón.", "info");
        } else {
          // 3. No encontrado en ningún lado: carga manual
          setNombreApellido("");
          setGenero("MASCULINO");
          setEdad("");
          setRefugio(effectiveRefugio || currentUser?.campamentoTransitorio || "");
          setAntecedentesPatologia("Ninguna");
          setAntecedentesMedicamentos([]);
          showToast("No encontrado. Rellene los datos manualmente.", "warning");
        }
      } catch (err) {
        console.error(err);
        showToast("Error al buscar en el padrón.", "error");
      }
    }
    setSearching(false);
  };

  // --- PREDEFINED PATHOLOGIES TOGGLE ---
  const toggleDiagPathology = (pName: string) => {
    const current = diagnosticoPatologia
      ? diagnosticoPatologia.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const index = current.indexOf(pName);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(pName);
    }
    setDiagnosticoPatologia(current.join(", "));
  };

  // --- MEDICAMENTOS DIAGNÓSTICADOS ---
  const addMed = () => {
    setDiagnosticoMedicamentos((p) => [...p, { nombre: "", dosis: "", periodo: "" }]);
  };

  const removeMed = (index: number) => {
    setDiagnosticoMedicamentos((p) => p.filter((_, i) => i !== index));
  };

  const updateMed = (index: number, field: keyof Medicamento, value: string) => {
    setDiagnosticoMedicamentos((p) =>
      p.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  };

  // --- RESET STATE ---
  const handleReset = () => {
    setSearchCedula("");
    setSearched(false);
    setCedula("");
    setNombreApellido("");
    setGenero("MASCULINO");
    setEdad("");
    setRefugio(effectiveRefugio || "");
    setAntecedentesPatologia("Ninguna");
    setAntecedentesMedicamentos([]);
    setDiagnosticoPatologia("");
    setDiagnosticoMedicamentos([]);
    setNotasDoctor("");
  };

  // --- GUARDAR CONSULTA (OFFLINE-FIRST) ---
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cedula || !nombreApellido.trim() || !refugio) {
      showToast("Por favor complete los datos del paciente.", "error");
      return;
    }

    setSaving(true);
    const docId = crypto.randomUUID();

    const localConsultaData = {
      id: docId,
      data: {
        cedula,
        nombreApellido: nombreApellido.trim(),
        genero,
        edad: edad ? parseInt(edad) : undefined,
        refugio,
        antecedentesPatologia,
        antecedentesMedicamentos,
        diagnosticoPatologia,
        diagnosticoMedicamentos: diagnosticoMedicamentos.filter(m => m.nombre.trim()),
        notasDoctor: notasDoctor.trim() || undefined,
      },
      userId: currentUser?.email,
    };

    try {
      await saveLocalConsulta(localConsultaData);
      showToast("Consulta médica registrada localmente.", "success");
      handleReset();
      await refreshLocalConsultas();
      // Disparar sincronización en segundo plano de inmediato
      triggerSync();
    } catch (err) {
      console.error(err);
      showToast("Error al guardar la consulta.", "error");
    } finally {
      setSaving(false);
    }
  };

  // Combinar consultas remotas y pendientes locales para historial
  const allConsultas = useMemo(() => {
    const combined = [...localConsultas];
    const localIds = new Set(localConsultas.map((c) => c.id));
    consultas.forEach((c) => {
      if (!localIds.has(c.id)) {
        combined.push({
          id: c.id,
          data: {
            cedula: c.cedula,
            nombreApellido: c.nombreApellido,
            genero: c.genero,
            edad: c.edad,
            refugio: c.refugio,
            antecedentesPatologia: c.antecedentesPatologia,
            antecedentesMedicamentos: c.antecedentesMedicamentos,
            diagnosticoPatologia: c.diagnosticoPatologia,
            diagnosticoMedicamentos: c.diagnosticoMedicamentos,
            notasDoctor: c.notasDoctor,
          },
          status: "synced",
          attempts: 0,
          createdAt: c.createdAt,
          userId: c.userId,
        });
      }
    });
    // Ordenar por fecha decreciente
    return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [localConsultas, consultas]);

  return (
    <div className="tab-view" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* 1. Header de Sección */}
      <div className="section-title-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--text-primary)", margin: 0 }}>Consultas Médicas (Morbilidad)</h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>Registro clínico y diagnóstico de pacientes refugiados</p>
        </div>
      </div>

      {/* 2. Buscador por Cédula */}
      {!searched && (
        <div className="dashboard-section" style={{ maxWidth: "500px", margin: "0 auto", width: "100%" }}>
          <form onSubmit={handleSearch} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="search-cedula" style={{ fontWeight: "700" }}>Buscar Paciente por Cédula</label>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <input
                  type="text"
                  id="search-cedula"
                  placeholder="ej: V-12345678"
                  value={searchCedula}
                  onChange={(e) => setSearchCedula(e.target.value.replace(/[^\dVEve-]/g, ""))}
                  style={{ flex: 1, height: "42px" }}
                />
                <button type="submit" className="btn-submit" disabled={searching} style={{ height: "42px", width: "100px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {searching ? <span className="spinner spinner-sm"></span> : "Buscar"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 3. Panel de Carga de Consulta */}
      {searched && (
        <form onSubmit={handleSave} className="grid-responsive-2col" style={{ display: "grid", gap: "1.5rem" }}>
          
          {/* Columna Izquierda: Información Básica e Historial */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            
            {/* Ficha básica del paciente */}
            <div className="dashboard-section">
              <h3 className="dashboard-section-title" style={{ fontSize: "0.95rem" }}>Datos Básicos del Paciente</h3>
              <div className="wizard-step" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
                <div className="form-group">
                  <label>Cédula</label>
                  <input type="text" value={cedula} disabled style={{ backgroundColor: "var(--border-color)", opacity: 0.8 }} />
                </div>
                <div className="form-group">
                  <label>Nombre y Apellido</label>
                  <input
                    type="text"
                    value={nombreApellido}
                    onChange={(e) => setNombreApellido(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Género</label>
                  <select value={genero} onChange={(e) => setGenero(e.target.value)}>
                    <option value="MASCULINO">Masculino</option>
                    <option value="FEMENINO">Femenino</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Edad</label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={edad}
                    onChange={(e) => setEdad(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label>Campamento Transitorio (Refugio)</label>
                  <input type="text" value={refugio} disabled style={{ backgroundColor: "var(--border-color)", opacity: 0.8 }} />
                </div>
              </div>
            </div>

            {/* Antecedentes clínicos (Solo lectura) */}
            <div className="dashboard-section">
              <h3 className="dashboard-section-title" style={{ fontSize: "0.95rem", color: "var(--color-primary)" }}>Antecedentes Clínicos (Censo)</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className="detail-field" style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "var(--text-secondary)" }}>Patologías registradas en Censo:</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-primary)" }}>{antecedentesPatologia}</span>
                </div>
                
                <div className="detail-field" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "var(--text-secondary)" }}>Medicamentos registrados en Censo:</span>
                  {antecedentesMedicamentos.length === 0 ? (
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>Ningún medicamento registrado.</span>
                  ) : (
                    <div className="med-table-view" style={{ fontSize: "0.8rem" }}>
                      <div className="med-row med-row--header">
                        <span>Nombre</span>
                        <span>Dosis</span>
                        <span>Período</span>
                      </div>
                      {antecedentesMedicamentos.map((m, i) => (
                        <div key={i} className="med-row med-row--readonly">
                          <span>{m.nombre}</span>
                          <span>{m.dosis}</span>
                          <span>{m.periodo}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* Columna Derecha: Diagnóstico y Notas */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            
            {/* Diagnóstico médico */}
            <div className="dashboard-section">
              <h3 className="dashboard-section-title" style={{ fontSize: "0.95rem", color: "var(--color-success)" }}>Diagnóstico de Consulta</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ marginBottom: "0.5rem", display: "block" }}>Patologías Diagnósticas</label>
                  <div className="pathology-pills-grid" style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
                    {patologias.map(pName => {
                      const isSelected = diagnosticoPatologia
                        ? diagnosticoPatologia.split(",").map((s) => s.trim()).includes(pName)
                        : false;
                      return (
                        <button
                          key={pName}
                          type="button"
                          onClick={() => toggleDiagPathology(pName)}
                          style={{
                            padding: "0.4rem 0.75rem",
                            borderRadius: "15px",
                            border: isSelected ? "1.5px solid var(--color-success)" : "1px solid var(--border-color)",
                            backgroundColor: isSelected ? "rgba(16, 185, 129, 0.12)" : "var(--bg-secondary)",
                            color: isSelected ? "var(--color-success-hover, #059669)" : "var(--text-secondary)",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            cursor: "pointer",
                            transition: "all 0.12s ease",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            userSelect: "none"
                          }}
                        >
                          {pName}
                          {isSelected && <span>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Patologías: <strong>{diagnosticoPatologia || "(Ninguna seleccionada)"}</strong>
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <div className="med-section">
                    <div className="med-section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="med-section-title" style={{ fontSize: "0.8rem", fontWeight: "700" }}>Medicamentos Diagnósticados (Receta)</span>
                      <button type="button" className="btn-add-med" onClick={addMed} style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}>
                        + Agregar
                      </button>
                    </div>
                    {diagnosticoMedicamentos.length === 0 ? (
                      <p className="med-empty" style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic", margin: "8px 0 0 0" }}>Sin medicamentos recetados.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                        <div className="med-row med-row--header" style={{ fontSize: "0.75rem" }}>
                          <span>Nombre</span>
                          <span>Dosis</span>
                          <span>Período</span>
                          <span />
                        </div>
                        {diagnosticoMedicamentos.map((m, i) => (
                          <div key={i} className="med-row" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 24px", gap: "0.25rem" }}>
                            <input className="med-input" placeholder="ej: Ibuprofeno" value={m.nombre} onChange={e => updateMed(i, "nombre", e.target.value)} style={{ padding: "0.35rem", fontSize: "0.8rem" }} />
                            <input className="med-input" placeholder="ej: 400mg" value={m.dosis} onChange={e => updateMed(i, "dosis", e.target.value)} style={{ padding: "0.35rem", fontSize: "0.8rem" }} />
                            <input className="med-input" placeholder="ej: c/8h" value={m.periodo} onChange={e => updateMed(i, "periodo", e.target.value)} style={{ padding: "0.35rem", fontSize: "0.8rem" }} />
                            <button type="button" className="btn-remove-med" onClick={() => removeMed(i)} style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: "var(--text-muted)", fontSize: "1rem", cursor: "pointer" }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="notas-doctor">Notas Médicas / Observaciones</label>
                  <textarea
                    id="notas-doctor"
                    placeholder="Escriba aquí los comentarios del doctor..."
                    value={notasDoctor}
                    onChange={(e) => setNotasDoctor(e.target.value)}
                    style={{ height: "80px", marginTop: "0.5rem", fontSize: "0.8rem" }}
                  />
                </div>

              </div>
            </div>

            {/* Acciones del formulario */}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" onClick={handleReset} style={{ width: "120px", height: "42px", margin: 0 }}>
                Cancelar
              </button>
              <button type="submit" className="btn-submit" disabled={saving} style={{ width: "160px", height: "42px", margin: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {saving ? <span className="spinner spinner-sm"></span> : "Guardar Consulta"}
              </button>
            </div>

          </div>
          
        </form>
      )}

      {/* 4. Historial de Consultas */}
      <div className="dashboard-section">
        <h3 className="dashboard-section-title" style={{ fontSize: "0.95rem", marginBottom: "1rem" }}>Historial de Consultas Médicas</h3>
        {allConsultas.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "1.5rem 0", margin: 0 }}>No hay consultas registradas en este refugio.</p>
        ) : (
          <div className="matrix-table-wrapper" style={{ overflowX: "auto" }}>
            <table className="matrix-table" style={{ fontSize: "0.8rem", minWidth: "700px" }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cédula</th>
                  <th>Paciente</th>
                  <th>Diagnóstico</th>
                  <th>Notas del Dr.</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {allConsultas.map((c) => {
                  const dateStr = new Date(c.createdAt).toLocaleDateString("es-VE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <tr key={c.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{dateStr}</td>
                      <td style={{ fontWeight: "700" }}>{c.data.cedula}</td>
                      <td>{c.data.nombreApellido}</td>
                      <td>
                        {c.data.diagnosticoPatologia ? (
                          <span style={{ color: "var(--color-success-hover, #059669)", fontWeight: "600" }}>{c.data.diagnosticoPatologia}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Ninguno</span>
                        )}
                        {Array.isArray(c.data.diagnosticoMedicamentos) && c.data.diagnosticoMedicamentos.length > 0 && (
                          <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                            R: {c.data.diagnosticoMedicamentos.map((m: any) => `${m.nombre} (${m.dosis})`).join(", ")}
                          </div>
                        )}
                      </td>
                      <td style={{ maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.data.notasDoctor}>
                        {c.data.notasDoctor || "-"}
                      </td>
                      <td>
                        <span className={`sync-status-badge ${c.status === "synced" ? "synced" : c.status === "error" ? "error" : "pending"}`}>
                          {c.status === "synced" ? "Sincronizado" : c.status === "error" ? "Error" : "Pendiente"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
