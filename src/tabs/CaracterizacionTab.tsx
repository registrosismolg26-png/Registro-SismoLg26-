"use client";

// ── Pestaña Caracterización ─────────────────────────────────────────────────
// Lista las FAMILIAS del censo (agrupadas por family_id) con su estado de
// cobertura (Sin ficha / Parcial / Completa) y abre la ficha por familia. La
// ficha reutiliza los datos del censo y solo captura lo nuevo. 100% pill/offline.

import { useState, useEffect, useMemo } from "react";
import { useAppContext } from "@/context/AppContext";
import { apiFetch } from "@/lib/apiFetch";
import { getAllLocalCaracterizacion } from "@/lib/db";
import { normalizeText } from "@/lib/helpers";
import Pagination from "@/components/Pagination";
import StyledSelect from "@/components/StyledSelect";
import CaracterizacionCatalogos from "@/components/CaracterizacionCatalogos";
import CaracterizacionFicha, { type Familia, type FamiliaMiembro } from "@/components/CaracterizacionFicha";

// family_id = cédula del jefe (o la propia si es individuo/sin jefe).
const familyIdOf = (r: any): string =>
  r?.jefeFamilia === "SI" ? String(r?.cedula ?? "") : String(r?.cedulaJefeFamilia || r?.cedula || "");

