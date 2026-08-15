"use client";

// ── Gráficas de VZLA RENACE (solo Master) ───────────────────────────────────
// Estadísticas AGREGADAS (sin PII) del endpoint `/api/vzlarenace/stats`: sección
// GLOBAL (KPIs + planteamientos por tipo + cobertura) y una tarjeta POR CAMPAMENTO
// que crece sola a medida que se importan campamentos con datos. Charts en CSS/SVG.

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useAnimatedModal } from "@/components/useAnimatedModal";
import { RENACE_PLANTEAMIENTO_TIPOS } from "@/lib/constants";

type PorTipo = Record<string, number>;
type Camp = { refugioId: string; nombre: string; familias: number; miembros: number; conPlan: number; sinPlan: number; porTipo: PorTipo };
type Stats = { campamentos: Camp[]; global: { campamentos: number; familias: number; miembros: number; conPlan: number; sinPlan: number; porTipo: PorTipo } };

const CACHE_KEY = "renace_stats_v1";
const TIPOS = ["COMPRA", "ALQUILER", "GMVV_INTERIOR", "PLAN_RENACE"];
const TIPO_COLOR: Record<string, string> = { COMPRA: "#2563eb", ALQUILER: "#0d9488", GMVV_INTERIOR: "#d97706", PLAN_RENACE: "#7c3aed" };
const tipoLabel = (v: string) => RENACE_PLANTEAMIENTO_TIPOS.find((t) => t.value === v)?.label || v;
const fmt = (n: number) => n.toLocaleString("es-VE");
// Porcentaje con 2 decimales y coma decimal (formato venezolano): "12,34%".
const pctStr = (n: number, total: number) => `${(total ? (n / total) * 100 : 0).toFixed(2).replace(".", ",")}%`;

// Barras horizontales de planteamientos por tipo.
function TipoBars({ porTipo, compact }: { porTipo: PorTipo; compact?: boolean }) {
  const total = TIPOS.reduce((s, k) => s + (porTipo[k] || 0), 0);
  return (
    <div className={`renace-bars${compact ? " renace-bars--compact" : ""}`}>
      {TIPOS.map((k) => {
        const v = porTipo[k] || 0;
        const w = total ? (v / total) * 100 : 0;
        return (
          <div key={k} className="renace-bar">
            <span className="renace-bar__label">{compact ? tipoLabel(k).split(" ")[0] : tipoLabel(k)}</span>
            <div className="renace-bar__track">
              <span className="renace-bar__fill" style={{ width: `${w}%`, background: TIPO_COLOR[k] }} />
            </div>
            <span className="renace-bar__val"><b>{fmt(v)}</b><span className="renace-bar__pct">{pctStr(v, total)}</span></span>
          </div>
        );
      })}
      {total === 0 && <div className="renace-bars__empty">Sin planteamientos aún.</div>}
    </div>
  );
}

// Barra de cobertura con/sin planteamiento.
function Cobertura({ con, sin }: { con: number; sin: number }) {
  const total = con + sin;
  const cp = total ? (con / total) * 100 : 0;
  return (
    <div className="renace-cob">
      <div className="renace-cob__bar" role="img" aria-label={`Con plan ${con}, sin plan ${sin}`}>
        <span className="renace-cob__con" style={{ width: `${cp}%` }} />
      </div>
      <div className="renace-cob__legend">
        <span><i className="renace-cob__dot renace-cob__dot--con" /> Con plan · <b>{fmt(con)}</b> ({pctStr(con, total)})</span>
        <span><i className="renace-cob__dot renace-cob__dot--sin" /> Sin plan · <b>{fmt(sin)}</b> ({pctStr(sin, total)})</span>
      </div>
    </div>
  );
}

// Barra MULTICOLOR apilada: composición por tipo (cada segmento un color).
function TipoStack({ porTipo }: { porTipo: PorTipo }) {
  const total = TIPOS.reduce((s, k) => s + (porTipo[k] || 0), 0);
  return (
    <div className={`renace-stack${total ? "" : " renace-stack--empty"}`}>
      {total > 0 && TIPOS.map((k) =>
        porTipo[k] ? <span key={k} style={{ width: `${(porTipo[k] / total) * 100}%`, background: TIPO_COLOR[k] }} /> : null,
      )}
    </div>
  );
}

