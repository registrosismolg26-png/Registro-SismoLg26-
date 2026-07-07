"use client";

// ── Pestaña: Balance de Salud (roles médicos + Master) ──────────────────────
// Tablero de morbilidad con diseño propio (NO clona el dashboard general): hero,
// cards con badge de ícono a color, donut de género, barras redondeadas y ranking
// de patologías. Se calcula 100% en el cliente desde las consultas (locales +
// remotas) del refugio, cruzando con el censo (registros) si falta género/edad.
// 100% responsive y coherente en claro/oscuro (tintes con color-mix).

import { useMemo, type ReactNode, type CSSProperties } from "react";
import { useAppContext } from "@/context/AppContext";
import { patologiaNombre, normalizeText } from "@/lib/helpers";

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
const edadFromISO = (iso?: string): number | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
};

// Grupos de edad: Lactantes = 0–3 años (separados del resto de menores, que pasan a 4–17).
type Bucket = "lactantes" | "menores" | "adultos" | "mayores";
const bucketOf = (edad: number | null): Bucket | null =>
  edad == null ? null : edad <= 3 ? "lactantes" : edad < 18 ? "menores" : edad < 60 ? "adultos" : "mayores";

// ── Íconos (stroke, 24x24) ──────────────────────────────────────────────────
const I = {
  pulse: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  clipboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  heart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/><path d="M3.5 12.5h4l2-3 3 5 2-3h4.5"/></svg>,
  pill: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7Z"/><path d="m8.5 8.5 7 7"/></svg>,
  virus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  venus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M12 13v8M9 18h6"/></svg>,
  cake: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21h16M4 21v-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M4 15c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1M12 8V5M9 8V6M15 8V6"/></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>,
  chart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7" rx="1"/><rect x="12" y="6" width="3" height="11" rx="1"/><rect x="17" y="13" width="3" height="4" rx="1"/></svg>,
  pregnant: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="4" r="2"/><path d="M12 7v6M12 9c3 0 4.5 2 4.5 4.5S15 18 12 18M12 13c-1.2 0-2 .8-2 2v6"/></svg>,
};

