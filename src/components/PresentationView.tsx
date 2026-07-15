"use client";

// ── Vista de PRESENTACIÓN (modo TV para los jefes) ──────────────────────────
// Dashboard en pantalla completa, hermoso y "que denote control": membrete con
// reloj/fecha en vivo, AUTORROTACIÓN entre secciones con transiciones animadas,
// números que animan al cambiar, semáforos de ocupación. 100% pill y responsive.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import SismoDayBadge from "@/components/SismoDayBadge";

interface Props {
  stats: any;
  roomCounts: Record<string, number>;
  roomCapacities: Record<string, number>;
  allCuartos: string[];
  refugio?: string;
  onExit?: () => void;
}

const ROTATE_MS = 22000; // cada sección se queda ~22s (antes 11s: iba muy rápido)

// Cuenta ascendente animada (easeOutCubic). Reinicia cuando cambia el valor
// (cambio de sección o de dato) → "animado cuando un dato cambia".
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

export default function PresentationView({ stats, roomCounts, roomCapacities, allCuartos, refugio, onExit }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [idx, setIdx] = useState(0);
  const [cycle, setCycle] = useState(0); // fuerza reinicio de la barra de progreso
  const [theme, setTheme] = useState<"dark" | "light">("dark"); // el usuario elige
  const [paused, setPaused] = useState(false); // pausa SOLO la autorrotación (no el refresh de datos)

  // Preferencia de tema persistida (por dispositivo).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pres_theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch { /* noop */ }
  }, []);
  const toggleTheme = () => setTheme((t) => {
    const next = t === "dark" ? "light" : "dark";
    try { localStorage.setItem("pres_theme", next); } catch { /* noop */ }
    return next;
  });

  // Reloj en vivo (solo cliente).
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const S = stats || {};
  const m = S.matrix || { lactantes: {}, menores: {}, adultos: {}, mayores: {} };

  // Ocupación de cuartos con semáforo.
  const rooms = useMemo(() => {
    return (allCuartos || []).map((r) => {
      const count = roomCounts[r] || 0;
      const cap = roomCapacities[r] || 0;
      const ratio = cap > 0 ? count / cap : 0;
      const level = cap === 0 ? "none" : ratio >= 1 ? "red" : ratio >= 0.75 ? "yellow" : "green";
      return { name: r, count, cap, level };
    });
  }, [allCuartos, roomCounts, roomCapacities]);
  const ocupados = rooms.reduce((s, r) => s + r.count, 0);
  const capacidadTotal = rooms.reduce((s, r) => s + r.cap, 0);
  const ocupacionPct = capacidadTotal > 0 ? Math.round((ocupados / capacidadTotal) * 100) : 0;

  const genero = Array.isArray(S.byGenero) ? S.byGenero : [];
  const fem = genero.find((g: any) => /fem/i.test(g.name))?.count ?? ((m.menores?.femenino || 0) + (m.adultos?.femenino || 0) + (m.mayores?.femenino || 0));
  const masc = genero.find((g: any) => /mas/i.test(g.name))?.count ?? ((m.menores?.masculino || 0) + (m.adultos?.masculino || 0) + (m.mayores?.masculino || 0));
  // Patologías MÁS FRECUENTES (nombres reales del censo), no el conteo SÍ/NO.
  const topPat = (Array.isArray(S.topPatologias) ? S.topPatologias : []).slice(0, 6);
  const parrSorted = [...(Array.isArray(S.byParroquia) ? S.byParroquia : [])].sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
  const topParr = parrSorted.slice(0, 10);
  // Concentración territorial: cuánto del total se agrupa en las 3 parroquias top.
  const parrTotal = parrSorted.reduce((s: number, x: any) => s + (x.count || 0), 0);
  const top3Count = parrSorted.slice(0, 3).reduce((s: number, x: any) => s + (x.count || 0), 0);
  const restoCount = Math.max(0, parrTotal - top3Count);
  const top3Pct = parrTotal ? Math.round((top3Count / parrTotal) * 100) : 0;
  // Con / sin patología (proporción, para mostrarlo "de otra forma" que un ranking).
  const conPat = S.conPatologia || 0;
  const sinPat = Math.max(0, (S.total || 0) - conPat);
  const conPatPct = (S.total || 0) > 0 ? Math.round((conPat / S.total) * 100) : 0;
  // Lesionados / No lesionados (mismo tratamiento de proporción).
  const lesion = S.lesionados || 0;
  const noLesion = Math.max(0, (S.total || 0) - lesion);
  const lesionPct = (S.total || 0) > 0 ? Math.round((lesion / S.total) * 100) : 0;
  // Mujeres embarazadas (censo).
  const embarazadas = S.embarazadas || 0;

  // Slides
  const slides: { id: string; title: string; icon: ReactNode; body: ReactNode }[] = [
    {
      id: "panorama", title: "Panorama General",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="7" rx="1" /><rect x="12" y="6" width="3" height="11" rx="1" /><rect x="17" y="13" width="3" height="4" rx="1" /></svg>,
      body: (
        <div className="pres-cards">
          <BigCard accent="#2563eb" label="Personas registradas" value={S.totalRegistrados || 0} icon={ICON.users} />
          <BigCard accent="#0d9488" label="Presentes" value={S.total || 0} icon={ICON.home} />
          <BigCard accent="#7c3aed" label="Núcleos familiares" value={S.nucleosFamiliares || 0} icon={ICON.family} />
          <BigCard accent="#64748b" label="Individuos solos" value={S.individuosSolos || 0} icon={ICON.user} />
          <BigCard accent="#d97706" label="Intermitentes" value={S.intermitentes || 0} icon={ICON.clock} />
          <BigCard accent="#dc2626" label="Retirados" value={S.totalRetirados || 0} icon={ICON.out} />
          <BigCard accent="#16a34a" label="Hogar solidario" value={S.hogarSolidario || 0} icon={ICON.heart} />
          <BigCard accent="#0284c7" label="Edad promedio" value={S.promedioEdad || 0} suffix="años" icon={ICON.cake} />
          <BigCard accent="#f59e0b" label="Ocupación cuartos" value={ocupacionPct} suffix="%" icon={ICON.bed} />
        </div>
      ),
    },
    {
      id: "demografia", title: "Demografía",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>,
      body: (
        <div className="pres-demo">
          <Panel title="Por género">
            <Donut fem={fem} masc={masc} />
          </Panel>
          <Panel title="Por edad">
            <div className="pres-bars">
              <BarRow label="Lactantes (0–3)" value={S.lactantes || 0} total={S.total || 1} color="#06b6d4" />
              <BarRow label="Menores (4–17)" value={Math.max(0, (S.menores || 0) - (S.lactantes || 0))} total={S.total || 1} color="#10b981" />
              <BarRow label="Adultos (18–59)" value={S.adultos || 0} total={S.total || 1} color="#f59e0b" />
              <BarRow label="Mayores (≥60)" value={S.mayores || 0} total={S.total || 1} color="#8b5cf6" />
            </div>
          </Panel>
          <Panel title="Edad × género" wide>
            <MatrixT m={m} />
          </Panel>
        </div>
      ),
    },
    {
      id: "territorio", title: "Distribución Territorial",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>,
      body: (
        <div className="pres-terr">
          <Panel title="Afectados por parroquia">
            {topParr.length === 0 ? <p className="pres-empty">No hay datos de parroquia en el censo.</p> : (
              <div className="pres-rank">
                {topParr.map((p: any, i: number) => (
                  <div key={i} className="pres-rank__row">
                    <span className={`pres-rank__pos ${i < 3 ? "is-top" : ""}`}>{i + 1}</span>
                    <span className="pres-rank__label">{p.name}</span>
                    <span className="pres-rank__track"><span className="pres-rank__fill" style={{ width: `${pct(p.count, topParr[0]?.count || 1)}%` }} /></span>
                    <span className="pres-rank__count"><Num value={p.count} /></span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Concentración territorial">
            {parrTotal === 0 ? <p className="pres-empty">Sin datos.</p> : (() => {
              const R = 52, Circ = 2 * Math.PI * R;
              const frac = top3Count / (parrTotal || 1);
              const dash = frac * Circ;
              return (
                <div className="pres-donut">
                  <svg viewBox="0 0 130 130" className="pres-donut__svg">
                    <circle cx="65" cy="65" r={R} fill="none" stroke="var(--pres-track)" strokeWidth="16" />
                    <circle cx="65" cy="65" r={R} fill="none" stroke="#2563eb" strokeWidth="16" strokeDasharray={`${dash} ${Circ - dash}`} transform="rotate(-90 65 65)" strokeLinecap="round" />
                    <circle cx="65" cy="65" r={R} fill="none" stroke="#94a3b8" strokeWidth="16" strokeDasharray={`${Circ - dash} ${dash}`} transform={`rotate(${-90 + frac * 360} 65 65)`} strokeLinecap="round" />
                    <text x="65" y="72" textAnchor="middle" className="pres-donut__num">{top3Pct}%</text>
                  </svg>
                  <div className="pres-donut__legend">
                    <span><i style={{ background: "#2563eb" }} />Top 3 parroquias <b>{top3Count.toLocaleString("es-VE")}</b> <em>({top3Pct}%)</em></span>
                    <span><i style={{ background: "#94a3b8" }} />Resto <b>{restoCount.toLocaleString("es-VE")}</b> <em>({100 - top3Pct}%)</em></span>
                  </div>
                </div>
              );
            })()}
          </Panel>
        </div>
      ),
    },
    {
      id: "salud", title: "Salud y Condición",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
      body: (
        <div className="pres-salud">
          <div className="pres-cards pres-cards--3">
            <BigCard accent="#e11d48" label="Con patología" value={conPat} suffix={`· ${conPatPct}%`} icon={ICON.heart} />
            <BigCard accent="#dc2626" label="Lesionados" value={lesion} icon={ICON.bandage} />
            <BigCard accent="#db2777" label="Mujeres embarazadas" value={embarazadas} icon={ICON.pregnant} />
          </div>
          <div className="pres-demo">
            <div className="pres-col">
            <Panel title="Con / sin patología">
              <div className="pres-seg">
                <span className="pres-seg__part" style={{ width: `${conPatPct}%`, background: "#e11d48" }}>{conPatPct >= 12 ? `${conPatPct}%` : ""}</span>
                <span className="pres-seg__part" style={{ width: `${100 - conPatPct}%`, background: "#64748b" }}>{(100 - conPatPct) >= 12 ? `${100 - conPatPct}%` : ""}</span>
              </div>
              <div className="pres-seg__legend">
                <span><i style={{ background: "#e11d48" }} />Con patología <b>{conPat.toLocaleString("es-VE")}</b></span>
                <span><i style={{ background: "#64748b" }} />Sin patología <b>{sinPat.toLocaleString("es-VE")}</b></span>
              </div>
            </Panel>
            <Panel title="Lesionados / No lesionados">
              <div className="pres-seg">
                <span className="pres-seg__part" style={{ width: `${lesionPct}%`, background: "#dc2626" }}>{lesionPct >= 12 ? `${lesionPct}%` : ""}</span>
                <span className="pres-seg__part" style={{ width: `${100 - lesionPct}%`, background: "#0d9488" }}>{(100 - lesionPct) >= 12 ? `${100 - lesionPct}%` : ""}</span>
              </div>
              <div className="pres-seg__legend">
                <span><i style={{ background: "#dc2626" }} />Lesionados <b>{lesion.toLocaleString("es-VE")}</b></span>
                <span><i style={{ background: "#0d9488" }} />No lesionados <b>{noLesion.toLocaleString("es-VE")}</b></span>
              </div>
            </Panel>
            </div>
            <Panel title="Patologías más frecuentes en el censo">
              {topPat.length === 0 ? <p className="pres-empty">No hay patologías registradas en el censo.</p> : (
                <div className="pres-rank">
                  {topPat.map((p: any, i: number) => (
                    <div key={i} className="pres-rank__row">
                      <span className={`pres-rank__pos ${i < 3 ? "is-top" : ""}`}>{i + 1}</span>
                      <span className="pres-rank__label">{p.name}</span>
                      <span className="pres-rank__track"><span className="pres-rank__fill" style={{ width: `${pct(p.count, topPat[0]?.count || 1)}%` }} /></span>
                      <span className="pres-rank__count"><Num value={p.count} /></span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      ),
    },
    {
      id: "alojamiento", title: "Alojamiento",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
      body: (
        <div className="pres-aloja">
          <div className="pres-cards pres-cards--3">
            <BigCard accent="#0d9488" label="Cuartos" value={rooms.length} icon={ICON.grid} />
            <BigCard accent="#2563eb" label="Personas alojadas" value={ocupados} icon={ICON.users} />
            <BigCard accent="#dc2626" label="Por asignar" value={S.sinCuarto || 0} icon={ICON.alert} />
          </div>
          {rooms.length > 0 && (
            <Panel title={`Ocupación por cuarto · ${ocupacionPct}% general`} wide>
              <div className="pres-rooms">
                {rooms.map((r) => (
                  <div key={r.name} className={`pres-room pres-room--${r.level}`}>
                    <span className="pres-room__name">{r.name}</span>
                    <span className="pres-room__num">{r.count}{r.cap ? <em>/{r.cap}</em> : ""}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      ),
    },
  ];

  // Autorrotación (se detiene si el usuario pausa; el refresh de datos sigue aparte).
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => { setIdx((i) => (i + 1) % slides.length); setCycle((c) => c + 1); }, ROTATE_MS);
    return () => clearInterval(t);
  }, [slides.length, paused]);

  const go = (i: number) => { setIdx(i); setCycle((c) => c + 1); };
  const cur = slides[idx];
  const hh = now ? two(now.getHours()) : "--";
  const mm = now ? two(now.getMinutes()) : "--";
  const ss = now ? two(now.getSeconds()) : "--";
  const fecha = now ? now.toLocaleDateString("es-VE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : "";

  return (
    <div className={`pres pres--${theme}`}>
      {/* Membrete */}
      <header className="pres__header">
        <div className="pres__brand">
          <img src="/logo_gob.webp" alt="" className="pres__logo" />
          <div className="pres__brand-txt">
            <span className="pres__org">Gobernación del Estado La Guaira</span>
            <h1 className="pres__title">Campamentos Transitorios</h1>
            <span className="pres__refugio">{refugio || "Todos los campamentos"}</span>
          </div>
        </div>
        <div className="pres__headright">
          {/* Controles: pausar rotación · tema claro/oscuro · salir */}
          <div className="pres__controls">
            <button type="button" className="pres__ctl" onClick={() => setPaused((p) => !p)} title={paused ? "Reanudar rotación" : "Pausar rotación"} aria-label={paused ? "Reanudar" : "Pausar"}>
              {paused
                ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                : <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>}
            </button>
            <button type="button" className="pres__ctl" onClick={toggleTheme} title={theme === "dark" ? "Tema claro" : "Tema oscuro"} aria-label="Cambiar tema">
              {theme === "dark"
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>}
            </button>
            {onExit && (
              <button type="button" className="pres__ctl pres__ctl--exit" onClick={onExit} title="Salir de presentación" aria-label="Salir de presentación">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>
          <div className="pres__clock">
            <div className="pres__time"><b>{hh}</b>:<b>{mm}</b><span className="pres__sec">{ss}</span></div>
            <div className="pres__date">{fecha}</div>
            <SismoDayBadge className="pres__daybadge" />
          </div>
        </div>
      </header>

      {/* Escenario (slide) */}
      <main className="pres__stage">
        <div className="pres__slide" key={idx}>
          <div className="pres__slide-head">
            <span className="pres__slide-ico" style={{ background: "#2563eb", color: "#fff" }}>{cur.icon}</span>
            <h2>{cur.title}</h2>
          </div>
          <div className="pres__slide-body">{cur.body}</div>
        </div>
      </main>

      {/* Pie: barra de progreso + indicadores */}
      <footer className="pres__footer">
        <div className="pres__dots">
          {slides.map((s, i) => (
            <button key={s.id} type="button" className={`pres__dot ${i === idx ? "is-active" : ""}`} onClick={() => go(i)} aria-label={s.title} />
          ))}
        </div>
        <div className="pres__bar"><span key={cycle} className="pres__bar-fill" style={{ animationDuration: `${ROTATE_MS}ms`, animationPlayState: paused ? "paused" : "running" }} /></div>
      </footer>
    </div>
  );
}

const pct = (n: number, total: number) => (total > 0 ? Math.min(100, (n / total) * 100) : 0);

// ── Sub-piezas ──────────────────────────────────────────────────────────────
function BigCard({ accent, label, value, icon, suffix }: { accent: string; label: string; value: number; icon: ReactNode; suffix?: string }) {
  return (
    <div className="pres-card" style={{ ["--accent" as any]: accent }}>
      {/* Fondo del badge INLINE (a prueba de CSS cacheado / var(--accent) sin resolver):
          así nunca queda blanco con el ícono blanco encima. */}
      <span className="pres-card__icon" style={{ background: accent, color: "#fff" }}>{icon}</span>
      <span className="pres-card__value"><Num value={value} />{suffix && <em>{suffix}</em>}</span>
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
function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return (
    <div className="pres-barrow">
      <span className="pres-barrow__label">{label}</span>
      <span className="pres-barrow__track"><span className="pres-barrow__fill" style={{ width: `${pct(value, total)}%`, background: color }} /></span>
      <span className="pres-barrow__val"><Num value={value} /></span>
    </div>
  );
}
function Donut({ fem, masc }: { fem: number; masc: number }) {
  const total = fem + masc || 1;
  const R = 52, C = 2 * Math.PI * R;
  const fFrac = fem / total;
  const fDash = fFrac * C;
  return (
    <div className="pres-donut">
      <svg viewBox="0 0 130 130" className="pres-donut__svg">
        <circle cx="65" cy="65" r={R} fill="none" stroke="var(--pres-track)" strokeWidth="16" />
        <circle cx="65" cy="65" r={R} fill="none" stroke="#db2777" strokeWidth="16" strokeDasharray={`${fDash} ${C - fDash}`} transform="rotate(-90 65 65)" strokeLinecap="round" />
        <circle cx="65" cy="65" r={R} fill="none" stroke="#2563eb" strokeWidth="16" strokeDasharray={`${C - fDash} ${fDash}`} transform={`rotate(${-90 + fFrac * 360} 65 65)`} strokeLinecap="round" />
        <text x="65" y="70" textAnchor="middle" className="pres-donut__num">{total}</text>
      </svg>
      <div className="pres-donut__legend">
        <span><i style={{ background: "#db2777" }} />Femenino <b>{fem}</b> <em>({Math.round(fFrac * 100)}%)</em></span>
        <span><i style={{ background: "#2563eb" }} />Masculino <b>{masc}</b> <em>({Math.round((1 - fFrac) * 100)}%)</em></span>
      </div>
    </div>
  );
}
function MatrixT({ m }: { m: any }) {
  const row = (label: string, o: any) => {
    const f = o?.femenino || 0, ma = o?.masculino || 0;
    return (
      <tr><td>{label}</td><td className="f">{f}</td><td className="m">{ma}</td><td className="t">{f + ma}</td></tr>
    );
  };
  const lac = m.lactantes || {};
  // "Menores" (m.menores) es <18 e incluye lactantes; se muestra el tramo 4–17 aparte.
  const men4 = {
    femenino: Math.max(0, (m.menores?.femenino || 0) - (lac.femenino || 0)),
    masculino: Math.max(0, (m.menores?.masculino || 0) - (lac.masculino || 0)),
  };
  const tf = (m.menores?.femenino || 0) + (m.adultos?.femenino || 0) + (m.mayores?.femenino || 0);
  const tm = (m.menores?.masculino || 0) + (m.adultos?.masculino || 0) + (m.mayores?.masculino || 0);
  return (
    <table className="pres-matrix">
      <thead><tr><th>Grupo</th><th>Fem</th><th>Masc</th><th>Total</th></tr></thead>
      <tbody>
        {row("Lactantes", lac)}
        {row("Menores", men4)}
        {row("Adultos", m.adultos)}
        {row("Mayores", m.mayores)}
        <tr className="tot"><td>Total</td><td className="f">{tf}</td><td className="m">{tm}</td><td className="t">{tf + tm}</td></tr>
      </tbody>
    </table>
  );
}

const ICON = {
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>,
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  family: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>,
  out: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
  cake: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 21h16M4 21v-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M4 15c1.5 0 1.5 1 3 1s1.5-1 3-1M12 8V5" /></svg>,
  bed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  heart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" /></svg>,
  pregnant: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="4" r="2" /><path d="M12 7v6M12 9c3 0 4.5 2 4.5 4.5S15 18 12 18M12 13c-1.2 0-2 .8-2 2v6" /></svg>,
  bandage: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)" /><path d="M9.5 9.5l5 5" /></svg>,
  alert: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>,
};
