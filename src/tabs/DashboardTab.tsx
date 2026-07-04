"use client";

// ── Pestaña: Panel de Estadísticas (Dashboard, solo ADMIN) ──────────────────
// Toda la vista del dashboard vive aquí: tarjetas de métricas, gráficos, matriz
// demográfica, distribución por habitación, modo presentación (fullscreen) y el
// generador de reporte para WhatsApp.
// Del context global consume: isOnline, loadingStats, stats, fetchStats,
// dashboardRooms, allCuartos, registros, localRecords, showToast.

import { useState, useEffect, useMemo, useRef } from "react";
import { useAppContext } from "@/context/AppContext";
import PresentationView from "@/components/PresentationView";
import { formatRoomLabel, roomFillLevel } from "@/lib/helpers";
import { DEFAULT_ENTES } from "@/lib/constants";
import { apiFetch } from "@/lib/apiFetch";
import StyledSelect from "@/components/StyledSelect";

// ── Íconos (stroke 24×24) para las tarjetas y paneles del panel de estadísticas.
// Mismo lenguaje visual que Balance de Salud (badge a color + acento por tarjeta).
const DASH_ICONS = {
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  family: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  child: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18a6 6 0 0 0-12 0"/><circle cx="8" cy="8" r="4"/><path d="M12 11h8M12 15h6"/></svg>,
  elder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M2 21h12"/><circle cx="8" cy="7" r="4"/></svg>,
  userx: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>,
  refresh: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  alert: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  heart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/></svg>,
  homeoff: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><line x1="9" y1="21" x2="9" y2="12"/><line x1="15" y1="21" x2="15" y2="12"/></svg>,
  chart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7" rx="1"/><rect x="12" y="6" width="3" height="11" rx="1"/><rect x="17" y="13" width="3" height="4" rx="1"/></svg>,
  cake: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21h16M4 21v-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M4 15c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1M12 8V5"/></svg>,
  venus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M12 13v8M9 18h6"/></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>,
  map: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>,
  bed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
};