export default function BalanceTab() {
  const { consultas, localConsultas, registros, patologias, effectiveRefugio } = useAppContext();

  const B = useMemo(() => {
    // Las remotas ya vienen scoped por el backend; las locales (IndexedDB) se
    // filtran por el refugio de vista para que Master, al cambiar de refugio, vea
    // el balance de ESE campamento (consolidado, sin refugio de vista → todas).
    const scopedLocal = effectiveRefugio
      ? localConsultas.filter((c: any) => (c.data?.refugio || "") === effectiveRefugio)
      : localConsultas;
    const localIds = new Set(scopedLocal.map((c: any) => c.id));
    const all: any[] = [
      ...scopedLocal.map((c: any) => ({ ...c.data, createdAt: c.createdAt })),
      ...consultas.filter((c: any) => !localIds.has(c.id)),
    ];
    all.sort((a, b) => new Date(b.fechaConsulta || b.createdAt || 0).getTime() - new Date(a.fechaConsulta || a.createdAt || 0).getTime());

    const regByCedula = new Map<string, any>();
    registros.forEach((r: any) => regByCedula.set(onlyDigits(r.cedula), r));

    // IDs de patologías de EMBARAZO (cualquier nombre que contenga "embarazo"): para la
    // card de mujeres embarazadas (antecedente = embarazo). Insensible a acentos/mayúsc.
    const embarazoIds = new Set(
      patologias.filter((p: any) => normalizeText(p.nombre).includes("embarazo")).map((p: any) => p.id)
    );
    const hasEmbarazo = (ids: any) => Array.isArray(ids) && ids.some((id: string) => embarazoIds.has(id));

    const patients = new Map<string, { genero: string; edad: number | null; conPat: boolean; embarazada: boolean }>();
    let totalMedsRecetados = 0;
    const patCount = new Map<string, number>();
    // Desglose de ATENCIONES (consultas) por tipo.
    const tipoCount: Record<string, number> = { REFUGIADO: 0, APOYO_INSTITUCIONAL: 0, APOYO_COMUNITARIO: 0, EMERGENCIA: 0 };

    for (const c of all) {
      const ced = onlyDigits(c.cedula);
      const diagPat: string[] = Array.isArray(c.diagnosticoPatologiaIds) ? c.diagnosticoPatologiaIds : [];
      const antPat: string[] = Array.isArray(c.antecedentesPatologiaIds) ? c.antecedentesPatologiaIds : [];
      const diagMeds: any[] = Array.isArray(c.diagnosticoMedicamentoIds) ? c.diagnosticoMedicamentoIds : [];
      totalMedsRecetados += diagMeds.filter((m) => m && m.id).length;
      diagPat.forEach((id) => patCount.set(id, (patCount.get(id) || 0) + 1));
      const tp = c.tipoPaciente || "REFUGIADO";
      tipoCount[tp] = (tipoCount[tp] ?? 0) + 1;

      if (!ced) continue;
      const reg = regByCedula.get(ced);
      const genero = (c.genero || reg?.genero || "").toUpperCase();
      let edad: number | null = c.edad ?? null;
      if (edad == null && reg) edad = reg.edad ?? edadFromISO(reg.fechaNacimiento);
      const conPat = diagPat.length > 0 || antPat.length > 0 || (reg && Array.isArray(reg.patologiaIds) && reg.patologiaIds.length > 0);
      // Embarazada = estado EXPLÍCITO (consulta o censo) marcado "SI"; con respaldo por
      // palabras clave para datos legados sin el campo explícito (antecedentes/diagnóstico
      // de la consulta o antecedentes del censo).
      const embarazada = c.embarazo === "SI" || reg?.embarazo === "SI"
        || hasEmbarazo(antPat) || hasEmbarazo(diagPat) || (reg && hasEmbarazo(reg.patologiaIds));

      if (!patients.has(ced)) patients.set(ced, { genero, edad, conPat, embarazada });
      else {
        const p = patients.get(ced)!;
        if (!p.genero && genero) p.genero = genero;
        if (p.edad == null && edad != null) p.edad = edad;
        if (conPat) p.conPat = true;
        if (embarazada) p.embarazada = true;
      }
    }

    const gen = { FEMENINO: 0, MASCULINO: 0, OTRO: 0 };
    const matrix = { lactantes: { FEMENINO: 0, MASCULINO: 0 }, menores: { FEMENINO: 0, MASCULINO: 0 }, adultos: { FEMENINO: 0, MASCULINO: 0 }, mayores: { FEMENINO: 0, MASCULINO: 0 } };
    let sumEdad = 0, nEdad = 0, conPatCount = 0, embarazadasCount = 0;
    const ageTot = { lactantes: 0, menores: 0, adultos: 0, mayores: 0, sinEdad: 0 };

    patients.forEach((p) => {
      const g = p.genero === "FEMENINO" ? "FEMENINO" : p.genero === "MASCULINO" ? "MASCULINO" : "OTRO";
      gen[g]++;
      if (p.conPat) conPatCount++;
      if (p.embarazada) embarazadasCount++;
      const b = bucketOf(p.edad);
      if (b) {
        ageTot[b]++;
        if (p.edad != null) { sumEdad += p.edad; nEdad++; }
        if (g === "FEMENINO" || g === "MASCULINO") matrix[b][g]++;
      } else ageTot.sinEdad++;
    });

    const topPatologias = [...patCount.entries()]
      .map(([id, count]) => ({ id, nombre: patologiaNombre(id, patologias), count }))
      .sort((a, b) => b.count - a.count).slice(0, 8);

    return {
      totalConsultas: all.length, pacientes: patients.size, conPatologia: conPatCount,
      medsRecetados: totalMedsRecetados, patologiasDistintas: patCount.size,
      promedioEdad: nEdad > 0 ? Math.round(sumEdad / nEdad) : 0,
      embarazadas: embarazadasCount,
      gen, matrix, ageTot, topPatologias, tipoCount,
    };
  }, [consultas, localConsultas, registros, patologias, effectiveRefugio]);

  const pct = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);

  const cards: { label: string; value: ReactNode; color: string; icon: ReactNode }[] = [
    { label: "Consultas registradas", value: B.totalConsultas, color: "#2563eb", icon: I.clipboard },
    { label: "Pacientes atendidos", value: B.pacientes, color: "#0d9488", icon: I.users },
    { label: "Pacientes con patología", value: B.conPatologia, color: "#e11d48", icon: I.heart },
    { label: "Mujeres embarazadas", value: B.embarazadas, color: "#db2777", icon: I.pregnant },
    { label: "Medicamentos recetados", value: B.medsRecetados, color: "#d97706", icon: I.pill },
    { label: "Patologías distintas", value: B.patologiasDistintas, color: "#7c3aed", icon: I.virus },
    { label: "Edad promedio", value: B.promedioEdad ? `${B.promedioEdad}` : "—", suffix: "años", color: "#0284c7", icon: I.calendar } as any,
  ];

  const genSegs = [
    { label: "Femenino", count: B.gen.FEMENINO, color: "#db2777" },
    { label: "Masculino", count: B.gen.MASCULINO, color: "#2563eb" },
    ...(B.gen.OTRO ? [{ label: "Otro / N.E.", count: B.gen.OTRO, color: "#94a3b8" }] : []),
  ];
  const ageSegs = [
    { label: "Lactantes (0–3)", count: B.ageTot.lactantes, color: "#06b6d4" },
    { label: "Menores (4–17)", count: B.ageTot.menores, color: "#10b981" },
    { label: "Adultos (18–59)", count: B.ageTot.adultos, color: "#f59e0b" },
    { label: "Mayores (≥60)", count: B.ageTot.mayores, color: "#8b5cf6" },
    ...(B.ageTot.sinEdad ? [{ label: "Sin edad", count: B.ageTot.sinEdad, color: "#94a3b8" }] : []),
  ];

  // Donut de género
  const genTotal = genSegs.reduce((s, x) => s + x.count, 0);
  const RADIUS = 46, C = 2 * Math.PI * RADIUS;
  let cum = 0;
  const arcs = genSegs.filter((s) => s.count > 0).map((s) => {
    const frac = genTotal ? s.count / genTotal : 0;
    const dash = frac * C, rot = -90 + cum * 360;
    cum += frac;
    return { ...s, dash, rot, pct: pct(s.count, genTotal) };
  });

  const maxTopPat = Math.max(1, ...B.topPatologias.map((p) => p.count));
  const totFem = B.matrix.lactantes.FEMENINO + B.matrix.menores.FEMENINO + B.matrix.adultos.FEMENINO + B.matrix.mayores.FEMENINO;
  const totMasc = B.matrix.lactantes.MASCULINO + B.matrix.menores.MASCULINO + B.matrix.adultos.MASCULINO + B.matrix.mayores.MASCULINO;

  const SegBar = ({ segs, icon, title }: { segs: { label: string; count: number; color: string }[]; icon: ReactNode; title: string }) => {
    const total = segs.reduce((s, x) => s + x.count, 0) || 1;
    return (
      <div className="bal-panel">
        <div className="bal-panel__head"><span className="bal-panel__ico">{icon}</span><h3>{title}</h3></div>
        <div className="bal-seg">
          {segs.map((s, i) => {
            const p = pct(s.count, total);
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
              {s.label} <strong>{s.count}</strong>
            </span>
          ))}
        </div>
      </div>
    );
  };

  const matRow = (label: string, m: { FEMENINO: number; MASCULINO: number }) => {
    const tot = m.FEMENINO + m.MASCULINO;
    return (
      <tr>
        <td><strong>{label}</strong></td>
        <td className="bal-cell bal-cell--f" data-label="Femenino">{m.FEMENINO}</td>
        <td className="bal-cell bal-cell--m" data-label="Masculino">{m.MASCULINO}</td>
        <td data-label="Total" className="bal-cell--tot">{tot}</td>
      </tr>
    );
  };

  return (
    <div className="tab-view balance-view tab-enter">
      {/* Hero */}
      <div className="bal-hero">
        <span className="bal-hero__icon">{I.pulse}</span>
        <div className="bal-hero__text">
          <h2>Balance de Salud</h2>
          <p>Indicadores de morbilidad{effectiveRefugio ? <> · <span className="bal-hero__chip">{effectiveRefugio}</span></> : ""}</p>
        </div>
      </div>

      {B.totalConsultas === 0 ? (
        <div className="bal-panel bal-empty">
          <span className="bal-empty__ico">{I.pulse}</span>
          <p>Aún no hay consultas médicas registradas en este refugio.</p>
        </div>
      ) : (
        <>
          {/* Cards */}
          <div className="bal-cards">
            {cards.map((c, i) => (
              <div key={i} className="bal-card" style={{ ["--accent" as any]: c.color } as CSSProperties}>
                <span className="bal-card__icon">{c.icon}</span>
                <span className="bal-card__value">{c.value}{(c as any).suffix && <em>{(c as any).suffix}</em>}</span>
                <span className="bal-card__label">{c.label}</span>
              </div>
            ))}
          </div>

          {/* Género (donut) + Edad (barra) */}
          <div className="bal-duo">
            <div className="bal-panel">
              <div className="bal-panel__head"><span className="bal-panel__ico">{I.venus}</span><h3>Pacientes por género</h3></div>
              <div className="bal-donut">
                <svg viewBox="0 0 120 120" className="bal-donut__svg" role="img" aria-label="Distribución por género">
                  <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--border-color)" strokeWidth="14" opacity="0.5" />
                  {arcs.map((a, i) => (
                    <circle key={i} cx="60" cy="60" r={RADIUS} fill="none" stroke={a.color} strokeWidth="14"
                      strokeDasharray={`${a.dash} ${C - a.dash}`} transform={`rotate(${a.rot} 60 60)`} strokeLinecap="round" />
                  ))}
                  <text x="60" y="56" textAnchor="middle" className="bal-donut__num">{genTotal}</text>
                  <text x="60" y="72" textAnchor="middle" className="bal-donut__cap">pacientes</text>
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

            <SegBar segs={ageSegs} icon={I.cake} title="Pacientes por edad" />
          </div>

          {/* Atenciones por tipo (refugiados + apoyos) */}
          <div className="bal-panel">
            <div className="bal-panel__head"><span className="bal-panel__ico">{I.users}</span><h3>Atenciones por tipo</h3></div>
            <div className="bal-tipos">
              {[
                { key: "REFUGIADO", label: "Refugiados", color: "#2563eb" },
                { key: "APOYO_INSTITUCIONAL", label: "Apoyo Institucional", color: "#7c3aed" },
                { key: "APOYO_COMUNITARIO", label: "Apoyo Comunitario", color: "#0d9488" },
                { key: "EMERGENCIA", label: "Emergencia", color: "#e11d48" },
              ].map((t) => (
                <div key={t.key} className="bal-tipo" style={{ ["--accent" as any]: t.color } as CSSProperties}>
                  <span className="bal-tipo__count">{B.tipoCount[t.key] || 0}</span>
                  <span className="bal-tipo__label">{t.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Matriz edad × género */}
          <div className="bal-panel">
            <div className="bal-panel__head"><span className="bal-panel__ico">{I.grid}</span><h3>Distribución por edad y género</h3></div>
            <div className="bal-matrix-wrap">
              <table className="bal-matrix">
                <thead>
                  <tr><th>Grupo de edad</th><th>Femenino</th><th>Masculino</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {matRow("Lactantes (0–3)", B.matrix.lactantes)}
                  {matRow("Menores (4–17)", B.matrix.menores)}
                  {matRow("Adultos (18–59)", B.matrix.adultos)}
                  {matRow("Mayores (≥60)", B.matrix.mayores)}
                  <tr className="bal-matrix__total">
                    <td><strong>Total</strong></td>
                    <td className="bal-cell bal-cell--f" data-label="Femenino"><strong>{totFem}</strong></td>
                    <td className="bal-cell bal-cell--m" data-label="Masculino"><strong>{totMasc}</strong></td>
                    <td data-label="Total" className="bal-cell--tot"><strong>{totFem + totMasc}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Top patologías (ranking) */}
          <div className="bal-panel">
            <div className="bal-panel__head"><span className="bal-panel__ico">{I.chart}</span><h3>Patologías más frecuentes</h3></div>
            {B.topPatologias.length === 0 ? (
              <p className="bal-muted">Sin patologías diagnosticadas todavía.</p>
            ) : (
              <div className="bal-rank">
                {B.topPatologias.map((p, i) => (
                  <div key={p.id} className="bal-rank__row">
                    <span className={`bal-rank__pos ${i < 3 ? `bal-rank__pos--${i + 1}` : ""}`}>{i + 1}</span>
                    <span className="bal-rank__label" title={p.nombre}>{p.nombre}</span>
                    <span className="bal-rank__track"><span className="bal-rank__fill" style={{ width: `${pct(p.count, maxTopPat)}%` }} /></span>
                    <span className="bal-rank__count">{p.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
