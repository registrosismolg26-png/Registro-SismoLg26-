"use client";

import { useState, useEffect, useMemo } from "react";
import { useAppContext } from "@/context/AppContext";
import { apiFetch } from "@/lib/apiFetch";
import { normalizeText } from "@/lib/helpers";
import StyledSelect from "@/components/StyledSelect";
import ConfirmModal from "@/components/ConfirmModal";
import PlanteamientoSalaModal from "@/components/PlanteamientoSalaModal";
import PlanteamientoSalaEstatusModal from "@/components/PlanteamientoSalaEstatusModal";
import PlanteamientoSalaViewModal from "@/components/PlanteamientoSalaViewModal";
import PlanteamientoSalaGraficas from "@/components/PlanteamientoSalaGraficas";
import PlanteamientoSalaExportModal from "@/components/PlanteamientoSalaExportModal";
import PlanteamientoSalaGrupoFamiliarModal from "@/components/PlanteamientoSalaGrupoFamiliarModal";
import {
  ESTATUS_SALA_OPTIONS,
  CAMPAMENTOS_PLANTEAMIENTO_SALA,
  TIPO_OPCION_PLANTEAMIENTO_OPTIONS,
} from "@/lib/constants";
import type { PlanteamientoSalaItem } from "@/types";

const initialsOf = (name: string) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatDateDisplay = (dStr?: string | null): string => {
  if (!dStr) return "—";
  const clean = dStr.slice(0, 10);
  const parts = clean.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return clean;
};

