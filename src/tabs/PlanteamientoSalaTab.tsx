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
import { ESTATUS_SALA_OPTIONS, CAMPAMENTOS_PLANTEAMIENTO_SALA } from "@/lib/constants";
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

  const [items, setItems] = useState<PlanteamientoSalaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Modales
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanteamientoSalaItem | null>(null);
  const [itemForStatus, setItemForStatus] = useState<PlanteamientoSalaItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<PlanteamientoSalaItem | null>(null);
  const [itemToView, setItemToView] = useState<PlanteamientoSalaItem | null>(null);

  const loadItems = async () => {
    setLoading(true);
    try {
      const q = selectedRefugio && selectedRefugio !== "TODOS"
        ? `?refugio=${encodeURIComponent(selectedRefugio)}`
        : "";
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
  }, [selectedRefugio]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = normalizeText(search);
    const qDigits = search.replace(/\D/g, "");
    return items.filter((it) => {
      if (normalizeText(it.nombreApellido).includes(q)) return true;
      if (it.cedula.includes(qDigits)) return true;
      if (normalizeText(it.refugio).includes(q)) return true;
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
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              background: "var(--bg-secondary)",
              padding: "0.85rem 1rem",
              borderRadius: "16px",
              border: "1px solid var(--border-color)",
            }}
          >
            {/* Selector de Campamento (los 26 campamentos) */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", flex: 1 }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>Campamento:</span>
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

              {/* Buscador en la tabla */}
              <div style={{ position: "relative", minWidth: "200px", flex: "1 1 220px" }}>
                <input
                  type="text"
                  placeholder="Buscar por cédula, nombre u obs…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: "100%",
                    height: "var(--ctl-h, 38px)",
                    borderRadius: "999px",
                    padding: "0 1rem",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-primary)",
                  }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Botón Cargar Persona y Actualizar */}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button
                type="button"
                className="toolbar-btn"
                onClick={loadItems}
                disabled={loading}
                title="Actualizar listado"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>

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
                  fontWeight: 600,
                  padding: "0 1.1rem",
                }}
              >
                + Cargar Persona
              </button>
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
            <div className="registro-table-wrapper">
              <table className="registro-table">
                <thead>
                  <tr>
                    <th className="col-num" style={{ width: "36px" }}>#</th>
                    <th>Persona</th>
                    <th>Campamento</th>
                    <th style={{ minWidth: "160px" }}>Progreso de Requisitos</th>
                    <th>Estatus</th>
                    <th>Observaciones</th>
                    <th className="col-action" style={{ width: "110px", textAlign: "center" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => {
                    const meta = getEstatusMeta(item.estatus);
                    return (
                      <tr key={item.id} className="reg-row-enter">
                        <td className="col-num">{idx + 1}</td>

                        {/* Persona */}
                        <td className="col-persona">
                          <div className="person-cell">
                            <span className="person-avatar" aria-hidden="true">
                              {initialsOf(item.nombreApellido)}
                            </span>
                            <div className="person-info">
                              <div className="person-top">
                                <span className="person-name">{item.nombreApellido}</span>
                              </div>
                              <div className="person-sub">
                                <span className="person-cedula">C.I. {item.cedula}</span>
                                {item.telefono && (
                                  <span className="person-phone"> · {item.telefono}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Campamento */}
                        <td style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                          <span
                            style={{
                              display: "inline-block",
                              background: "rgba(0,0,0,0.05)",
                              padding: "3px 8px",
                              borderRadius: "999px",
                            }}
                          >
                            {item.refugio}
                          </span>
                        </td>

                        {/* Progreso */}
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                              <span style={{ fontWeight: 600 }}>
                                {Math.round((item.porcentajeProgreso / 100) * 9)} de 9
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
                                height: "7px",
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
                          </div>
                        </td>

                        {/* Estatus */}
                        <td>
                          <button
                            type="button"
                            onClick={() => setItemForStatus(item)}
                            title="Haz clic para cambiar estatus y observación"
                            style={{
                              border: "none",
                              cursor: "pointer",
                              padding: "4px 10px",
                              borderRadius: "999px",
                              fontSize: "0.76rem",
                              fontWeight: 700,
                              background: meta.bg,
                              color: meta.color,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <span>{meta.label}</span>
                            <span style={{ fontSize: "0.65rem", opacity: 0.8 }}>✎</span>
                          </button>
                        </td>

                        {/* Observaciones */}
                        <td style={{ fontSize: "0.82rem", color: "var(--text-secondary)", maxWidth: "200px" }}>
                          {item.observacion ? (
                            <span title={item.observacion} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.observacion}
                            </span>
                          ) : (
                            <span style={{ opacity: 0.5 }}>—</span>
                          )}
                        </td>

                        {/* Acciones */}
                        <td className="col-action">
                          <div className="row-actions" style={{ justifyContent: "center" }}>
                            {/* Visualizar Ficha Completa */}
                            <button
                              type="button"
                              className="btn-ver btn-ver--view"
                              aria-label="Visualizar planteamiento"
                              data-tip="Visualizar"
                              onClick={() => setItemToView(item)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>

                            {/* Cambiar Estatus */}
                            <button
                              type="button"
                              className="btn-ver btn-ver--view"
                              aria-label="Cambiar estatus y observación"
                              data-tip="Estatus / Obs"
                              onClick={() => setItemForStatus(item)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                            </button>

                            {/* Editar Requisitos */}
                            <button
                              type="button"
                              className="btn-ver btn-ver--edit"
                              aria-label="Editar requisitos documentales"
                              data-tip="Editar Requisitos"
                              onClick={() => {
                                setEditingItem(item);
                                setShowModal(true);
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                              </svg>
                            </button>

                            {/* Eliminar */}
                            <button
                              type="button"
                              className="btn-ver"
                              aria-label="Eliminar expediente"
                              data-tip="Eliminar"
                              style={{ color: "var(--color-danger)" }}
                              onClick={() => setItemToDelete(item)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
