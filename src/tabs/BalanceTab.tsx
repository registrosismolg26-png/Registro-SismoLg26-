"use client";

// ── Pestaña: Balance de Salud (roles médicos + Master) ──────────────────────
// Tablero tipo "Estadísticas" pero enfocado en SALUD (morbilidad). Se calcula en
// el cliente a partir de las consultas (locales + remotas) del refugio, cruzando
// con el censo (registros) cuando a la consulta le falta género o edad.
// 100% responsive; usa el sistema visual del dashboard (stat-card, matrix-table…).

import { useMemo } from "react";
import { useAppContext } from "@/context/AppContext";
import { patologiaNombre } from "@/lib/helpers";

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

// Edad a partir de una fecha ISO (respaldo cuando la consulta no trae edad).
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

type Bucket = "menores" | "adultos" | "mayores";
const bucketOf = (edad: number | null): Bucket | null =>
  edad == null ? null : edad < 18 ? "menores" : edad < 60 ? "adultos" : "mayores";

export default function BalanceTab() {
  const { consultas, localConsultas, registros, patologias, effectiveRefugio } = useAppContext();

  const B = useMemo(() => {
    // 1. Unificar consultas (locales pendientes + remotas), sin duplicar por id.
    const localIds = new Set(localConsultas.map((c: any) => c.id));
    const all: any[] = [
      ...localConsultas.map((c: any) => ({ ...c.data, createdAt: c.createdAt })),
      ...consultas.filter((c: any) => !localIds.has(c.id)),
    ];
    all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    // Índice del censo por cédula (para cruzar datos faltantes).
    const regByCedula = new Map<string, any>();
    registros.forEach((r: any) => regByCedula.set(onlyDigits(r.cedula), r));

    // 2. Pacientes únicos (por cédula), tomando la consulta MÁS RECIENTE y
    //    completando género/edad desde el censo si faltan.
    const patients = new Map<string, { genero: string; edad: number | null; conPat: boolean }>();
    let totalMedsRecetados = 0;
    const patCount = new Map<string, number>(); // conteo de patologías diagnosticadas

    for (const c of all) {
      const ced = onlyDigits(c.cedula);
      const diagPat: string[] = Array.isArray(c.diagnosticoPatologiaIds) ? c.diagnosticoPatologiaIds : [];
      const antPat: string[] = Array.isArray(c.antecedentesPatologiaIds) ? c.antecedentesPatologiaIds : [];
      const diagMeds: any[] = Array.isArray(c.diagnosticoMedicamentoIds) ? c.diagnosticoMedicamentoIds : [];
      totalMedsRecetados += diagMeds.filter((m) => m && m.id).length;
      diagPat.forEach((id) => patCount.set(id, (patCount.get(id) || 0) + 1));

      if (!ced) continue;
      const reg = regByCedula.get(ced);
      let genero = (c.genero || reg?.genero || "").toUpperCase();
      let edad: number | null = c.edad ?? null;
      if (edad == null && reg) edad = reg.edad ?? edadFromISO(reg.fechaNacimiento);
      const conPat = diagPat.length > 0 || antPat.length > 0 || (reg && Array.isArray(reg.patologiaIds) && reg.patologiaIds.length > 0);

      if (!patients.has(ced)) {
        patients.set(ced, { genero, edad, conPat });
      } else {
        // completar huecos con esta consulta (o el censo) sin pisar lo ya definido
        const p = patients.get(ced)!;
        if (!p.genero && genero) p.genero = genero;
        if (p.edad == null && edad != null) p.edad = edad;
        if (conPat) p.conPat = true;
      }
    }

    // 3. Agregados por género y edad.
    const gen = { FEMENINO: 0, MASCULINO: 0, OTRO: 0 };
    const matrix = {
      menores: { FEMENINO: 0, MASCULINO: 0 },
      adultos: { FEMENINO: 0, MASCULINO: 0 },
      mayores: { FEMENINO: 0, MASCULINO: 0 },
    };
    let sumEdad = 0, nEdad = 0, conPatCount = 0;
    const ageTot = { menores: 0, adultos: 0, mayores: 0, sinEdad: 0 };

    patients.forEach((p) => {
      const g = p.genero === "FEMENINO" ? "FEMENINO" : p.genero === "MASCULINO" ? "MASCULINO" : "OTRO";
      gen[g]++;
      if (p.conPat) conPatCount++;
      const b = bucketOf(p.edad);
      if (b) {
        ageTot[b]++;
        if (p.edad != null) { sumEdad += p.edad; nEdad++; }
        if (g === "FEMENINO" || g === "MASCULINO") matrix[b][g]++;
      } else {
        ageTot.sinEdad++;
      }
    });

    // 4. Top patologías diagnosticadas.
    const topPatologias = [...patCount.entries()]
      .map(([id, count]) => ({ id, nombre: patologiaNombre(id, patologias), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      totalConsultas: all.length,
      pacientes: patients.size,
      conPatologia: conPatCount,
      medsRecetados: totalMedsRecetados,
      patologiasDistintas: patCount.size,
      promedioEdad: nEdad > 0 ? Math.round(sumEdad / nEdad) : 0,
      gen, matrix, ageTot, topPatologias,
    };
  }, [consultas, localConsultas, registros, patologias]);

  const totalGen = B.gen.FEMENINO + B.gen.MASCULINO + B.gen.OTRO || 1;
  const totalAge = B.ageTot.menores + B.ageTot.adultos + B.ageTot.mayores + B.ageTot.sinEdad || 1;
  const pct = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);

  // Segmentos de género y edad (para las barras).
  const genSegs = [
    { label: "Femenino", count: B.gen.FEMENINO, color: "var(--chart-femenino, #db2777)" },
    { label: "Masculino", count: B.gen.MASCULINO, color: "var(--chart-masculino, #2563eb)" },
    ...(B.gen.OTRO ? [{ label: "Otro / N.E.", count: B.gen.OTRO, color: "var(--chart-otro, #94a3b8)" }] : []),
  ];
  const ageSegs = [
    { label: "Menores (<18)", count: B.ageTot.menores, color: "var(--chart-menores, #10b981)" },
    { label: "Adultos (18–59)", count: B.ageTot.adultos, color: "var(--chart-adultos, #f59e0b)" },
    { label: "Mayores (≥60)", count: B.ageTot.mayores, color: "var(--chart-mayores, #8b5cf6)" },
    ...(B.ageTot.sinEdad ? [{ label: "Sin edad", count: B.ageTot.sinEdad, color: "var(--text-muted, #94a3b8)" }] : []),
  ];
  const maxTopPat = Math.max(1, ...B.topPatologias.map((p) => p.count));

  const cards = [
    { label: "Consultas registradas", value: B.totalConsultas, mod: "primary" },
    { label: "Pacientes atendidos", value: B.pacientes, mod: "success" },
    { label: "Pacientes con patología", value: B.conPatologia, mod: "danger" },
    { label: "Medicamentos recetados", value: B.medsRecetados, mod: "warning" },
    { label: "Patologías distintas", value: B.patologiasDistintas, mod: "" },
    { label: "Edad promedio", value: B.promedioEdad ? `${B.promedioEdad} años` : "—", mod: "" },
  ];

  const Bar = ({ segs }: { segs: { label: string; count: number; color: string }[] }) => {
    const total = segs.reduce((s, x) => s + x.count, 0) || 1;
    return (
      <div className="segmented-bar-container">
        <div className="segmented-bar-track">
          {segs.map((s, i) => {
            const p = pct(s.count, total);
            return (
              <div key={i} style={{ width: `${p}%`, backgroundColor: s.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "0.72rem", fontWeight: 700, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
                {p >= 14 ? `${s.count} · ${p.toFixed(0)}%` : ""}
              </div>
            );
          })}
        </div>
        <div className="segmented-bar-legend">
          {segs.map((s, i) => (
            <span key={i} className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: s.color }} />
              {s.label} · <strong>{s.count}</strong> ({pct(s.count, total).toFixed(1)}%)
            </span>
          ))}
        </div>
      </div>
    );
  };

  const row = (label: string, m: { FEMENINO: number; MASCULINO: number }) => {
    const tot = m.FEMENINO + m.MASCULINO;
    return (
      <tr>
        <td><strong>{label}</strong></td>
        <td className="cell-fem" data-label="Femenino">{m.FEMENINO}</td>
        <td className="cell-masc" data-label="Masculino">{m.MASCULINO}</td>
        <td data-label="Total" style={{ textAlign: "right" }}><strong>{tot}</strong></td>
      </tr>
    );
  };
  const totFem = B.matrix.menores.FEMENINO + B.matrix.adultos.FEMENINO + B.matrix.mayores.FEMENINO;
  const totMasc = B.matrix.menores.MASCULINO + B.matrix.adultos.MASCULINO + B.matrix.mayores.MASCULINO;

  return (
    <div className="tab-view balance-view tab-enter">
      <div className="morb-head">
        <div className="morb-head__titles">
          <h2>Balance de Salud</h2>
          <p>Indicadores de morbilidad del refugio{effectiveRefugio ? ` · ${effectiveRefugio}` : ""}</p>
        </div>
      </div>

      {B.totalConsultas === 0 ? (
        <div className="dashboard-section">
          <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "1.5rem 0", margin: 0 }}>
            Aún no hay consultas médicas registradas en este refugio.
          </p>
        </div>
      ) : (
        <>
          {/* Totales */}
          <div className="stats-grid">
            {cards.map((c, i) => (
              <div key={i} className={`stat-card ${c.mod ? `stat-card--${c.mod}` : ""}`}>
                <div className="stat-card-header">
                  <span className="stat-label">{c.label}</span>
                </div>
                <span className="stat-value">{c.value}</span>
              </div>
            ))}
          </div>

          {/* Género + Edad */}
          <div className="balance-duo">
            <div className="dashboard-section">
              <h3 className="dashboard-section-title">Pacientes por género</h3>
              <Bar segs={genSegs} />
            </div>
            <div className="dashboard-section">
              <h3 className="dashboard-section-title">Pacientes por edad</h3>
              <Bar segs={ageSegs} />
            </div>
          </div>

          {/* Matriz edad × género */}
          <div className="dashboard-section">
            <h3 className="dashboard-section-title">Distribución por edad y género</h3>
            <div className="matrix-table-wrapper">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th>Grupo de edad</th>
                    <th>Femenino</th>
                    <th>Masculino</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {row("Menores (<18)", B.matrix.menores)}
                  {row("Adultos (18–59)", B.matrix.adultos)}
                  {row("Mayores (≥60)", B.matrix.mayores)}
                  <tr className="matrix-total-row">
                    <td><strong>Total</strong></td>
                    <td className="cell-fem" data-label="Femenino"><strong>{totFem}</strong></td>
                    <td className="cell-masc" data-label="Masculino"><strong>{totMasc}</strong></td>
                    <td data-label="Total" style={{ textAlign: "right" }}><strong>{totFem + totMasc}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Top patologías */}
          <div className="dashboard-section">
            <h3 className="dashboard-section-title">Patologías más frecuentes (diagnóstico)</h3>
            {B.topPatologias.length === 0 ? (
              <p style={{ color: "var(--text-muted)", margin: 0 }}>Sin patologías diagnosticadas todavía.</p>
            ) : (
              <div className="balance-barlist">
                {B.topPatologias.map((p) => (
                  <div key={p.id} className="balance-barlist__row">
                    <span className="balance-barlist__label" title={p.nombre}>{p.nombre}</span>
                    <span className="balance-barlist__track">
                      <span className="balance-barlist__fill" style={{ width: `${pct(p.count, maxTopPat)}%` }} />
                    </span>
                    <span className="balance-barlist__count">{p.count}</span>
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
