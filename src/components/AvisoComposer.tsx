"use client";

// ── Enviar aviso (Master / Admin) ───────────────────────────────────────────
// Redacta un aviso y elige la audiencia por ROL (checkbox por rol o "todos") y por
// CAMPAMENTO (Master: uno/varios/todos; Admin: fijo a su refugio), y los CANALES
// (in-app y/o Telegram). El servidor revalida permisos (roles asignables + ámbito).
// Todo pill. El padre controla el montaje.

import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { assignableRoles, ROLE_LABELS, isMaster } from "@/lib/permissions";
import SearchableSelect from "@/components/SearchableSelect";
import type { ToastType } from "@/types";

interface Props {
  senderRole: string;
  senderRefugio: string;
  refugios: { id: string; nombre: string }[];
  onClose: () => void;
  showToast: (m: string, t: ToastType) => void;
}

export default function AvisoComposer({ senderRole, senderRefugio, refugios, onClose, showToast }: Props) {
  const master = isMaster(senderRole);
  const roleOptions = assignableRoles(senderRole);

  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [roles, setRoles] = useState<string[]>(roleOptions);         // por defecto: todos
  const [todosRef, setTodosRef] = useState(true);                    // Master: todos los campamentos
  const [refs, setRefs] = useState<string[]>([]);                    // campamentos elegidos (si no "todos")
  const [inApp, setInApp] = useState(true);
  const [telegram, setTelegram] = useState(false);
  const [sending, setSending] = useState(false);

  const toggleRole = (r: string) => setRoles((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  const allRolesOn = roles.length === roleOptions.length;
  const toggleAllRoles = () => setRoles(allRolesOn ? [] : roleOptions);

  const enviar = async () => {
    if (!titulo.trim() || !cuerpo.trim()) { showToast("El título y el mensaje son obligatorios.", "error"); return; }
    if (!roles.length) { showToast("Selecciona al menos un rol.", "error"); return; }
    if (!inApp && !telegram) { showToast("Elige al menos un canal (in-app o Telegram).", "error"); return; }
    if (master && !todosRef && !refs.length) { showToast("Elige al menos un campamento o marca «Todos».", "error"); return; }

    setSending(true);
    try {
      const refugios = master ? (todosRef ? [] : refs) : [];
      const res = await apiFetch("/api/avisos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: titulo.trim(), cuerpo: cuerpo.trim(), roles, refugios, canalInApp: inApp, canalTelegram: telegram }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        if (d.count > 0) {
          showToast(`Aviso enviado a ${d.count} usuario${d.count === 1 ? "" : "s"}${telegram && d.telegram ? ` · ${d.telegram} por Telegram` : ""}.`, "success");
          onClose();
        } else {
          showToast("Ningún usuario cumple esos filtros.", "warning");
        }
      } else {
        showToast(d.error || "No se pudo enviar el aviso.", "error");
      }
    } catch { showToast("Error de red al enviar el aviso.", "error"); }
    finally { setSending(false); }
  };

  return (
    <div className="modal-overlay" onClick={() => { if (!sending) onClose(); }}>
      <div className="modal-content modal-content--detail pill-form" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div className="modal-avatar" style={{ background: "var(--color-primary-light)", color: "var(--color-primary)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
            </div>
            <div>
              <span className="modal-title">Enviar aviso</span>
              <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>Redacta y elige a quién le llega</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} disabled={sending}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="detail-edit-grid" style={{ gridTemplateColumns: "1fr", gap: "0.85rem", padding: "0.5rem 0" }}>
          <div className="form-group">
            <label htmlFor="aviso-titulo">Título</label>
            <input id="aviso-titulo" className="morb-control" type="text" maxLength={120} placeholder="ej: Reunión de coordinación" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>

          <div className="form-group">
            <label htmlFor="aviso-cuerpo">Mensaje</label>
            <textarea id="aviso-cuerpo" className="morb-control" maxLength={1000} placeholder="Escribe el aviso…" value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={4} />
          </div>

          {/* Campamento(s) */}
          <div className="form-group">
            <label>Campamento{master ? "(s)" : ""}</label>
            {master ? (
              <>
                <button type="button" className={`pill-check pill-check--wrap${todosRef ? " is-on" : ""}`} aria-pressed={todosRef} onClick={() => setTodosRef((v) => !v)}>
                  <span className="pill-check__box" aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
                  <span className="pill-check__label">Todos los campamentos</span>
                </button>
                {!todosRef && (
                  <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    <SearchableSelect
                      options={refugios.filter((r) => !refs.includes(r.nombre)).map((r) => ({ value: r.nombre, label: r.nombre }))}
                      onSelect={(v) => setRefs((p) => [...p, v])}
                      placeholder="Agregar campamento…"
                      inputClassName="morb-control"
                      emptyText="Sin campamentos"
                    />
                    {refs.length > 0 && (
                      <div className="aviso-chips">
                        {refs.map((n) => (
                          <span key={n} className="aviso-chip">
                            {n}
                            <button type="button" onClick={() => setRefs((p) => p.filter((x) => x !== n))} aria-label={`Quitar ${n}`}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <input className="morb-control" type="text" value={senderRefugio} readOnly disabled title="Como Admin, el aviso va a tu campamento." />
            )}
          </div>

          {/* Roles */}
          <div className="form-group">
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Enviar a estos roles</span>
              <button type="button" className="aviso-link" onClick={toggleAllRoles}>{allRolesOn ? "Ninguno" : "Todos"}</button>
            </label>
            <div className="aviso-roles">
              {roleOptions.map((r) => {
                const on = roles.includes(r);
                return (
                  <button key={r} type="button" className={`pill-check pill-check--wrap${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => toggleRole(r)}>
                    <span className="pill-check__box" aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
                    <span className="pill-check__label">{ROLE_LABELS[r] ?? r}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Canales */}
          <div className="form-group">
            <label>Canales</label>
            <div className="aviso-roles">
              <button type="button" className={`pill-check pill-check--wrap${inApp ? " is-on" : ""}`} aria-pressed={inApp} onClick={() => setInApp((v) => !v)}>
                <span className="pill-check__box" aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
                <span className="pill-check__label">En la app (campana)</span>
              </button>
              <button type="button" className={`pill-check pill-check--wrap${telegram ? " is-on" : ""}`} aria-pressed={telegram} onClick={() => setTelegram((v) => !v)}>
                <span className="pill-check__box" aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
                <span className="pill-check__label">Telegram (a los vinculados)</span>
              </button>
            </div>
          </div>

          <div className="modal-edit-actions" style={{ marginTop: "0.5rem" }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={sending}>Cancelar</button>
            <button type="button" className="btn-submit" style={{ flex: 1 }} onClick={enviar} disabled={sending}>
              {sending ? <><span className="spinner spinner-sm"></span>Enviando…</> : "Enviar aviso"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