export default function PlanteamientoSalaTab() {
  const { currentUser, showToast } = useAppContext();

  const campamentosSalaList = useMemo(() => {
    return CAMPAMENTOS_PLANTEAMIENTO_SALA.map((nombre) => ({
      id: nombre,
      nombre,
    }));
  }, []);

  // Submódulos: "informacion" (gestión de personas por campamento) y "graficas"
  const [subview, setSubview] = useState<"informacion" | "graficas">("informacion");

  // Selector de campamento (los 26 campamentos)
  const [selectedRefugio, setSelectedRefugio] = useState<string>("TODOS");

  // Filtro por Modalidad / Tipo de Opción
  const [selectedTipoOpcion, setSelectedTipoOpcion] = useState<string>("TODOS");

  const [items, setItems] = useState<PlanteamientoSalaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Modales
  const [showModal, setShowModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanteamientoSalaItem | null>(null);
  const [itemForStatus, setItemForStatus] = useState<PlanteamientoSalaItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<PlanteamientoSalaItem | null>(null);
  const [itemToView, setItemToView] = useState<PlanteamientoSalaItem | null>(null);
  const [itemForGrupoFamiliar, setItemForGrupoFamiliar] = useState<PlanteamientoSalaItem | null>(null);

  const loadItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedRefugio && selectedRefugio !== "TODOS") {
        params.set("refugio", selectedRefugio);
      }
      if (selectedTipoOpcion && selectedTipoOpcion !== "TODOS") {
        params.set("tipoOpcion", selectedTipoOpcion);
      }
      const q = params.toString() ? `?${params.toString()}` : "";
      const res = await apiFetch(`/api/planteamiento-sala${q}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && Array.isArray(data.items)) {
        setItems(data.items);
      } else {
        showToast(data?.error || "Error al cargar planteamientos.", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Error de conexión al obtener datos.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRefugio, selectedTipoOpcion]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = normalizeText(search);
    const qDigits = search.replace(/\D/g, "");
    return items.filter((it) => {
      if (normalizeText(it.nombreApellido).includes(q)) return true;
      if (it.cedula.includes(qDigits)) return true;
      if (normalizeText(it.refugio).includes(q)) return true;
      if (it.viviendaEdificacion && normalizeText(it.viviendaEdificacion).includes(q)) return true;
      if (it.viviendaDireccion && normalizeText(it.viviendaDireccion).includes(q)) return true;
      if (it.viviendaCircuitoComunal && normalizeText(it.viviendaCircuitoComunal).includes(q)) return true;
      if (it.observacion && normalizeText(it.observacion).includes(q)) return true;
      return false;
    });
  }, [items, search]);

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    try {
      const res = await apiFetch(`/api/planteamiento-sala/${encodeURIComponent(itemToDelete.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        showToast("Expediente eliminado.", "success");
        setItemToDelete(null);
        loadItems();
      } else {
        showToast(data?.error || "No se pudo eliminar el expediente.", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Error de conexión al eliminar.", "error");
    }
  };

  const getEstatusMeta = (val: string) => {
    return (
      ESTATUS_SALA_OPTIONS.find((e) => e.value === val) || {
        value: val,
        label: val,
        color: "#64748b",
        bg: "rgba(100, 116, 139, 0.12)",
      }
    );
  };

  return (
    <div className="tab-view tab-enter" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Cabecera Principal + Alternador de Submódulos */}
      <div
        className="asign-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div className="dashboard-section-title" style={{ fontSize: "1.35rem", fontWeight: 800 }}>
            Planteamiento Sala
          </div>
          <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Módulo exclusivo de supervisión y gestión de recaudos documentales por campamento.
          </p>
        </div>

        {/* Submódulos: Información vs Gráficas (Botonera agrupada segmentada) */}
        <div className="btn-seg-group">
          <button
            type="button"
            className={`toolbar-btn${subview === "informacion" ? " is-active" : ""}`}
            onClick={() => setSubview("informacion")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: "4px" }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span className="btn-txt-collapsible">Información</span>
          </button>
          <button
            type="button"
            className={`toolbar-btn${subview === "graficas" ? " is-active" : ""}`}
            onClick={() => setSubview("graficas")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: "4px" }}
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span className="btn-txt-collapsible">Gráficas</span>
          </button>
        </div>
      </div>

      {subview === "graficas" ? (
        <PlanteamientoSalaGraficas campamentosList={campamentosSalaList} showToast={showToast} />
      ) : (
        <>
          {/* Barra de Acciones del Submódulo Información */}
          <div
            className="sala-toolbar"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
              background: "var(--bg-secondary)",
              padding: "1rem 1.15rem",
              borderRadius: "16px",
              border: "1px solid var(--border-color)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
            }}
          >
            {/* Nivel 1: Filtros de Selección y Buscador */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap", width: "100%" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  whiteSpace: "nowrap",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: "var(--color-primary)" }}
                >
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                <span>Filtros:</span>
              </div>

              {/* Selector de Campamento */}
              <div style={{ minWidth: "260px", flex: "1 1 280px" }}>
                <StyledSelect
                  value={selectedRefugio}
                  onChange={setSelectedRefugio}
                  ariaLabel="Selector de campamento"
                  options={[
                    { value: "TODOS", label: "Todos los Campamentos (26)" },
                    ...campamentosSalaList.map((c) => ({ value: c.nombre, label: c.nombre })),
                  ]}
                />
              </div>

              {/* Selector de Modalidad */}
              <div style={{ minWidth: "220px", flex: "1 1 240px" }}>
                <StyledSelect
                  value={selectedTipoOpcion}
                  onChange={setSelectedTipoOpcion}
                  ariaLabel="Selector de modalidad"
                  options={[
                    { value: "TODOS", label: "Todas las Modalidades" },
                    ...TIPO_OPCION_PLANTEAMIENTO_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    })),
                  ]}
                />
              </div>

              {/* Buscador en la tabla */}
              <div style={{ position: "relative", minWidth: "240px", flex: "1 1 260px" }}>
                <div
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Buscar por cédula, nombre u obs…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: "100%",
                    height: "var(--ctl-h, 38px)",
                    borderRadius: "10px",
                    padding: "0 2rem 0 2.2rem",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-primary)",
                    fontSize: "0.85rem",
                  }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    title="Limpiar búsqueda"
                    style={{
                      position: "absolute",
                      right: "8px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      padding: "4px",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Nivel 2: Contador de Resultados y Botonera de Acciones Espaciosa */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.85rem",
                width: "100%",
                paddingTop: "0.75rem",
                borderTop: "1px solid var(--border-color)",
              }}
            >
              {/* Contador de Expedientes */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    background: "var(--bg-primary)",
                    padding: "5px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-primary)" }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <span>
                    Mostrando <b>{filteredItems.length}</b> de <b>{items.length}</b> expedientes
                  </span>
                </span>

                {selectedRefugio !== "TODOS" && (
                  <span
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--color-primary)",
                      fontWeight: 700,
                      background: "rgba(37,99,235,0.08)",
                      padding: "3px 10px",
                      borderRadius: "6px",
                      border: "1px solid rgba(37,99,235,0.2)",
                    }}
                  >
                    {selectedRefugio}
                  </span>
                )}
              </div>

              {/* Botonera de Acciones */}
              <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
                {/* Botón Descargar Excel */}
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => setShowExportModal(true)}
                  title="Descargar archivo Excel con opciones por modalidad"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    fontWeight: 600,
                    fontSize: "0.84rem",
                    padding: "0.45rem 1rem",
                    borderRadius: "9px",
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="16" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <span>Descargar Excel</span>
                </button>

                {/* Botón Actualizar */}
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={loadItems}
                  disabled={loading}
                  title="Actualizar listado"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "36px",
                    height: "36px",
                    padding: 0,
                    borderRadius: "9px",
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                </button>

                {/* Botón Cargar Persona */}
                <button
                  type="button"
                  className="toolbar-btn toolbar-btn--primary"
                  onClick={() => {
                    setEditingItem(null);
                    setShowModal(true);
                  }}
                  style={{
                    background: "var(--color-primary)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    padding: "0.45rem 1.15rem",
                    borderRadius: "9px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: "0 2px 6px rgba(37,99,235,0.22)",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Cargar Persona</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tabla de Personas Cargadas */}
          {loading ? (
            <div style={{ padding: "3rem", textAlign: "center" }}>
              <span className="spinner" style={{ width: "28px", height: "28px", margin: "0 auto 1rem" }} />
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Cargando expedientes…</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="reg-empty-state" style={{ padding: "3rem 1rem" }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p>No hay personas cargadas {selectedRefugio !== "TODOS" ? `en ${selectedRefugio}` : ""}</p>
              <span>Usa el botón "+ Cargar Persona" para ingresar una nueva ficha con su checklist de requisitos.</span>
            </div>
          ) : (
            <div className="registro-table-wrapper sala-table-wrapper">
              <table className="registro-table sala-table">
                <thead>
                  <tr>
                    <th className="col-num" style={{ width: "40px", textAlign: "center" }}>#</th>
                    <th style={{ minWidth: "210px" }}>Persona</th>
                    <th style={{ width: "140px", minWidth: "140px", textAlign: "center" }}>Modalidad</th>
                    <th style={{ minWidth: "170px", maxWidth: "220px" }}>Campamento</th>
                    <th style={{ width: "155px", minWidth: "155px" }}>Progreso / Carpeta</th>
                    <th style={{ width: "155px", minWidth: "155px", textAlign: "center" }}>Estatus / Subsidio</th>
                    <th className="sala-col-action" style={{ width: "175px", minWidth: "175px", textAlign: "center" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => {
                    const meta = getEstatusMeta(item.estatus);
                    const opcionMeta =
                      TIPO_OPCION_PLANTEAMIENTO_OPTIONS.find((o) => o.value === item.tipoOpcion) ||
                      TIPO_OPCION_PLANTEAMIENTO_OPTIONS[0];
                    const totalReq = opcionMeta.requisitosCount;
                    const cumplidos = Math.round((item.porcentajeProgreso / 100) * totalReq);

                    return (
                      <tr key={item.id} className="reg-row-enter">
                        <td className="col-num" style={{ textAlign: "center" }}>{idx + 1}</td>

                        {/* Persona (Datos personales limpios y legibles) */}
                        <td className="col-persona" style={{ minWidth: "210px" }}>
                          <div className="person-cell" style={{ gap: "10px" }}>
                            <span className="person-avatar" aria-hidden="true" style={{ width: "34px", height: "34px", minWidth: "34px", fontSize: "0.78rem" }}>
                              {initialsOf(item.nombreApellido)}
                            </span>
                            <div className="person-info" style={{ minWidth: 0 }}>
                              <div className="person-top">
                                <span className="person-name" style={{ fontSize: "0.86rem", fontWeight: 700 }}>
                                  {item.nombreApellido}
                                </span>
                              </div>
                              <div className="person-sub" style={{ fontSize: "0.74rem", color: "var(--text-secondary)", marginTop: "3px", display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                                <span className="person-cedula">C.I. <b>{item.cedula}</b></span>
                                {item.genero && (
                                  <span>· {item.genero === "MASCULINO" ? "M" : "F"}</span>
                                )}
                                {item.edad != null && (
                                  <span>· {item.edad}a</span>
                                )}
                                {item.telefono && (
                                  <span className="person-phone">· {item.telefono}</span>
                                )}
                                {Array.isArray(item.cargaFamiliar) && item.cargaFamiliar.length > 0 && (
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      background: "rgba(37,99,235,0.09)",
                                      color: "#2563eb",
                                      padding: "1px 6px",
                                      borderRadius: "4px",
                                      fontWeight: 700,
                                      whiteSpace: "nowrap",
                                      border: "1px solid rgba(37,99,235,0.2)",
                                    }}
                                    title={`${item.cargaFamiliar.length} familiar${item.cargaFamiliar.length === 1 ? "" : "es"} registrado${item.cargaFamiliar.length === 1 ? "" : "s"}`}
                                  >
                                    {item.cargaFamiliar.length} fam.
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Modalidad */}
                        <td style={{ textAlign: "center", width: "140px", minWidth: "140px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              padding: "3px 10px",
                              borderRadius: "999px",
                              background: opcionMeta.bg,
                              color: opcionMeta.color,
                              border: `1px solid ${opcionMeta.border}`,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {opcionMeta.shortLabel}
                          </span>
                        </td>

                        {/* Campamento */}
                        <td style={{ fontSize: "0.8rem", fontWeight: 600, minWidth: "170px", maxWidth: "220px", lineHeight: "1.3" }}>
                          <span
                            style={{
                              display: "inline-block",
                              background: "rgba(0,0,0,0.05)",
                              padding: "3px 8px",
                              borderRadius: "6px",
                              maxWidth: "100%",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "normal",
                            }}
                            title={item.refugio}
                          >
                            {item.refugio}
                          </span>
                        </td>

                        {/* Progreso / Carpeta */}
                        <td style={{ width: "155px", minWidth: "155px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem" }}>
                              <span style={{ fontWeight: 600 }}>
                                {cumplidos} de {totalReq}
                              </span>
                              <span
                                style={{
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
                                height: "6px",
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
                                      ? "#2563eb"
                                      : "#d97706",
                                  borderRadius: "999px",
                                }}
                              />
                            </div>
                            <div
                              style={{ fontSize: "0.68rem", color: "var(--text-secondary)", marginTop: "2px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                              title="Fecha de entrega de carpeta (fecha en que se cargó la persona)"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                              </svg>
                              <span>{formatDateDisplay(item.fechaEntregaCarpeta || item.createdAt)}</span>
                            </div>
                          </div>
                        </td>

                        {/* Estatus / Subsidio */}
                        <td style={{ textAlign: "center", width: "155px", minWidth: "155px" }}>
                          <button
                            type="button"
                            onClick={() => setItemForStatus(item)}
                            title="Haz clic para cambiar estatus y observación"
                            style={{
                              border: "none",
                              cursor: "pointer",
                              padding: "3px 9px",
                              borderRadius: "999px",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              background: meta.bg,
                              color: meta.color,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <span>{meta.label}</span>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          {item.estatus === "CREDITO ENTREGADO" && (item.fechaEntregaSubsidio || item.updatedAt) && (
                            <div
                              style={{ fontSize: "0.68rem", color: "#059669", fontWeight: 700, marginTop: "2px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                              title="Fecha de entrega de subsidio"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                                <line x1="1" y1="10" x2="23" y2="10" />
                              </svg>
                              <span>{formatDateDisplay(item.fechaEntregaSubsidio || item.updatedAt)}</span>
                            </div>
                          )}
                        </td>

                        {/* Acciones */}
                        <td className="sala-col-action">
                          <div className="sala-actions-group">
                            {/* Visualizar Avance del Planteamiento */}
                            <button
                              type="button"
                              className="btn-ver btn-ver--view sala-btn-action"
                              aria-label="Ver avance del planteamiento"
                              data-tip="Ver Avance"
                              onClick={() => setItemToView(item)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>

                            {/* Ver Grupo Familiar */}
                            <button
                              type="button"
                              className="btn-ver btn-ver--view sala-btn-action"
                              aria-label="Ver grupo familiar de la persona"
                              data-tip="Ver Grupo Familiar"
                              onClick={() => setItemForGrupoFamiliar(item)}
                              style={{
                                color: Array.isArray(item.cargaFamiliar) && item.cargaFamiliar.length > 0 ? "#2563eb" : undefined,
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                              </svg>
                            </button>

                            {/* Cambiar Estatus */}
                            <button
                              type="button"
                              className="btn-ver btn-ver--view sala-btn-action"
                              aria-label="Cambiar estatus y observación"
                              data-tip="Estatus / Obs"
                              onClick={() => setItemForStatus(item)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                            </button>

                            {/* Editar Requisitos */}
                            <button
                              type="button"
                              className="btn-ver btn-ver--edit sala-btn-action"
                              aria-label="Editar requisitos documentales"
                              data-tip="Editar Requisitos"
                              onClick={() => {
                                setEditingItem(item);
                                setShowModal(true);
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                              </svg>
                            </button>

                            {/* Eliminar */}
                            <button
                              type="button"
                              className="btn-ver sala-btn-action"
                              aria-label="Eliminar expediente"
                              data-tip="Eliminar"
                              style={{ color: "var(--color-danger)" }}
                              onClick={() => setItemToDelete(item)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal de Carga / Edición Completa */}
      <PlanteamientoSalaModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingItem(null);
        }}
        onSaved={loadItems}
        itemToEdit={editingItem}
        defaultRefugio={selectedRefugio !== "TODOS" ? selectedRefugio : undefined}
        campamentosList={campamentosSalaList}
        showToast={showToast}
      />

      {/* Modal de Cambio Rápido de Estatus y Observación */}
      <PlanteamientoSalaEstatusModal
        isOpen={itemForStatus !== null}
        onClose={() => setItemForStatus(null)}
        onUpdated={loadItems}
        item={itemForStatus}
        showToast={showToast}
      />

      {/* Modal de Visualización Detallada del Planteamiento */}
      <PlanteamientoSalaViewModal
        isOpen={itemToView !== null}
        onClose={() => setItemToView(null)}
        item={itemToView}
        onEdit={(it) => {
          setEditingItem(it);
          setShowModal(true);
        }}
      />

      {/* Modal de Grupo Familiar */}
      <PlanteamientoSalaGrupoFamiliarModal
        isOpen={itemForGrupoFamiliar !== null}
        onClose={() => setItemForGrupoFamiliar(null)}
        item={itemForGrupoFamiliar}
        onEdit={(it) => {
          setItemForGrupoFamiliar(null);
          setEditingItem(it);
          setShowModal(true);
        }}
      />

      {/* Modal de Selección y Descarga de Excel por Modalidad */}
      <PlanteamientoSalaExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        selectedRefugio={selectedRefugio}
        items={items}
        showToast={showToast}
      />

      {/* Modal de Confirmación de Eliminación */}
      {itemToDelete && (
        <ConfirmModal
          title="Eliminar Expediente"
          message={`¿Estás seguro de que deseas eliminar a ${itemToDelete.nombreApellido} (C.I. ${itemToDelete.cedula}) de Planteamiento Sala?`}
          highlight={`${itemToDelete.nombreApellido} · ${itemToDelete.refugio}`}
          onConfirm={handleDeleteConfirm}
          onClose={() => setItemToDelete(null)}
        />
      )}
    </div>
  );
}
