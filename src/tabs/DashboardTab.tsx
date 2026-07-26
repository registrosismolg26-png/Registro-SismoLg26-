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
import { formatRoomLabel, roomFillLevel, fmtMil, cedulaFamilia, razonRetiroBase } from "@/lib/helpers";
import { apiFetch } from "@/lib/apiFetch";
import { logActivity } from "@/lib/activityLog";
import StyledSelect from "@/components/StyledSelect";
import SismoDayBadge from "@/components/SismoDayBadge";
import { useBodyScrollLock } from "@/components/useBodyScrollLock";
import { useAnimatedModal } from "@/components/useAnimatedModal";

// ── Íconos (stroke 24×24) para las tarjetas y paneles del panel de estadísticas.
// Mismo lenguaje visual que Balance de Salud (badge a color + acento por tarjeta).
const DASH_ICONS = {
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  family: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  child: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18a6 6 0 0 0-12 0"/><circle cx="8" cy="8" r="4"/><path d="M12 11h8M12 15h6"/></svg>,
  baby: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="6" r="4"/><path d="M9.5 6h.01M14.5 6h.01M10 8.5c.9.7 3.1.7 4 0"/><path d="M5 21v-1.5a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5V21"/></svg>,
  elder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M2 21h12"/><circle cx="8" cy="7" r="4"/></svg>,
  userx: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>,
  refresh: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  alert: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  heart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/></svg>,
  pregnant: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="4" r="2"/><path d="M12 7v6M12 9c3 0 4.5 2 4.5 4.5S15 18 12 18M12 13c-1.2 0-2 .8-2 2v6"/></svg>,
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
  // Tipo de reporte y campos libres del reporte detallado (persisten en
  // localStorage para no reescribirlos cada vez).
  const [reportType, setReportType] = useState<"resumen" | "detallado" | "comunidad">("resumen");
  const [repOrganismo, setRepOrganismo] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("rep_organismo") || "" : ""));

  // Estado de "Compartir reporte por link público"
  const isMasterUser = currentUser?.role === "MASTER";
  const isPrivilegedUser = isMasterUser || currentUser?.role === "ADMIN"; // ve links de otros
  const [showShareModal, setShowShareModal] = useState(false);
  useBodyScrollLock(showShareModal); // bloquea el scroll de fondo mientras el modal esté abierto
  const [shareRefugio, setShareRefugio] = useState(""); // Master: "" = todos
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null); // feedback de copiar por fila
  type ShareRow = { id: string; refugio: string | null; activo: boolean; createdAt: string; accesos: number; creadoPorNombre: string; creadoPorRole: string | null; esMio: boolean; puedeRevocar: boolean };
  const [myShares, setMyShares] = useState<ShareRow[]>([]);

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

  // Re-copiar cualquier link de la lista (no solo el recién generado).
  const copiarLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/reporte/${id}`);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
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

  // Refresco automático de stats en modo presentación (pantalla completa). Cada 30s:
  // suficiente para una TV de sala en vivo, y ahora que /api/stats es 100% agregado en
  // SQL (unos KB constantes), este intervalo casi no consume egress.
  useEffect(() => {
    if (isFullscreen && isOnline) {
      const interval = setInterval(() => {
        setIsUpdatingPresentation(true);
        Promise.resolve(fetchStats(true, true)).finally(() => {
          setIsUpdatingPresentation(false);
        });
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [isFullscreen, isOnline]);

  // Local Offline statistics calculation helper
  const getLocalStats = () => {
    const activeRecords = localRecords.filter(r => (r.data as any).retirado !== "SI");
    const retiredRecords = localRecords.filter(r => (r.data as any).retirado === "SI");

    const total = activeRecords.length;
    const totalRetirados = retiredRecords.length;
    const hogarSolidario = retiredRecords.filter(r => razonRetiroBase((r.data as any).retiradoRazon) === "Hogar Solidario").length;
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
    const embarazadas   = activeRecords.filter(r => (r.data as any).embarazo === "SI").length;
    const sinCuarto     = activeRecords.filter(r => !(r.data as any).cuarto).length;

    if (total === 0) {
      return {
        total: 0,
        totalRegistrados,
        totalRetirados,
        hogarSolidario,
        nucleosFamiliares: 0,
        individuosSolos: 0,
        lactantes: 0,
        noLactantes: 0,
        adolescentes: 0,
        menores: 0,
        adultos: 0,
        mayores: 0,
        matrix: {
          lactantes: { femenino: 0, masculino: 0, otro: 0 },
          noLactantes: { femenino: 0, masculino: 0, otro: 0 },
          adolescentes: { femenino: 0, masculino: 0, otro: 0 },
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
        embarazadas: 0,
        sinCuarto: 0
      };
    }

    const byParroquiaMap: Record<string, number> = {};
    const byGeneroMap: Record<string, number> = {};
    const byEstadoFisicoMap: Record<string, number> = {};
    const byPatologiaMap: Record<string, number> = {};
    let sumAge = 0;
    let lactantes = 0;
    let noLactantes = 0;
    let adolescentes = 0;
    let menores = 0;
    let adultos = 0;
    let mayores = 0;

    const matrix = {
      lactantes: { femenino: 0, masculino: 0, otro: 0 },
      noLactantes: { femenino: 0, masculino: 0, otro: 0 },
      adolescentes: { femenino: 0, masculino: 0, otro: 0 },
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
          // Subgrupos de menores, SIN huecos: lactantes 0–3, no lactantes 4–12, adolescentes 13–17.
          if (edadVal < 4) {
            lactantes++;
            if (isFem) matrix.lactantes.femenino++;
            else if (isMasc) matrix.lactantes.masculino++;
            else matrix.lactantes.otro++;
          } else if (edadVal < 13) {
            noLactantes++;
            if (isFem) matrix.noLactantes.femenino++;
            else if (isMasc) matrix.noLactantes.masculino++;
            else matrix.noLactantes.otro++;
          } else {
            adolescentes++;
            if (isFem) matrix.adolescentes.femenino++;
            else if (isMasc) matrix.adolescentes.masculino++;
            else matrix.adolescentes.otro++;
          }
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
      hogarSolidario,
      nucleosFamiliares,
      individuosSolos,
      lactantes,
      noLactantes,
      adolescentes,
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
      embarazadas,
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

  // Refugios ITINERANTE/MIXTO: la distribución es por TIPO DE CARPA (sin capacidad/límite),
  // no por habitación. El tipo de carpa = segmento del medio del `cuarto` "COMUNIDAD - TIPO - Nº".
  const refugioTipo = refugiosList.find((r: any) => r.nombre === effectiveRefugio)?.tipo || "TRANSITORIO";
  const esCarpa = refugioTipo === "ITINERANTE" || refugioTipo === "MIXTO";
  const carpaCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    registros.filter(r => r.retirado !== "SI" && r.cuarto).forEach(r => {
      const parts = String(r.cuarto).split(" - ");
      const tipo = parts.length >= 3 ? parts.slice(1, -1).join(" - ").trim() : String(r.cuarto).trim();
      if (tipo) counts[tipo] = (counts[tipo] || 0) + 1;
    });
    return counts;
  }, [registros]);


  // Itinerante/Mixto: desglose POR COMUNIDAD (total + género + grupos etarios), con los
  // MISMOS cortes de edad del resto del panel: 0–3 / 4–17 / 18–59 / ≥60. Solo presentes.
  type ComuRow = {
    comunidad: string; total: number; familias: number; solos: number;
    fem: number; masc: number;
    lactantes: number; menores: number; adultos: number; mayores: number;
  };
  const comunidadStats = useMemo<ComuRow[]>(() => {
    // ONLINE: usa el agregado del SERVIDOR (mismo criterio exacto que la tarjeta de
    // "Presentes": retirado = 'NO'). Antes se calculaba aquí con `retirado !== "SI"`,
    // que además cuenta los registros con `retirado` nulo/vacío → la suma del cuadro
    // no cuadraba con la tarjeta. Ahora ambos salen de la MISMA fuente.
    const srv = (currentStats as any)?.byComunidad;
    if (Array.isArray(srv) && srv.length > 0) {
      return srv.map((r: any) => ({
        comunidad: String(r.name ?? "Sin comunidad"),
        total: Number(r.total ?? 0), familias: Number(r.familias ?? 0), solos: Number(r.solos ?? 0),
        fem: Number(r.fem ?? 0), masc: Number(r.masc ?? 0),
        lactantes: Number(r.lactantes ?? 0), menores: Number(r.menores ?? 0),
        adultos: Number(r.adultos ?? 0), mayores: Number(r.mayores ?? 0),
      }));
    }
    // OFFLINE: espejo desde el censo cacheado (aproximación, sin conexión).
    const map = new Map<string, ComuRow>();
    const famMap = new Map<string, Map<string, number>>(); // comunidad → núcleo → personas
    registros.filter((r: any) => r.retirado !== "SI").forEach((r: any) => {
      const key = String(r.comunidad || "").trim() || "Sin comunidad";
      if (!map.has(key)) {
        map.set(key, { comunidad: key, total: 0, familias: 0, solos: 0, fem: 0, masc: 0, lactantes: 0, menores: 0, adultos: 0, mayores: 0 });
      }
      const row = map.get(key)!;
      // Núcleo por dígitos de la cédula del jefe (mismo criterio que el resto).
      const fid = cedulaFamilia(r.jefeFamilia === "SI" ? r.cedula : (r.cedulaJefeFamilia || r.cedula)) || String(r.id);
      if (!famMap.has(key)) famMap.set(key, new Map());
      const fm = famMap.get(key)!;
      fm.set(fid, (fm.get(fid) || 0) + 1);
      row.total++;
      if (r.genero === "FEMENINO") row.fem++;
      else if (r.genero === "MASCULINO") row.masc++;
      const e = Number(r.edad);
      if (Number.isFinite(e)) {
        if (e < 4) row.lactantes++;
        else if (e < 18) row.menores++;
        else if (e < 60) row.adultos++;
        else row.mayores++;
      }
    });
    // Vuelca los núcleos: 2+ personas = familia; 1 persona = individuo solo.
    map.forEach((row, key) => {
      const cnts = [...(famMap.get(key)?.values() || [])];
      row.familias = cnts.filter((c) => c >= 2).length;
      row.solos = cnts.filter((c) => c === 1).length;
    });
    return [...map.values()].sort(
      (a, b) => b.total - a.total || a.comunidad.localeCompare(b.comunidad),
    );
  }, [registros, currentStats]);
  const comunidadTotals = useMemo<ComuRow>(
    () => comunidadStats.reduce(
      (acc, r) => ({
        comunidad: "TOTAL", total: acc.total + r.total,
        familias: acc.familias + r.familias, solos: acc.solos + r.solos,
        fem: acc.fem + r.fem, masc: acc.masc + r.masc,
        lactantes: acc.lactantes + r.lactantes, menores: acc.menores + r.menores,
        adultos: acc.adultos + r.adultos, mayores: acc.mayores + r.mayores,
      }),
      { comunidad: "TOTAL", total: 0, familias: 0, solos: 0, fem: 0, masc: 0, lactantes: 0, menores: 0, adultos: 0, mayores: 0 },
    ),
    [comunidadStats],
  );

  // Helper to generate the WhatsApp report text
  const generateReportText = () => {
    const now = new Date();
    const cap1 = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const weekday = cap1(now.toLocaleDateString("es-VE", { weekday: "long" }));
    const monthName = cap1(now.toLocaleDateString("es-VE", { month: "long" }));
    const dd = String(now.getDate()).padStart(2, "0");
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const fechaStr = `${weekday} ${dd} de ${monthName} ${yyyy} || ${hh}:${mm}hrs`;

    const t = currentStats.total || 0;
    const familias = currentStats.nucleosFamiliares || 0;

    const ad = currentStats.adultos || 0;
    const adM = currentStats.matrix?.adultos?.masculino || 0;
    const adF = currentStats.matrix?.adultos?.femenino || 0;

    const lactantes = currentStats.lactantes || 0;
    const menores = currentStats.menores || 0;                 // < 18 (incluye lactantes)
    const menoresRango = Math.max(0, menores - lactantes);     // 4–17
    const may = currentStats.mayores || 0;

    // Capacidad instalada = suma de capacidades de los salones ACTIVOS del refugio,
    // con el mismo criterio del panel "Distribución por Habitación" (cap ?? 18; los
    // salones inactivos no cuentan). Las plazas disponibles nunca son negativas.
    const capacidad = dashboardRooms
      .filter((room) => allCuartos.includes(room))
      .reduce((s, room) => s + (roomCapacities[room] ?? 18), 0);
    const plazas = Math.max(0, capacidad - t);

    const pct = (n: number) => (t > 0 ? ((n / t) * 100).toFixed(1) : "0.0");

    // El reporte es del refugio ACTIVO: Master usa el del selector del header
    // (effectiveRefugio); el resto, su propio refugio.
    const refugioActivo = effectiveRefugio || currentUser?.campamentoTransitorio || "";

    return `*CAMPAMENTO TRANSITORIO ${refugioActivo.toUpperCase()}*