export default function DashboardTab() {
  const {
    isOnline,
    loadingStats,
    stats,
    fetchStats,
    dashboardRooms,
    allCuartos,
    roomCapacities,
    registros,
    localRecords,
    showToast,
    currentUser,
    effectiveRefugio,
    refugiosList,
  } = useAppContext();

  // Modo presentación (pantalla completa)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isUpdatingPresentation, setIsUpdatingPresentation] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Estado del generador de reporte para WhatsApp
  const [showReportModal, setShowReportModal] = useState(false);
  const [personalTrabajo, setPersonalTrabajo] = useState(84);
  const [incluirDistribucion, setIncluirDistribucion] = useState(true);
  const [entes, setEntes] = useState<string[]>(DEFAULT_ENTES);
  const [newEnte, setNewEnte] = useState("");

  // Estado de "Compartir reporte por link público"
  const isMasterUser = currentUser?.role === "MASTER";
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareRefugio, setShareRefugio] = useState(""); // Master: "" = todos
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [myShares, setMyShares] = useState<Array<{ id: string; refugio: string | null; activo: boolean; createdAt: string; _count: { accesos: number } }>>([]);

  const cargarShares = async () => {
    try {
      const r = await apiFetch("/api/reporte");
      const d = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(d.reportes)) setMyShares(d.reportes);
    } catch { /* noop */ }
  };

  const abrirCompartir = () => {
    setShareLink("");
    setShareCopied(false);
    setShareRefugio(isMasterUser ? "" : (campamentoActivo || ""));
    setShowShareModal(true);
    cargarShares();
  };

  const generarShare = async () => {
    setShareLoading(true);
    try {
      const body = isMasterUser ? { refugio: shareRefugio || null } : {};
      const r = await apiFetch("/api/reporte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.token) {
        setShareLink(`${window.location.origin}/reporte/${d.token}`);
        setShareCopied(false);
        cargarShares();
      } else {
        showToast(d.error || "No se pudo generar el link", "error");
      }
    } catch {
      showToast("No se pudo generar el link", "error");
    } finally {
      setShareLoading(false);
    }
  };

  const copiarShare = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      showToast("No se pudo copiar", "error");
    }
  };

  const revocarShare = async (id: string) => {
    try {
      const r = await apiFetch(`/api/reporte?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (r.ok) {
        setMyShares((prev) => prev.map((s) => (s.id === id ? { ...s, activo: false } : s)));
        showToast("Link revocado", "success");
      }
    } catch {
      showToast("No se pudo revocar", "error");
    }
  };

  // Listen to fullscreen changes to sync React state
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    document.addEventListener("mozfullscreenchange", handleFsChange);
    document.addEventListener("MSFullscreenChange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
      document.removeEventListener("mozfullscreenchange", handleFsChange);
      document.removeEventListener("MSFullscreenChange", handleFsChange);
    };
  }, []);

  // Automatically refresh stats every 5 seconds when in fullscreen presentation mode
  useEffect(() => {
    if (isFullscreen && isOnline) {
      const interval = setInterval(() => {
        setIsUpdatingPresentation(true);
        Promise.resolve(fetchStats(true, true)).finally(() => {
          setIsUpdatingPresentation(false);
        });
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isFullscreen, isOnline]);

  // Local Offline statistics calculation helper
  const getLocalStats = () => {
    const activeRecords = localRecords.filter(r => (r.data as any).retirado !== "SI");
    const retiredRecords = localRecords.filter(r => (r.data as any).retirado === "SI");

    const total = activeRecords.length;
    const totalRetirados = retiredRecords.length;
    const totalRegistrados = total + totalRetirados;

    // Calculate families
    const familyGroups: Record<string, number> = {};
    activeRecords.forEach(r => {
      let familyId = "";
      if (r.data.jefeFamilia === "SI") {
        familyId = r.data.cedula;
      } else if (r.data.cedulaJefeFamilia) {
        familyId = r.data.cedulaJefeFamilia;
      } else {
        familyId = r.data.cedula;
      }
      familyGroups[familyId] = (familyGroups[familyId] || 0) + 1;
    });

    let nucleosFamiliares = 0;
    let individuosSolos = 0;
    Object.values(familyGroups).forEach(size => {
      if (size >= 2) {
        nucleosFamiliares++;
      } else {
        individuosSolos++;
      }
    });

    const intermitentes = activeRecords.filter(r => (r.data as any).intermitente === "SI").length;
    const lesionados    = activeRecords.filter(r => (r.data as any).estadoFisico === "LESIONADO").length;
    const conPatologia  = activeRecords.filter(r => (r.data as any).patologia === "SI").length;
    const sinCuarto     = activeRecords.filter(r => !(r.data as any).cuarto).length;

    if (total === 0) {
      return {
        total: 0,
        totalRegistrados,
        totalRetirados,
        nucleosFamiliares: 0,
        individuosSolos: 0,
        menores: 0,
        adultos: 0,
        mayores: 0,
        matrix: {
          menores: { femenino: 0, masculino: 0, otro: 0 },
          adultos: { femenino: 0, masculino: 0, otro: 0 },
          mayores: { femenino: 0, masculino: 0, otro: 0 }
        },
        byParroquia: [],
        byGenero: [],
        byEstadoFisico: [],
        byPatologia: [],
        promedioEdad: 0,
        intermitentes: 0,
        lesionados: 0,
        conPatologia: 0,
        sinCuarto: 0
      };
    }

    const byParroquiaMap: Record<string, number> = {};
    const byGeneroMap: Record<string, number> = {};
    const byEstadoFisicoMap: Record<string, number> = {};
    const byPatologiaMap: Record<string, number> = {};
    let sumAge = 0;
    let menores = 0;
    let adultos = 0;
    let mayores = 0;

    const matrix = {
      menores: { femenino: 0, masculino: 0, otro: 0 },
      adultos: { femenino: 0, masculino: 0, otro: 0 },
      mayores: { femenino: 0, masculino: 0, otro: 0 }
    };

    activeRecords.forEach(r => {
      const p = r.data.parroquia || "DESCONOCIDO";
      byParroquiaMap[p] = (byParroquiaMap[p] || 0) + 1;

      const g = r.data.genero || "DESCONOCIDO";
      byGeneroMap[g] = (byGeneroMap[g] || 0) + 1;

      const ef = r.data.estadoFisico || "DESCONOCIDO";
      byEstadoFisicoMap[ef] = (byEstadoFisicoMap[ef] || 0) + 1;

      const pat = r.data.patologia || "NO";
      byPatologiaMap[pat] = (byPatologiaMap[pat] || 0) + 1;

      const edadVal = parseInt(String(r.data.edad), 10);
      const gVal = String(r.data.genero || "").toUpperCase();
      const isFem = gVal === "FEMENINO";
      const isMasc = gVal === "MASCULINO";

      if (!isNaN(edadVal)) {
        sumAge += edadVal;
        if (edadVal < 18) {
          menores++;
          if (isFem) matrix.menores.femenino++;
          else if (isMasc) matrix.menores.masculino++;
          else matrix.menores.otro++;
        } else if (edadVal < 60) {
          adultos++;
          if (isFem) matrix.adultos.femenino++;
          else if (isMasc) matrix.adultos.masculino++;
          else matrix.adultos.otro++;
        } else {
          mayores++;
          if (isFem) matrix.mayores.femenino++;
          else if (isMasc) matrix.mayores.masculino++;
          else matrix.mayores.otro++;
        }
      }
    });

    const byParroquia = Object.keys(byParroquiaMap).map(name => ({ name, count: byParroquiaMap[name] }));
    const byGenero = Object.keys(byGeneroMap).map(name => ({ name, count: byGeneroMap[name] }));
    const byEstadoFisico = Object.keys(byEstadoFisicoMap).map(name => ({ name, count: byEstadoFisicoMap[name] }));
    const byPatologia = Object.keys(byPatologiaMap).map(name => ({ name, count: byPatologiaMap[name] }));
    const promedioEdad = Math.round(sumAge / total);

    return {
      total,
      totalRegistrados,
      totalRetirados,
      nucleosFamiliares,
      individuosSolos,
      menores,
      adultos,
      mayores,
      matrix,
      byParroquia,
      byGenero,
      byEstadoFisico,
      byPatologia,
      promedioEdad,
      intermitentes,
      lesionados,
      conPatologia,
      sinCuarto
    };
  };

  const currentStats = useMemo(
    () => (isOnline && stats) ? stats : getLocalStats(),
    [isOnline, stats, localRecords]
  );

  const roomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allCuartos.forEach(room => {
      counts[room] = 0;
    });
    registros.filter(r => r.retirado !== "SI" && r.cuarto).forEach(r => {
      if (r.cuarto && counts[r.cuarto] !== undefined) {
        counts[r.cuarto]++;
      }
    });
    return counts;
  }, [registros, allCuartos]);

  // Helper to generate the WhatsApp report text
  const generateReportText = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const dateTimeStr = `${day}/${month} || Hora: ${hours}:${minutes}hrs`;

    const t = currentStats.total || 0;
    const may = currentStats.mayores || 0;
    const mayM = currentStats.matrix?.mayores?.masculino || 0;
    const mayF = currentStats.matrix?.mayores?.femenino || 0;

    const ad = currentStats.adultos || 0;
    const adM = currentStats.matrix?.adultos?.masculino || 0;
    const adF = currentStats.matrix?.adultos?.femenino || 0;

    const men = currentStats.menores || 0;
    const menF = currentStats.matrix?.menores?.femenino || 0;
    const menM = currentStats.matrix?.menores?.masculino || 0;

    const familias = currentStats.nucleosFamiliares || 0;
    const solos = currentStats.individuosSolos || 0;
    const retirados = currentStats.totalRetirados || 0;

    const parroquiasSorted = [...(currentStats.byParroquia || [])].sort((a, b) => b.count - a.count);
    const parroquiasList = parroquiasSorted.map(p => {
      const pct = t > 0 ? Math.round(p.count / t * 100) : 0;
      const countStr = String(p.count).padStart(2, '0');
      return pct > 0 ? `- ${p.name}: ${countStr} (${pct}%)` : `- ${p.name}: ${countStr}`;
    }).join("\n");

    const entesList = entes.map(e => `- ${e}`).join("\n");

    // El reporte es del refugio ACTIVO: Master usa el del selector del header
    // (effectiveRefugio); el resto, su propio refugio. La ubicación sale de la BD.
    const refugioActivo = effectiveRefugio || currentUser?.campamentoTransitorio || "";
    const ubicacion = refugiosList.find(r => r.nombre === refugioActivo)?.ubicacion || "";

    return `*Campamento Transitorio ${refugioActivo}.*

Fecha y Hora: ${dateTimeStr}${ubicacion ? `\nUbicación: ${ubicacion}` : ""}

Total general: ${t} personas
Núcleos Familiares: ${familias}
Personas solas: ${solos}

Adultos Mayores: ${may}
${String(mayM).padStart(2, '0')} masculinos
${String(mayF).padStart(2, '0')} femeninos

Adultos: ${ad}
${String(adM).padStart(2, '0')} masculino
${String(adF).padStart(2, '0')} femenino

Niños: ${men}
${String(menF).padStart(2, '0')} niñas
${String(menM).padStart(2, '0')} niños
${incluirDistribucion ? `
Distribución territorial:
${parroquiasList}
` : ""}
Personas retiradas en refugios solidarios: ${String(retirados).padStart(2, '0')}

Personal de trabajo: ${personalTrabajo} personas.
Entes Presentes:
${entesList}`;
  };

  const handleShareReport = () => {
    const text = generateReportText();
    navigator.clipboard.writeText(text).then(() => {
      showToast("Reporte copiado al portapapeles.", "success");
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank");
    }).catch(() => {
      showToast("No se pudo copiar el texto automáticamente. Cópielo manualmente.", "error");
    });
  };

  const handleAddEnte = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEnte.trim()) {
      setEntes(prev => [...prev, newEnte.trim()]);
      setNewEnte("");
    }
  };

  const handleRemoveEnte = (index: number) => {
    setEntes(prev => prev.filter((_, i) => i !== index));
  };

  const campamentoActivo = effectiveRefugio || currentUser?.campamentoTransitorio || "";

  return (
    <>
        {/* Nota: NO se agrega la clase `presentation-mode` en pantalla completa.
            Esas reglas eran para el viejo dashboard-en-fullscreen (ya no se
            renderiza; lo reemplaza <PresentationView/>). Una de ellas
            (`.presentation-mode svg { background:#fff !important }`) pintaba un
            cuadrado blanco detrás de CADA ícono de la presentación. */}
        <div ref={dashboardRef} className={`tab-view tab-view--dashboard tab-enter`}>
          {isFullscreen ? (
            <PresentationView
              stats={currentStats}
              roomCounts={roomCounts}
              roomCapacities={roomCapacities}
              allCuartos={allCuartos}
              refugio={campamentoActivo}
              onExit={() => { try { document.exitFullscreen?.(); } catch {} }}
            />
          ) : (
          <>

          {/* Membrete institucional — solo visible al imprimir / exportar PDF */}
          <div className="print-letterhead">
            <img src="/logo_gob.webp" alt="Gobernación La Guaira" className="print-letterhead-logo" />
            <div className="print-letterhead-text">
              <span className="print-letterhead-org">Gobernación del Estado La Guaira</span>
              <h1 className="print-letterhead-title">Panel de Estadísticas</h1>
              <span className="print-letterhead-sub">{campamentoActivo || "Campamento Transitorio"} &middot; La Guaira 2026</span>
            </div>
            <div className="print-letterhead-meta">Generado:<br />{new Date().toLocaleString("es-VE")}</div>
          </div>

          <div className="dashboard-header-card bal-hero dash-hero">
            <span className="bal-hero__icon">{DASH_ICONS.chart}</span>
            <div className="bal-hero__text">
              <h2>Panel de Estadísticas</h2>
              <p>
                {campamentoActivo ? <span className="bal-hero__chip">{campamentoActivo}</span> : "Consolidado general"}
                {isUpdatingPresentation && (
                  <span className="dash-hero__live"><span className="pulse-dot" /> Actualizando…</span>
                )}
              </p>
            </div>
            <div className="dash-action-group">
              <button
                type="button"
                className="dash-icon-btn"
                data-tip={isFullscreen ? "Salir presentación" : "Modo presentación"}
                onClick={() => {
                  if (document.fullscreenElement) {
                    document.exitFullscreen();
                  } else {
                    dashboardRef.current?.requestFullscreen();
                  }
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
              </button>
              <button
                type="button"
                className="dash-icon-btn"
                data-tip="Imprimir / PDF"
                onClick={() => window.print()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              </button>
              <button
                type="button"
                className="dash-icon-btn"
                data-tip="Compartir por link"
                onClick={abrirCompartir}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
              <div className="dash-action-sep" />
              <button
                type="button"
                className="dash-wa-btn"
                onClick={() => setShowReportModal(true)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.124 1.534 5.857L.057 23.882a.5.5 0 0 0 .606.606l6.058-1.476A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.65-.52-5.157-1.424l-.369-.221-3.827.931.957-3.773-.242-.388A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                Reporte
              </button>
            </div>
          </div>

          {/* Connection status notification for stats */}
          {!isOnline && (
            <div className="status-bar status-bar--warning">
              <div className="status-indicator">
                <span className="status-dot offline"></span>
                <span className="text-warning">Sin conexión: Estadísticas de registros locales</span>
              </div>
            </div>
          )}

          {loadingStats ? (
            <div className="form-card loading-center">
              <span className="spinner spinner-lg"></span>
              <span>Cargando métricas consolidadas...</span>
            </div>
          ) : (
            <>
              {/* Tarjetas de indicadores (lenguaje .bal-* con acento por métrica) */}
              {(() => {
                const S = currentStats;
                const tot = S.total || 0;
                const pc = (n: number) => (tot > 0 ? `${((n / tot) * 100).toFixed(1)}%` : null);
                const statCards: { label: string; value: number; suffix?: string; sub?: string | null; accent: string; icon: React.ReactNode }[] = [
                  { label: "Total Registrados", value: S.totalRegistrados || 0, accent: "#2563eb", icon: DASH_ICONS.users },
                  { label: "Presentes en Campamento", value: S.total || 0, accent: "#0d9488", icon: DASH_ICONS.home },
                  { label: "Núcleos Familiares", value: S.nucleosFamiliares || 0, accent: "#7c3aed", icon: DASH_ICONS.family },
                  { label: "Individuos Solos", value: S.individuosSolos || 0, accent: "#64748b", icon: DASH_ICONS.user },
                  { label: "Menores (<18)", value: S.menores || 0, sub: pc(S.menores || 0), accent: "#10b981", icon: DASH_ICONS.child },
                  { label: "Adultos (18–59)", value: S.adultos || 0, sub: pc(S.adultos || 0), accent: "#f59e0b", icon: DASH_ICONS.user },
                  { label: "Mayores (60+)", value: S.mayores || 0, sub: pc(S.mayores || 0), accent: "#8b5cf6", icon: DASH_ICONS.elder },
                  { label: "Personas Retiradas", value: S.totalRetirados || 0, accent: "#dc2626", icon: DASH_ICONS.userx },
                  { label: "Intermitentes Activos", value: S.intermitentes || 0, sub: pc(S.intermitentes || 0), accent: "#d97706", icon: DASH_ICONS.refresh },
                  { label: "Edad Promedio", value: S.promedioEdad || 0, suffix: "años", accent: "#0284c7", icon: DASH_ICONS.calendar },
                  { label: "Lesionados", value: S.lesionados || 0, sub: pc(S.lesionados || 0), accent: "#e11d48", icon: DASH_ICONS.alert },
                  { label: "Con Patología", value: S.conPatologia || 0, sub: pc(S.conPatologia || 0), accent: "#db2777", icon: DASH_ICONS.heart },
                  { label: "Sin Alojamiento", value: S.sinCuarto || 0, sub: pc(S.sinCuarto || 0), accent: "#64748b", icon: DASH_ICONS.homeoff },
                ];
                return (
                  <div className="bal-cards dash-cards">
                    {statCards.map((c) => (
                      <div key={c.label} className="bal-card" style={{ ["--accent" as any]: c.accent } as React.CSSProperties}>
                        <span className="bal-card__icon">{c.icon}</span>
                        <span key={c.value} className="bal-card__value stat-card-value-animate">{c.value}{c.suffix && <em>{c.suffix}</em>}</span>
                        <span className="bal-card__label">{c.label}{c.sub && <span className="bal-card__sub"> · {c.sub}</span>}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              <div className="stats-charts-grid">
                {/* Distribución por Grupos de Edad - Segmentado */}
                <div className="dashboard-section">
                <div className="dash-sec-head" style={{ ["--accent" as any]: "#f59e0b" } as React.CSSProperties}><span className="dash-sec-head__ico">{DASH_ICONS.cake}</span><h3 className="dashboard-section-title">Distribución de Población por Edad</h3></div>
                {currentStats.total === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "0.5rem 0" }}>Sin datos</p>
                ) : (
                  <div className="segmented-bar-container">
                    {(() => {
                      const t = currentStats.total || 1;
                      const pMen = (currentStats.menores || 0) / t * 100;
                      const pAd  = (currentStats.adultos  || 0) / t * 100;
                      const pMay = (currentStats.mayores  || 0) / t * 100;
                      const segs = [
                        { pct: pMen, count: currentStats.menores || 0, color: "var(--chart-menores)" },
                        { pct: pAd,  count: currentStats.adultos  || 0, color: "var(--chart-adultos)" },
                        { pct: pMay, count: currentStats.mayores  || 0, color: "var(--chart-mayores)" }
                      ];
                      return (
                        <>
                          <div className="segmented-bar-track" style={{ position: "relative", height: "28px", borderRadius: "6px", overflow: "hidden", display: "flex" }}>
                            {segs.map((s, i) => (
                              <div key={i} style={{ width: `${s.pct}%`, backgroundColor: s.color, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", transition: "width 0.4s ease" }}>
                                {s.pct >= 15 && (
                                  <span style={{ fontSize: "0.625rem", fontWeight: "700", color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap" }}>
                                    {s.count} · {s.pct.toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="segmented-bar-legend">
                            <span className="legend-item"><span className="legend-dot" style={{ backgroundColor: "var(--chart-menores)" }}></span> Menores · <strong>{currentStats.menores || 0}</strong> ({pMen.toFixed(1)}%)</span>
                            <span className="legend-item"><span className="legend-dot" style={{ backgroundColor: "var(--chart-adultos)" }}></span> Adultos · <strong>{currentStats.adultos || 0}</strong> ({pAd.toFixed(1)}%)</span>
                            <span className="legend-item"><span className="legend-dot" style={{ backgroundColor: "var(--chart-mayores)" }}></span> Mayores · <strong>{currentStats.mayores || 0}</strong> ({pMay.toFixed(1)}%)</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Distribución por Género - Dona SVG pura */}
              <div className="dashboard-section">
                <div className="dash-sec-head" style={{ ["--accent" as any]: "#db2777" } as React.CSSProperties}><span className="dash-sec-head__ico">{DASH_ICONS.venus}</span><h3 className="dashboard-section-title">Distribución de Población por Género</h3></div>
                {currentStats.total === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "0.5rem 0" }}>Sin datos</p>
                ) : (
                  (() => {
                    const t = currentStats.total || 1;
                    const f = currentStats.byGenero.find((g: any) => g.name === "FEMENINO")?.count || 0;
                    const m = currentStats.byGenero.find((g: any) => g.name === "MASCULINO")?.count || 0;
                    const pFem  = f / t * 100;
                    const pMasc = m / t * 100;

                    // SVG donut: r=38, circumference ≈ 238.76
                    const r = 38;
                    const cx = 50;
                    const cy = 50;
                    const circ = 2 * Math.PI * r;
                    const segments = [
                      { count: f, pct: pFem,  color: "var(--chart-femenino)",  label: "Femenino"  },
                      { count: m, pct: pMasc, color: "var(--chart-masculino)", label: "Masculino" },
                    ];
                    let offset = 0;
                    const arcs = segments.map(seg => {
                      const dash  = (seg.pct / 100) * circ;
                      const gap   = circ - dash;
                      const rotate = (offset / 100) * 360 - 90;
                      offset += seg.pct;
                      return { ...seg, dash, gap, rotate };
                    });

                    return (
                      <div className="donut-chart-wrapper">
                        <svg viewBox="0 0 100 100" width="110" height="110" style={{ flexShrink: 0 }}>
                          {arcs.map((arc, i) => (
                            <circle
                              key={i}
                              cx={cx} cy={cy} r={r}
                              fill="none"
                              stroke={arc.color}
                              strokeWidth="14"
                              strokeDasharray={`${arc.dash} ${arc.gap}`}
                              strokeDashoffset={0}
                              transform={`rotate(${arc.rotate} ${cx} ${cy})`}
                              style={{ transition: "stroke-dasharray 0.4s ease" }}
                            />
                          ))}
                          <text x="50" y="46" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" style={{ fill: "var(--text-primary)" }}>{currentStats.total}</text>
                          <text x="50" y="57" textAnchor="middle" fontSize="6.5" fill="currentColor" style={{ fill: "var(--text-muted)" }}>Total</text>
                        </svg>
                        <div className="donut-legend">
                          {arcs.map((arc, i) => (
                            <div key={i} className="donut-legend-item">
                              <span className="donut-legend-dot" style={{ backgroundColor: arc.color }}></span>
                              <span>{arc.label}</span>
                              <span className="donut-legend-pct">{arc.count} <span style={{ fontWeight: "normal", color: "var(--text-muted)" }}>({arc.pct.toFixed(1)}%)</span></span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Matriz de Frecuencias Demográficas (Cruce de variables) */}
              <div className="dashboard-section">
                <div className="dash-sec-head" style={{ ["--accent" as any]: "#7c3aed" } as React.CSSProperties}><span className="dash-sec-head__ico">{DASH_ICONS.grid}</span><h3 className="dashboard-section-title">Matriz de Frecuencias Demográficas</h3></div>
                {(() => {
                  const mx = currentStats.matrix || {
                    menores: { femenino: 0, masculino: 0, otro: 0 },
                    adultos: { femenino: 0, masculino: 0, otro: 0 },
                    mayores: { femenino: 0, masculino: 0, otro: 0 }
                  };
                  const tMen = mx.menores.femenino + mx.menores.masculino + mx.menores.otro;
                  const tAd  = mx.adultos.femenino  + mx.adultos.masculino  + mx.adultos.otro;
                  const tMay = mx.mayores.femenino  + mx.mayores.masculino  + mx.mayores.otro;
                  const tFem  = mx.menores.femenino  + mx.adultos.femenino  + mx.mayores.femenino;
                  const tMasc = mx.menores.masculino + mx.adultos.masculino + mx.mayores.masculino;
                  const tOtr  = mx.menores.otro      + mx.adultos.otro      + mx.mayores.otro;

                  // heatmap intensity per column (relative to column max)
                  const maxFem  = Math.max(mx.menores.femenino,  mx.adultos.femenino,  mx.mayores.femenino)  || 1;
                  const maxMasc = Math.max(mx.menores.masculino, mx.adultos.masculino, mx.mayores.masculino) || 1;
                  const maxOtr  = Math.max(mx.menores.otro,      mx.adultos.otro,      mx.mayores.otro)      || 1;
                  const hFem  = (v: number) => ({ background: `rgba(219, 39, 119, ${(v / maxFem)  * 0.18})` });
                  const hMasc = (v: number) => ({ background: `rgba(37, 99, 235,   ${(v / maxMasc) * 0.18})` });
                  const hOtr  = (v: number) => ({ background: `rgba(100, 116, 139, ${(v / maxOtr)  * 0.18})` });

                  return (
                    <div className="bal-matrix-wrap">
                      <table className="bal-matrix">
                        <thead>
                          <tr>
                            <th>Grupo de Edad</th>
                            <th>Femenino</th>
                            <th>Masculino</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td><strong>Menores (&lt;18)</strong></td>
                            <td className="bal-cell bal-cell--f" data-label="Femenino" style={hFem(mx.menores.femenino)}>{mx.menores.femenino}</td>
                            <td className="bal-cell bal-cell--m" data-label="Masculino" style={hMasc(mx.menores.masculino)}>{mx.menores.masculino}</td>
                            <td className="bal-cell--tot" data-label="Total"><strong>{tMen}</strong></td>
                          </tr>
                          <tr>
                            <td><strong>Adultos (18-59)</strong></td>
                            <td className="bal-cell bal-cell--f" data-label="Femenino" style={hFem(mx.adultos.femenino)}>{mx.adultos.femenino}</td>
                            <td className="bal-cell bal-cell--m" data-label="Masculino" style={hMasc(mx.adultos.masculino)}>{mx.adultos.masculino}</td>
                            <td className="bal-cell--tot" data-label="Total"><strong>{tAd}</strong></td>
                          </tr>
                          <tr>
                            <td><strong>Mayores (60+)</strong></td>
                            <td className="bal-cell bal-cell--f" data-label="Femenino" style={hFem(mx.mayores.femenino)}>{mx.mayores.femenino}</td>
                            <td className="bal-cell bal-cell--m" data-label="Masculino" style={hMasc(mx.mayores.masculino)}>{mx.mayores.masculino}</td>
                            <td className="bal-cell--tot" data-label="Total"><strong>{tMay}</strong></td>
                          </tr>
                          <tr className="bal-matrix__total">
                            <td><strong>Total General</strong></td>
                            <td className="bal-cell bal-cell--f" data-label="Femenino"><strong>{tFem}</strong></td>
                            <td className="bal-cell bal-cell--m" data-label="Masculino"><strong>{tMasc}</strong></td>
                            <td className="bal-cell--tot" data-label="Total"><strong>{currentStats.total}</strong></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* Afectados por Parroquia */}
              <div className="dashboard-section">
                <div className="dash-sec-head" style={{ ["--accent" as any]: "#0d9488" } as React.CSSProperties}><span className="dash-sec-head__ico">{DASH_ICONS.map}</span><h3 className="dashboard-section-title">Afectados por Parroquia</h3></div>
                {currentStats.byParroquia.length === 0 ? (
                  <p className="data-empty">
                    No hay datos registrados aún.
                  </p>
                ) : (() => {
                  const rows = [...currentStats.byParroquia].sort((a: any, b: any) => b.count - a.count);
                  const maxP = Math.max(1, ...rows.map((x: any) => x.count));
                  return (
                    <div className="bal-rank">
                      {rows.map((p: any, i: number) => (
                        <div key={p.name} className="bal-rank__row">
                          <span className={`bal-rank__pos ${i < 3 ? `bal-rank__pos--${i + 1}` : ""}`}>{i + 1}</span>
                          <span className="bal-rank__label" title={p.name}>{p.name}</span>
                          <span className="bal-rank__track"><span className="bal-rank__fill" style={{ width: `${Math.round((p.count / maxP) * 100)}%` }} /></span>
                          <span className="bal-rank__count">{p.count}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Salud y Condición Física */}
              <div className="dashboard-section dashboard-section--wide">
                <div className="dash-sec-head" style={{ ["--accent" as any]: "#e11d48" } as React.CSSProperties}><span className="dash-sec-head__ico">{DASH_ICONS.heart}</span><h3 className="dashboard-section-title">Salud y Condición Física</h3></div>
                <div className="tab-view" style={{ gap: "1rem" }}>
                  {/* Estado Físico - Gauges semicirculares SVG */}
                  <div>
                    <h4 className="subsection-title">Estado Físico</h4>
                    {currentStats.byEstadoFisico.length === 0 ? (
                      <p className="data-empty-sm">Sin datos</p>
                    ) : (
                      (() => {
                        const ileso    = currentStats.byEstadoFisico.find((e: any) => e.name === "ILESO")?.count || 0;
                        const lesionado = currentStats.byEstadoFisico.find((e: any) => e.name === "LESIONADO" || e.name === "LECIONADO")?.count || 0;
                        const t = currentStats.total || 1;
                        // Semicircle gauge: arc on a 100×60 viewBox, r=40, half-circumference=125.66
                        const halfCirc = Math.PI * 40;
                        const gaugeArc = (pct: number) => {
                          const filled = (pct / 100) * halfCirc;
                          return `${filled} ${halfCirc - filled}`;
                        };
                        const gauges = [
                          { label: "Ilesos",     count: ileso,    pct: (ileso    / t * 100), color: "var(--chart-ileso)",    track: "var(--chart-ileso-track)" },
                          { label: "Lesionados", count: lesionado, pct: (lesionado / t * 100), color: "var(--chart-lesionado)", track: "var(--chart-lesionado-track)" }
                        ];
                        return (
                          <div className="gauge-wrapper">
                            {gauges.map(g => (
                              <div key={g.label} className="gauge-item">
                                <svg viewBox="0 0 100 56" width="110" height="62">
                                  {/* track */}
                                  <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={g.track} strokeWidth="12" strokeLinecap="round" />
                                  {/* filled arc */}
                                  <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={g.color} strokeWidth="12" strokeLinecap="round"
                                    strokeDasharray={gaugeArc(g.pct)}
                                    style={{ transition: "stroke-dasharray 0.5s ease" }} />
                                  <text x="50" y="44" textAnchor="middle" fontSize="14" fontWeight="800" style={{ fill: "var(--text-primary)" }}>{g.count}</text>
                                </svg>
                                <span className="gauge-label">{g.label}</span>
                                <span className="gauge-pct">{g.pct.toFixed(1)}%</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()
                    )}
                  </div>

                  {/* Patologías Crónicas */}
                  <div>
                    <h4 className="subsection-title subsection-title--compact">Patologías Crónicas</h4>
                    {currentStats.byPatologia.length === 0 ? (
                      <p className="data-empty-sm">Sin datos</p>
                    ) : (
                      <div className="bar-list bar-list--sm">
                        {currentStats.byPatologia.map((pat: any) => {
                          const percentage = currentStats.total > 0 ? Math.round((pat.count / currentStats.total) * 100) : 0;
                          const barColor = pat.name === "SI" ? "var(--color-warning)" : "#94a3b8";
                          return (
                            <div key={pat.name} className="bar-item">
                              <div className="bar-item-header bar-item-header--sm">
                                <span>{pat.name === "SI" ? "SÍ POSEE PATOLOGÍA" : "NO POSEE PATOLOGÍA"}</span>
                                <span>{pat.count} ({percentage}%)</span>
                              </div>
                              <div className="bar-track-sm">
                                <div className="bar-fill" style={{ width: `${percentage}%`, background: barColor }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Distribución por Habitación / Salón */}
              <div className="dashboard-section" style={{ gridColumn: "1 / -1", marginTop: "1rem" }}>
                <div className="dash-sec-head" style={{ ["--accent" as any]: "#2563eb" } as React.CSSProperties}><span className="dash-sec-head__ico">{DASH_ICONS.bed}</span><h3 className="dashboard-section-title">Distribución por Habitación / Salón</h3></div>
                <div className="dash-rooms">
                  {dashboardRooms.map(room => {
                    const count = roomCounts[room] || 0;
                    const isDeleted = !allCuartos.includes(room);
                    const cap = roomCapacities[room] ?? 18;

                    let level: "green" | "yellow" | "red" | "gray" = "green";
                    if (isDeleted) {
                      level = "gray";
                    } else {
                      const f = roomFillLevel(count, cap);
                      level = f === "red" ? "red" : f === "yellow" ? "yellow" : "green";
                    }

                    return (
                      <div key={room} className={`dash-room dash-room--${level}`}>
                        <span className="dash-room__name">
                          {formatRoomLabel(room)}
                          {isDeleted && <small>Inactiva</small>}
                        </span>
                        <span className="dash-room__num">
                          {isDeleted ? `${count}` : `${count}/${cap}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
          </>
          )}
        </div>

      {/* WhatsApp Report Generator Modal */}
      {showReportModal && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="modal-content modal-content--detail" onClick={e => e.stopPropagation()} style={{ maxWidth: "600px", width: "95%" }}>
            <div className="modal-header">
              <span className="modal-title" style={{ fontSize: "0.95rem", lineHeight: "1.2" }}>Generador de Reporte para WhatsApp</span>
              <button className="modal-close" onClick={() => setShowReportModal(false)}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem", maxHeight: "65vh", overflowY: "auto", paddingRight: "5px" }}>
              <div className="form-group">
                <label htmlFor="rep-personal">Personal de Trabajo</label>
                <input
                  type="number"
                  id="rep-personal"
                  value={personalTrabajo}
                  onChange={e => setPersonalTrabajo(parseInt(e.target.value, 10) || 0)}
                  min="0"
                />
              </div>

              <div className="form-group">
                <label>Entes Presentes</label>
                <form onSubmit={handleAddEnte} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", width: "100%" }}>
                  <input
                    type="text"
                    placeholder="Agregar nuevo ente..."
                    value={newEnte}
                    onChange={e => setNewEnte(e.target.value)}
                    style={{ flex: 1, minWidth: "120px" }}
                  />
                  <button type="submit" className="btn-submit" style={{ width: "auto", margin: 0, padding: "0 1rem" }}>Agregar</button>
                </form>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: "150px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "0.5rem" }}>
                  {entes.map((ente, index) => (
                    <div key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", padding: "2px 0" }}>
                      <span style={{ wordBreak: "break-all", paddingRight: "5px" }}>• {ente}</span>
                      <button type="button" onClick={() => handleRemoveEnte(index)} style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", fontWeight: "bold", padding: "0 5px" }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)" }}>
                <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500 }}>Incluir Distribución Territorial</span>
                <button
                  type="button"
                  onClick={() => setIncluirDistribucion(v => !v)}
                  style={{
                    position: "relative", display: "inline-flex", alignItems: "center",
                    width: "42px", height: "24px", borderRadius: "999px", border: "none",
                    cursor: "pointer", padding: 0, flexShrink: 0,
                    background: incluirDistribucion ? "var(--color-primary)" : "var(--border-color)",
                    transition: "background 0.2s"
                  }}
                  aria-pressed={incluirDistribucion}
                >
                  <span style={{
                    position: "absolute", top: "3px",
                    left: incluirDistribucion ? "21px" : "3px",
                    width: "18px", height: "18px", borderRadius: "50%",
                    background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                    transition: "left 0.2s"
                  }} />
                </button>
              </div>

              <div className="form-group">
                <label>Vista Previa del Mensaje</label>
                <pre style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "var(--font-system)",
                  fontSize: "0.8rem",
                  backgroundColor: "var(--input-bg)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  padding: "0.75rem",
                  color: "var(--text-primary)",
                  maxHeight: "180px",
                  overflowY: "auto",
                  overflowX: "hidden"
                }}>
                  {generateReportText()}
                </pre>
              </div>
            </div>

            <div className="modal-actions" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
              <button type="button" className="btn-secondary" style={{ flex: "1 1 100px", margin: 0 }} onClick={() => setShowReportModal(false)}>
                Cancelar
              </button>
              <button type="button" className="btn-submit" style={{ flex: "2 1 180px", margin: 0, whiteSpace: "normal", height: "auto", minHeight: "var(--element-height)", padding: "6px 12px", lineHeight: "1.2" }} onClick={handleShareReport}>
                Copiar y Abrir WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compartir reporte por link público */}
      {showShareModal && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal-content pill-form" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "540px", width: "95%" }}>
            <div className="modal-header">
              <span className="modal-title">Compartir reporte por link</span>
              <button type="button" className="modal-close" onClick={() => setShowShareModal(false)}>&times;</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", padding: "0.25rem 0" }}>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Genera un enlace público de <strong>solo lectura</strong> con estadísticas agregadas (sin datos personales).
                Quien lo abra deberá <strong>permitir su ubicación</strong>; cada apertura queda auditada (navegador, IP y ubicación).
              </p>

              {isMasterUser && (
                <div>
                  <label className="form-label" style={{ display: "block", marginBottom: "0.35rem" }}>Refugio del reporte</label>
                  <StyledSelect
                    value={shareRefugio}
                    onChange={setShareRefugio}
                    options={[{ value: "", label: "Todos los campamentos (consolidado)" }, ...refugiosList.map((r: any) => ({ value: r.nombre, label: r.nombre }))]}
                    ariaLabel="Refugio del reporte"
                  />
                </div>
              )}
              {!isMasterUser && (
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Refugio: <strong>{campamentoActivo || "—"}</strong>
                </div>
              )}

              <button type="button" className="btn-submit" style={{ margin: 0 }} onClick={generarShare} disabled={shareLoading}>
                {shareLoading ? "Generando…" : "Generar link"}
              </button>

              {shareLink && (
                <div className="share-link-box">
                  <input type="text" readOnly value={shareLink} className="share-link-input" onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="btn-secondary" style={{ margin: 0, whiteSpace: "nowrap" }} onClick={copiarShare}>
                    {shareCopied ? "¡Copiado!" : "Copiar"}
                  </button>
                </div>
              )}

              {myShares.length > 0 && (
                <div>
                  <div className="form-label" style={{ marginBottom: "0.4rem" }}>Mis links</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "180px", overflowY: "auto" }}>
                    {myShares.map((s) => (
                      <div key={s.id} className="share-row">
                        <div style={{ minWidth: 0 }}>
                          <div className="share-row__ref">{s.refugio || "Todos los campamentos"}</div>
                          <div className="share-row__meta">{s._count.accesos} apertura{s._count.accesos === 1 ? "" : "s"}{!s.activo && " · revocado"}</div>
                        </div>
                        {s.activo && (
                          <button type="button" className="share-row__revoke" onClick={() => revocarShare(s.id)} title="Revocar link">Revocar</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