export default function CaracterizacionTab() {
  const { registros, effectiveRefugio, currentUser } = useAppContext();

  // Cobertura del servidor + fichas locales pendientes.
  const [srvHogares, setSrvHogares] = useState<Set<string>>(new Set());   // jefeRegistroId con hogar
  const [srvPersonas, setSrvPersonas] = useState<Set<string>>(new Set()); // registroId con persona
  const [locHogares, setLocHogares] = useState<Set<string>>(new Set());
  const [locPersonas, setLocPersonas] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const [abierta, setAbierta] = useState<Familia | null>(null);
  const [search, setSearch] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const refreshLocal = async () => {
    const locales = await getAllLocalCaracterizacion();
    const lh = new Set<string>(); const lp = new Set<string>();
    for (const f of locales) {
      if (f?.data?.hogar?.jefeRegistroId) lh.add(f.data.hogar.jefeRegistroId);
      for (const p of f?.data?.personas || []) if (p?.registroId) lp.add(p.registroId);
    }
    setLocHogares(lh); setLocPersonas(lp);
  };

  const fetchCobertura = async () => {
    await refreshLocal();
    if (!navigator.onLine) return;
    setLoading(true);
    try {
      const q = effectiveRefugio ? `?refugio=${encodeURIComponent(effectiveRefugio)}` : "";
      const res = await apiFetch(`/api/caracterizacion${q}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.success) {
          setSrvHogares(new Set((data.hogares || []).map((h: any) => h.jefeRegistroId)));
          setSrvPersonas(new Set(data.personas || []));
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCobertura(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [effectiveRefugio]);
  useEffect(() => { setPage(1); }, [search, fEstado, pageSize]);

  // Agrupa el censo ACTIVO por familia.
  const familias = useMemo<Familia[]>(() => {
    const activos = (registros || []).filter((r: any) => r?.retirado !== "SI");
    const groups = new Map<string, any[]>();
    for (const r of activos) {
      const fid = familyIdOf(r);
      if (!fid) continue;
      (groups.get(fid) || groups.set(fid, []).get(fid)!).push(r);
    }
    const hogaresCubiertos = new Set([...srvHogares, ...locHogares]);
    const personasCubiertas = new Set([...srvPersonas, ...locPersonas]);
    const out: Familia[] = [];
    for (const [fid, miembrosRaw] of groups) {
      // Jefe: el marcado como jefe, o el que tiene la cédula = family_id, o el primero.
      const jefe = miembrosRaw.find((m) => m.jefeFamilia === "SI")
        ?? miembrosRaw.find((m) => String(m.cedula) === fid)
        ?? miembrosRaw[0];
      const miembros: FamiliaMiembro[] = miembrosRaw.map((m) => ({
        registroId: m.id, cedula: m.cedula, nombreApellido: m.nombreApellido,
        genero: m.genero, edad: m.edad, fechaNacimiento: m.fechaNacimiento,
      }));
      const hogarDone = hogaresCubiertos.has(jefe.id);
      const personasDone = miembros.filter((m) => personasCubiertas.has(m.registroId)).length;
      const estado: Familia["estado"] =
        !hogarDone && personasDone === 0 ? "sin"
        : hogarDone && personasDone >= miembros.length ? "completa" : "parcial";
      out.push({
        familiaCedula: fid, jefeRegistroId: jefe.id, jefeNombre: jefe.nombreApellido,
        parroquia: jefe.parroquia, direccionExacta: jefe.direccionExacta,
        gpsLat: jefe.gpsLat ?? null, gpsLng: jefe.gpsLng ?? null,
        telefono: jefe.telefono ?? null, refugio: jefe.refugio,
        miembros, estado, personasDone,
      });
    }
    out.sort((a, b) => (a.jefeNombre || "").localeCompare(b.jefeNombre || ""));
    return out;
  }, [registros, srvHogares, srvPersonas, locHogares, locPersonas]);

  const filtradas = useMemo(() => {
    const q = normalizeText(search);
    return familias.filter((f) => {
      if (fEstado && f.estado !== fEstado) return false;
      if (!q) return true;
      return normalizeText(f.jefeNombre).includes(q) || normalizeText(f.familiaCedula).includes(q);
    });
  }, [familias, search, fEstado]);

  const resumen = useMemo(() => ({
    total: familias.length,
    completas: familias.filter((f) => f.estado === "completa").length,
    parciales: familias.filter((f) => f.estado === "parcial").length,
    sin: familias.filter((f) => f.estado === "sin").length,
  }), [familias]);

  const offset = (page - 1) * pageSize;
  const pagina = useMemo(() => filtradas.slice(offset, offset + pageSize), [filtradas, offset, pageSize]);

  const ESTADO_META: Record<string, { label: string; cls: string }> = {
    sin: { label: "Sin ficha", cls: "carac-badge--sin" },
    parcial: { label: "Parcial", cls: "carac-badge--parcial" },
    completa: { label: "Completa", cls: "carac-badge--completa" },
  };

  return (
    <div className="tab-view carac-view">
      <div className="carac-head">
        <div>
          <h2 className="carac-title">Caracterización</h2>
          <p className="carac-sub">Ficha socioeconómica por familia. Reutiliza el censo; solo captura lo nuevo.</p>
        </div>
        <CaracterizacionCatalogos />
      </div>

      <div className="carac-stats">
        <span className="carac-chip"><b>{resumen.total}</b> familias</span>
        <span className="carac-chip carac-chip--ok"><b>{resumen.completas}</b> completas</span>
        <span className="carac-chip carac-chip--mid"><b>{resumen.parciales}</b> parciales</span>
        <span className="carac-chip carac-chip--no"><b>{resumen.sin}</b> sin ficha</span>
        {loading && <span className="carac-chip">Actualizando…</span>}
      </div>

      <div className="carac-filters pill-form">
        <input type="text" className="morb-control" placeholder="Buscar por jefe de familia o cédula…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <StyledSelect value={fEstado} onChange={setFEstado} ariaLabel="Estado de la ficha"
          options={[{ value: "", label: "Todos los estados" }, { value: "sin", label: "Sin ficha" }, { value: "parcial", label: "Parcial" }, { value: "completa", label: "Completa" }]} />
      </div>

      {filtradas.length === 0 ? (
        <div className="carac-empty">No hay familias que coincidan. {familias.length === 0 && "Registra personas en el censo primero."}</div>
      ) : (
        <>
          <div className="carac-list">
            {pagina.map((f) => {
              const meta = ESTADO_META[f.estado];
              return (
                <button type="button" key={f.jefeRegistroId} className="carac-card" onClick={() => setAbierta(f)}>
                  <div className="carac-card__main">
                    <span className="carac-card__name">{f.jefeNombre}</span>
                    <span className="carac-card__meta">C.I. {f.familiaCedula} · {f.miembros.length} {f.miembros.length === 1 ? "persona" : "personas"} · {f.parroquia || "—"}</span>
                  </div>
                  <div className="carac-card__right">
                    <span className={`carac-badge ${meta.cls}`}>{meta.label}</span>
                    <span className="carac-card__prog">{f.personasDone}/{f.miembros.length}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </div>
                </button>
              );
            })}
          </div>
          <Pagination total={filtradas.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="familias" />
        </>
      )}

      {abierta && (
        <CaracterizacionFicha
          familia={abierta}
          onClose={() => setAbierta(null)}
          onSaved={() => { setAbierta(null); fetchCobertura(); }}
        />
      )}
    </div>
  );
}