Reporte: ${fechaStr}

Personas en el Campamento: ${t}
Capacidad instalada: ${capacidad}

*Familias:* ${familias}

*Adultos:* ${ad} ADULTOS (18–59) · ${pct(ad)}%
- Femenino ${adF}
- Masculino ${adM}

*Niños, niñas y adolescente:*
- LACTANTES (0–3) ${lactantes} · ${pct(lactantes)}%
- MENORES (4–17) ${menoresRango} · ${pct(menoresRango)}%

*Adultos y Adultas Mayores:*
- ${may} MAYORES (60+) · ${pct(may)}%

Plazas Disponibles : ${plazas}`;
  };

  // ── Reporte DETALLADO (formato oficial): encabezado con campos libres +
  //    indicadores de capacidad/ocupación + demografía por categorías de edad,
  //    SIN huecos ni solapes: lactantes 0–3, no lactantes 4–12, adolescentes
  //    13–17, adultos 18–59, adultos mayores 60+; cada una por género. ──
  const generateDetalladoText = () => {
    const s: any = currentStats;
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mesStr = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    let h12 = now.getHours();
    const ampm = h12 >= 12 ? "PM" : "AM";
    h12 = h12 % 12; if (h12 === 0) h12 = 12;
    const hhStr = String(h12).padStart(2, "0");
    const minStr = String(now.getMinutes()).padStart(2, "0");

    const refugioActivo = effectiveRefugio || currentUser?.campamentoTransitorio || "";
    const ubicacion = (refugiosList.find((r: any) => r.nombre === refugioActivo)?.ubicacion || "").trim();
    const t = s.total || 0;
    const familias = s.nucleosFamiliares || 0;
    const lesionados = s.lesionados || 0;
    const conPatologia = s.conPatologia || 0;
    const embarazadas = s.embarazadas || 0;
    const capacidad = dashboardRooms
      .filter((room: string) => allCuartos.includes(room))
      .reduce((acc: number, room: string) => acc + (roomCapacities[room] ?? 18), 0);
    const disponibilidad = Math.max(0, capacidad - t);

    // Subtotal por género de cada categoría de la matriz demográfica.
    const cat = (k: string) => {
      const row = (s.matrix && s.matrix[k]) || { femenino: 0, masculino: 0, otro: 0 };
      const fem = row.femenino || 0, masc = row.masculino || 0, otro = row.otro || 0;
      return { masc, fem, sub: fem + masc + otro };
    };
    const may = cat("mayores"), ad = cat("adultos"), lac = cat("lactantes"), nolac = cat("noLactantes"), ado = cat("adolescentes");

    // Estado y municipio son FIJOS del sistema (Gobernación del Estado La Guaira,
    // municipio Vargas) — valores institucionales, hardcode autorizado por el dueño.
    const estado = "La Guaira";
    const municipio = "Vargas";
    const organismo = repOrganismo.trim() || "—";

    return `Nombre del campamento: *${refugioActivo}*
