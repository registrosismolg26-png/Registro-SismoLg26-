"use client";

// ── Vista de PRESENTACIÓN: Planteamiento Sala (Modo TV / Pantalla Completa) ──
// Dashboard ejecutivo para salas situacionales y pantallas grandes de la Gobernación.
// Membrete oficial con reloj/fecha en vivo, autorrotación fluida con barra de progreso,
// números con cuenta animada (useCountUp), cuadros de Estatus × Modalidad,
// auditoría de Códigos QR, demografía y selección de campamento o consolidado general.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import SismoDayBadge from "@/components/SismoDayBadge";
import type { PlanteamientoSalaStats, TipoOpcionPlanteamiento, PlanteamientoSalaEstatus } from "@/types";

interface Props {
  stats: PlanteamientoSalaStats;
  selectedCampamento: string;
  onExit?: () => void;
  onRefresh?: () => void;
  isUpdating?: boolean;
}

const ROTATE_MS = 24000; // 24 segundos por diapositiva

function useCountUp(target: number, durationMs = 1100) {
  const [val, setVal] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, durationMs]);
  return val;
}

const Num = ({ value }: { value: number }) => <>{useCountUp(value || 0).toLocaleString("es-VE")}</>;

const two = (n: number) => String(n).padStart(2, "0");
const pct = (n: number, total: number) => (total > 0 ? Math.min(100, Math.round((n / total) * 100)) : 0);

const MODALIDADES_META: { key: TipoOpcionPlanteamiento; label: string; short: string; color: string }[] = [
  { key: "MERCADO_SECUNDARIO", label: "Mercado Secundario", short: "M. Secundario", color: "#2563eb" },
  { key: "ALQUILER", label: "Alquiler de Vivienda", short: "Alquiler", color: "#059669" },
  { key: "PLAN_VENEZUELA_RENACE", label: "Plan Venezuela Renace", short: "Vzla Renace", color: "#7c3aed" },
  { key: "CAMPAMENTO_MAYOR_PERMANENCIA", label: "Campamento Mayor Permanencia", short: "Mayor Perm.", color: "#ea580c" },
  { key: "ASIGNACION_GMVV", label: "Asignación GMVV", short: "Asig. GMVV", color: "#0891b2" },
];