// Anillo de cobertura + barra multicolor por tipo (clic → detalle del campamento).
function Ring({ camp, onClick }: { camp: Camp; onClick: () => void }) {
  const cob = camp.familias ? (camp.conPlan / camp.familias) * 100 : 0;
  // Aro más GRANDE (SVG 104, radio 42) pero con relación 1:1 (viewBox = ancho) para que
  // el texto interno (% y "COBERTURA") conserve su tamaño real en px (no escala con el aro).
  const R = 42;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - Math.min(cob, 100) / 100);
  return (
    <button type="button" className="renace-ring" onClick={onClick} data-tip={`${camp.nombre} — ver detalle`}>
      <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
        <circle className="renace-ring__track" cx="52" cy="52" r={R} fill="none" strokeWidth="9" />
        {cob > 0 && <circle className="renace-ring__arc" cx="52" cy="52" r={R} fill="none" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 52 52)" />}
        <text x="52" y="51" textAnchor="middle" className="renace-ring__pct">{pctStr(camp.conPlan, camp.familias)}</text>
        <text x="52" y="63" textAnchor="middle" className="renace-ring__cap">cobertura</text>
      </svg>
      <span className="renace-ring__name">{camp.nombre}</span>
      <span className="renace-ring__meta">{fmt(camp.familias)} fam · {fmt(camp.miembros)} miemb</span>
      <TipoStack porTipo={camp.porTipo} />
    </button>
  );
}

// Modal de detalle de un campamento (cobertura + tipos con sus números).
function CampDetalle({ camp, onClose }: { camp: Camp; onClose: () => void }) {
  const [show, setShow] = useState(true);
  const modal = useAnimatedModal(show);
  const close = () => setShow(false);
  useEffect(() => { if (!modal.mounted) onClose(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [modal.mounted]);
  if (!modal.mounted) return null;
  return (
    <div className={`modal-overlay${modal.closing ? " modal-overlay--closing" : ""}`} onClick={close}>
      <div className={`modal-content renace-camp-modal${modal.closing ? " modal-content--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="renace-camp-modal__head">
          <div>
            <h3>{camp.nombre}</h3>
            <p>{fmt(camp.familias)} familias · {fmt(camp.miembros)} miembros</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Cerrar">×</button>
        </div>
        <div className="renace-camp-modal__body">
          <div>
            <h4 className="renace-graf-panel__title">Cobertura de planteamientos</h4>
            <Cobertura con={camp.conPlan} sin={camp.sinPlan} />
          </div>
          <div>
            <h4 className="renace-graf-panel__title">Planteamientos por tipo</h4>
            <TipoBars porTipo={camp.porTipo} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RenaceGraficas() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [expandido, setExpandido] = useState<Camp | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); if (c) setStats(c); } catch { /* ignore */ }
    if (!navigator.onLine) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/vzlarenace/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* cuota */ }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (!stats) {
    return <div className="renace-empty">{loading ? "Cargando estadísticas…" : "Sin datos. Importa un campamento para ver las gráficas."}</div>;
  }

  const g = stats.global;
  const kpis = [
    { label: "Campamentos", value: g.campamentos, accent: "#1e3a8a" },
    { label: "Familias", value: g.familias, accent: "#0284c7" },
    { label: "Miembros", value: g.miembros, accent: "#0369a1" },
    { label: "Con planteamiento", value: g.conPlan, sub: pctStr(g.conPlan, g.familias), accent: "#059669" },
    { label: "Sin planteamiento", value: g.sinPlan, sub: pctStr(g.sinPlan, g.familias), accent: "#d97706" },
  ];

  return (
    <div className="renace-graficas">
      {/* ── GLOBAL ── */}
      <div className="bal-cards renace-kpis">
        {kpis.map((c) => (
          <div key={c.label} className="bal-card" style={{ ["--accent" as any]: c.accent } as React.CSSProperties}>
            <span className="bal-card__value stat-card-value-animate">{fmt(c.value)}</span>
            <span className="bal-card__label">{c.label}{c.sub && <span className="bal-card__sub"> · {c.sub}</span>}</span>
          </div>
        ))}
      </div>

      <div className="renace-graf-row">
        <div className="renace-graf-panel">
          <h4 className="renace-graf-panel__title">Planteamientos por tipo (global)</h4>
          <TipoBars porTipo={g.porTipo} />
        </div>
        <div className="renace-graf-panel">
          <h4 className="renace-graf-panel__title">Cobertura de planteamientos</h4>
          <Cobertura con={g.conPlan} sin={g.sinPlan} />
        </div>
      </div>

      {/* ── POR CAMPAMENTO: mosaico de anillos (clic → detalle) ── */}
      <div className="renace-graf-camphead">
        <h4 className="renace-graf-heading">Por campamento ({stats.campamentos.length})</h4>
        <div className="renace-stack-legend">
          {TIPOS.map((k) => (
            <span key={k}><i style={{ background: TIPO_COLOR[k] }} />{tipoLabel(k).split(" ")[0]}</span>
          ))}
        </div>
      </div>
      <div className="renace-rings">
        {stats.campamentos.map((c) => (
          <Ring key={c.refugioId} camp={c} onClick={() => setExpandido(c)} />
        ))}
      </div>

      {expandido && <CampDetalle camp={expandido} onClose={() => setExpandido(null)} />}
    </div>
  );
}