Ubicación: ${ubicacion || "—"}
Estado: *${estado}*
Municipio: *${municipio}*
Organismo responsable: *${organismo}*
Fecha: *${dd}/${mesStr}/${yyyy}*
Hora: *${hhStr}:${minStr}* ${ampm}

*1. INDICADORES DE CAPACIDAD Y OCUPACIÓN*
· Capacidad Máxima: ${capacidad}
· Total Ocupado: ${t}
· Disponibilidad Real: ${disponibilidad}

*2. DISTRIBUCIÓN DE POBLACIÓN PROTEGIDA (DEMOGRAFÍA)*

*2.1. ADULTOS MAYORES (60+)*
· Masculinos: ${may.masc}
· Femeninos: ${may.fem}
· *Subtotal: ${may.sub}*

*2.2. ADULTOS (18–59)*
· Masculinos: ${ad.masc}
· Femeninos: ${ad.fem}
· *Subtotal: ${ad.sub}*

*2.3. NIÑOS / NIÑAS LACTANTES (0–3)*
· Niños: ${lac.masc}
· Niñas: ${lac.fem}
· *Subtotal: ${lac.sub}*

*2.4. NIÑOS / NIÑAS NO LACTANTES (4–12)*
· Niños: ${nolac.masc}
· Niñas: ${nolac.fem}
· *Subtotal: ${nolac.sub}*

