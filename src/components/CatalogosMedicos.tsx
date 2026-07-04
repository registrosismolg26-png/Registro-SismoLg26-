"use client";

// ── Catálogos Médicos (patologías y medicamentos) ───────────────────────────
// Dos botones discretos + sus modales, ubicados DENTRO de Morbilidad (antes vivían
// en Configuración). Permisos:
//   · Ver/usar los botones y CREAR/EDITAR → canEditCatalogosMedicos (Master, AdminMedico, OperadorMedico)
//   · ELIMINAR                            → canManageCatalogosMedicos (Master, AdminMedico)
// Todo "full pill" (envuelto en .pill-form) y responsive; el fondo no hace scroll
// mientras un modal está abierto (useBodyScrollLock).

import { useState } from "react";
import { useAppContext } from "@/context/AppContext";
import { apiFetch } from "@/lib/apiFetch";
import { normalizeText } from "@/lib/helpers";
import { canEditCatalogosMedicos, canManageCatalogosMedicos } from "@/lib/permissions";
import { useBodyScrollLock } from "@/components/useBodyScrollLock";

type Panel = "pat" | "med" | "les" | null;
const EMPTY_MED = { nombre: "", concentracion: "", presentacion: "", dosis: "", periodo: "", nota: "" };

export default function CatalogosMedicos() {
  const {
    currentUser,
    isOnline,
    showToast,
    patologias,
    predefinedMedicamentos,
    tiposLesion,
    fetchPatologias,
    fetchPredefinedMedicamentos,
    fetchTiposLesion,
  } = useAppContext();

  const role = currentUser?.role ?? "";
  const puedeEditar = canEditCatalogosMedicos(role);
  const puedeEliminar = canManageCatalogosMedicos(role);

  const [panel, setPanel] = useState<Panel>(null);
  const [closing, setClosing] = useState(false);

  // Patologías
  const [patValue, setPatValue] = useState("");
  const [editPatId, setEditPatId] = useState<string | null>(null);
  const [savingPat, setSavingPat] = useState(false);
  const [patFilter, setPatFilter] = useState("");

  // Medicamentos
  const [medForm, setMedForm] = useState({ ...EMPTY_MED });
  const [editMedId, setEditMedId] = useState<string | null>(null);
  const [savingMed, setSavingMed] = useState(false);
  const [medFilter, setMedFilter] = useState("");

  // Tipos de lesión (catálogo simple de un solo nombre, como patologías)
  const [lesValue, setLesValue] = useState("");
  const [editLesId, setEditLesId] = useState<string | null>(null);
  const [savingLes, setSavingLes] = useState(false);
  const [lesFilter, setLesFilter] = useState("");

  // Confirmación de borrado inline (id del ítem cuyo borrado se está confirmando)
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useBodyScrollLock(panel !== null);

  if (!puedeEditar) return null;

  const close = () => {
    setClosing(true);
    setTimeout(() => {
      setPanel(null);
      setClosing(false);
      setPatValue(""); setEditPatId(null); setPatFilter("");
      setMedForm({ ...EMPTY_MED }); setEditMedId(null); setMedFilter("");
      setLesValue(""); setEditLesId(null); setLesFilter("");
      setConfirmDel(null);
    }, 180);
  };

  // ── Patologías ──
  const submitPat = async () => {
    const nombre = patValue.replace(/\s+/g, " ").trim();
    if (!nombre) return;
    if (nombre.includes(",")) { showToast("El nombre no puede contener comas.", "error"); return; }
    setSavingPat(true);
    try {
      const res = editPatId
        ? await apiFetch("/api/patologias", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editPatId, nombre }) })
        : await apiFetch("/api/patologias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }) });
      if (res.ok) {
        setPatValue(""); setEditPatId(null); fetchPatologias();
        showToast(editPatId ? "Patología actualizada." : "Patología agregada.", "success");
      } else {
        const d = await res.json().catch(() => ({})); showToast(d.error || "No se pudo guardar.", "error");
      }
    } catch { showToast("Error de red.", "error"); }
    finally { setSavingPat(false); }
  };

  const deletePat = async (id: string) => {
    setConfirmDel(null);
    try {
      const res = await apiFetch(`/api/patologias?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) { if (editPatId === id) { setEditPatId(null); setPatValue(""); } fetchPatologias(); showToast("Patología eliminada.", "success"); }
      else { const d = await res.json().catch(() => ({})); showToast(d.error || "No se pudo eliminar.", "error"); }
    } catch { showToast("Error de red al eliminar.", "error"); }
  };

  // ── Medicamentos ──
  const submitMed = async () => {
    const nombre = medForm.nombre.replace(/\s+/g, " ").trim();
    if (!nombre) { showToast("El principio activo es obligatorio.", "error"); return; }
    setSavingMed(true);
    try {
      const payload = editMedId ? { id: editMedId, ...medForm } : medForm;
      const res = await apiFetch("/api/medicamentos", {
        method: editMedId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setMedForm({ ...EMPTY_MED }); setEditMedId(null); fetchPredefinedMedicamentos();
        showToast(editMedId ? "Medicamento actualizado." : "Medicamento agregado.", "success");
      } else {
        const d = await res.json().catch(() => ({})); showToast(d.error || "No se pudo guardar.", "error");
      }
    } catch { showToast("Error de red.", "error"); }
    finally { setSavingMed(false); }
  };

  const deleteMed = async (id: string) => {
    setConfirmDel(null);
    try {
      const res = await apiFetch(`/api/medicamentos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) { if (editMedId === id) { setEditMedId(null); setMedForm({ ...EMPTY_MED }); } fetchPredefinedMedicamentos(); showToast("Medicamento eliminado.", "success"); }
      else { const d = await res.json().catch(() => ({})); showToast(d.error || "No se pudo eliminar.", "error"); }
    } catch { showToast("Error de red al eliminar.", "error"); }
  };

  const startEditMed = (m: any) => {
    setEditMedId(m.id);
    setMedForm({ nombre: m.nombre || "", concentracion: m.concentracion || "", presentacion: m.presentacion || "", dosis: m.dosis || "", periodo: m.periodo || "", nota: m.nota || "" });
    setConfirmDel(null);
  };

  // ── Tipos de lesión ──
  const submitLes = async () => {
    const nombre = lesValue.replace(/\s+/g, " ").trim();
    if (!nombre) return;
    setSavingLes(true);
    try {
      const res = editLesId
        ? await apiFetch("/api/tipos-lesion", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editLesId, nombre }) })
        : await apiFetch("/api/tipos-lesion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }) });
      if (res.ok) {
        setLesValue(""); setEditLesId(null); fetchTiposLesion();
        showToast(editLesId ? "Tipo de lesión actualizado." : "Tipo de lesión agregado.", "success");
      } else {
        const d = await res.json().catch(() => ({})); showToast(d.error || "No se pudo guardar.", "error");
      }
    } catch { showToast("Error de red.", "error"); }
    finally { setSavingLes(false); }
  };

  const deleteLes = async (id: string) => {
    setConfirmDel(null);
    try {
      const res = await apiFetch(`/api/tipos-lesion?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) { if (editLesId === id) { setEditLesId(null); setLesValue(""); } fetchTiposLesion(); showToast("Tipo de lesión eliminado.", "success"); }
      else { const d = await res.json().catch(() => ({})); showToast(d.error || "No se pudo eliminar.", "error"); }
    } catch { showToast("Error de red al eliminar.", "error"); }
  };

  const patList = patologias.filter((p) => normalizeText(p.nombre).includes(normalizeText(patFilter)));
  const medList = predefinedMedicamentos.filter((m) => normalizeText([m.nombre, m.concentracion, m.presentacion].join(" ")).includes(normalizeText(medFilter)));
  const lesList = tiposLesion.filter((t) => normalizeText(t.nombre).includes(normalizeText(lesFilter)));

  return (
    <>
      {/* Dos botones discretos */}
      <div className="cat-triggers">
        <button type="button" className="cat-trigger" onClick={() => setPanel("pat")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
          Patologías
        </button>
        <button type="button" className="cat-trigger" onClick={() => setPanel("med")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7Z"/><path d="m8.5 8.5 7 7"/></svg>
          Medicamentos
        </button>
        <button type="button" className="cat-trigger" onClick={() => setPanel("les")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.8 4.8a3 3 0 0 1 4.2 0l1.5 1.5m3 3 4.7 4.7a3 3 0 0 1-4.2 4.2L4.8 9a3 3 0 0 1 0-4.2Z"/><path d="m10.5 6.3 3.2 3.2"/></svg>
          Lesiones
        </button>
      </div>

      {panel && (
        <div className={`modal-overlay${closing ? " modal-overlay--closing" : ""}`} onClick={close}>
          <div className={`modal-content modal-content--detail cat-modal${closing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{panel === "pat" ? "Catálogo de Patologías" : panel === "med" ? "Catálogo de Medicamentos" : "Catálogo de Tipos de Lesión"}</span>
              <button className="modal-close" onClick={close} aria-label="Cerrar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {!isOnline && (
              <div className="users-offline-notice" style={{ marginBottom: "0.9rem" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
                Sin conexión — no es posible gestionar el catálogo.
              </div>
            )}

            <div className="pill-form cat-body">
              {panel === "pat" ? (
                <>
                  <div className="cat-add cat-add--pat">
                    <input
                      type="text"
                      value={patValue}
                      onChange={(e) => setPatValue(e.target.value)}
                      placeholder={editPatId ? "Editar patología…" : "Nueva patología…"}
                      disabled={!isOnline}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitPat(); } }}
                    />
                    <button type="button" className="btn-submit cat-add__btn" onClick={submitPat} disabled={!isOnline || savingPat || !patValue.trim()}>
                      {savingPat ? <span className="spinner spinner-sm" /> : editPatId ? "Guardar" : "Agregar"}
                    </button>
                    {editPatId && (
                      <button type="button" className="btn-secondary cat-add__cancel" onClick={() => { setEditPatId(null); setPatValue(""); }}>Cancelar</button>
                    )}
                  </div>
                  <input type="text" className="cat-filter" value={patFilter} onChange={(e) => setPatFilter(e.target.value)} placeholder="Filtrar patologías…" />
                  <div className="cat-count">{patList.length} de {patologias.length}</div>
                  <div className="cat-list">
                    {patList.length === 0 ? (
                      <div className="cat-empty">Sin resultados.</div>
                    ) : patList.map((p) => (
                      <div key={p.id} className={`cat-row ${editPatId === p.id ? "cat-row--editing" : ""}`}>
                        <span className="cat-row__name">{p.nombre}</span>
                        {confirmDel === p.id ? (
                          <span className="cat-confirm">
                            <span>¿Eliminar?</span>
                            <button type="button" className="cat-confirm__yes" onClick={() => deletePat(p.id)}>Sí</button>
                            <button type="button" className="cat-confirm__no" onClick={() => setConfirmDel(null)}>No</button>
                          </span>
                        ) : (
                          <span className="cat-row__actions">
                            <button type="button" className="cat-icon-btn" title="Editar" aria-label="Editar" onClick={() => { setEditPatId(p.id); setPatValue(p.nombre); setConfirmDel(null); }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            {puedeEliminar && (
                              <button type="button" className="cat-icon-btn cat-icon-btn--danger" title="Eliminar" aria-label="Eliminar" onClick={() => setConfirmDel(p.id)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : panel === "med" ? (
                <>
                  <div className="cat-add cat-add--med">
                    <input type="text" value={medForm.nombre} onChange={(e) => setMedForm({ ...medForm, nombre: e.target.value })} placeholder="Principio activo *" disabled={!isOnline} />
                    <input type="text" value={medForm.concentracion} onChange={(e) => setMedForm({ ...medForm, concentracion: e.target.value })} placeholder="Concentración" disabled={!isOnline} />
                    <input type="text" value={medForm.presentacion} onChange={(e) => setMedForm({ ...medForm, presentacion: e.target.value })} placeholder="Presentación" disabled={!isOnline} />
                    <div className="cat-add__row">
                      <button type="button" className="btn-submit cat-add__btn" onClick={submitMed} disabled={!isOnline || savingMed || !medForm.nombre.trim()}>
                        {savingMed ? <span className="spinner spinner-sm" /> : editMedId ? "Guardar" : "Agregar"}
                      </button>
                      {editMedId && (
                        <button type="button" className="btn-secondary cat-add__cancel" onClick={() => { setEditMedId(null); setMedForm({ ...EMPTY_MED }); }}>Cancelar</button>
                      )}
                    </div>
                  </div>
                  <input type="text" className="cat-filter" value={medFilter} onChange={(e) => setMedFilter(e.target.value)} placeholder="Filtrar medicamentos…" />
                  <div className="cat-count">{medList.length} de {predefinedMedicamentos.length}</div>
                  <div className="cat-list">
                    {medList.length === 0 ? (
                      <div className="cat-empty">Sin resultados.</div>
                    ) : medList.map((m) => (
                      <div key={m.id} className={`cat-row ${editMedId === m.id ? "cat-row--editing" : ""}`}>
                        <span className="cat-row__name">{[m.nombre, m.concentracion, m.presentacion].map((s) => (s || "").trim()).filter(Boolean).join(" · ")}</span>
                        {confirmDel === m.id ? (
                          <span className="cat-confirm">
                            <span>¿Eliminar?</span>
                            <button type="button" className="cat-confirm__yes" onClick={() => deleteMed(m.id)}>Sí</button>
                            <button type="button" className="cat-confirm__no" onClick={() => setConfirmDel(null)}>No</button>
                          </span>
                        ) : (
                          <span className="cat-row__actions">
                            <button type="button" className="cat-icon-btn" title="Editar" aria-label="Editar" onClick={() => startEditMed(m)}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            {puedeEliminar && (
                              <button type="button" className="cat-icon-btn cat-icon-btn--danger" title="Eliminar" aria-label="Eliminar" onClick={() => setConfirmDel(m.id)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="cat-add cat-add--pat">
                    <input
                      type="text"
                      value={lesValue}
                      onChange={(e) => setLesValue(e.target.value)}
                      placeholder={editLesId ? "Editar tipo de lesión…" : "Nuevo tipo de lesión…"}
                      disabled={!isOnline}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitLes(); } }}
                    />
                    <button type="button" className="btn-submit cat-add__btn" onClick={submitLes} disabled={!isOnline || savingLes || !lesValue.trim()}>
                      {savingLes ? <span className="spinner spinner-sm" /> : editLesId ? "Guardar" : "Agregar"}
                    </button>
                    {editLesId && (
                      <button type="button" className="btn-secondary cat-add__cancel" onClick={() => { setEditLesId(null); setLesValue(""); }}>Cancelar</button>
                    )}
                  </div>
                  <input type="text" className="cat-filter" value={lesFilter} onChange={(e) => setLesFilter(e.target.value)} placeholder="Filtrar tipos de lesión…" />
                  <div className="cat-count">{lesList.length} de {tiposLesion.length}</div>
                  <div className="cat-list">
                    {lesList.length === 0 ? (
                      <div className="cat-empty">Sin resultados.</div>
                    ) : lesList.map((t) => (
                      <div key={t.id} className={`cat-row ${editLesId === t.id ? "cat-row--editing" : ""}`}>
                        <span className="cat-row__name">{t.nombre}</span>
                        {confirmDel === t.id ? (
                          <span className="cat-confirm">
                            <span>¿Eliminar?</span>
                            <button type="button" className="cat-confirm__yes" onClick={() => deleteLes(t.id)}>Sí</button>
                            <button type="button" className="cat-confirm__no" onClick={() => setConfirmDel(null)}>No</button>
                          </span>
                        ) : (
                          <span className="cat-row__actions">
                            <button type="button" className="cat-icon-btn" title="Editar" aria-label="Editar" onClick={() => { setEditLesId(t.id); setLesValue(t.nombre); setConfirmDel(null); }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            {puedeEliminar && (
                              <button type="button" className="cat-icon-btn cat-icon-btn--danger" title="Eliminar" aria-label="Eliminar" onClick={() => setConfirmDel(t.id)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
