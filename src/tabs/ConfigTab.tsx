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

import { useState, useEffect, type ReactNode } from "react";
import QRCode from "qrcode";
import { getPending, saveLocal, resetAttempts, resetAllLocalToPending, resetAllConsultasToPending, type LocalRegistro } from "@/lib/db";
import { formatRoomLabel } from "@/lib/helpers";
import { useAppContext } from "@/context/AppContext";
import { apiFetch } from "@/lib/apiFetch";
import { enablePush, pushSupported } from "@/lib/pushClient";
import { canManageRooms, canRegister, isMaster } from "@/lib/permissions";
import { useBodyScrollLock } from "@/components/useBodyScrollLock";
import PasswordInput from "@/components/PasswordInput";
import StyledSelect from "@/components/StyledSelect";

export default function ConfigTab() {
  const {
    currentUser,
    setCurrentUser,
    isOnline,
    showToast,
    triggerSync,
    isSyncing,
    syncQueueProgress,
    pendingCount,
    localRecords,
    refreshLocalRecords,
    setCustomCuartos,
    sortedCustomCuartos,
    roomCapacities,
    setRoomCapacities,
    effectiveRefugio,
    votersCount,
    syncStatus,
    syncProgress,
    downloadFullPadron,
    deletePadronLocal,
  } = useAppContext();

  // (La gestión de catálogos médicos —patologías y medicamentos— se movió a la
  //  pestaña Morbilidad: componente src/components/CatalogosMedicos.tsx.)

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
  const [newTipo, setNewTipo] = useState<"EDIFICIO" | "PISO" | "OTRO">("EDIFICIO");
  const [newContenedor, setNewContenedor] = useState("");
  const [newSalon, setNewSalon] = useState("");
  const [newCapacidad, setNewCapacidad] = useState("18");
  const [roomToConfirmAdd, setRoomToConfirmAdd] = useState<{ key: string; capacidad: number } | null>(null);
  const [roomToConfirmDelete, setRoomToConfirmDelete] = useState<string | null>(null);
  // Editar capacidad de camas de un salón existente
  const [roomToEditCap, setRoomToEditCap] = useState<string | null>(null);
  const [editCapValue, setEditCapValue] = useState("18");
  const [savingCap, setSavingCap] = useState(false);

  // ── Mi Cuenta (autoservicio, en MODAL: el propio usuario edita SU nombre / contraseña) ──
  const [showAccount, setShowAccount] = useState(false);
  const [miNombre, setMiNombre] = useState(currentUser?.nombre || "");
  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confPwd, setConfPwd] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  const openAccount = () => { setMiNombre(currentUser?.nombre || ""); setCurPwd(""); setNewPwd(""); setConfPwd(""); setShowAccount(true); };
  const closeAccount = () => { setShowAccount(false); setCurPwd(""); setNewPwd(""); setConfPwd(""); };
  useBodyScrollLock(showAccount); // bloquea el scroll de fondo mientras el modal esté abierto

  const handleSaveAccount = async () => {
    if (!currentUser) return;
    const nombre = miNombre.replace(/\s+/g, " ").trim();
    if (!nombre) { showToast("El nombre no puede quedar vacío.", "error"); return; }
    const wantsPwd = !!(curPwd || newPwd || confPwd);
    if (wantsPwd) {
      if (!curPwd) { showToast("Ingresa tu contraseña actual para cambiarla.", "error"); return; }
      if (newPwd.length < 6) { showToast("La nueva contraseña debe tener al menos 6 caracteres.", "error"); return; }
      if (newPwd !== confPwd) { showToast("La nueva contraseña y su confirmación no coinciden.", "error"); return; }
    }
    const nombreChanged = nombre !== currentUser.nombre;
    if (!nombreChanged && !wantsPwd) { showToast("No hay cambios que guardar.", "info"); return; }
    if (!isOnline) { showToast("Necesitas conexión para actualizar tu cuenta.", "error"); return; }
    setSavingAccount(true);
    try {
      const payload: any = {};
      if (nombreChanged) payload.nombre = nombre;
      if (wantsPwd) { payload.currentPassword = curPwd; payload.newPassword = newPwd; }
      const res = await apiFetch("/api/auth/me", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        // Refleja el nuevo nombre en la sesión local (memoria + almacenamiento).
        const updated = { ...currentUser, nombre: d.user.nombre };
        setCurrentUser(updated);
        if (typeof window !== "undefined") {
          if (localStorage.getItem("sismo_operator")) localStorage.setItem("sismo_operator", JSON.stringify(updated));
          if (sessionStorage.getItem("sismo_operator")) sessionStorage.setItem("sismo_operator", JSON.stringify(updated));
        }
        setCurPwd(""); setNewPwd(""); setConfPwd("");
        setShowAccount(false);
        showToast(wantsPwd ? "Cuenta y contraseña actualizadas." : "Cuenta actualizada.", "success");
      } else {
        showToast(d.error || "No se pudo actualizar la cuenta.", "error");
      }
    } catch {
      showToast("Error de red al actualizar la cuenta.", "error");
    } finally {
      setSavingAccount(false);
    }
  };

  // ── Gestión de Refugios (solo MASTER) ──
  interface Refugio { id: string; nombre: string; ubicacion?: string | null; createdAt?: string }
  const [refugios, setRefugios] = useState<Refugio[]>([]);
  const [loadingRefugios, setLoadingRefugios] = useState(false);
  const [newRefugio, setNewRefugio] = useState("");
  const [creatingRefugio, setCreatingRefugio] = useState(false);
  const [refugioToRename, setRefugioToRename] = useState<Refugio | null>(null);
  const [refugioRenameValue, setRefugioRenameValue] = useState("");
  const [savingRefugioRename, setSavingRefugioRename] = useState(false);
  const [refugioUbicacionValue, setRefugioUbicacionValue] = useState("");
  const [refugioToDelete, setRefugioToDelete] = useState<Refugio | null>(null);
  const [deletingRefugio, setDeletingRefugio] = useState(false);

  const [notifBusy, setNotifBusy] = useState(false);
  // Solo los roles que reciben alertas de registro pueden activarlas.
  const canManageNotif = !!currentUser && (currentUser.role === "ADMIN" || isMaster(currentUser.role));
  const notifSupported = pushSupported();

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermissionState(Notification.permission);
      const interval = setInterval(() => {
        setPermissionState(Notification.permission);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, []);

  // Activar / renovar / resolicitar el permiso de notificaciones (gesto del usuario).
  const handleEnableNotif = async () => {
    if (!currentUser) return;
    const wasGranted = typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
    setNotifBusy(true);
    try {
      const res = await enablePush(currentUser.id);
      if (typeof window !== "undefined" && "Notification" in window) setPermissionState(Notification.permission);
      if (res.ok) {
        showToast(wasGranted ? "Suscripción de notificaciones renovada." : "Notificaciones activadas.", "success");
      } else if (res.reason === "bloqueado") {
        showToast("Están bloqueadas para este sitio. Actívalas en los ajustes del navegador.", "error");
      } else if (res.reason === "no-soportado") {
        showToast("Este navegador/dispositivo no soporta notificaciones (requiere HTTPS).", "error");
      } else if (res.reason === "sin-permiso") {
        showToast("No se concedió el permiso de notificaciones.", "info");
      } else {
        showToast("No se pudieron activar las notificaciones. Intenta de nuevo.", "error");
      }
    } finally {
      setNotifBusy(false);
    }
  };
  const recheckNotif = () => {
    if (typeof window !== "undefined" && "Notification" in window) setPermissionState(Notification.permission);
  };

  // ── Refugios: carga y mutaciones (solo MASTER, todo vía apiFetch) ──
  const fetchRefugios = async () => {
    if (!currentUser || !isMaster(currentUser.role) || !navigator.onLine) return;
    setLoadingRefugios(true);
    try {
      const res = await apiFetch("/api/refugios");
      const data = await res.json();
      if (res.ok && data.success) {
        setRefugios(data.refugios || []);
      } else {
        showToast(data.error || "Error al cargar campamentos.", "error");
      }
    } catch (err) {
      console.error("Error al listar refugios:", err);
      showToast("Error de conexión al cargar campamentos.", "error");
    } finally {
      setLoadingRefugios(false);
    }
  };

  // Carga inicial al montar (si es Master) y recarga al recuperar conexión.
  useEffect(() => {
    fetchRefugios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const handleCreateRefugio = async () => {
    const nombre = newRefugio.trim();
    if (!nombre || creatingRefugio) return;
    if (!isOnline) {
      showToast("Se requiere conexión para crear campamentos.", "warning");
      return;
    }
    setCreatingRefugio(true);
    try {
      const res = await apiFetch("/api/refugios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Error al crear el campamento.", "error");
        return;
      }
      showToast("Campamento creado con éxito.", "success");
      setNewRefugio("");
      await fetchRefugios();
    } catch (err) {
      console.error("Error al crear refugio:", err);
      showToast("Error de conexión al crear el campamento.", "error");
    } finally {
      setCreatingRefugio(false);
    }
  };

  const handleRenameRefugioConfirmed = async () => {
    if (!refugioToRename || savingRefugioRename) return;
    const nombre = refugioRenameValue.trim();
    if (!nombre) return;
    if (!isOnline) {
      showToast("Se requiere conexión para renombrar campamentos.", "warning");
      return;
    }
    setSavingRefugioRename(true);
    try {
      const res = await apiFetch("/api/refugios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: refugioToRename.id, nombre, ubicacion: refugioUbicacionValue.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Error al guardar el campamento.", "error");
        return;
      }
      showToast("Campamento actualizado. Los cambios de nombre se propagan a usuarios y registros.", "success");
      setRefugioToRename(null);
      setRefugioRenameValue("");
      setRefugioUbicacionValue("");
      await fetchRefugios();
    } catch (err) {
      console.error("Error al editar refugio:", err);
      showToast("Error de conexión al editar el campamento.", "error");
    } finally {
      setSavingRefugioRename(false);
    }
  };

  const handleDeleteRefugioConfirmed = async () => {
    if (!refugioToDelete || deletingRefugio) return;
    if (!isOnline) {
      showToast("Se requiere conexión para eliminar campamentos.", "warning");
      return;
    }
    setDeletingRefugio(true);
    try {
      const res = await apiFetch(`/api/refugios?id=${encodeURIComponent(refugioToDelete.id)}`, {
        method: "DELETE"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409 → tiene usuarios/registros asociados: muestra el error del backend, no borra.
        showToast(data.error || "No se pudo eliminar el campamento.", "error");
        return;
      }
      showToast("Campamento eliminado con éxito.", "success");
      setRefugioToDelete(null);
      await fetchRefugios();
    } catch (err) {
      console.error("Error al eliminar refugio:", err);
      showToast("Error de conexión al eliminar el campamento.", "error");
    } finally {
      setDeletingRefugio(false);
    }
  };

  // Normaliza el input de camas: entero 1..999; si es inválido, 18 por defecto.
  const normalizeCap = (raw: string): number => {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 && n <= 999 ? n : 18;
  };

  // ── Salones del refugio activo ───────────────────────────────────────────
  // La gestión de salones usa el "refugio de vista" global (Master lo cambia en
  // el header; el resto ve su propio refugio). El estado global de cuartos ya
  // sigue ese refugio (page.tsx), así que aquí solo se reusa con nombres locales.
  const masterMode = !!currentUser && isMaster(currentUser.role);
  const salonRefugioActivo = effectiveRefugio;
  const rooms = sortedCustomCuartos;
  const roomCaps = roomCapacities;
  const applyRoomsChange = setCustomCuartos;
  const applyCapsChange = setRoomCapacities;

  // Construye el nombre canónico del salón según el tipo de contenedor.
  // Edificio/Piso → "EDIFICIO N SALON S" / "PISO N SALON S"; Otro → "<texto> SALON S".
  const buildRoomKey = (tipo: string, contenedor: string, salon: string): string => {
    const c = contenedor.trim().toUpperCase();
    const s = salon.trim().toUpperCase();
    return tipo === "OTRO" ? `${c} SALON ${s}` : `${tipo} ${c} SALON ${s}`;
  };

  const addCustomCuarto = () => {
    const c = newContenedor.trim();
    const s = newSalon.trim();
    if (!c || !s) return;
    const key = buildRoomKey(newTipo, c, s);
    if (rooms.includes(key)) return;
    setRoomToConfirmAdd({ key, capacidad: normalizeCap(newCapacidad) });
  };

  const addCustomCuartoConfirmed = async () => {
    if (!roomToConfirmAdd) return;
    const { key, capacidad } = roomToConfirmAdd;

    // Optimistic UI update
    applyRoomsChange(prev => [...prev, key]);
    applyCapsChange(prev => ({ ...prev, [key]: capacidad }));
    setNewContenedor("");
    setNewSalon("");
    setNewCapacidad("18");
    setRoomToConfirmAdd(null);

    if (navigator.onLine) {
      try {
        await apiFetch("/api/cuartos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: key, capacidad, refugio: salonRefugioActivo })
        });
      } catch (err) {
        console.error("Error creating custom room in DB:", err);
      }
    }
  };

  // Abre el modal de edición de capacidad con el valor actual del salón.
  const openEditCap = (key: string) => {
    setRoomToEditCap(key);
    setEditCapValue(String(roomCaps[key] ?? 18));
  };

  const saveEditCap = async () => {
    if (!roomToEditCap) return;
    const key = roomToEditCap;
    const cap = parseInt(editCapValue, 10);
    if (!Number.isFinite(cap) || cap < 1 || cap > 999) {
      showToast("Capacidad inválida (entre 1 y 999).", "error");
      return;
    }
    if (!navigator.onLine) {
      showToast("Sin conexión. Editar la capacidad requiere señal.", "warning");
      return;
    }
    setSavingCap(true);
    try {
      const res = await apiFetch("/api/cuartos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: key, capacidad: cap, refugio: salonRefugioActivo })
      });
      if (res.ok) {
        applyCapsChange(prev => ({ ...prev, [key]: cap }));
        showToast("Capacidad actualizada.", "success");
        setRoomToEditCap(null);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "No se pudo actualizar la capacidad.", "error");
      }
    } catch (err) {
      console.error("Error updating room capacity:", err);
      showToast("Error de conexión al actualizar la capacidad.", "error");
    } finally {
      setSavingCap(false);
    }
  };

  const removeCustomCuarto = (key: string) => {
    setRoomToConfirmDelete(key);
  };

  const removeCustomCuartoConfirmed = async () => {
    if (!roomToConfirmDelete) return;
    const key = roomToConfirmDelete;

    applyRoomsChange(prev => prev.filter(c => c !== key));
    applyCapsChange(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setRoomToConfirmDelete(null);

    if (navigator.onLine) {
      try {
        await apiFetch(`/api/cuartos?name=${encodeURIComponent(key)}&refugio=${encodeURIComponent(salonRefugioActivo)}`, {
          method: "DELETE"
        });
      } catch (err) {
        console.error("Error deleting custom room in DB:", err);
      }
    }
  };

  // Recuperación: reencola TODOS los cambios locales (registros + consultas) que
  // quedaron sin enviar (p. ej. ediciones que se quedaron en 'synced' por el bug) y
  // fuerza la sincronización. No pierde datos: reenvía el último estado local.
  const [resyncing, setResyncing] = useState(false);
  const handleResyncAll = async () => {
    if (!navigator.onLine) { showToast("Sin conexión. Reintenta al recuperar señal.", "warning"); return; }
    setResyncing(true);
    try {
      const n1 = await resetAllLocalToPending();
      const n2 = await resetAllConsultasToPending();
      await refreshLocalRecords();
      triggerSync();
      showToast(n1 + n2 > 0 ? `${n1 + n2} cambio(s) local(es) reencolado(s) para sincronizar.` : "No había cambios locales pendientes de reenviar.", "success");
    } catch (e) {
      console.error(e);
      showToast("Error al reencolar los cambios locales.", "error");
    } finally {
      setResyncing(false);
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
            pi: record.data.patologiaIds || [],
            mi: record.data.medicamentoIds || [],
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

  // ── Acordeón: qué secciones están desplegadas (permite varias abiertas a la
  //    vez). "perfil" abierto por defecto; el resto plegado para una vista corta.
  const [openAcc, setOpenAcc] = useState<Set<string>>(new Set(["perfil"]));
  const toggleAcc = (key: string) =>
    setOpenAcc(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  // Cabecera clicable de cada panel (devuelve JSX, NO un componente, para no
  // remontar el contenido ni perder el foco de los inputs en cada render).
  const accHead = (id: string, icon: ReactNode, title: string, sub: string, badge?: ReactNode) => (
    <button type="button" className="config-acc__head" aria-expanded={openAcc.has(id)} onClick={() => toggleAcc(id)}>
      <span className="config-acc__icon">{icon}</span>
      <span className="config-acc__titles">
        <span className="config-acc__title">{title}</span>
        <span className="config-acc__sub">{sub}</span>
      </span>
      {badge}
      <span className="config-acc__chev" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </span>
    </button>
  );

  // Guarda de tipos: este tab solo se monta autenticado (activeTab === "config").
  if (!currentUser) return null;

  return (
    <>
      <div className="tab-view tab-enter">
        <div className="config-accordion">

        {/* ── 1. PERFIL DE OPERADOR ── */}
        <section className="config-acc config-acc--perfil" data-open={openAcc.has("perfil")}>
          {accHead("perfil", (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          ), "Perfil de Operador", "Tu cuenta, rol y notificaciones")}
          <div className="config-acc__panel"><div className="config-acc__inner"><div className="config-acc__body">
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
            {!notifSupported ? (
              <span style={{ fontSize: "0.73rem", color: "var(--color-danger)", fontWeight: "600" }}>No soportado — requiere HTTPS</span>
            ) : permissionState === "granted" ? (
              <span style={{ fontSize: "0.73rem", color: "var(--color-success)", fontWeight: "600" }}>● Activo</span>
            ) : permissionState === "denied" ? (
              <span style={{ fontSize: "0.73rem", color: "var(--color-danger)", fontWeight: "600" }}>● Bloqueado</span>
            ) : (
              <span style={{ fontSize: "0.73rem", color: "var(--color-warning)", fontWeight: "600" }}>● Pendiente</span>
            )}
            {/* Activar / renovar / resolicitar (roles con alertas: Admin y Master) */}
            {canManageNotif && notifSupported && permissionState !== "denied" && (
              <button type="button" className="config-notif-btn" onClick={handleEnableNotif} disabled={notifBusy}>
                {notifBusy ? "Procesando…" : permissionState === "granted" ? "Renovar" : "Activar"}
              </button>
            )}
          </div>
          {/* Bloqueado: no se puede reabrir el prompt por JS; se guía al navegador. */}
          {canManageNotif && notifSupported && permissionState === "denied" && (
            <p className="config-notif-help">
              Las notificaciones están <strong>bloqueadas</strong> para este sitio. Para reactivarlas, abre los permisos del navegador
              (el <strong>candado 🔒</strong> junto a la dirección → <strong>Notificaciones</strong> → Permitir), y luego pulsa{" "}
              <button type="button" className="config-notif-recheck" onClick={recheckNotif}>Volver a comprobar</button>.
            </p>
          )}
          {/* "Mi Cuenta" en un MODAL (Config estaba saturado): editar nombre/contraseña. */}
          <button type="button" className="config-account-trigger" onClick={openAccount}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Editar mi cuenta
          </button>
          </div></div></div>
        </section>

        {/* ── 2. PADRÓN ELECTORAL LOCAL (lo usa quien censa: MASTER/ADMIN/REGISTRADOR) ── */}
        {canRegister(currentUser.role) && (
        <section className="config-acc config-acc--padron" data-open={openAcc.has("padron")}>
          {accHead("padron", (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          ), "Padrón Electoral Local", "Base offline para autocompletar cédulas",
            votersCount > 0
              ? <span className="config-acc__badge">{votersCount.toLocaleString()}</span>
              : <span className="config-acc__badge config-acc__badge--muted">No instalado</span>
          )}
          <div className="config-acc__panel"><div className="config-acc__inner"><div className="config-acc__body">
          {votersCount > 0 && syncStatus === "idle" && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "-0.35rem" }}>
              <button type="button" onClick={deletePadronLocal} className="btn-link-danger" style={{ fontSize: "0.72rem" }}>
                Borrar local
              </button>
            </div>
          )}

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
          </div></div></div>
        </section>
        )}

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
            <section className="config-acc config-acc--sync" data-open={openAcc.has("sync")}>
              {accHead("sync", (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              ), "Cola de Sincronización", "Registros de este dispositivo por enviar",
                isSyncing && syncQueueProgress
                  ? <span className="config-acc__badge"><span className="spinner spinner-sm"></span>{syncQueueProgress.done}/{syncQueueProgress.total}</span>
                  : pendingCount > 0
                    ? <span className="config-acc__badge">{pendingCount} pend.</span>
                    : <span className="config-acc__badge config-acc__badge--muted">Al día</span>
              )}
              <div className="config-acc__panel"><div className="config-acc__inner"><div className="config-acc__body">
              <div className="config-sync-actions" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", justifyContent: "flex-end" }}>
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
                  style={{ width: "auto", margin: 0, padding: "0 1rem", height: "40px", borderRadius: "999px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
                  onClick={handleResyncAll}
                  disabled={resyncing || isSyncing || !isOnline}
                  data-tip="Reenvía TODOS los cambios locales de este dispositivo (recupera ediciones que no se sincronizaron)"
                >
                  {resyncing ? <><span className="spinner spinner-sm"></span>Reenviando</> : "Reenviar cambios"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: "auto", margin: 0, padding: "0 1rem", height: "40px", borderRadius: "999px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
                  onClick={triggerSync}
                  disabled={isSyncing || !isOnline}
                >
                  {isSyncing ? <><span className="spinner spinner-sm"></span>Sincronizando</> : "Sincronizar cola"}
                </button>
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
              </div></div></div>
            </section>
          );
        })()}

        {/* ── 4. GESTIÓN DE HABITACIONES (MASTER o ADMIN) ── */}
        {canManageRooms(currentUser.role) && (
          <section className="config-acc config-acc--salones" data-open={openAcc.has("salones")}>
            {accHead("salones", (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg>
            ), "Edificios y Salones", masterMode ? `Salones y camas · ${salonRefugioActivo || "campamento activo"}` : "Salones y camas de tu campamento",
              rooms.length > 0 ? <span className="config-acc__badge">{rooms.length}</span> : undefined
            )}
            <div className="config-acc__panel"><div className="config-acc__inner"><div className="config-acc__body">
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0" }}>
              Agregue salones {masterMode ? <>al campamento <strong>{salonRefugioActivo || "activo"}</strong> (cámbialo desde el selector del encabezado)</> : "a su campamento"}. Elija el tipo de contenedor y defina las camas disponibles de cada salón.
            </p>
            <div className="room-add-form pill-form">
              {/* Tipo de contenedor: Edificio / Piso / Otro */}
              <div className="room-type-toggle">
                {(["EDIFICIO", "PISO", "OTRO"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`room-type-btn ${newTipo === t ? "room-type-btn--active" : ""}`}
                    onClick={() => { setNewTipo(t); setNewContenedor(""); }}
                  >
                    {t === "EDIFICIO" ? "Edificio" : t === "PISO" ? "Piso" : "Otro"}
                  </button>
                ))}
              </div>
              <div className="room-add-inputs">
                <div className="room-add-field">
                  <label className="room-add-label">
                    {newTipo === "EDIFICIO" ? "N° de Edificio" : newTipo === "PISO" ? "N° de Piso" : "Nombre del área"}
                  </label>
                  <input
                    className="room-add-input"
                    placeholder={newTipo === "OTRO" ? "ej: Anexo B" : "ej: 3"}
                    value={newContenedor}
                    onChange={e => setNewContenedor(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addCustomCuarto()}
                  />
                </div>
                <div className="room-add-field">
                  <label className="room-add-label">Salón</label>
                  <input className="room-add-input" placeholder="ej: 33" value={newSalon}
                    onChange={e => setNewSalon(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustomCuarto()} />
                </div>
                <div className="room-add-field room-add-field--cap">
                  <label className="room-add-label">Camas</label>
                  <input className="room-add-input" type="number" min={1} max={999} placeholder="18" value={newCapacidad}
                    onChange={e => setNewCapacidad(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustomCuarto()} />
                </div>
                <button type="button" className="btn-submit btn-submit--sm" onClick={addCustomCuarto}
                  disabled={!newContenedor.trim() || !newSalon.trim()}>
                  Agregar
                </button>
              </div>
              {newContenedor.trim() && newSalon.trim() && (
                <p className="room-add-preview">
                  Se agregará: <strong>{formatRoomLabel(buildRoomKey(newTipo, newContenedor, newSalon))}</strong> &middot; {normalizeCap(newCapacidad)} camas
                </p>
              )}
            </div>
            <div className="room-list-section">
              <span className="room-list-label">
                Habitaciones registradas ({rooms.length})
              </span>
              {rooms.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.5rem 0 0 0" }}>
                  No hay habitaciones registradas en la base de datos.
                </p>
              ) : (
                (() => {
                  // Agrupa los salones por contenedor (la parte antes de " SALON ").
                  const groups: Record<string, string[]> = {};
                  rooms.forEach(key => {
                    const idx = key.lastIndexOf(" SALON ");
                    const contenedor = idx === -1 ? key : key.slice(0, idx);
                    if (!groups[contenedor]) groups[contenedor] = [];
                    groups[contenedor].push(key);
                  });
                  return Object.entries(groups).map(([contenedor, salones]) => (
                    <div key={contenedor} className="room-group">
                      <div className="room-group-title">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        {formatRoomLabel(contenedor)} <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>({salones.length})</span>
                      </div>
                      <div className="room-group-chips">
                        {salones.map(c => {
                          const idx = c.lastIndexOf(" SALON ");
                          const salonNum = idx === -1 ? c : c.slice(idx + 7);
                          return (
                            <span key={c} className="room-chip room-chip--custom">
                              Salón {salonNum}
                              <button type="button" className="room-chip-cap" onClick={() => openEditCap(c)} title="Editar capacidad de camas">
                                🛏 {roomCaps[c] ?? 18}
                              </button>
                              <button type="button" className="room-chip-remove" onClick={() => removeCustomCuarto(c)} title="Eliminar Habitación">×</button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>
            </div></div></div>
          </section>
        )}

        {/* Catálogos Médicos: la gestión de patologías y medicamentos se movió a la
            pestaña Morbilidad (dos botones + modales, componente CatalogosMedicos),
            visible solo para roles médicos con permiso. Ya no vive en Configuración. */}

        {/* ── 5. GESTIÓN DE REFUGIOS (solo MASTER) ── */}
        {isMaster(currentUser.role) && (
          <section className="config-acc config-acc--campamentos" data-open={openAcc.has("campamentos")}>
            {accHead("campamentos", (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            ), "Gestión de Campamentos", "Crear, renombrar y eliminar campamentos",
              refugios.length > 0 ? <span className="config-acc__badge">{refugios.length}</span> : undefined
            )}
            <div className="config-acc__panel"><div className="config-acc__inner"><div className="config-acc__body">
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0" }}>
              Administre los campamentos del sistema. Renombrar propaga el cambio a los operadores y registros asociados.
            </p>

            {!isOnline && (
              <div className="users-offline-notice" style={{ marginBottom: "0" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
                Sin conexión — no es posible listar o gestionar campamentos.
              </div>
            )}

            {/* Crear refugio */}
            <div className="room-add-form pill-form">
              <div className="room-add-inputs">
                <div className="room-add-field">
                  <label className="room-add-label">Nuevo campamento</label>
                  <input
                    className="room-add-input"
                    placeholder="Nombre del nuevo campamento"
                    value={newRefugio}
                    onChange={e => setNewRefugio(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCreateRefugio()}
                    disabled={!isOnline || creatingRefugio}
                  />
                </div>
                <button
                  type="button"
                  className="btn-submit btn-submit--sm"
                  onClick={handleCreateRefugio}
                  disabled={!newRefugio.trim() || !isOnline || creatingRefugio}
                >
                  {creatingRefugio ? <><span className="spinner spinner-sm"></span>Creando</> : "Agregar"}
                </button>
              </div>
            </div>

            {/* Lista de refugios */}
            <div className="room-list-section">
              <span className="room-list-label">Campamentos registrados ({refugios.length})</span>
              {loadingRefugios ? (
                <div className="status-msg status-msg--warning" style={{ marginTop: "0.5rem" }}>
                  <span className="spinner spinner-sm"></span> Cargando campamentos...
                </div>
              ) : refugios.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.5rem 0 0 0" }}>
                  No hay campamentos registrados en la base de datos.
                </p>
              ) : (
                <div className="sync-log-list" style={{ marginTop: "0.5rem" }}>
                  {refugios.map(rf => (
                    <div key={rf.id} className="sync-log-item" style={{ cursor: "default" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span className="sync-log-name">{rf.nombre}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexShrink: 0 }}>
                        <button
                          type="button"
                          className="dash-icon-btn"
                          data-tip="Renombrar"
                          disabled={!isOnline}
                          onClick={() => { setRefugioToRename(rf); setRefugioRenameValue(rf.nombre); setRefugioUbicacionValue(rf.ubicacion || ""); }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button
                          type="button"
                          className="dash-icon-btn"
                          data-tip="Eliminar"
                          style={{ color: "var(--color-danger)" }}
                          disabled={!isOnline}
                          onClick={() => setRefugioToDelete(rf)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div></div></div>
          </section>
        )}
        </div>
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

            <div className="pill-form" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label>Nombre y Apellido</label>
                <input
                  className="morb-control"
                  type="text"
                  value={localEditNombre}
                  onChange={(e) => setLocalEditNombre(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Cédula de Identidad</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <div style={{ width: "92px", flexShrink: 0 }}>
                    <StyledSelect
                      value={localEditNacionalidad}
                      onChange={setLocalEditNacionalidad}
                      options={[{ value: "V", label: "V" }, { value: "E", label: "E" }]}
                      ariaLabel="Nacionalidad"
                    />
                  </div>
                  <input
                    className="morb-control"
                    type="text"
                    value={localEditCedula}
                    onChange={(e) => setLocalEditCedula(e.target.value)}
                    style={{ flex: 1 }}
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
                {formatRoomLabel(roomToConfirmAdd.key)}
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

      {/* Modal: Editar Capacidad de Camas */}
      {roomToEditCap && (
        <div className="modal-overlay" onClick={() => setRoomToEditCap(null)}>
          <div className="modal-content modal-content--detail" onClick={e => e.stopPropagation()} style={{ maxWidth: "400px" }}>
            <div className="modal-header">
              <span className="modal-title">Capacidad de Camas</span>
              <button className="modal-close" onClick={() => setRoomToEditCap(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="pill-form" style={{ padding: "0.5rem 0", color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: "1.5" }}>
              <p>Número de camas disponibles en <strong>{formatRoomLabel(roomToEditCap)}</strong>:</p>
              <input
                className="morb-control"
                type="number"
                min={1}
                max={999}
                value={editCapValue}
                onChange={e => setEditCapValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveEditCap()}
                autoFocus
                style={{ margin: "0.75rem 0", width: "100%" }}
              />
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                Se usa en el select de asignación y en la estadística por habitación.
              </p>
            </div>

            <div className="modal-edit-actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="btn-secondary" onClick={() => setRoomToEditCap(null)}>
                Cancelar
              </button>
              <button type="button" className="btn-submit" style={{ flex: 1 }} onClick={saveEditCap} disabled={savingCap}>
                {savingCap ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Renombrar Refugio */}
      {refugioToRename && (
        <div className="modal-overlay" onClick={() => { setRefugioToRename(null); setRefugioRenameValue(""); setRefugioUbicacionValue(""); }}>
          <div className="modal-content modal-content--detail" onClick={e => e.stopPropagation()} style={{ maxWidth: "450px", width: "90%" }}>
            <div className="modal-header">
              <span className="modal-title">Editar Campamento</span>
              <button className="modal-close" onClick={() => { setRefugioToRename(null); setRefugioRenameValue(""); setRefugioUbicacionValue(""); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              El nuevo nombre se propagará automáticamente a todos los operadores y registros asociados a este campamento.
            </p>

            <div className="pill-form" style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div className="form-group">
                <label htmlFor="refugio-rename-input">Nombre del campamento</label>
                <input
                  className="morb-control"
                  type="text"
                  id="refugio-rename-input"
                  value={refugioRenameValue}
                  onChange={e => setRefugioRenameValue(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleRenameRefugioConfirmed()}
                />
              </div>

              <div className="form-group">
                <label htmlFor="refugio-ubicacion-input">Ubicación (link de Google Maps)</label>
                <input
                  className="morb-control"
                  type="text"
                  id="refugio-ubicacion-input"
                  placeholder="https://maps.app.goo.gl/..."
                  value={refugioUbicacionValue}
                  onChange={e => setRefugioUbicacionValue(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleRenameRefugioConfirmed()}
                />
                <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "0.3rem 0 0" }}>
                  Se usa en el reporte de WhatsApp de este campamento.
                </p>
              </div>
            </div>

            <div className="modal-edit-actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="btn-secondary" onClick={() => { setRefugioToRename(null); setRefugioRenameValue(""); setRefugioUbicacionValue(""); }}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-submit"
                style={{ flex: 1 }}
                onClick={handleRenameRefugioConfirmed}
                disabled={!refugioRenameValue.trim() || savingRefugioRename || (refugioRenameValue.trim() === refugioToRename.nombre && refugioUbicacionValue.trim() === (refugioToRename.ubicacion || ""))}
              >
                {savingRefugioRename ? <><span className="spinner spinner-sm"></span>Guardando</> : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminar Refugio */}
      {refugioToDelete && (
        <div className="modal-overlay" onClick={() => setRefugioToDelete(null)}>
          <div className="modal-content modal-content--detail" onClick={e => e.stopPropagation()} style={{ maxWidth: "400px" }}>
            <div className="modal-header">
              <span className="modal-title" style={{ color: "#ef4444" }}>⚠️ Confirmar Eliminación</span>
              <button className="modal-close" onClick={() => setRefugioToDelete(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ padding: "0.5rem 0", color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: "1.5" }}>
              <p>¿Estás seguro de que deseas eliminar el siguiente campamento de la base de datos?</p>
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
                {refugioToDelete.nombre}
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                Si el campamento tiene operadores o registros asociados, el sistema no permitirá eliminarlo.
              </p>
            </div>

            <div className="modal-edit-actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="btn-secondary" onClick={() => setRefugioToDelete(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-submit"
                style={{ flex: 1, backgroundColor: "#ef4444", borderColor: "#ef4444" }}
                onClick={handleDeleteRefugioConfirmed}
                disabled={deletingRefugio}
              >
                {deletingRefugio ? <><span className="spinner spinner-sm"></span>Eliminando</> : "Sí, Eliminar Campamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Mi Cuenta (autoservicio — editar SÓLO el propio nombre/contraseña; nunca el correo) */}
      {showAccount && (
        <div className="modal-overlay" onClick={closeAccount}>
          <div className="modal-content modal-content--detail" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px", width: "92%" }}>
            <div className="modal-header">
              <span className="modal-title">Mi Cuenta</span>
              <button className="modal-close" onClick={closeAccount}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <p className="config-account-note">Edita tu nombre o tu contraseña. El <strong>correo no se puede cambiar</strong>.</p>
            <div className="pill-form config-account config-account--stack">
              <div className="form-group">
                <label>Nombre</label>
                <input className="morb-control" type="text" value={miNombre} onChange={(e) => setMiNombre(e.target.value)} placeholder="Tu nombre" />
              </div>
              <div className="form-group">
                <label>Correo (no editable)</label>
                <input className="morb-control" type="text" value={currentUser.email} disabled title="El correo no se puede cambiar" />
              </div>
              <div className="config-account__divider"><span>Cambiar contraseña (opcional)</span></div>
              <div className="form-group">
                <label>Contraseña actual</label>
                <PasswordInput value={curPwd} onChange={setCurPwd} autoComplete="current-password" placeholder="••••••••" ariaLabel="Contraseña actual" />
              </div>
              <div className="form-group">
                <label>Nueva contraseña</label>
                <PasswordInput value={newPwd} onChange={setNewPwd} autoComplete="new-password" placeholder="Mín. 6 caracteres" ariaLabel="Nueva contraseña" />
              </div>
              <div className="form-group">
                <label>Confirmar nueva contraseña</label>
                <PasswordInput value={confPwd} onChange={setConfPwd} autoComplete="new-password" placeholder="Repite la nueva" ariaLabel="Confirmar nueva contraseña" />
              </div>
            </div>
            <div className="modal-edit-actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="btn-secondary" onClick={closeAccount} disabled={savingAccount}>Cancelar</button>
              <button type="button" className="btn-submit" style={{ flex: 1 }} onClick={handleSaveAccount} disabled={savingAccount || !isOnline}>
                {savingAccount ? <><span className="spinner spinner-sm"></span>Guardando</> : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
