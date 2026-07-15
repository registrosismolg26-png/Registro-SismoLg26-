"use client";

// ── Cuerpo del reporte público (solo lectura, SIN PII) ──────────────────────
// Reutiliza el lenguaje visual .bal-* del Panel de Estadísticas y muestra TODO lo
// de Estadísticas EXCEPTO el desglose cuarto-por-cuarto: hero, tarjetas con acento
// a color (mismo set que el Dashboard), donut de género, barra de edad, matriz
// responsive, ranking de parroquias y "Salud y condición física" (estado físico +
// patologías). Recibe estadísticas AGREGADAS por props (sin roomCounts → el
// desglose por habitación no es representable aquí, tal como se pidió).

import { type ReactNode, type CSSProperties } from "react";
import SismoDayBadge from "@/components/SismoDayBadge";

const pct = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);

export interface PublicReportProps {
  stats: any;
  refugioLabel: string;
  sharedBy: string;
  ubicacion: string | null;
}

export default function PublicReportView({ stats, refugioLabel, sharedBy, ubicacion }: PublicReportProps) {
  const S = stats || {};
  const tot = S.total || 0;
  const pc = (n: number) => (tot > 0 ? `${((n / tot) * 100).toFixed(1)}%` : null);
  const menores417 = Math.max(0, (S.menores || 0) - (S.lactantes || 0));
  const cards: { label: string; value: number; suffix?: string; sub?: string | null; accent: string; icon: ReactNode }[] = [
    { label: "Total registrados", value: S.totalRegistrados || 0, accent: "#2563eb", icon: IC.users },
    { label: "Presentes en campamento", value: S.total || 0, accent: "#0d9488", icon: IC.home },
    { label: "Núcleos familiares", value: S.nucleosFamiliares || 0, accent: "#7c3aed", icon: IC.users },
    { label: "Individuos solos", value: S.individuosSolos || 0, accent: "#64748b", icon: IC.user },
    { label: "Lactantes (0–3)", value: S.lactantes || 0, sub: pc(S.lactantes || 0), accent: "#06b6d4", icon: IC.baby },
    { label: "Menores (4–17)", value: menores417, sub: pc(menores417), accent: "#10b981", icon: IC.child },
    { label: "Adultos (18–59)", value: S.adultos || 0, sub: pc(S.adultos || 0), accent: "#f59e0b", icon: IC.user },
    { label: "Mayores (≥60)", value: S.mayores || 0, sub: pc(S.mayores || 0), accent: "#8b5cf6", icon: IC.elder },
    { label: "Retirados", value: S.totalRetirados || 0, accent: "#dc2626", icon: IC.userx },
    { label: "Retirados a hogar solidario", value: S.hogarSolidario || 0, accent: "#16a34a", icon: IC.home },
    { label: "Intermitentes", value: S.intermitentes || 0, sub: pc(S.intermitentes || 0), accent: "#d97706", icon: IC.refresh },
    { label: "Edad promedio", value: S.promedioEdad || 0, suffix: "años", accent: "#0284c7", icon: IC.cal },
    { label: "Lesionados", value: S.lesionados || 0, sub: pc(S.lesionados || 0), accent: "#e11d48", icon: IC.alert },
    { label: "Con patología", value: S.conPatologia || 0, sub: pc(S.conPatologia || 0), accent: "#db2777", icon: IC.heart },
    { label: "Mujeres embarazadas", value: S.embarazadas || 0, sub: pc(S.embarazadas || 0), accent: "#be185d", icon: IC.pregnant },
    { label: "Por asignar", value: S.sinCuarto || 0, sub: pc(S.sinCuarto || 0), accent: "#64748b", icon: IC.homeoff },
  ];

  const f = (S.byGenero || []).find((g: any) => g.name === "FEMENINO")?.count || 0;
  const m = (S.byGenero || []).find((g: any) => g.name === "MASCULINO")?.count || 0;
  const o = (S.byGenero || []).find((g: any) => g.name === "OTRO")?.count || 0;
  const genSegs = [
    { label: "Femenino", count: f, color: "#db2777" },
    { label: "Masculino", count: m, color: "#2563eb" },
    ...(o ? [{ label: "Otro / N.E.", count: o, color: "#94a3b8" }] : []),
  ];
  const genTotal = f + m + o || 1;
  const R = 46, C = 2 * Math.PI * R;
  let cum = 0;
  const arcs = genSegs.filter((s) => s.count > 0).map((s) => {
    const frac = s.count / genTotal, dash = frac * C, rot = -90 + cum * 360;
    cum += frac;
    return { ...s, dash, rot };
  });

  const menores4 = Math.max(0, (S.menores || 0) - (S.lactantes || 0));
  const ageSegs = [
    { label: "Lactantes (0–3)", count: S.lactantes || 0, color: "#06b6d4" },
    { label: "Menores (4–17)", count: menores4, color: "#10b981" },
    { label: "Adultos", count: S.adultos || 0, color: "#f59e0b" },
    { label: "Mayores", count: S.mayores || 0, color: "#8b5cf6" },
  ];
  const ageTotal = ageSegs.reduce((s, x) => s + x.count, 0) || 1;

  const mx = S.matrix || { lactantes: {}, menores: {}, adultos: {}, mayores: {} };
  const lac = mx.lactantes || {};
  // "menores" en la matriz es <18 (incluye lactantes); se muestra 4–17 aparte.
  const men4 = {
    femenino: Math.max(0, (mx.menores?.femenino || 0) - (lac.femenino || 0)),
    masculino: Math.max(0, (mx.menores?.masculino || 0) - (lac.masculino || 0)),
    otro: Math.max(0, (mx.menores?.otro || 0) - (lac.otro || 0)),
  };
  const tFem = (mx.menores?.femenino || 0) + (mx.adultos?.femenino || 0) + (mx.mayores?.femenino || 0);
  const tMasc = (mx.menores?.masculino || 0) + (mx.adultos?.masculino || 0) + (mx.mayores?.masculino || 0);
  const matRow = (label: string, row: any) => (
    <tr>
      <td><strong>{label}</strong></td>
      <td className="bal-cell bal-cell--f" data-label="Femenino">{row?.femenino || 0}</td>
      <td className="bal-cell bal-cell--m" data-label="Masculino">{row?.masculino || 0}</td>
      <td className="bal-cell--tot" data-label="Total"><strong>{(row?.femenino || 0) + (row?.masculino || 0) + (row?.otro || 0)}</strong></td>
    </tr>
  );

  const parr = [...(S.byParroquia || [])].sort((a: any, b: any) => b.count - a.count);
  const maxParr = Math.max(1, ...parr.map((p: any) => p.count));

  // Salud y condición física (mismo dato que Estadísticas): estado físico + patologías.
  const ilesos = (S.byEstadoFisico || []).find((e: any) => e.name === "ILESO")?.count || 0;
  const lesionadosEf = (S.byEstadoFisico || []).find((e: any) => e.name === "LESIONADO" || e.name === "LECIONADO")?.count || 0;
  const efTotal = ilesos + lesionadosEf || 1;
  const conPat = S.conPatologia || 0;
  const sinPat = Math.max(0, (S.total || 0) - conPat);
  const patTotal = conPat + sinPat || 1;

  return (
    <div className="balance-view tab-view" style={{ maxWidth: 1120, margin: "0 auto", width: "100%" }}>
      <div className="bal-hero">
        <span className="bal-hero__icon">{IC.chart}</span>
        <div className="bal-hero__text">
          <h2>Reporte de Estadísticas</h2>
          <p><span className="bal-hero__chip">{refugioLabel}</span>{" "}<SismoDayBadge /> · compartido por {sharedBy}</p>
        </div>
      </div>

      <div className="bal-cards">
        {cards.map((c) => (
          <div key={c.label} className="bal-card" style={{ ["--accent" as any]: c.accent } as CSSProperties}>
            <span className="bal-card__icon">{c.icon}</span>
            <span className="bal-card__value">{c.value}{c.suffix && <em>{c.suffix}</em>}</span>
            <span className="bal-card__label">{c.label}{c.sub && <span className="bal-card__sub" style={{ ["--accent" as any]: c.accent } as CSSProperties}> · {c.sub}</span>}</span>
          </div>
        ))}
      </div>

      <div className="bal-duo">
        <div className="bal-panel">
          <div className="bal-panel__head"><span className="bal-panel__ico">{IC.venus}</span><h3>Población por género</h3></div>
          <div className="bal-donut">
            <svg viewBox="0 0 120 120" className="bal-donut__svg">
              <circle cx="60" cy="60" r={R} fill="none" stroke="var(--border-color)" strokeWidth="14" opacity="0.5" />
              {arcs.map((a, i) => (
                <circle key={i} cx="60" cy="60" r={R} fill="none" stroke={a.color} strokeWidth="14" strokeDasharray={`${a.dash} ${C - a.dash}`} transform={`rotate(${a.rot} 60 60)`} strokeLinecap="round" />
              ))}
              <text x="60" y="56" textAnchor="middle" className="bal-donut__num">{genTotal}</text>
              <text x="60" y="72" textAnchor="middle" className="bal-donut__cap">personas</text>
            </svg>
            <div className="bal-legend bal-legend--col">
              {genSegs.map((s, i) => (
                <span key={i} className="bal-legend__item">
                  <span className="bal-legend__dot" style={{ background: s.color }} />
                  {s.label} <strong>{s.count}</strong>
                  <span className="bal-legend__pct">{pct(s.count, genTotal).toFixed(0)}%</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="bal-panel">
          <div className="bal-panel__head"><span className="bal-panel__ico">{IC.cake}</span><h3>Población por edad</h3></div>
          <div className="bal-seg">
            {ageSegs.map((s, i) => {
              const p = pct(s.count, ageTotal);
              return p > 0 ? <span key={i} className="bal-seg__part" style={{ width: `${p}%`, background: s.color }}>{p >= 12 ? `${p.toFixed(0)}%` : ""}</span> : null;
            })}
          </div>
          <div className="bal-legend">
            {ageSegs.map((s, i) => (
              <span key={i} className="bal-legend__item"><span className="bal-legend__dot" style={{ background: s.color }} />{s.label} <strong>{s.count}</strong></span>
            ))}
          </div>
        </div>
      </div>

      <div className="bal-panel">
        <div className="bal-panel__head"><span className="bal-panel__ico">{IC.grid}</span><h3>Distribución por edad y género</h3></div>
        <div className="bal-matrix-wrap">
          <table className="bal-matrix">
            <thead><tr><th>Grupo de edad</th><th>Femenino</th><th>Masculino</th><th>Total</th></tr></thead>
            <tbody>
              {matRow("Lactantes (0–3)", lac)}
              {matRow("Menores (4–17)", men4)}
              {matRow("Adultos (18–59)", mx.adultos)}
              {matRow("Mayores (≥60)", mx.mayores)}
              <tr className="bal-matrix__total">
                <td><strong>Total</strong></td>
                <td className="bal-cell bal-cell--f" data-label="Femenino"><strong>{tFem}</strong></td>
                <td className="bal-cell bal-cell--m" data-label="Masculino"><strong>{tMasc}</strong></td>
                <td className="bal-cell--tot" data-label="Total"><strong>{tot}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {parr.length > 0 && (
        <div className="bal-panel">
          <div className="bal-panel__head"><span className="bal-panel__ico">{IC.map}</span><h3>Afectados por parroquia</h3></div>
          <div className="bal-rank">
            {parr.map((p: any, i: number) => (
              <div key={p.name} className="bal-rank__row">
                <span className={`bal-rank__pos ${i < 3 ? `bal-rank__pos--${i + 1}` : ""}`}>{i + 1}</span>
                <span className="bal-rank__label" title={p.name}>{p.name}</span>
                <span className="bal-rank__track"><span className="bal-rank__fill" style={{ width: `${Math.round((p.count / maxParr) * 100)}%` }} /></span>
                <span className="bal-rank__count">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bal-duo">
        <div className="bal-panel">
          <div className="bal-panel__head"><span className="bal-panel__ico">{IC.heart}</span><h3>Estado físico</h3></div>
          <div className="bal-seg">
            {[{ label: "Ilesos", count: ilesos, color: "#10b981" }, { label: "Lesionados", count: lesionadosEf, color: "#dc2626" }].map((s, i) => {
              const p = pct(s.count, efTotal);
              return p > 0 ? <span key={i} className="bal-seg__part" style={{ width: `${p}%`, background: s.color }}>{p >= 12 ? `${p.toFixed(0)}%` : ""}</span> : null;
            })}
          </div>
          <div className="bal-legend">
            <span className="bal-legend__item"><span className="bal-legend__dot" style={{ background: "#10b981" }} />Ilesos <strong>{ilesos}</strong></span>
            <span className="bal-legend__item"><span className="bal-legend__dot" style={{ background: "#dc2626" }} />Lesionados <strong>{lesionadosEf}</strong></span>
          </div>
        </div>
        <div className="bal-panel">
          <div className="bal-panel__head"><span className="bal-panel__ico">{IC.heart}</span><h3>Patologías</h3></div>
          <div className="bal-seg">
            {[{ label: "Con patología", count: conPat, color: "#f59e0b" }, { label: "Sin patología", count: sinPat, color: "#94a3b8" }].map((s, i) => {
              const p = pct(s.count, patTotal);
              return p > 0 ? <span key={i} className="bal-seg__part" style={{ width: `${p}%`, background: s.color }}>{p >= 12 ? `${p.toFixed(0)}%` : ""}</span> : null;
            })}
          </div>
          <div className="bal-legend">
            <span className="bal-legend__item"><span className="bal-legend__dot" style={{ background: "#f59e0b" }} />Con patología <strong>{conPat}</strong></span>
            <span className="bal-legend__item"><span className="bal-legend__dot" style={{ background: "#94a3b8" }} />Sin patología <strong>{sinPat}</strong></span>
          </div>
        </div>
      </div>

      <p className="rep-foot">
        Reporte de solo lectura con datos agregados (sin información personal).
        {ubicacion ? <> · <a href={ubicacion} target="_blank" rel="noopener noreferrer">Ubicación del campamento</a></> : null}
        <br />Gobernación del Estado La Guaira · Campamentos Transitorios · La Guaira 2026
      </p>
    </div>
  );
}

const IC = {
  chart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7" rx="1"/><rect x="12" y="6" width="3" height="11" rx="1"/><rect x="17" y="13" width="3" height="4" rx="1"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  child: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18a6 6 0 0 0-12 0"/><circle cx="8" cy="8" r="4"/><path d="M12 11h8M12 15h6"/></svg>,
  baby: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="6" r="4"/><path d="M9.5 6h.01M14.5 6h.01M10 8.5c.9.7 3.1.7 4 0"/><path d="M5 21v-1.5a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5V21"/></svg>,
  elder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M2 21h12"/><circle cx="8" cy="7" r="4"/></svg>,
  userx: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>,
  cal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  cake: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21h16M4 21v-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M4 15c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1M12 8V5"/></svg>,
  heart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/></svg>,
  alert: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  venus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M12 13v8M9 18h6"/></svg>,
  pregnant: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="4" r="2"/><path d="M12 7v6M12 9c3 0 4.5 2 4.5 4.5S15 18 12 18M12 13c-1.2 0-2 .8-2 2v6"/></svg>,
  refresh: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  homeoff: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><line x1="9" y1="21" x2="9" y2="12"/><line x1="15" y1="21" x2="15" y2="12"/></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>,
  map: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>,
};