*2.5. ADOLESCENTES (13–17)*
· Masculinos: ${ado.masc}
· Femeninos: ${ado.fem}
· *Subtotal: ${ado.sub}*

*TOTAL GENERAL: ${t} personas*

*3. NÚCLEOS FAMILIARES:*
· Total Familias: ${familias}

*4. NOVEDAD:*
· LESIONADOS: ${lesionados}
· PATOLOGÍAS CRÓNICAS: ${conPatologia}
· EMBARAZADAS: ${embarazadas}`;
  };

  // ── Reporte "CARACTERIZACIÓN POR COMUNIDAD" (refugios itinerante/mixto) ──
  // Presentes (activos) agrupados por la comunidad del catálogo (campo `comunidad`).
  const generateComunidadText = () => {
    const now = new Date();
    const cap1 = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const weekday = cap1(now.toLocaleDateString("es-VE", { weekday: "long" }));
    const monthName = cap1(now.toLocaleDateString("es-VE", { month: "long" }));
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const fechaStr = `${weekday} ${dd} de ${monthName} ${now.getFullYear()} · ${hh}:${mm} hrs`;

    const refugioActivo = effectiveRefugio || currentUser?.campamentoTransitorio || "";
    const tipoLabel = refugioTipo === "MIXTO" ? "Mixto" : "Itinerante";

    const presentes = (registros || []).filter((r: any) => r.retirado !== "SI");
    const counts: Record<string, number> = {};
    let sinComunidad = 0;
    presentes.forEach((r: any) => {
      const com = String(r.comunidad || "").trim();
      if (com) counts[com] = (counts[com] || 0) + 1;
      else sinComunidad++;
    });
    const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const lineas = ordered.map(([com, n], i) => `${i + 1}. *${com}* — ${n}`).join("\n");
    const familias = currentStats.nucleosFamiliares || 0;
    const intermitentes = currentStats.intermitentes || 0;

    const SEP = "━━━━━━━━━━━━━━━━━━━━";
    return `🇻🇪 *CARACTERIZACIÓN POR COMUNIDAD* 🇻🇪
${SEP}
🏕️ *Campamento:* ${refugioActivo.toUpperCase()}
🏷️ *Tipo:* ${tipoLabel}
🗓️ *Reporte:* ${fechaStr}
${SEP}

👥 *Censados por comunidad:*

${lineas || "_Sin personas presentes registradas._"}${sinComunidad ? `\n\n_Sin comunidad asignada: ${sinComunidad}_` : ""}

