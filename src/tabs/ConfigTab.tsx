"use client";

// ── Pestaña: Configuración ──────────────────────────────────────────────────
// Todo el subsistema del tab config vive aquí (estado, handlers y modales):
//  1. Perfil del operador + diagnóstico de notificaciones PWA (permissionState).
//  2. Padrón electoral local: descargar / borrar + barra de progreso. El estado
//     y las acciones del padrón (syncStatus/syncProgress/syncTotal,
//     downloadFullPadron, deletePadronLocal, refreshVotersCount) viven en Home
//     porque hay un effect global de auto-descarga al login; se consumen del
//     context.
//  3. Cola de sincronización (grupos Nuevos/Actualizaciones/Historial), con
//     exportar JSON, generar QR, reintentar y modal de corrección local.
//  4. Gestión de edificios/salones (solo ADMIN) con modales de confirmación.
//
// Del context global consume: currentUser, isOnline, showToast, triggerSync,
// isSyncing, syncQueueProgress, pendingCount, localRecords, refreshLocalRecords,
// customCuartos, setCustomCuartos, allCuartos, sortedCustomCuartos, votersCount,
// syncStatus, syncProgress, syncTotal, downloadFullPadron, deletePadronLocal.

import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { getPending, saveLocal, resetAttempts, type LocalRegistro } from "@/lib/db";
import { formatRoomLabel } from "@/lib/helpers";
import { useAppContext } from "@/context/AppContext";

