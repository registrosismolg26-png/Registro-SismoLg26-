"use client";

// ── Gestión del catálogo general de Caracterización (Admin/Master) ──────────
// Botón + modal para administrar las opciones cerradas (una sola tabla, agrupada
// por lista via CARAC_CAMPOS). Mismo espíritu que CatalogosMedicos: crear/editar/
// borrar valores de la lista elegida. Todo pill. Sin auto-seed (las listas base se
// cargan por SQL; aquí solo se ajustan/añaden).

import { useState } from "react";
import { useAppContext } from "@/context/AppContext";
import { canManageCaracterizacion } from "@/lib/permissions";
import { CARAC_CAMPOS } from "@/lib/constants";
import { opcionesDe } from "@/lib/helpers";
import { apiFetch } from "@/lib/apiFetch";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import StyledSelect from "@/components/StyledSelect";

export default function CaracterizacionCatalogos() {
  const { currentUser, caracterizacionOpciones, fetchCaracterizacionOpciones, showToast } = useAppContext();
  const [open, setOpen] = useState(false);
  const modal = useAnimatedModal(open);

  // Lista seleccionada (por defecto la primera de la metadata).
  const [sel, setSel] = useState(`${CARAC_CAMPOS[0].modulo}::${CARAC_CAMPOS[0].campo}`);
  const [nuevo, setNuevo] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!currentUser || !canManageCaracterizacion(currentUser.role)) return null;

  const meta = CARAC_CAMPOS.find((c) => `${c.modulo}::${c.campo}` === sel) ?? CARAC_CAMPOS[0];
  const valores = opcionesDe(caracterizacionOpciones, meta.modulo, meta.campo);

  const close = () => { setOpen(false); setEditId(null); setConfirmDel(null); setNuevo(""); };

  const crear = async () => {
    const valor = nuevo.replace(/\s+/g, " ").trim();
    if (!valor || saving) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/caracterizacion/opciones", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulo: meta.modulo, campo: meta.campo, valor, orden: valores.length + 1 }),
      });
      if (res.ok) { setNuevo(""); fetchCaracterizacionOpciones(true); showToast("Opción agregada.", "success"); }
      else { const d = await res.json().catch(() => ({})); showToast(d.error || "No se pudo agregar.", "error"); }
    } catch { showToast("Error de red.", "error"); }
    finally { setSaving(false); }
  };

  const guardarEdit = async () => {
    const valor = editVal.replace(/\s+/g, " ").trim();
    if (!editId || !valor || saving) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/caracterizacion/opciones", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId, valor }),
      });
      if (res.ok) { setEditId(null); setEditVal(""); fetchCaracterizacionOpciones(true); showToast("Opción actualizada.", "success"); }
      else { const d = await res.json().catch(() => ({})); showToast(d.error || "No se pudo guardar.", "error"); }
    } catch { showToast("Error de red.", "error"); }
    finally { setSaving(false); }
  };

  const borrar = async (id: string) => {
    setConfirmDel(null);
    try {
      const res = await apiFetch(`/api/caracterizacion/opciones?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) { if (editId === id) setEditId(null); fetchCaracterizacionOpciones(true); showToast("Opción eliminada.", "success"); }
      else { const d = await res.json().catch(() => ({})); showToast(d.error || "No se pudo eliminar.", "error"); }
    } catch { showToast("Error de red al eliminar.", "error"); }
  };

  return (
    <>
      <button type="button" className="btn-secondary carac-cat-btn" onClick={() => setOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></svg>
        Catálogo
      </button>

      {modal.mounted && (
        <div className={`modal-overlay${modal.closing ? " modal-overlay--closing" : ""}`} onClick={close}>
          <div className={`modal-content pill-form carac-cat-modal${modal.closing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
            <div className="carac-cat-head">
              <h3>Catálogo de Caracterización</h3>
              <button type="button" className="modal-close" onClick={close} aria-label="Cerrar">×</button>
            </div>

            <label className="carac-cat-field">
              <span>Lista</span>
              <StyledSelect
                value={sel}
                onChange={(v) => { setSel(v); setEditId(null); setConfirmDel(null); }}
                options={CARAC_CAMPOS.map((c) => ({ value: `${c.modulo}::${c.campo}`, label: `${c.label}${c.fase === 2 ? " (Fase 2)" : ""}` }))}
                ariaLabel="Lista del catálogo"
              />
            </label>

            <div className="carac-cat-add">
              <input type="text" className="morb-control" placeholder="Nueva opción…" value={nuevo}
                onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") crear(); }} />
              <button type="button" className="btn-submit" onClick={crear} disabled={saving || !nuevo.trim()}>Agregar</button>
            </div>

            <ul className="carac-cat-list">
              {valores.length === 0 && <li className="carac-cat-empty">Sin opciones. Agrega la primera o corre el seed.</li>}
              {valores.map((o) => (
                <li key={o.id} className="carac-cat-item">
                  {editId === o.id ? (
                    <>
                      <input type="text" className="morb-control" value={editVal} onChange={(e) => setEditVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") guardarEdit(); if (e.key === "Escape") setEditId(null); }} autoFocus />
                      <button type="button" className="btn-submit carac-cat-mini" onClick={guardarEdit} disabled={saving}>Guardar</button>
                      <button type="button" className="btn-secondary carac-cat-mini" onClick={() => setEditId(null)}>Cancelar</button>
                    </>
                  ) : confirmDel === o.id ? (
                    <>
                      <span className="carac-cat-val">¿Eliminar “{o.valor}”?</span>
                      <button type="button" className="btn-danger carac-cat-mini" onClick={() => borrar(o.id)}>Sí</button>
                      <button type="button" className="btn-secondary carac-cat-mini" onClick={() => setConfirmDel(null)}>No</button>
                    </>
                  ) : (
                    <>
                      <span className="carac-cat-val">{o.valor}</span>
                      <button type="button" className="carac-cat-icon" title="Editar" onClick={() => { setEditId(o.id); setEditVal(o.valor); }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                      </button>
                      <button type="button" className="carac-cat-icon carac-cat-icon--del" title="Eliminar" onClick={() => setConfirmDel(o.id)}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