${SEP}
📊 *Total censados:* ${presentes.length}
🏘️ *Comunidades:* ${ordered.length}
👨‍👩‍👧 *Núcleos familiares:* ${familias}
🔄 *Intermitentes:* ${intermitentes}
${SEP}
_Gobernación del Estado La Guaira · Campamentos Transitorios_`;
  };

  const handleShareReport = () => {
    const text = (reportType === "comunidad" && esCarpa) ? generateComunidadText() : reportType === "detallado" ? generateDetalladoText() : generateReportText();
    if (reportType === "detallado" && typeof window !== "undefined") {
      // Recuerda el organismo para el próximo reporte (estado/municipio son fijos).
      localStorage.setItem("rep_organismo", repOrganismo.trim());
    }
    navigator.clipboard.writeText(text).then(() => {
      showToast("Reporte copiado al portapapeles.", "success");
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank");
    }).catch(() => {
      showToast("No se pudo copiar el texto automáticamente. Cópielo manualmente.", "error");
    });
  };

  const campamentoActivo = effectiveRefugio || currentUser?.campamentoTransitorio || "";

  // Animación de salida suave de los modales (se mantienen montados durante el cierre).
  const mReport = useAnimatedModal(showReportModal);
  const mShare = useAnimatedModal(showShareModal);

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
                {" "}<SismoDayBadge />
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
                onClick={() => { logActivity({ accion: "PRINT", recurso: "Panel de Estadísticas", formato: "PDF", refugio: campamentoActivo || undefined }); window.print(); }}
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
                  { label: "Lactantes (0–3)", value: S.lactantes || 0, sub: pc(S.lactantes || 0), accent: "#06b6d4", icon: DASH_ICONS.baby },
                  { label: "Menores (4–17)", value: Math.max(0, (S.menores || 0) - (S.lactantes || 0)), sub: pc(Math.max(0, (S.menores || 0) - (S.lactantes || 0))), accent: "#10b981", icon: DASH_ICONS.child },
                  { label: "Adultos (18–59)", value: S.adultos || 0, sub: pc(S.adultos || 0), accent: "#f59e0b", icon: DASH_ICONS.user },
                  { label: "Mayores (60+)", value: S.mayores || 0, sub: pc(S.mayores || 0), accent: "#8b5cf6", icon: DASH_ICONS.elder },
                  { label: "Personas Retiradas", value: S.totalRetirados || 0, accent: "#dc2626", icon: DASH_ICONS.userx },
                  { label: "Retirados a Hogar Solidario", value: S.hogarSolidario || 0, accent: "#16a34a", icon: DASH_ICONS.home },
                  { label: "Intermitentes Activos", value: S.intermitentes || 0, sub: pc(S.intermitentes || 0), accent: "#d97706", icon: DASH_ICONS.refresh },
                  { label: "Edad Promedio", value: S.promedioEdad || 0, suffix: "años", accent: "#0284c7", icon: DASH_ICONS.calendar },
                  { label: "Lesionados", value: S.lesionados || 0, sub: pc(S.lesionados || 0), accent: "#e11d48", icon: DASH_ICONS.alert },
                  { label: "Con Patología", value: S.conPatologia || 0, sub: pc(S.conPatologia || 0), accent: "#db2777", icon: DASH_ICONS.heart },
                  { label: "Mujeres Embarazadas", value: S.embarazadas || 0, sub: pc(S.embarazadas || 0), accent: "#be185d", icon: DASH_ICONS.pregnant },
                  { label: "Sin Alojamiento", value: S.sinCuarto || 0, sub: pc(S.sinCuarto || 0), accent: "#64748b", icon: DASH_ICONS.homeoff },
                ];
                return (
                  <div className="bal-cards dash-cards">
                    {statCards.map((c) => (
                      <div key={c.label} className="bal-card" style={{ ["--accent" as any]: c.accent } as React.CSSProperties}>
                        <span className="bal-card__icon">{c.icon}</span>
                        <span key={c.value} className="bal-card__value stat-card-value-animate">{fmtMil(c.value)}{c.suffix && <em>{c.suffix}</em>}</span>
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
                  <div>
                    {(() => {
                      // Réplica del gráfico "Pacientes por edad" de Balance (.bal-seg + .bal-legend).
                      const lac = currentStats.lactantes || 0;
                      const men = Math.max(0, (currentStats.menores || 0) - lac);
                      const segs = [
                        { label: "Lactantes (0–3)", count: lac, color: "#06b6d4" },
                        { label: "Menores (4–17)", count: men, color: "#10b981" },
                        { label: "Adultos (18–59)", count: currentStats.adultos || 0, color: "#f59e0b" },
                        { label: "Mayores (≥60)", count: currentStats.mayores || 0, color: "#8b5cf6" },
                      ];
                      const segTotal = segs.reduce((s, x) => s + x.count, 0) || 1;
                      return (
                        <>
                          <div className="bal-seg">
                            {segs.map((s, i) => {
                              const p = (s.count / segTotal) * 100;
                              return p > 0 ? (
                                <span key={i} className="bal-seg__part" style={{ width: `${p}%`, background: s.color }} title={`${s.label}: ${s.count}`}>
                                  {p >= 12 ? `${p.toFixed(0)}%` : ""}
                                </span>
                              ) : null;
                            })}
                          </div>
                          <div className="bal-legend">
                            {segs.map((s, i) => (
                              <span key={i} className="bal-legend__item">
                                <span className="bal-legend__dot" style={{ background: s.color }} />
                                {s.label} <strong>{fmtMil(s.count)}</strong>
                              </span>
                            ))}
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
                    // Réplica del donut "Pacientes por género" de Balance (.bal-donut).
                    const f = currentStats.byGenero.find((g: any) => g.name === "FEMENINO")?.count || 0;
                    const m = currentStats.byGenero.find((g: any) => g.name === "MASCULINO")?.count || 0;
                    const o = Math.max(0, (currentStats.total || 0) - f - m);
                    const segs = [
                      { label: "Femenino", count: f, color: "#db2777" },
                      { label: "Masculino", count: m, color: "#2563eb" },
                      ...(o ? [{ label: "Otro / N.E.", count: o, color: "#94a3b8" }] : []),
                    ];
                    const genTotal = segs.reduce((s, x) => s + x.count, 0) || 1;
                    const RADIUS = 46, C = 2 * Math.PI * RADIUS;
                    let cum = 0;
                    const arcs = segs.filter((s) => s.count > 0).map((s) => {
                      const frac = s.count / genTotal;
                      const dash = frac * C, rot = -90 + cum * 360;
                      cum += frac;
                      return { ...s, dash, rot };
                    });

                    return (
                      <div className="bal-donut">
                        <svg viewBox="0 0 120 120" className="bal-donut__svg" role="img" aria-label="Distribución por género">
                          <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--border-color)" strokeWidth="14" opacity="0.5" />
                          {arcs.map((a, i) => (
                            <circle key={i} cx="60" cy="60" r={RADIUS} fill="none" stroke={a.color} strokeWidth="14"
                              strokeDasharray={`${a.dash} ${C - a.dash}`} transform={`rotate(${a.rot} 60 60)`} strokeLinecap="round" />
                          ))}
                          <text x="60" y="56" textAnchor="middle" className="bal-donut__num">{fmtMil(currentStats.total || 0)}</text>
                          <text x="60" y="72" textAnchor="middle" className="bal-donut__cap">personas</text>
                        </svg>
                        <div className="bal-legend bal-legend--col">
                          {segs.map((s, i) => (
                            <span key={i} className="bal-legend__item">
                              <span className="bal-legend__dot" style={{ background: s.color }} />
                              {s.label} <strong>{fmtMil(s.count)}</strong>
                              <span className="bal-legend__pct">{((s.count / genTotal) * 100).toFixed(0)}%</span>
                            </span>
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
                    lactantes: { femenino: 0, masculino: 0, otro: 0 },
                    menores: { femenino: 0, masculino: 0, otro: 0 },
                    adultos: { femenino: 0, masculino: 0, otro: 0 },
                    mayores: { femenino: 0, masculino: 0, otro: 0 }
                  };
                  const lac = mx.lactantes || { femenino: 0, masculino: 0, otro: 0 };
                  // "Menores" en la matriz es <18 (incluye lactantes); el desglose muestra 4–17 aparte.
                  const men4 = {
                    femenino: Math.max(0, mx.menores.femenino - lac.femenino),
                    masculino: Math.max(0, mx.menores.masculino - lac.masculino),
                    otro: Math.max(0, mx.menores.otro - lac.otro),
                  };
                  const sum = (m: { femenino: number; masculino: number; otro: number }) => m.femenino + m.masculino + m.otro;
                  const tLac = sum(lac), tMen4 = sum(men4), tAd = sum(mx.adultos), tMay = sum(mx.mayores);
                  const tFem  = lac.femenino  + men4.femenino  + mx.adultos.femenino  + mx.mayores.femenino;
                  const tMasc = lac.masculino + men4.masculino + mx.adultos.masculino + mx.mayores.masculino;

                  // heatmap intensity per column (relative to column max)
                  const maxFem  = Math.max(lac.femenino,  men4.femenino,  mx.adultos.femenino,  mx.mayores.femenino)  || 1;
                  const maxMasc = Math.max(lac.masculino, men4.masculino, mx.adultos.masculino, mx.mayores.masculino) || 1;
                  const hFem  = (v: number) => ({ background: `rgba(219, 39, 119, ${(v / maxFem)  * 0.18})` });
                  const hMasc = (v: number) => ({ background: `rgba(37, 99, 235,   ${(v / maxMasc) * 0.18})` });

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
                            <td><strong>Lactantes (0–3)</strong></td>
                            <td className="bal-cell bal-cell--f" data-label="Femenino" style={hFem(lac.femenino)}>{fmtMil(lac.femenino)}</td>
                            <td className="bal-cell bal-cell--m" data-label="Masculino" style={hMasc(lac.masculino)}>{fmtMil(lac.masculino)}</td>
                            <td className="bal-cell--tot" data-label="Total"><strong>{fmtMil(tLac)}</strong></td>
                          </tr>
                          <tr>
                            <td><strong>Menores (4–17)</strong></td>
                            <td className="bal-cell bal-cell--f" data-label="Femenino" style={hFem(men4.femenino)}>{fmtMil(men4.femenino)}</td>
                            <td className="bal-cell bal-cell--m" data-label="Masculino" style={hMasc(men4.masculino)}>{fmtMil(men4.masculino)}</td>
                            <td className="bal-cell--tot" data-label="Total"><strong>{fmtMil(tMen4)}</strong></td>
                          </tr>
                          <tr>
                            <td><strong>Adultos (18-59)</strong></td>
                            <td className="bal-cell bal-cell--f" data-label="Femenino" style={hFem(mx.adultos.femenino)}>{fmtMil(mx.adultos.femenino)}</td>
                            <td className="bal-cell bal-cell--m" data-label="Masculino" style={hMasc(mx.adultos.masculino)}>{fmtMil(mx.adultos.masculino)}</td>
                            <td className="bal-cell--tot" data-label="Total"><strong>{fmtMil(tAd)}</strong></td>
                          </tr>
                          <tr>
                            <td><strong>Mayores (60+)</strong></td>
                            <td className="bal-cell bal-cell--f" data-label="Femenino" style={hFem(mx.mayores.femenino)}>{fmtMil(mx.mayores.femenino)}</td>
                            <td className="bal-cell bal-cell--m" data-label="Masculino" style={hMasc(mx.mayores.masculino)}>{fmtMil(mx.mayores.masculino)}</td>
                            <td className="bal-cell--tot" data-label="Total"><strong>{fmtMil(tMay)}</strong></td>
                          </tr>
                          <tr className="bal-matrix__total">
                            <td><strong>Total General</strong></td>
                            <td className="bal-cell bal-cell--f" data-label="Femenino"><strong>{fmtMil(tFem)}</strong></td>
                            <td className="bal-cell bal-cell--m" data-label="Masculino"><strong>{fmtMil(tMasc)}</strong></td>
                            <td className="bal-cell--tot" data-label="Total"><strong>{fmtMil(currentStats.total)}</strong></td>
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
                          <span className="bal-rank__count">{fmtMil(p.count)}</span>
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

              {/* Transitorio → por Habitación/Salón (con capacidad). Itinerante/Mixto → por Tipo de Carpa (sin límite). */}
              <div className="dashboard-section" style={{ gridColumn: "1 / -1", marginTop: "1rem" }}>
                {esCarpa ? (
                  <>
                    <div className="dash-sec-head" style={{ ["--accent" as any]: "#2563eb" } as React.CSSProperties}><span className="dash-sec-head__ico">{DASH_ICONS.bed}</span><h3 className="dashboard-section-title">Distribución por Tipo de Carpa</h3></div>
                    <div className="dash-rooms dash-rooms--carpa">
                      {Object.entries(carpaCounts).sort((a, b) => b[1] - a[1]).map(([tipo, count]) => (
                        <div key={tipo} className="dash-room dash-room--green">
                          <span className="dash-room__name">{tipo}</span>
                          <span className="dash-room__num">{fmtMil(count)}<small className="dash-room__unit">personas</small></span>
                        </div>
                      ))}
                      {Object.keys(carpaCounts).length === 0 && (
                        <div style={{ gridColumn: "1 / -1", fontSize: "0.8rem", color: "var(--text-muted)", padding: "0.5rem" }}>
                          Aún no hay personas asignadas a carpas.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>

              {/* Itinerante/Mixto: desglose POR COMUNIDAD (total + género + grupos etarios) */}
              {esCarpa && (
                <div className="dashboard-section" style={{ gridColumn: "1 / -1", marginTop: "1rem" }}>
                  <div className="dash-sec-head" style={{ ["--accent" as any]: "#0d9488" } as React.CSSProperties}>
                    <span className="dash-sec-head__ico">{DASH_ICONS.map}</span>
                    <h3 className="dashboard-section-title">Población por Comunidad</h3>
                  </div>
                  {comunidadStats.length === 0 ? (
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "0.5rem 0" }}>Sin datos</p>
                  ) : (
                    <div className="dash-comu-wrap">
                      <table className="dash-comu">
                        <thead>
                          <tr>
                            <th className="dash-comu__th-name" rowSpan={2}>Comunidad</th>
                            <th className="dc-tot dc-sep" rowSpan={2}>Total</th>
                            <th className="dc-fam dc-sep" colSpan={2}>Núcleos</th>
                            <th className="dc-sex dc-sep" colSpan={2}>Género</th>
                            <th className="dc-age dc-sep" colSpan={4}>Grupos de edad</th>
                          </tr>
                          <tr>
                            <th className="dc-fam dc-sep">N.º Familias</th>
                            <th className="dc-fam">Ind. solos</th>
                            <th className="dc-sex dc-sep">Fem.</th>
                            <th className="dc-sex">Masc.</th>
                            <th className="dc-age dc-sep">Lactantes<small>0–3</small></th>
                            <th className="dc-age">Menores<small>4–17</small></th>
                            <th className="dc-age">Adultos<small>18–59</small></th>
                            <th className="dc-age">Mayores<small>≥60</small></th>
                          </tr>
                        </thead>
                        <tbody>
                          {comunidadStats.map((c) => (
                            <tr key={c.comunidad}>
                              <td className="dash-comu__name">{c.comunidad}</td>
                              <td className="dc-tot dc-sep dash-comu__tot">{fmtMil(c.total)}</td>
                              <td className="dc-fam dc-sep">{fmtMil(c.familias)}</td>
                              <td className="dc-fam">{fmtMil(c.solos)}</td>
                              <td className="dc-sex dc-sep">{fmtMil(c.fem)}</td>
                              <td className="dc-sex">{fmtMil(c.masc)}</td>
                              <td className="dc-age dc-sep">{fmtMil(c.lactantes)}</td>
                              <td className="dc-age">{fmtMil(c.menores)}</td>
                              <td className="dc-age">{fmtMil(c.adultos)}</td>
                              <td className="dc-age">{fmtMil(c.mayores)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td className="dash-comu__name">Total</td>
                            <td className="dc-tot dc-sep dash-comu__tot">{fmtMil(comunidadTotals.total)}</td>
                            <td className="dc-fam dc-sep">{fmtMil(comunidadTotals.familias)}</td>
                            <td className="dc-fam">{fmtMil(comunidadTotals.solos)}</td>
                            <td className="dc-sex dc-sep">{fmtMil(comunidadTotals.fem)}</td>
                            <td className="dc-sex">{fmtMil(comunidadTotals.masc)}</td>
                            <td className="dc-age dc-sep">{fmtMil(comunidadTotals.lactantes)}</td>
                            <td className="dc-age">{fmtMil(comunidadTotals.menores)}</td>
                            <td className="dc-age">{fmtMil(comunidadTotals.adultos)}</td>
                            <td className="dc-age">{fmtMil(comunidadTotals.mayores)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
          </>
          )}
        </div>

      {/* WhatsApp Report Generator Modal — elige tipo (resumen / detallado) */}
      {mReport.mounted && (
        <div className={`modal-overlay${mReport.closing ? " modal-overlay--closing" : ""}`} onClick={() => setShowReportModal(false)}>
          <div className={`modal-content modal-content--detail pill-form${mReport.closing ? " modal-content--closing" : ""}`} onClick={e => e.stopPropagation()} style={{ maxWidth: "600px", width: "95%" }}>
            <div className="modal-header">
              <span className="modal-title" style={{ fontSize: "0.95rem", lineHeight: "1.2" }}>Reporte para WhatsApp</span>
              <button className="modal-close" onClick={() => setShowReportModal(false)}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", maxHeight: "68vh", overflowY: "auto", overflowX: "hidden", paddingRight: "4px" }}>
              {/* Tipo de reporte */}
              <div className="form-group">
                <label>Tipo de reporte</label>
                <div className="report-type-toggle">
                  <button type="button" className={`report-type-btn ${reportType === "resumen" ? "report-type-btn--active" : ""}`} onClick={() => setReportType("resumen")}>Resumen</button>
                  <button type="button" className={`report-type-btn ${reportType === "detallado" ? "report-type-btn--active" : ""}`} onClick={() => setReportType("detallado")}>Detallado</button>
                  {esCarpa && (
                    <button type="button" className={`report-type-btn ${reportType === "comunidad" ? "report-type-btn--active" : ""}`} onClick={() => setReportType("comunidad")}>Por Comunidad</button>
                  )}
                </div>
              </div>

              {/* Campo libre (solo reporte detallado): el organismo responsable.
                  Estado (La Guaira) y Municipio (Vargas) son fijos del sistema. */}
              {reportType === "detallado" && (
                <div className="form-group">
                  <label>Organismo responsable</label>
                  <input className="morb-control" type="text" value={repOrganismo} onChange={e => setRepOrganismo(e.target.value)} placeholder="Ej: Banco Central de Venezuela" />
                </div>
              )}

              {/* Vista previa */}
              <div className="form-group">
                <label>Vista previa del mensaje</label>
                <pre className="report-preview">{(reportType === "comunidad" && esCarpa) ? generateComunidadText() : reportType === "detallado" ? generateDetalladoText() : generateReportText()}</pre>
              </div>
            </div>

            <div className="modal-edit-actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="btn-secondary" onClick={() => setShowReportModal(false)}>Cancelar</button>
              <button type="button" className="btn-submit" style={{ flex: 1 }} onClick={handleShareReport}>Copiar y Abrir WhatsApp</button>
            </div>
          </div>
        </div>
      )}

      {/* Compartir reporte por link público */}
      {mShare.mounted && (
        <div className={`modal-overlay${mShare.closing ? " modal-overlay--closing" : ""}`} onClick={() => setShowShareModal(false)}>
          <div className={`modal-content pill-form${mShare.closing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "540px", width: "95%" }}>
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
                  <div className="form-label" style={{ marginBottom: "0.4rem" }}>{isPrivilegedUser ? "Links compartidos" : "Mis links"}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "200px", overflowY: "auto" }}>
                    {myShares.map((s) => {
                      const roleLabel = s.creadoPorRole === "MASTER" ? "Master" : s.creadoPorRole === "ADMIN" ? "Admin" : (s.creadoPorRole || "");
                      return (
                        <div key={s.id} className="share-row">
                          <div style={{ minWidth: 0 }}>
                            <div className="share-row__ref">{s.refugio || "Todos los campamentos"}</div>
                            <div className="share-row__meta">
                              {s.accesos} apertura{s.accesos === 1 ? "" : "s"}
                              {!s.esMio && <> · por <strong>{s.creadoPorNombre}</strong>{roleLabel ? ` (${roleLabel})` : ""}</>}
                              {!s.activo && " · revocado"}
                            </div>
                          </div>
                          {s.activo && (
                            <div className="share-row__actions">
                              <button type="button" className="share-row__copy" onClick={() => copiarLink(s.id)} title="Copiar link">
                                {copiedId === s.id ? "¡Copiado!" : "Copiar"}
                              </button>
                              {s.puedeRevocar && (
                                <button type="button" className="share-row__revoke" onClick={() => revocarShare(s.id)} title="Revocar link">Revocar</button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