export default function ConfigTab() {
  const {
    currentUser,
    isOnline,
    showToast,
    triggerSync,
    isSyncing,
    syncQueueProgress,
    pendingCount,
    localRecords,
    refreshLocalRecords,
    setCustomCuartos,
    allCuartos,
    sortedCustomCuartos,
    votersCount,
    syncStatus,
    syncProgress,
    downloadFullPadron,
    deletePadronLocal,
  } = useAppContext();

  // Notification Diagnostics (helper state)
  const [permissionState, setPermissionState] = useState<string>("default");

  // Local edit states for offline correction
  const [selectedLocalRecord, setSelectedLocalRecord] = useState<LocalRegistro | null>(null);
  const [showLocalEditModal, setShowLocalEditModal] = useState(false);
  const [localEditCedula, setLocalEditCedula] = useState("");
  const [localEditNombre, setLocalEditNombre] = useState("");
  const [localEditNacionalidad, setLocalEditNacionalidad] = useState("V");

  // QR Transfer Modal States
  const [qrCodes, setQrCodes] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  // Confirmation Modals for Room Management
  const [newBuilding, setNewBuilding] = useState("");
  const [newSalon, setNewSalon] = useState("");
  const [roomToConfirmAdd, setRoomToConfirmAdd] = useState<{ building: string; salon: string } | null>(null);
  const [roomToConfirmDelete, setRoomToConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermissionState(Notification.permission);
      const interval = setInterval(() => {
        setPermissionState(Notification.permission);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, []);

  const addCustomCuarto = () => {
    const b = newBuilding.trim().toUpperCase();
    const s = newSalon.trim().toUpperCase();
    if (!b || !s) return;
    const key = `EDIFICIO ${b} SALON ${s}`;
    if (allCuartos.includes(key)) return;
    setRoomToConfirmAdd({ building: b, salon: s });
  };

  const addCustomCuartoConfirmed = async () => {
    if (!roomToConfirmAdd) return;
    const { building, salon } = roomToConfirmAdd;
    const key = `EDIFICIO ${building} SALON ${salon}`;

    // Optimistic UI update
    setCustomCuartos(prev => [...prev, key]);
    setNewBuilding("");
    setNewSalon("");
    setRoomToConfirmAdd(null);

    if (navigator.onLine) {
      try {
        await fetch("/api/cuartos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: key })
        });
      } catch (err) {
        console.error("Error creating custom room in DB:", err);
      }
    }
  };

  const removeCustomCuarto = (key: string) => {
    setRoomToConfirmDelete(key);
  };

  const removeCustomCuartoConfirmed = async () => {
    if (!roomToConfirmDelete) return;
    const key = roomToConfirmDelete;

    setCustomCuartos(prev => prev.filter(c => c !== key));
    setRoomToConfirmDelete(null);

    if (navigator.onLine) {
      try {
        await fetch(`/api/cuartos?name=${encodeURIComponent(key)}`, {
          method: "DELETE"
        });
      } catch (err) {
        console.error("Error deleting custom room in DB:", err);
      }
    }
  };

  const handleRetryRecord = async (id: string) => {
    await resetAttempts(id);
    await refreshLocalRecords();
    if (navigator.onLine) {
      triggerSync();
      showToast("Reintentando sincronización...", "success");
    } else {
      showToast("Sin conexión. Se reintentará al recuperar señal.", "warning");
    }
  };

  const handleSaveLocalEdit = async () => {
    if (!selectedLocalRecord) return;
    const cleanCed = localEditCedula.trim().toUpperCase();
    const finalCedula = (cleanCed.startsWith("V-") || cleanCed.startsWith("E-")) ? cleanCed : `${localEditNacionalidad}-${cleanCed}`;
    const updatedRecord = {
      ...selectedLocalRecord,
      data: {
        ...selectedLocalRecord.data,
        cedula: finalCedula,
        nombreApellido: localEditNombre.trim().toUpperCase()
      },
      status: "pending" as const,
      attempts: 0,
      syncResult: undefined
    };
    await saveLocal(updatedRecord);
    setShowLocalEditModal(false);
    setSelectedLocalRecord(null);
    showToast("Registro local corregido y en cola", "success");
    await refreshLocalRecords();
    if (navigator.onLine) {
      triggerSync();
    }
  };

  const handleExportJSON = async () => {
    const pending = await getPending();
    if (pending.length === 0) {
      showToast("No hay registros pendientes para respaldar.", "info");
      return;
    }

    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pending, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `respaldo-censo-pendientes-${new Date().toISOString().slice(0,10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast("Copia de seguridad JSON descargada.", "success");
    } catch (err) {
      showToast("Error al exportar archivo JSON.", "error");
    }
  };

  // EXPORT 2: Generate Offline QR Codes for pending records
  const handleGenerateQRs = async () => {
    const pending = await getPending();
    if (pending.length === 0) {
      showToast("No hay registros pendientes para generar QR.", "info");
      return;
    }

    try {
      const codes = await Promise.all(
        pending.map(async (record) => {
          const compressed = {
            id: record.id,
            p: record.data.parroquia,
            s: record.data.sector,
            c: record.data.comunidad,
            d: record.data.direccionExacta,
            n: record.data.nombreApellido,
            ci: record.data.cedula,
            jf: record.data.jefeFamilia,
            g: record.data.genero,
            fn: record.data.fechaNacimiento,
            e: record.data.edad,
            pn: record.data.perteneceNucleo,
            cj: record.data.cedulaJefeFamilia || null,
            ef: record.data.estadoFisico,
            pat: record.data.patologia,
            pd: record.data.patologiaDescripcion || null,
            lat: record.data.gpsLat || null,
            lng: record.data.gpsLng || null
          };

          const jsonStr = JSON.stringify(compressed);
          const qrUrl = await QRCode.toDataURL(jsonStr, { errorCorrectionLevel: "L", margin: 2 });

          return {
            id: record.id,
            name: record.data.nombreApellido,
            url: qrUrl
          };
        })
      );

      setQrCodes(codes);
      setShowQrModal(true);
    } catch (err) {
      console.error("Error al generar QR:", err);
      showToast("Error al generar códigos QR.", "error");
    }
  };

  // Guarda de tipos: este tab solo se monta autenticado (activeTab === "config").
  if (!currentUser) return null;

  return (
    <>
      <div className="tab-view tab-enter">

        {/* ── 1. PERFIL DE OPERADOR ── */}
        <div className="dashboard-section">
          <h3 className="dashboard-section-title">Perfil de Operador</h3>
          <div className="config-profile-row">
            <div className="modal-avatar" style={{ width: "48px", height: "48px", fontSize: "1rem", flexShrink: 0 }}>
              {currentUser.nombre.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0] || "").join("").toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: "700", fontSize: "0.9rem", color: "var(--text-primary)" }}>{currentUser.nombre}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>{currentUser.email}</div>
              {currentUser.campamentoTransitorio && (
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>{currentUser.campamentoTransitorio}</div>
              )}
            </div>
            <span className={`config-role-badge ${currentUser.role === "ADMIN" ? "config-role-badge--admin" : "config-role-badge--reg"}`}>
              {currentUser.role}
            </span>
          </div>
          <div className="config-notif-row">
            <span style={{ fontSize: "0.73rem", fontWeight: "700", color: "var(--text-secondary)", flexShrink: 0 }}>Notif. PWA:</span>
            {typeof window !== "undefined" && (!("serviceWorker" in navigator) || !("PushManager" in window)) ? (
              <span style={{ fontSize: "0.73rem", color: "var(--color-danger)", fontWeight: "600" }}>No soportado — requiere HTTPS</span>
            ) : permissionState === "granted" ? (
              <span style={{ fontSize: "0.73rem", color: "var(--color-success)", fontWeight: "600" }}>● Activo</span>
            ) : permissionState === "denied" ? (
              <span style={{ fontSize: "0.73rem", color: "var(--color-danger)", fontWeight: "600" }}>● Bloqueado — restablecer en navegador</span>
            ) : (
              <span style={{ fontSize: "0.73rem", color: "var(--color-warning)", fontWeight: "600" }}>● Pendiente</span>
            )}
          </div>
        </div>

        {/* ── 2. PADRÓN ELECTORAL ── */}
        <div className="dashboard-section">
          <div className="config-section-header">
            <h3 className="dashboard-section-title">Padrón Electoral Local</h3>
            {votersCount > 0 && syncStatus === "idle" && (
              <button type="button" onClick={deletePadronLocal} className="btn-link-danger" style={{ fontSize: "0.72rem" }}>
                Borrar local
              </button>
            )}
          </div>

          {votersCount > 0 ? (
            <div className="padron-installed">
              Padrón electoral instalado — <strong>{votersCount.toLocaleString()}</strong> ciudadanos
            </div>
          ) : (
            <div className="padron-missing">
              Padrón offline no instalado. El censo no autocompletará datos.
            </div>
          )}

          {syncStatus === "idle" && votersCount === 0 && (
            <button type="button" onClick={downloadFullPadron} disabled={!isOnline} className="btn-submit btn-submit--sm">
              Descargar Padrón Completo
            </button>
          )}

          {syncStatus === "downloading" && (
            <div className="status-msg status-msg--warning">
              <span className="spinner"></span> Descargando datos del padrón...
            </div>
          )}

          {syncStatus === "saving" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div className="padron-status-count-row status-msg--warning">
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span className="spinner spinner-sm"></span>
                  Guardando en dispositivo...
                </span>
                <span className="tabular-num">{syncProgress.toLocaleString()} reg.</span>
              </div>
              <div className="padron-progress-track">
                <div className="padron-indeterminate-bar" style={{ height: "100%", background: "var(--color-warning)" }} />
              </div>
            </div>
          )}

          {syncStatus === "completed" && (
            <div className="status-msg status-msg--success">
              Instalación completa. Ciudadanos listos para lookup local.
            </div>
          )}

          {syncStatus === "error" && (
            <div className="status-msg status-msg--danger">
              Error al descargar el padrón. Verifique conexión.
            </div>
          )}
        </div>

        {/* ── 3. COLA DE SINCRONIZACIÓN ── */}
        {(() => {
          const pendingNew     = localRecords.filter(r => r.status === "pending" && r.type !== "update");
          const pendingUpdates = localRecords.filter(r => r.status === "pending" && r.type === "update");
          const syncedRecords  = localRecords.filter(r => r.status === "synced");

          const renderSyncItem = (r: LocalRegistro) => {
            const isUpdate = r.type === "update";
            let badgeClass = "pending";
            let badgeText  = "En cola";
            if (r.status === "synced") {
              if (r.syncResult === "duplicado") { badgeClass = "duplicado"; badgeText = "Duplicado"; }
              else { badgeClass = "registrado"; badgeText = isUpdate ? "Actualizado" : "Registrado"; }
            } else if (r.attempts > 3) { badgeClass = "error"; badgeText = "Fallo"; }

            return (
              <div
                key={r.id}
                className="sync-log-item"
                onClick={() => {
                  setSelectedLocalRecord(r);
                  const cleanCed = r.data.cedula.replace(/^[VE]-/, "");
                  const nac = r.data.cedula.startsWith("E") ? "E" : "V";
                  setLocalEditCedula(cleanCed);
                  setLocalEditNombre(r.data.nombreApellido);
                  setLocalEditNacionalidad(nac);
                  setShowLocalEditModal(true);
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                    <span className="sync-log-name">{r.data.nombreApellido}</span>
                    {isUpdate && <span className="sync-type-tag sync-type-tag--update">Edición</span>}
                  </div>
                  <div className="sync-log-meta">
                    C.I. {r.data.cedula} · {r.data.parroquia}
                    {r.attempts > 0 && r.status === "pending" && (
                      <span className="sync-attempts-text"> · {r.attempts} intento{r.attempts !== 1 ? "s" : ""} fallido{r.attempts !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                  {r.status === "pending" && r.attempts > 3 && (
                    <button
                      type="button"
                      className="sync-retry-btn"
                      onClick={(e) => { e.stopPropagation(); handleRetryRecord(r.id); }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.76"/></svg>
                      Reintentar
                    </button>
                  )}
                  <span className={`sync-badge ${badgeClass}`}>{badgeText}</span>
                </div>
              </div>
            );
          };

          return (
            <div className="dashboard-section">
              <div className="config-section-header">
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  <h3 className="dashboard-section-title">Cola de Sincronización</h3>
                  {isSyncing && syncQueueProgress ? (
                    <span className="asign-count" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                      <span className="spinner spinner-sm"></span>{syncQueueProgress.done}/{syncQueueProgress.total}
                    </span>
                  ) : pendingCount > 0 ? (
                    <span className="asign-count">{pendingCount} pend.</span>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
                  {pendingCount > 0 && (
                    <>
                      <button type="button" className="dash-icon-btn" data-tip="Exportar JSON" onClick={handleExportJSON}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>
                      </button>
                      <button type="button" className="dash-icon-btn" data-tip="Generar QR" onClick={handleGenerateQRs}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="17" y="17" width="3" height="3"/></svg>
                      </button>
                      <div className="dash-action-sep"></div>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ width: "auto", margin: 0, padding: "0 0.875rem", height: "36px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                    onClick={triggerSync}
                    disabled={isSyncing || !isOnline}
                  >
                    {isSyncing ? <><span className="spinner spinner-sm"></span>Sincronizando</> : "Sincronizar cola"}
                  </button>
                </div>
              </div>

              {isSyncing && syncQueueProgress && (
                <div className="padron-progress-track" style={{ margin: "0.25rem 0" }}>
                  <div style={{
                    height: "100%", background: "var(--color-primary)", borderRadius: "2px",
                    width: `${Math.round(syncQueueProgress.done / syncQueueProgress.total * 100)}%`,
                    transition: "width 0.3s ease"
                  }} />
                </div>
              )}

              {localRecords.length === 0 ? (
                <div className="reg-empty-state" style={{ padding: "2rem 1rem" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <p>Todo sincronizado</p>
                  <span>No hay registros pendientes en este dispositivo</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {pendingNew.length > 0 && (
                    <div>
                      <div className="sync-subgroup-label">
                        <span>Registros nuevos</span>
                        <span className="sync-subgroup-count">{pendingNew.length}</span>
                      </div>
                      <div className="sync-log-list" style={{ marginTop: "0.5rem" }}>
                        {pendingNew.map(r => renderSyncItem(r))}
                      </div>
                    </div>
                  )}
                  {pendingUpdates.length > 0 && (
                    <div>
                      <div className="sync-subgroup-label">
                        <span>Actualizaciones pendientes</span>
                        <span className="sync-subgroup-count">{pendingUpdates.length}</span>
                      </div>
                      <div className="sync-log-list" style={{ marginTop: "0.5rem" }}>
                        {pendingUpdates.map(r => renderSyncItem(r))}
                      </div>
                    </div>
                  )}
                  {syncedRecords.length > 0 && (
                    <div>
                      <div className="sync-subgroup-label">
                        <span>Historial sincronizado</span>
                        <span className="sync-subgroup-count">{syncedRecords.length}</span>
                      </div>
                      <div className="sync-log-list sync-log-list--muted" style={{ marginTop: "0.5rem" }}>
                        {syncedRecords.map(r => renderSyncItem(r))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── 4. GESTIÓN DE HABITACIONES (solo ADMIN) ── */}
        {currentUser.role === "ADMIN" && (
          <div className="dashboard-section">
            <h3 className="dashboard-section-title">Gestión de Edificios y Salones</h3>
            <div className="room-add-form">
              <div className="room-add-inputs">
                <div className="room-add-field">
                  <label className="room-add-label">Edificio</label>
                  <input className="room-add-input" placeholder="ej: 3" value={newBuilding}
                    onChange={e => setNewBuilding(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustomCuarto()} />
                </div>
                <div className="room-add-field">
                  <label className="room-add-label">Salón</label>
                  <input className="room-add-input" placeholder="ej: 33" value={newSalon}
                    onChange={e => setNewSalon(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustomCuarto()} />
                </div>
                <button type="button" className="btn-submit btn-submit--sm" onClick={addCustomCuarto}
                  disabled={!newBuilding.trim() || !newSalon.trim()}>
                  Agregar
                </button>
              </div>
              {newBuilding.trim() && newSalon.trim() && (
                <p className="room-add-preview">
                  Se agregará: <strong>Edif. {newBuilding.trim()} &mdash; Salón {newSalon.trim()}</strong>
                </p>
              )}
            </div>
            <div className="room-list-section">
              <span className="room-list-label">Habitaciones registradas ({sortedCustomCuartos.length})</span>
              {sortedCustomCuartos.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.5rem 0 0 0" }}>
                  No hay habitaciones registradas en la base de datos.
                </p>
              ) : (
                <div className="room-chip-list" style={{ marginTop: "0.5rem" }}>
                  {sortedCustomCuartos.map(c => (
                    <span key={c} className="room-chip room-chip--custom">
                      {formatRoomLabel(c)}
                      <button type="button" className="room-chip-remove" onClick={() => removeCustomCuarto(c)} title="Eliminar Habitación">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* QR Codes Modal */}
      {showQrModal && (
        <div className="modal-overlay" onClick={() => setShowQrModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">CÓDIGOS QR DE EMERGENCIA</span>
              <button className="modal-close" onClick={() => setShowQrModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Escanee estos códigos QR desde otro dispositivo con conexión a internet para cargar los censos del operador a la base central.
            </p>
            <div className="qr-carousel">
              {qrCodes.map((code, index) => (
                <div key={code.id} className="qr-card">
                  <div className="qr-badge">Registro {index + 1} de {qrCodes.length}</div>
                  <img src={code.url} alt={`QR de ${code.name}`} className="qr-image" />
                  <div className="qr-name">{code.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Local Queue Edit Modal for corrections (duplicate Cédula errors) */}
      {showLocalEditModal && selectedLocalRecord && (
        <div className="modal-overlay" onClick={() => { setShowLocalEditModal(false); setSelectedLocalRecord(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "450px", width: "90%" }}>
            <div className="modal-header">
              <span className="modal-title">CORREGIR CÉDULA / NOMBRE</span>
              <button className="modal-close" onClick={() => { setShowLocalEditModal(false); setSelectedLocalRecord(null); }}>✕</button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Modifique los datos principales del registro local para intentar la sincronización nuevamente.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label>Nombre y Apellido</label>
                <input
                  type="text"
                  value={localEditNombre}
                  onChange={(e) => setLocalEditNombre(e.target.value)}
                  style={{ width: "100%", height: "38px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem" }}
                />
              </div>

              <div className="form-group">
                <label>Cédula de Identidad</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <select
                    value={localEditNacionalidad}
                    onChange={(e) => setLocalEditNacionalidad(e.target.value)}
                    style={{ width: "80px", height: "38px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem" }}
                  >
                    <option value="V">V</option>
                    <option value="E">E</option>
                  </select>
                  <input
                    type="text"
                    value={localEditCedula}
                    onChange={(e) => setLocalEditCedula(e.target.value)}
                    style={{ flex: 1, height: "38px", borderRadius: "6px", border: "1px solid var(--border-color)", padding: "0 0.5rem" }}
                  />
                </div>
              </div>

              <button
                type="button"
                className="btn-submit"
                onClick={handleSaveLocalEdit}
                style={{ marginTop: "0.5rem" }}
              >
                Guardar y Sincronizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Agregar Habitación */}
      {roomToConfirmAdd && (
        <div className="modal-overlay" onClick={() => setRoomToConfirmAdd(null)}>
          <div className="modal-content modal-content--detail" onClick={e => e.stopPropagation()} style={{ maxWidth: "400px" }}>
            <div className="modal-header">
              <span className="modal-title">Confirmar Nueva Habitación</span>
              <button className="modal-close" onClick={() => setRoomToConfirmAdd(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ padding: "0.5rem 0", color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: "1.5" }}>
              <p>¿Estás seguro de que deseas agregar la siguiente habitación al censo?</p>
              <div style={{
                margin: "1rem 0",
                padding: "0.75rem",
                backgroundColor: "var(--bg-primary)",
                borderRadius: "6px",
                border: "1px dashed var(--border-color)",
                textAlign: "center",
                fontSize: "0.95rem",
                color: "var(--color-primary)",
                fontWeight: "700"
              }}>
                Edificio {roomToConfirmAdd.building} &mdash; Salón {roomToConfirmAdd.salon}
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                Esta habitación estará disponible inmediatamente para todos los registradores.
              </p>
            </div>

            <div className="modal-edit-actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="btn-secondary" onClick={() => setRoomToConfirmAdd(null)}>
                Cancelar
              </button>
              <button type="button" className="btn-submit" style={{ flex: 1 }} onClick={addCustomCuartoConfirmed}>
                Confirmar y Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminar Habitación */}
      {roomToConfirmDelete && (
        <div className="modal-overlay" onClick={() => setRoomToConfirmDelete(null)}>
          <div className="modal-content modal-content--detail" onClick={e => e.stopPropagation()} style={{ maxWidth: "400px" }}>
            <div className="modal-header">
              <span className="modal-title" style={{ color: "#ef4444" }}>⚠️ Confirmar Eliminación</span>
              <button className="modal-close" onClick={() => setRoomToConfirmDelete(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ padding: "0.5rem 0", color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: "1.5" }}>
              <p>¿Estás seguro de que deseas eliminar la siguiente habitación de la base de datos?</p>
              <div style={{
                margin: "1rem 0",
                padding: "0.75rem",
                backgroundColor: "var(--bg-primary)",
                borderRadius: "6px",
                border: "1px dashed #fca5a5",
                textAlign: "center",
                fontSize: "0.95rem",
                color: "#ef4444",
                fontWeight: "700"
              }}>
                {formatRoomLabel(roomToConfirmDelete)}
              </div>
              <p style={{ fontSize: "0.75rem", color: "#ef4444", fontWeight: "600" }}>
                ¡Advertencia: Esta acción removerá el salón del listado y no podrá deshacerse!
              </p>
            </div>

            <div className="modal-edit-actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="btn-secondary" onClick={() => setRoomToConfirmDelete(null)}>
                Cancelar
              </button>
              <button type="button" className="btn-submit" style={{ flex: 1, backgroundColor: "#ef4444", borderColor: "#ef4444" }} onClick={removeCustomCuartoConfirmed}>
                Sí, Eliminar Salón
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