export default function PlanteamientoSalaPresentationView({
  stats,
  selectedCampamento,
  onExit,
  onRefresh,
  isUpdating,
}: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [idx, setIdx] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("pres_theme_sala");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* noop */
    }
  }, []);

  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("pres_theme_sala", next);
      } catch {
        /* noop */
      }
      return next;
    });

  // Reloj en tiempo real
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Ámbito de datos actual
  const scope = useMemo(() => {
    if (!stats) return null;
    if (selectedCampamento === "TODOS") return stats.global;
    return stats.campamentos.find((c) => c.refugio === selectedCampamento) || stats.global;
  }, [stats, selectedCampamento]);

  const {
    totalPersonas = 0,
    totalCargaFamiliar = 0,
    totalPoblacion = 0,
    promedioProgreso = 0,
    porEstatus = { "CREDITO ENTREGADO": 0, "EN PROCESO": 0, "CARPETA RETORNADA": 0, "CON NOVEDAD EN LA SEDE": 0 },
    porTipoOpcion = { MERCADO_SECUNDARIO: 0, ALQUILER: 0, PLAN_VENEZUELA_RENACE: 0, CAMPAMENTO_MAYOR_PERMANENCIA: 0, ASIGNACION_GMVV: 0 },
    estatusPorModalidad = {} as Record<PlanteamientoSalaEstatus, Record<TipoOpcionPlanteamiento, number>>,
    modalidadPorEstatus = {} as Record<TipoOpcionPlanteamiento, Record<PlanteamientoSalaEstatus, number>>,
    demografia,
    qrCobertura = { habitatVivienda: 0, colapsoVivienda: 0, ambosQr: 0, alMenosUno: 0, sinQr: 0 },
    rangosProgreso = { completo100: 0, avanzado70_99: 0, medio40_69: 0, inicial0_39: 0 },
  } = scope || {};

  const creditosCount = porEstatus?.["CREDITO ENTREGADO"] || 0;
  const enProcesoCount = porEstatus?.["EN PROCESO"] || 0;
  const retornadasCount = porEstatus?.["CARPETA RETORNADA"] || 0;
  const novedadesCount = porEstatus?.["CON NOVEDAD EN LA SEDE"] || 0;

  // Slides de la presentación
  const slides = useMemo(() => {
    const list: { id: string; title: string; icon: ReactNode; body: ReactNode }[] = [
      // ── SLIDE 1: PANORAMA GENERAL & MATRIZ ESTATUS × MODALIDAD ─────────────
      {
        id: "panorama",
        title: "Panorama General y Cuadros de Estatus × Modalidad",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18" />
            <rect x="7" y="10" width="3" height="7" rx="1" />
            <rect x="12" y="6" width="3" height="11" rx="1" />
            <rect x="17" y="13" width="3" height="4" rx="1" />
          </svg>
        ),
        body: (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            {/* Fila de BigCards Superiores */}
            <div className="pres-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <BigCard accent="#2563eb" label="Expedientes Titulares" value={totalPersonas} icon={PRES_ICONS.folder} />
              <BigCard accent="#4338ca" label="Población Beneficiada" value={totalPoblacion} suffix={`· ${totalCargaFamiliar} fam.`} icon={PRES_ICONS.family} />
              <BigCard accent="#059669" label="Crédito Entregado" value={creditosCount} suffix={`· ${pct(creditosCount, totalPersonas)}%`} icon={PRES_ICONS.checkCircle} />
              <BigCard accent="#2563eb" label="En Proceso" value={enProcesoCount} suffix={`· ${pct(enProcesoCount, totalPersonas)}%`} icon={PRES_ICONS.clock} />
              <BigCard accent="#d97706" label="Carpetas Retornadas" value={retornadasCount} icon={PRES_ICONS.alert} />
              <BigCard accent="#dc2626" label="Novedades en Sede" value={novedadesCount} icon={PRES_ICONS.shield} />
              <BigCard accent="#7c3aed" label="Avance Documental" value={promedioProgreso} suffix="%" icon={PRES_ICONS.award} />
            </div>

            {/* Los 4 Cuadros de Estatus × Modalidad */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
              {/* Cuadro 1: Créditos Entregados */}
              <StatusBox
                title="Créditos Entregados"
                count={creditosCount}
                total={totalPersonas}
                color="#059669"
                bg="rgba(5, 150, 105, 0.08)"
                icon={PRES_ICONS.checkCircle}
                breakdown={estatusPorModalidad?.["CREDITO ENTREGADO"]}
              />

              {/* Cuadro 2: En Proceso */}
              <StatusBox
                title="En Proceso de Gestión"
                count={enProcesoCount}
                total={totalPersonas}
                color="#2563eb"
                bg="rgba(37, 99, 235, 0.08)"
                icon={PRES_ICONS.clock}
                breakdown={estatusPorModalidad?.["EN PROCESO"]}
              />

              {/* Cuadro 3: Carpetas Retornadas */}
              <StatusBox
                title="Carpetas Retornadas"
                count={retornadasCount}
                total={totalPersonas}
                color="#d97706"
                bg="rgba(217, 119, 6, 0.08)"
                icon={PRES_ICONS.alert}
                breakdown={estatusPorModalidad?.["CARPETA RETORNADA"]}
              />

              {/* Cuadro 4: Con Novedad en la Sede */}
              <StatusBox
                title="Con Novedad en Sede"
                count={novedadesCount}
                total={totalPersonas}
                color="#dc2626"
                bg="rgba(220, 38, 38, 0.08)"
                icon={PRES_ICONS.shield}
                breakdown={estatusPorModalidad?.["CON NOVEDAD EN LA SEDE"]}
              />
            </div>
          </div>
        ),
      },

      // ── SLIDE 2: MODALIDADES HABITACIONALES & COBERTURA QR ─────────────────
      {
        id: "modalidades_qr",
        title: "Modalidades de Vivienda & Cobertura de Códigos QR",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        ),
        body: (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
            {/* Panel Izquierdo: Las 5 Modalidades */}
            <Panel title="Distribución por Modalidad de Atención">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.5rem" }}>
                {MODALIDADES_META.map((m) => {
                  const val = porTipoOpcion?.[m.key] || 0;
                  const stMap = modalidadPorEstatus?.[m.key] || {
                    "CREDITO ENTREGADO": 0,
                    "EN PROCESO": 0,
                    "CARPETA RETORNADA": 0,
                    "CON NOVEDAD EN LA SEDE": 0,
                  };
                  return (
                    <div
                      key={m.key}
                      style={{
                        padding: "0.85rem 1.1rem",
                        borderRadius: "14px",
                        background: "var(--pres-card-bg, rgba(255,255,255,0.04))",
                        border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: m.color }} />
                          {m.label}
                        </span>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontWeight: 800, fontSize: "1.15rem", color: m.color }}>
                            <Num value={val} />
                          </span>
                          <span style={{ fontSize: "0.78rem", opacity: 0.75, marginLeft: "6px" }}>
                            ({pct(val, totalPersonas)}%)
                          </span>
                        </div>
                      </div>
                      <div style={{ width: "100%", height: "6px", borderRadius: "999px", background: "var(--pres-track, rgba(255,255,255,0.1))", overflow: "hidden" }}>
                        <div style={{ width: `${pct(val, totalPersonas)}%`, height: "100%", background: m.color, borderRadius: "999px" }} />
                      </div>
                      <div style={{ display: "flex", gap: "10px", fontSize: "0.75rem", opacity: 0.85, marginTop: "2px" }}>
                        <span style={{ color: "#059669" }}>Entregados: <b>{stMap["CREDITO ENTREGADO"] || 0}</b></span>
                        <span style={{ color: "#2563eb" }}>En Proceso: <b>{stMap["EN PROCESO"] || 0}</b></span>
                        {(stMap["CARPETA RETORNADA"] || 0) > 0 && <span style={{ color: "#d97706" }}>Ret: <b>{stMap["CARPETA RETORNADA"]}</b></span>}
                        {(stMap["CON NOVEDAD EN LA SEDE"] || 0) > 0 && <span style={{ color: "#dc2626" }}>Nov: <b>{stMap["CON NOVEDAD EN LA SEDE"]}</b></span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            {/* Panel Derecho: Códigos QR & Niveles de Maduración */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Auditoría QR */}
              <Panel title="Penetración y Registro de Códigos QR">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", margin: "0.5rem 0 0.85rem" }}>
                  <div style={{ padding: "0.85rem", borderRadius: "12px", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)" }}>
                    <span style={{ fontSize: "0.76rem", opacity: 0.8, display: "block" }}>QR Hábitat y Vivienda</span>
                    <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "#2563eb" }}><Num value={qrCobertura.habitatVivienda} /></span>
                    <span style={{ fontSize: "0.78rem", display: "block", marginTop: "2px" }}>{pct(qrCobertura.habitatVivienda, totalPersonas)}% de cobertura</span>
                  </div>
                  <div style={{ padding: "0.85rem", borderRadius: "12px", background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)" }}>
                    <span style={{ fontSize: "0.76rem", opacity: 0.8, display: "block" }}>QR Colapso de Vivienda</span>
                    <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "#7c3aed" }}><Num value={qrCobertura.colapsoVivienda} /></span>
                    <span style={{ fontSize: "0.78rem", display: "block", marginTop: "2px" }}>{pct(qrCobertura.colapsoVivienda, totalPersonas)}% de cobertura</span>
                  </div>
                </div>

                <div className="pres-bars">
                  <BarRow label="Con Ambos Códigos QR" value={qrCobertura.ambosQr} total={totalPersonas || 1} color="#059669" />
                  <BarRow label="Al menos un Código QR" value={qrCobertura.alMenosUno} total={totalPersonas || 1} color="#2563eb" />
                  <BarRow label="Pendientes por QR" value={qrCobertura.sinQr} total={totalPersonas || 1} color="#e11d48" />
                </div>
              </Panel>

              {/* Maduración Documental */}
              <Panel title="Nivel de Maduración Documental (Recaudos)">
                <div className="pres-bars" style={{ marginTop: "0.4rem" }}>
                  <BarRow label="100% Expediente Completo (Listo)" value={rangosProgreso.completo100} total={totalPersonas || 1} color="#059669" />
                  <BarRow label="70% – 99% Avance Avanzado" value={rangosProgreso.avanzado70_99} total={totalPersonas || 1} color="#2563eb" />
                  <BarRow label="40% – 69% Avance Intermedio" value={rangosProgreso.medio40_69} total={totalPersonas || 1} color="#f59e0b" />
                  <BarRow label="0% – 39% Recepción Inicial" value={rangosProgreso.inicial0_39} total={totalPersonas || 1} color="#dc2626" />
                </div>
              </Panel>
            </div>
          </div>
        ),
      },

      // ── SLIDE 3: DEMOGRAFÍA & TERRITORIO ───────────────────────────────────
      {
        id: "demografia",
        title: "Demografía y Caracterización de la Población",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          </svg>
        ),
        body: (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
            {/* Panel A: Género Titulares vs Total */}
            <Panel title="Distribución por Género">
              {demografia ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <Donut fem={demografia.generoTotal.femenino} masc={demografia.generoTotal.masculino} />
                  <div style={{ display: "flex", justifyContent: "space-around", fontSize: "0.85rem", borderTop: "1px solid var(--border-color)", paddingTop: "0.6rem" }}>
                    <div>
                      <span style={{ opacity: 0.75, display: "block", fontSize: "0.75rem" }}>Jefas Femeninas</span>
                      <b style={{ color: "#db2777" }}><Num value={demografia.generoTitulares.femenino} /></b>
                    </div>
                    <div>
                      <span style={{ opacity: 0.75, display: "block", fontSize: "0.75rem" }}>Jefes Masculinos</span>
                      <b style={{ color: "#2563eb" }}><Num value={demografia.generoTitulares.masculino} /></b>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="pres-empty">Sin datos demográficos</p>
              )}
            </Panel>

            {/* Panel B: Grupos de Edad */}
            <Panel title="Pirámide por Grupos de Edad">
              {demografia ? (
                <div className="pres-bars" style={{ marginTop: "0.5rem" }}>
                  <BarRow label="Niños y Adolescentes (0–17)" value={demografia.gruposEdad.ninosAdolescentes} total={totalPoblacion || 1} color="#06b6d4" />
                  <BarRow label="Jóvenes (18–29)" value={demografia.gruposEdad.jovenes} total={totalPoblacion || 1} color="#10b981" />
                  <BarRow label="Adultos (30–59)" value={demografia.gruposEdad.adultos} total={totalPoblacion || 1} color="#f59e0b" />
                  <BarRow label="Adultos Mayores (≥60)" value={demografia.gruposEdad.adultosMayores} total={totalPoblacion || 1} color="#8b5cf6" />
                </div>
              ) : null}
            </Panel>

            {/* Panel C: Consolidado Territorial o Ritmo Temporal */}
            <Panel
              title={
                selectedCampamento === "TODOS"
                  ? "Top Campamentos con Mayor Carga"
                  : "Ritmo de Recepción y Créditos Mensuales"
              }
            >
              {selectedCampamento === "TODOS" ? (
                <div className="pres-rank">
                  {stats.campamentos
                    .filter((c) => c.totalPersonas > 0)
                    .slice(0, 6)
                    .map((c, i) => (
                      <div key={c.refugio} className="pres-rank__row">
                        <span className={`pres-rank__pos ${i < 3 ? "is-top" : ""}`}>{i + 1}</span>
                        <span className="pres-rank__label" style={{ fontSize: "0.85rem" }}>{c.refugio}</span>
                        <span className="pres-rank__track">
                          <span
                            className="pres-rank__fill"
                            style={{
                              width: `${pct(c.totalPersonas, stats.campamentos[0]?.totalPersonas || 1)}%`,
                              background: "#2563eb",
                            }}
                          />
                        </span>
                        <span className="pres-rank__count">
                          <Num value={c.totalPersonas} />
                          <small style={{ opacity: 0.7, fontSize: "0.72rem", marginLeft: "4px" }}>
                            ({c.porEstatus?.["CREDITO ENTREGADO"] || 0} ent.)
                          </small>
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.65rem", marginTop: "0.5rem" }}>
                  {(stats.avanceTemporal || []).map((t) => (
                    <div
                      key={t.mes}
                      style={{
                        padding: "0.7rem",
                        borderRadius: "10px",
                        background: "var(--pres-card-bg, rgba(255,255,255,0.04))",
                        textAlign: "center",
                      }}
                    >
                      <span style={{ fontSize: "0.75rem", opacity: 0.75, display: "block" }}>{t.mes}</span>
                      <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "#2563eb", display: "block" }}>{t.carpetas}</span>
                      <span style={{ fontSize: "0.7rem", color: "#059669", fontWeight: 700 }}>{t.creditos} ent.</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        ),
      },
    ];
    return list;
  }, [
    totalPersonas,
    totalPoblacion,
    totalCargaFamiliar,
    promedioProgreso,
    creditosCount,
    enProcesoCount,
    retornadasCount,
    novedadesCount,
    estatusPorModalidad,
    modalidadPorEstatus,
    porTipoOpcion,
    demografia,
    qrCobertura,
    rangosProgreso,
    selectedCampamento,
    stats,
  ]);

  // Rotación automática entre diapositivas
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % slides.length);
      setCycle((c) => c + 1);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [slides.length, paused]);

  const go = (i: number) => {
    setIdx(i);
    setCycle((c) => c + 1);
  };

  const cur = slides[idx] || slides[0];
  const hh = now ? two(now.getHours()) : "--";
  const mm = now ? two(now.getMinutes()) : "--";
  const ss = now ? two(now.getSeconds()) : "--";
  const fecha = now
    ? now.toLocaleDateString("es-VE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    : "";

  return (
    <div className={`pres pres--${theme}`}>
      {/* ── MEMBRETE SUPERIOR INSTITUCIONAL ─────────────────────────────────── */}
      <header className="pres__header">
        <div className="pres__brand">
          <img src="/logo_gob.webp" alt="Gobernación del Estado La Guaira" className="pres__logo" />
          <div className="pres__brand-txt">
            <span className="pres__org">Gobernación del Estado La Guaira</span>
            <h1 className="pres__title">Planteamiento de Soluciones Habitacionales</h1>
            <span className="pres__refugio">
              {selectedCampamento === "TODOS" ? "Consolidado General (26 Campamentos Oficiales)" : selectedCampamento}
              {isUpdating && <span style={{ marginLeft: "8px", color: "#60a5fa", fontSize: "0.75rem" }}>● Actualizando…</span>}
            </span>
          </div>
        </div>

        <div className="pres__headright">
          {/* Controles de Presentación */}
          <div className="pres__controls">
            {onRefresh && (
              <button
                type="button"
                className="pres__ctl"
                onClick={onRefresh}
                title="Actualizar datos ahora"
                aria-label="Actualizar datos"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="pres__ctl"
              onClick={() => setPaused((p) => !p)}
              title={paused ? "Reanudar autorrotación" : "Pausar autorrotación"}
              aria-label={paused ? "Reanudar" : "Pausar"}
            >
              {paused ? (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="pres__ctl"
              onClick={toggleTheme}
              title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
              aria-label="Cambiar tema"
            >
              {theme === "dark" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            {onExit && (
              <button
                type="button"
                className="pres__ctl pres__ctl--exit"
                onClick={onExit}
                title="Salir de pantalla completa (Esc)"
                aria-label="Salir"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Reloj y Fecha Oficial en Vivo */}
          <div className="pres__clock">
            <div className="pres__time">
              <b>{hh}</b>:<b>{mm}</b>
              <span className="pres__sec">{ss}</span>
            </div>
            <div className="pres__date">{fecha}</div>
            <SismoDayBadge className="pres__daybadge" />
          </div>
        </div>
      </header>

      {/* ── ESCENARIO PRINCIPAL DE DIAPOSITIVA ─────────────────────────────────── */}
      <main className="pres__stage">
        <div className="pres__slide" key={idx}>
          <div className="pres__slide-head">
            <span className="pres__slide-ico" style={{ background: "#2563eb", color: "#fff" }}>
              {cur.icon}
            </span>
            <h2>{cur.title}</h2>
          </div>
          <div className="pres__slide-body">{cur.body}</div>
        </div>
      </main>

      {/* ── PIE CON NAVEGACIÓN Y BARRA DE PROGRESO ────────────────────────────── */}
      <footer className="pres__footer">
        <div className="pres__dots">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`pres__dot ${i === idx ? "is-active" : ""}`}
              onClick={() => go(i)}
              aria-label={s.title}
            />
          ))}
        </div>
        <div className="pres__bar">
          <span
            key={cycle}
            className="pres__bar-fill"
            style={{
              animationDuration: `${ROTATE_MS}ms`,
              animationPlayState: paused ? "paused" : "running",
            }}
          />
        </div>
      </footer>
    </div>
  );
}

// ── COMPONENTES AUXILIARES ───────────────────────────────────────────────────

function BigCard({
  accent,
  label,
  value,
  icon,
  suffix,
}: {
  accent: string;
  label: string;
  value: number;
  icon: ReactNode;
  suffix?: string;
}) {
  return (
    <div className="pres-card" style={{ ["--accent" as any]: accent }}>
      <span className="pres-card__icon" style={{ background: accent, color: "#fff" }}>
        {icon}
      </span>
      <span className="pres-card__value">
        <Num value={value} />
        {suffix && <em>{suffix}</em>}
      </span>
      <span className="pres-card__label">{label}</span>
    </div>
  );
}

function Panel({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`pres-panel ${wide ? "pres-panel--wide" : ""}`}>
      <h3 className="pres-panel__title">{title}</h3>
      {children}
    </div>
  );
}

function BarRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  return (
    <div className="pres-barrow">
      <span className="pres-barrow__label">{label}</span>
      <span className="pres-barrow__track">
        <span className="pres-barrow__fill" style={{ width: `${pct(value, total)}%`, background: color }} />
      </span>
      <span className="pres-barrow__val">
        <Num value={value} />
      </span>
    </div>
  );
}

function Donut({ fem, masc }: { fem: number; masc: number }) {
  const total = fem + masc || 1;
  const R = 52,
    C = 2 * Math.PI * R;
  const fFrac = fem / total;
  const fDash = fFrac * C;
  return (
    <div className="pres-donut">
      <svg viewBox="0 0 130 130" className="pres-donut__svg">
        <circle cx="65" cy="65" r={R} fill="none" stroke="var(--pres-track)" strokeWidth="16" />
        <circle
          cx="65"
          cy="65"
          r={R}
          fill="none"
          stroke="#db2777"
          strokeWidth="16"
          strokeDasharray={`${fDash} ${C - fDash}`}
          transform="rotate(-90 65 65)"
          strokeLinecap="round"
        />
        <circle
          cx="65"
          cy="65"
          r={R}
          fill="none"
          stroke="#2563eb"
          strokeWidth="16"
          strokeDasharray={`${C - fDash} ${fDash}`}
          transform={`rotate(${-90 + fFrac * 360} 65 65)`}
          strokeLinecap="round"
        />
        <text x="65" y="70" textAnchor="middle" className="pres-donut__num">
          {total}
        </text>
      </svg>
      <div className="pres-donut__legend">
        <span>
          <i style={{ background: "#db2777" }} />
          Femenino <b>{fem}</b> <em>({Math.round(fFrac * 100)}%)</em>
        </span>
        <span>
          <i style={{ background: "#2563eb" }} />
          Masculino <b>{masc}</b> <em>({Math.round((1 - fFrac) * 100)}%)</em>
        </span>
      </div>
    </div>
  );
}

function StatusBox({
  title,
  count,
  total,
  color,
  bg,
  icon,
  breakdown = {} as Record<TipoOpcionPlanteamiento, number>,
}: {
  title: string;
  count: number;
  total: number;
  color: string;
  bg: string;
  icon: ReactNode;
  breakdown?: Record<TipoOpcionPlanteamiento, number>;
}) {
  return (
    <div
      style={{
        borderRadius: "16px",
        background: bg,
        border: `1.5px solid ${color}40`,
        padding: "1rem 1.15rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.65rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: color,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </span>
          <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{title}</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: "1.3rem", fontWeight: 800, color }}>
            <Num value={count} />
          </span>
          <span style={{ fontSize: "0.75rem", opacity: 0.75, marginLeft: "4px" }}>
            ({pct(count, total)}%)
          </span>
        </div>
      </div>

      {/* Desglose por las 5 modalidades */}
      <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginTop: "4px" }}>
        {MODALIDADES_META.map((m) => {
          const val = breakdown[m.key] || 0;
          return (
            <div key={m.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.78rem" }}>
              <span style={{ opacity: 0.85, display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: m.color }} />
                {m.short}:
              </span>
              <span style={{ fontWeight: 700, color: val > 0 ? color : "inherit", opacity: val > 0 ? 1 : 0.4 }}>
                {val}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PRES_ICONS = {
  folder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  family: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  ),
  checkCircle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  award: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="8" r="7" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </svg>
  ),
};
