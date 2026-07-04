"use client";

import { useState, useMemo } from "react";
import { useAppContext } from "@/context/AppContext";
import { saveLocalConsulta, buscarCedulaEnCliente, saveLocal } from "@/lib/db";
import { patologiaNombre, medLabel, medItemsText } from "@/lib/helpers";
import SearchableSelect from "@/components/SearchableSelect";
import StyledSelect from "@/components/StyledSelect";
import { PERIODO_OPTIONS } from "@/lib/constants";
import type { Medicamento } from "@/types";

const GENERO_OPTS = [{ value: "MASCULINO", label: "Masculino" }, { value: "FEMENINO", label: "Femenino" }];
const PERIODO_OPTS = [{ value: "", label: "Período…" }, ...PERIODO_OPTIONS.map((op) => ({ value: op, label: op }))];

// Edad (a hoy) a partir de una fecha yyyy-mm-dd. Siempre se recalcula desde la fecha.
const computeEdad = (ymd: string): string => {
  if (!ymd) return "";
  const d = new Date(ymd + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 ? String(age) : "";
};
const ymdFromISO = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

export default function MorbilidadTab() {
  const {
    currentUser,
    registros,
    setRegistros,
    refreshLocalRecords,
    patologias,
    consultas,
    localConsultas,
    refreshLocalConsultas,
    triggerSync,
    showToast,
    effectiveRefugio,
    predefinedMedicamentos,
  } = useAppContext();

  // Búsqueda y formulario
  const [searchCedula, setSearchCedula] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Datos Básicos del Paciente
  const [cedula, setCedula] = useState("");
  const [registroId, setRegistroId] = useState<string | undefined>(undefined);  // UID del registro del censo
  const [matchedRegistro, setMatchedRegistro] = useState<any | null>(null);     // registro completo (para actualizar el censo)
  const [nombreApellido, setNombreApellido] = useState("");
  const [genero, setGenero] = useState("MASCULINO");
  const [fechaNacimiento, setFechaNacimiento] = useState(""); // yyyy-mm-dd (editable)
  const [edad, setEdad] = useState("");                       // calculada desde la fecha
  const [refugio, setRefugio] = useState(effectiveRefugio || "");

  const onFechaChange = (ymd: string) => { setFechaNacimiento(ymd); setEdad(computeEdad(ymd)); };

  // Antecedentes del censo — EDITABLES (guardar actualiza el registro del censo). Por-ID.
  const [antecedentesPatologiaIds, setAntecedentesPatologiaIds] = useState<string[]>([]);
  const [antecedentesMedicamentoIds, setAntecedentesMedicamentoIds] = useState<Medicamento[]>([]);

  // Diagnóstico de esta consulta (modificable) — por-ID.
  const [diagnosticoPatologiaIds, setDiagnosticoPatologiaIds] = useState<string[]>([]);
  const [diagnosticoMedicamentoIds, setDiagnosticoMedicamentoIds] = useState<Medicamento[]>([]);
  const [notasDoctor, setNotasDoctor] = useState("");

  const [saving, setSaving] = useState(false);

  // Animación de salida: marca una clave (namespaced) como "saliendo" y la remueve al terminar.
  const [exiting, setExiting] = useState<Record<string, boolean>>({});
  const animateOut = (key: string, remove: () => void) => {
    setExiting((e) => ({ ...e, [key]: true }));
    window.setTimeout(() => {
      remove();
      setExiting((e) => { const n = { ...e }; delete n[key]; return n; });
    }, 200);
  };

  // Agregar un medicamento (nombre y dosis salen del catálogo por ID; dosis = concentración).
  const buildMedItem = (medId: string): Medicamento | null => {
    const match = predefinedMedicamentos.find((m) => m.id === medId);
    if (!match) return null;
    return { id: match.id, dosis: match.concentracion || "", periodo: "" };
  };

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

    // 1. Buscar en registros censados (estado registros)
    const localMatch = registros.find(
      (r) => r.cedula.replace(/\D/g, "") === cleanCedula && r.retirado !== "SI"
    );

    if (localMatch) {
      setRegistroId(localMatch.id);   // vinculación por UID
      setMatchedRegistro(localMatch);
      setNombreApellido(localMatch.nombreApellido);
      setGenero(localMatch.genero);
      const fnCenso = ymdFromISO(localMatch.fechaNacimiento);
      setFechaNacimiento(fnCenso);
      setEdad(fnCenso ? computeEdad(fnCenso) : String(localMatch.edad ?? "")); // recalcula a hoy
      setRefugio(localMatch.refugio);
      setAntecedentesPatologiaIds(Array.isArray(localMatch.patologiaIds) ? localMatch.patologiaIds : []);
      setAntecedentesMedicamentoIds(Array.isArray(localMatch.medicamentoIds) ? localMatch.medicamentoIds : []);
      showToast("Paciente encontrado en el Censo.", "success");
    } else {
      // 2. Buscar en Padrón Electoral local en IndexedDB
      try {
        const padronMatch = await buscarCedulaEnCliente(cleanCedula);
        setRegistroId(undefined);
        setMatchedRegistro(null);
        setAntecedentesPatologiaIds([]);
        setAntecedentesMedicamentoIds([]);
        if (padronMatch) {
          setNombreApellido(padronMatch.nombreCompleto);
          setGenero(padronMatch.sexo === "M" ? "MASCULINO" : "FEMENINO");
          const fnPad = ymdFromISO(padronMatch.fechaNacimiento);
          setFechaNacimiento(fnPad);
          setEdad(computeEdad(fnPad));
          setRefugio(effectiveRefugio || currentUser?.campamentoTransitorio || "");
          showToast("Paciente encontrado en el Padrón.", "info");
        } else {
          setNombreApellido("");
          setGenero("MASCULINO");
          setFechaNacimiento("");
          setEdad("");
          setRefugio(effectiveRefugio || currentUser?.campamentoTransitorio || "");
          showToast("No encontrado. Rellene los datos manualmente.", "warning");
        }
      } catch (err) {
        console.error(err);
        showToast("Error al buscar en el padrón.", "error");
      }
    }
    setSearching(false);
  };

  // --- ANTECEDENTES (editables) ---
  const addAntPatologia = (id: string) => { if (id) setAntecedentesPatologiaIds((p) => (p.includes(id) ? p : [...p, id])); };
  const removeAntPatologia = (id: string) => setAntecedentesPatologiaIds((p) => p.filter((x) => x !== id));
  const addAntMed = (medId: string) => {
    const item = buildMedItem(medId);
    if (item && !antecedentesMedicamentoIds.some((x) => x.id === medId)) setAntecedentesMedicamentoIds((p) => [...p, item]);
  };
  const removeAntMed = (id: string) => setAntecedentesMedicamentoIds((p) => p.filter((m) => m.id !== id));
  const updateAntMed = (i: number, field: "dosis" | "periodo", value: string) =>
    setAntecedentesMedicamentoIds((p) => p.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));

  // --- DIAGNÓSTICO ---
  const addDiagPatologia = (id: string) => { if (id) setDiagnosticoPatologiaIds((p) => (p.includes(id) ? p : [...p, id])); };
  const removeDiagPatologia = (id: string) => setDiagnosticoPatologiaIds((p) => p.filter((x) => x !== id));
  const addDiagMed = (medId: string) => {
    const item = buildMedItem(medId);
    if (item && !diagnosticoMedicamentoIds.some((x) => x.id === medId)) setDiagnosticoMedicamentoIds((p) => [...p, item]);
  };
  const removeDiagMed = (id: string) => setDiagnosticoMedicamentoIds((p) => p.filter((m) => m.id !== id));
  const updateDiagMed = (i: number, field: "dosis" | "periodo", value: string) =>
    setDiagnosticoMedicamentoIds((p) => p.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));

  // --- RESET STATE ---
  const handleReset = () => {
    setSearchCedula("");
    setSearched(false);
    setCedula("");
    setRegistroId(undefined);
    setMatchedRegistro(null);
    setNombreApellido("");
    setGenero("MASCULINO");
    setFechaNacimiento("");
    setEdad("");
    setRefugio(effectiveRefugio || "");
    setAntecedentesPatologiaIds([]);
    setAntecedentesMedicamentoIds([]);
    setDiagnosticoPatologiaIds([]);
    setDiagnosticoMedicamentoIds([]);
    setNotasDoctor("");
  };

  // Al guardar, si el paciente está en el censo, propaga los cambios de Datos Básicos
  // (nombre, género, fecha de nacimiento, edad) y de Antecedentes al Registro del censo.
  const syncPatientToRegistro = async () => {
    if (!matchedRegistro) return;
    const prevPat = Array.isArray(matchedRegistro.patologiaIds) ? matchedRegistro.patologiaIds : [];
    const prevMed = Array.isArray(matchedRegistro.medicamentoIds) ? matchedRegistro.medicamentoIds : [];
    const prevFechaYmd = ymdFromISO(matchedRegistro.fechaNacimiento);
    const nuevaEdad = edad ? parseInt(edad) : null;
    const changed =
      JSON.stringify(antecedentesPatologiaIds) !== JSON.stringify(prevPat) ||
      JSON.stringify(antecedentesMedicamentoIds) !== JSON.stringify(prevMed) ||
      nombreApellido.trim() !== (matchedRegistro.nombreApellido || "") ||
      genero !== matchedRegistro.genero ||
      (fechaNacimiento || "") !== (prevFechaYmd || "") ||
      nuevaEdad !== (matchedRegistro.edad ?? null);
    if (!changed) return;

    const patologia = antecedentesPatologiaIds.length > 0 ? "SI" : "NO";
    const updatedReg = {
      ...matchedRegistro,
      nombreApellido: nombreApellido.trim() || matchedRegistro.nombreApellido,
      genero,
      fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento + "T00:00:00").toISOString() : matchedRegistro.fechaNacimiento,
      edad: nuevaEdad ?? matchedRegistro.edad,
      patologia,
      patologiaIds: antecedentesPatologiaIds,
      medicamentoIds: antecedentesMedicamentoIds,
    };
    setRegistros((prev) => {
      const next = prev.map((r) => (r.id === updatedReg.id ? updatedReg : r));
      if (typeof window !== "undefined") localStorage.setItem("cached_registros", JSON.stringify(next));
      return next;
    });
    setMatchedRegistro(updatedReg);
    const regUpdate = {
      id: updatedReg.id,
      type: "update" as const,
      refugio: matchedRegistro.refugio || currentUser?.campamentoTransitorio,
      userId: currentUser?.id,
      data: updatedReg,
    };
    await saveLocal(regUpdate);
    await refreshLocalRecords();
    showToast("Datos del paciente actualizados en el censo.", "info");
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
        registroId,
        genero,
        edad: edad ? parseInt(edad) : undefined,
        refugio,
        antecedentesPatologiaIds,
        antecedentesMedicamentoIds,
        diagnosticoPatologiaIds,
        diagnosticoMedicamentoIds: diagnosticoMedicamentoIds.filter((m) => m.id),
        notasDoctor: notasDoctor.trim() || undefined,
      },
      userId: currentUser?.email,
    };
    try {
      await saveLocalConsulta(localConsultaData);
      await syncPatientToRegistro();
      showToast("Consulta médica registrada localmente.", "success");
      handleReset();
      await refreshLocalConsultas();
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
            registroId: c.registroId,
            genero: c.genero,
            edad: c.edad,
            refugio: c.refugio,
            antecedentesPatologiaIds: c.antecedentesPatologiaIds || [],
            antecedentesMedicamentoIds: c.antecedentesMedicamentoIds || [],
            diagnosticoPatologiaIds: c.diagnosticoPatologiaIds || [],
            diagnosticoMedicamentoIds: c.diagnosticoMedicamentoIds || [],
            notasDoctor: c.notasDoctor,
          },
          status: "synced",
          attempts: 0,
          createdAt: c.createdAt,
          userId: c.userId,
        });
      }
    });
    return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [localConsultas, consultas]);

  // Opciones para los buscadores (excluyendo lo ya elegido).
  const patologiaOptions = (excluir: string[]) =>
    patologias.filter((p) => !excluir.includes(p.id)).map((p) => ({ value: p.id, label: p.nombre }));
  const medOptions = (excluir: Medicamento[]) =>
    predefinedMedicamentos
      .filter((m) => !excluir.some((x) => x.id === m.id))
      .map((m) => ({ value: m.id, label: [m.nombre, m.concentracion, m.presentacion].filter(Boolean).join(" · ") }));

  // ── Render helpers (funciones, no componentes: evita remonte de inputs) ──
  const patologiaChips = (ids: string[], onRemove: (id: string) => void, variant: "primary" | "success", ns: string) => (
    <div className="morb-pills">
      {ids.length === 0 ? (
        <span className="morb-pills__empty">(Ninguna seleccionada)</span>
      ) : ids.map((id) => {
        const key = `${ns}:${id}`;
        return (
          <span key={id} className={`morb-pill morb-pill--${variant} ${exiting[key] ? "morb-pill--out" : ""}`}>
            {patologiaNombre(id, patologias)}
            <button type="button" className="morb-pill__x" aria-label="Quitar" onClick={() => animateOut(key, () => onRemove(id))}>×</button>
          </span>
        );
      })}
    </div>
  );

  const medRowsView = (items: Medicamento[], onUpdate: (i: number, f: "dosis" | "periodo", v: string) => void, onRemove: (id: string) => void, ns: string) => (
    items.length === 0 ? (
      <p className="morb-meds__empty">Sin medicamentos. Búscalo y agrégalo del catálogo.</p>
    ) : (
      <div className="morb-meds">
        <div className="morb-meds__head"><span>Medicamento</span><span>Dosis</span><span>Período</span><span /></div>
        {items.map((m, i) => {
          const key = `${ns}:${m.id}`;
          return (
            <div key={m.id} className={`morb-med ${exiting[key] ? "morb-med--out" : ""}`}>
              <span className="morb-med__name" title={medLabel(m.id, predefinedMedicamentos)}>{medLabel(m.id, predefinedMedicamentos)}</span>
              <span className="morb-med__dosis" title={m.dosis}>{m.dosis || "—"}</span>
              <StyledSelect dense value={m.periodo} onChange={(v) => onUpdate(i, "periodo", v)} options={PERIODO_OPTS} placeholder="Período…" ariaLabel="Período" />
              <button type="button" className="morb-med__x" aria-label="Quitar" onClick={() => animateOut(key, () => onRemove(m.id))}>×</button>
            </div>
          );
        })}
      </div>
    )
  );

  return (
    <div className="tab-view morb">
      {/* 1. Header */}
      <div className="morb-head">
        <h2>Consultas Médicas (Morbilidad)</h2>
        <p>Registro clínico y diagnóstico de pacientes refugiados</p>
      </div>

      {/* 2. Buscador por Cédula */}
      {!searched && (
        <div className="morb-search">
          <form onSubmit={handleSearch} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div className="morb-field">
              <label className="morb-field__label" htmlFor="search-cedula">Buscar paciente por cédula</label>
              <div className="morb-search__row">
                <input
                  className="morb-control"
                  type="text"
                  id="search-cedula"
                  placeholder="ej: V-12345678"
                  value={searchCedula}
                  onChange={(e) => setSearchCedula(e.target.value.replace(/[^\dVEve-]/g, ""))}
                />
                <button type="submit" className="morb-btn morb-btn--primary" disabled={searching} style={{ minWidth: "104px" }}>
                  {searching ? <span className="spinner spinner-sm" /> : "Buscar"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 3. Panel de Carga de Consulta */}
      {searched && (
        <form onSubmit={handleSave} className="morb-form">
          {/* Datos Básicos — ocupa todo el ancho */}
          <div className="morb-card morb-card--primary">
            <h3 className="morb-card__title">Datos Básicos del Paciente</h3>
            <div className="morb-basic">
              <div className="morb-field">
                <label className="morb-field__label">Cédula</label>
                <input className="morb-control" type="text" value={cedula} disabled />
              </div>
              <div className="morb-field">
                <label className="morb-field__label">Nombre y Apellido</label>
                <input className="morb-control" type="text" value={nombreApellido} onChange={(e) => setNombreApellido(e.target.value)} required />
              </div>
              <div className="morb-field">
                <label className="morb-field__label">Género</label>
                <StyledSelect value={genero} onChange={setGenero} options={GENERO_OPTS} ariaLabel="Género" />
              </div>
              <div className="morb-field">
                <label className="morb-field__label">Fecha de Nacimiento</label>
                <input className="morb-control" type="date" value={fechaNacimiento} max={ymdFromISO(new Date().toISOString())} onChange={(e) => onFechaChange(e.target.value)} />
              </div>
              <div className="morb-field">
                <label className="morb-field__label">Edad (años)</label>
                <input className="morb-control" type="text" value={edad === "" ? "—" : edad} disabled title="Se calcula automáticamente de la fecha de nacimiento" />
              </div>
              <div className="morb-field full">
                <label className="morb-field__label">Campamento Transitorio (Refugio)</label>
                <input className="morb-control" type="text" value={refugio} disabled />
              </div>
            </div>
          </div>

          {/* Antecedentes | Diagnóstico — 2 columnas simétricas */}
          <div className="morb-duo">
            <div className="morb-card morb-card--primary">
              <h3 className="morb-card__title">Antecedentes Clínicos (Censo)</h3>
              <p className="morb-hint">
                {matchedRegistro ? "Editables: al guardar la consulta se actualizan en el censo del paciente." : "El paciente no está en el censo; estos datos solo quedan en la consulta."}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                <div className="morb-field">
                  <label className="morb-field__label">Patologías del paciente</label>
                  <SearchableSelect inputClassName="morb-control" placeholder="Buscar y agregar patología…" options={patologiaOptions(antecedentesPatologiaIds)} onSelect={addAntPatologia} />
                  {patologiaChips(antecedentesPatologiaIds, removeAntPatologia, "primary", "antpat")}
                </div>
                <div className="morb-field">
                  <label className="morb-field__label">Medicamentos del paciente</label>
                  <SearchableSelect inputClassName="morb-control" placeholder="Buscar y agregar medicamento…" options={medOptions(antecedentesMedicamentoIds)} onSelect={addAntMed} />
                  {medRowsView(antecedentesMedicamentoIds, updateAntMed, removeAntMed, "antmed")}
                </div>
              </div>
            </div>

            <div className="morb-card morb-card--success">
              <h3 className="morb-card__title">Diagnóstico de Consulta</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                <div className="morb-field">
                  <label className="morb-field__label">Patologías Diagnósticas</label>
                  <SearchableSelect inputClassName="morb-control" placeholder="Buscar y agregar patología…" options={patologiaOptions(diagnosticoPatologiaIds)} onSelect={addDiagPatologia} />
                  {patologiaChips(diagnosticoPatologiaIds, removeDiagPatologia, "success", "diagpat")}
                </div>
                <div className="morb-field">
                  <label className="morb-field__label">Medicamentos Diagnósticados (Receta)</label>
                  <SearchableSelect inputClassName="morb-control" placeholder="Buscar y agregar medicamento…" options={medOptions(diagnosticoMedicamentoIds)} onSelect={addDiagMed} />
                  {medRowsView(diagnosticoMedicamentoIds, updateDiagMed, removeDiagMed, "diagmed")}
                </div>
                <div className="morb-field">
                  <label className="morb-field__label" htmlFor="notas-doctor">Notas Médicas / Observaciones</label>
                  <textarea className="morb-control" id="notas-doctor" placeholder="Escriba aquí los comentarios del doctor..." value={notasDoctor} onChange={(e) => setNotasDoctor(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="morb-actions">
            <button type="button" className="morb-btn morb-btn--ghost" onClick={handleReset}>Cancelar</button>
            <button type="submit" className="morb-btn morb-btn--primary" disabled={saving} style={{ minWidth: "160px" }}>
              {saving ? <span className="spinner spinner-sm" /> : "Guardar Consulta"}
            </button>
          </div>
        </form>
      )}

      {/* 4. Historial de Consultas */}
      <div className="morb-card">
        <h3 className="morb-card__title" style={{ marginBottom: "1rem" }}>Historial de Consultas Médicas</h3>
        {allConsultas.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "1.5rem 0", margin: 0 }}>No hay consultas registradas en este refugio.</p>
        ) : (
          <div className="morb-history__scroll">
            <table className="matrix-table" style={{ fontSize: "0.8rem", minWidth: "700px" }}>
              <thead>
                <tr>
                  <th>Fecha</th><th>Cédula</th><th>Paciente</th><th>Diagnóstico</th><th>Notas del Dr.</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {allConsultas.map((c) => {
                  const dateStr = new Date(c.createdAt).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
                  const diagPatIds: string[] = Array.isArray(c.data.diagnosticoPatologiaIds) ? c.data.diagnosticoPatologiaIds : [];
                  const diagMeds: Medicamento[] = Array.isArray(c.data.diagnosticoMedicamentoIds) ? c.data.diagnosticoMedicamentoIds : [];
                  return (
                    <tr key={c.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{dateStr}</td>
                      <td style={{ fontWeight: "700" }}>{c.data.cedula}</td>
                      <td>{c.data.nombreApellido}</td>
                      <td>
                        {diagPatIds.length > 0 ? (
                          <span style={{ color: "var(--color-success)", fontWeight: "600" }}>{diagPatIds.map((id) => patologiaNombre(id, patologias)).join(", ")}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Ninguno</span>
                        )}
                        {diagMeds.length > 0 && (
                          <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "4px" }}>R: {medItemsText(diagMeds, predefinedMedicamentos)}</div>
                        )}
                      </td>
                      <td style={{ maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.data.notasDoctor}>{c.data.notasDoctor || "-"}</td>
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
