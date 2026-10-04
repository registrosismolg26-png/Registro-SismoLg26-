import { prisma } from "@/lib/prisma";
import { CAMPAMENTOS_PLANTEAMIENTO_SALA } from "@/lib/constants";
import type {
  PlanteamientoSalaStats,
  PlanteamientoSalaStatsScope,
  TituloCasaTipo,
  PlanteamientoSalaEstatus,
  TipoOpcionPlanteamiento,
} from "@/types";

function computeAge(birthStr?: string | null): number | null {
  if (!birthStr) return null;
  const d = new Date(birthStr.slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 && a <= 130 ? a : null;
}

function createScopeStats(): PlanteamientoSalaStatsScope {
  return {
    totalPersonas: 0,
    totalCargaFamiliar: 0,
    totalPoblacion: 0,
    promedioProgreso: 0,
    porEstatus: {
      "SIN ESTATUS": 0,
      "EN PROCESO": 0,
      "CREDITO ENTREGADO": 0,
      "CARPETA RETORNADA": 0,
      "CON NOVEDAD EN LA SEDE": 0,
    },
    porTipoOpcion: {
      MERCADO_SECUNDARIO: 0,
      ALQUILER: 0,
      PLAN_VENEZUELA_RENACE: 0,
      CAMPAMENTO_MAYOR_PERMANENCIA: 0,
      ASIGNACION_GMVV: 0,
    },
    estatusPorModalidad: {
      "SIN ESTATUS": { MERCADO_SECUNDARIO: 0, ALQUILER: 0, PLAN_VENEZUELA_RENACE: 0, CAMPAMENTO_MAYOR_PERMANENCIA: 0, ASIGNACION_GMVV: 0 },
      "EN PROCESO": { MERCADO_SECUNDARIO: 0, ALQUILER: 0, PLAN_VENEZUELA_RENACE: 0, CAMPAMENTO_MAYOR_PERMANENCIA: 0, ASIGNACION_GMVV: 0 },
      "CREDITO ENTREGADO": { MERCADO_SECUNDARIO: 0, ALQUILER: 0, PLAN_VENEZUELA_RENACE: 0, CAMPAMENTO_MAYOR_PERMANENCIA: 0, ASIGNACION_GMVV: 0 },
      "CARPETA RETORNADA": { MERCADO_SECUNDARIO: 0, ALQUILER: 0, PLAN_VENEZUELA_RENACE: 0, CAMPAMENTO_MAYOR_PERMANENCIA: 0, ASIGNACION_GMVV: 0 },
      "CON NOVEDAD EN LA SEDE": { MERCADO_SECUNDARIO: 0, ALQUILER: 0, PLAN_VENEZUELA_RENACE: 0, CAMPAMENTO_MAYOR_PERMANENCIA: 0, ASIGNACION_GMVV: 0 },
    },
    modalidadPorEstatus: {
      MERCADO_SECUNDARIO: { "SIN ESTATUS": 0, "EN PROCESO": 0, "CREDITO ENTREGADO": 0, "CARPETA RETORNADA": 0, "CON NOVEDAD EN LA SEDE": 0 },
      ALQUILER: { "SIN ESTATUS": 0, "EN PROCESO": 0, "CREDITO ENTREGADO": 0, "CARPETA RETORNADA": 0, "CON NOVEDAD EN LA SEDE": 0 },
      PLAN_VENEZUELA_RENACE: { "SIN ESTATUS": 0, "EN PROCESO": 0, "CREDITO ENTREGADO": 0, "CARPETA RETORNADA": 0, "CON NOVEDAD EN LA SEDE": 0 },
      CAMPAMENTO_MAYOR_PERMANENCIA: { "SIN ESTATUS": 0, "EN PROCESO": 0, "CREDITO ENTREGADO": 0, "CARPETA RETORNADA": 0, "CON NOVEDAD EN LA SEDE": 0 },
      ASIGNACION_GMVV: { "SIN ESTATUS": 0, "EN PROCESO": 0, "CREDITO ENTREGADO": 0, "CARPETA RETORNADA": 0, "CON NOVEDAD EN LA SEDE": 0 },
    },
    rangosProgreso: {
      completo100: 0,
      avanzado70_99: 0,
      medio40_69: 0,
      inicial0_39: 0,
    },
    qrCobertura: {
      habitatVivienda: 0,
      colapsoVivienda: 0,
      ambosQr: 0,
      alMenosUno: 0,
      sinQr: 0,
    },
    demografia: {
      generoTitulares: { femenino: 0, masculino: 0, noEspecificado: 0 },
      generoTotal: { femenino: 0, masculino: 0, noEspecificado: 0 },
      gruposEdad: {
        ninosAdolescentes: 0,
        jovenes: 0,
        adultos: 0,
        adultosMayores: 0,
        sinDato: 0,
      },
      parentescos: {
        "Hijos / Hijas": 0,
        "Cónyuges / Parejas": 0,
        "Nietos / Nietas": 0,
        "Hermanos / Hermanas": 0,
        "Padres / Madres": 0,
        Otros: 0,
      },
    },
    mercadoSecundario: {
      total: 0,
      porRequisito: {
        planillaCaracterizacion: 0,
        cedulaCatastral: 0,
        conTituloCasa: 0,
        referenciaBancariaVendedor: 0,
        qrHabitatVivienda: 0,
        cedulaVendedor: 0,
        cedulaComprador: 0,
        fotosVivienda: 0,
        vendedorPoseePatria: 0,
        qrColapsoVivienda: 0,
      },
      titulosCasaDesglose: {
        NINGUNO: 0,
        TITULO_PROPIEDAD: 0,
        TITULO_SUPLETORIO: 0,
        COMPRA_VENTA: 0,
      },
    },
    alquiler: {
      total: 0,
      porRequisito: {
        cartaCompromiso: 0,
        fotosAlquiler: 0,
        referenciaBancariaAlquiler: 0,
        cedulaArrendador: 0,
        cedulaArrendatario: 0,
        rifArrendador: 0,
        rifArrendatario: 0,
      },
    },
    venezuelaRenace: {
      total: 0,
      porRequisito: {
        rifViviendaDanos: 0,
        fotosViviendaRenace: 0,
        conMateriales: 0,
      },
      materialesTotales: {
        sacosCemento: 0,
        metrosArena: 0,
        bloques: 0,
        cabillas: 0,
        pego: 0,
      },
    },
    porRequisito: {
      planillaCaracterizacion: 0,
      cedulaCatastral: 0,
      conTituloCasa: 0,
      referenciaBancariaVendedor: 0,
      qrHabitatVivienda: 0,
      cedulaVendedor: 0,
      cedulaComprador: 0,
      fotosVivienda: 0,
      vendedorPoseePatria: 0,
      qrColapsoVivienda: 0,
    },
    titulosCasaDesglose: {
      NINGUNO: 0,
      TITULO_PROPIEDAD: 0,
      TITULO_SUPLETORIO: 0,
      COMPRA_VENTA: 0,
    },
  };
}

function processItemInScope(scope: PlanteamientoSalaStatsScope, it: any) {
  scope.totalPersonas++;

  const estatusVal: PlanteamientoSalaEstatus = (it.estatus && scope.porEstatus[it.estatus as PlanteamientoSalaEstatus] !== undefined)
    ? (it.estatus as PlanteamientoSalaEstatus)
    : "SIN ESTATUS";
  scope.porEstatus[estatusVal]++;

  const tipo: TipoOpcionPlanteamiento = (it.tipoOpcion && scope.porTipoOpcion[it.tipoOpcion as TipoOpcionPlanteamiento] !== undefined)
    ? (it.tipoOpcion as TipoOpcionPlanteamiento)
    : "MERCADO_SECUNDARIO";
  scope.porTipoOpcion[tipo]++;

  if (scope.estatusPorModalidad?.[estatusVal]?.[tipo] !== undefined) {
    scope.estatusPorModalidad[estatusVal][tipo]++;
  }
  if (scope.modalidadPorEstatus?.[tipo]?.[estatusVal] !== undefined) {
    scope.modalidadPorEstatus[tipo][estatusVal]++;
  }

  const gt = String(it.genero || "").toUpperCase().trim();
  if (gt.startsWith("F")) {
    scope.demografia.generoTitulares.femenino++;
    scope.demografia.generoTotal.femenino++;
  } else if (gt.startsWith("M")) {
    scope.demografia.generoTitulares.masculino++;
    scope.demografia.generoTotal.masculino++;
  } else {
    scope.demografia.generoTitulares.noEspecificado++;
    scope.demografia.generoTotal.noEspecificado++;
  }

  const ageT = it.edad != null && !isNaN(Number(it.edad)) ? Number(it.edad) : computeAge(it.fechaNacimiento);
  if (ageT != null && !isNaN(ageT) && ageT >= 0) {
    if (ageT <= 17) scope.demografia.gruposEdad.ninosAdolescentes++;
    else if (ageT <= 29) scope.demografia.gruposEdad.jovenes++;
    else if (ageT <= 59) scope.demografia.gruposEdad.adultos++;
    else scope.demografia.gruposEdad.adultosMayores++;
  } else {
    scope.demografia.gruposEdad.sinDato++;
  }

  let famList: any[] = [];
  if (Array.isArray(it.cargaFamiliar)) {
    famList = it.cargaFamiliar;
  } else if (typeof it.cargaFamiliar === "string" && it.cargaFamiliar.trim()) {
    try {
      famList = JSON.parse(it.cargaFamiliar);
    } catch {
      famList = [];
    }
  }

  for (const m of famList) {
    if (!m || (!m.cedula && !m.nombreApellido)) continue;
    scope.totalCargaFamiliar++;

    const gf = String(m.genero || "").toUpperCase().trim();
    if (gf.startsWith("F")) {
      scope.demografia.generoTotal.femenino++;
    } else if (gf.startsWith("M")) {
      scope.demografia.generoTotal.masculino++;
    } else {
      scope.demografia.generoTotal.noEspecificado++;
    }

    const ageF = m.edad != null && !isNaN(Number(m.edad)) ? Number(m.edad) : computeAge(m.fechaNacimiento);
    if (ageF != null && !isNaN(ageF) && ageF >= 0) {
      if (ageF <= 17) scope.demografia.gruposEdad.ninosAdolescentes++;
      else if (ageF <= 29) scope.demografia.gruposEdad.jovenes++;
      else if (ageF <= 59) scope.demografia.gruposEdad.adultos++;
      else scope.demografia.gruposEdad.adultosMayores++;
    } else {
      scope.demografia.gruposEdad.sinDato++;
    }

    const p = String(m.parentesco || "").toUpperCase().trim();
    if (p.includes("HIJ")) scope.demografia.parentescos["Hijos / Hijas"]++;
    else if (p.includes("ESPOS") || p.includes("CONYUG") || p.includes("PAREJ")) scope.demografia.parentescos["Cónyuges / Parejas"]++;
    else if (p.includes("NIET")) scope.demografia.parentescos["Nietos / Nietas"]++;
    else if (p.includes("HERMAN")) scope.demografia.parentescos["Hermanos / Hermanas"]++;
    else if (p.includes("MADRE") || p.includes("PADRE") || p.includes("MAMA") || p.includes("PAPA")) scope.demografia.parentescos["Padres / Madres"]++;
    else scope.demografia.parentescos["Otros"]++;
  }

  const prog = it.porcentajeProgreso || 0;
  if (scope.rangosProgreso) {
    if (prog >= 100) scope.rangosProgreso.completo100++;
    else if (prog >= 70) scope.rangosProgreso.avanzado70_99++;
    else if (prog >= 40) scope.rangosProgreso.medio40_69++;
    else scope.rangosProgreso.inicial0_39++;
  }

  const hasHab = it.qrHabitatVivienda === "SI";
  const hasCol = it.qrColapsoVivienda === "SI";
  if (scope.qrCobertura) {
    if (hasHab) scope.qrCobertura.habitatVivienda++;
    if (hasCol) scope.qrCobertura.colapsoVivienda++;
    if (hasHab && hasCol) scope.qrCobertura.ambosQr++;
    if (hasHab || hasCol) scope.qrCobertura.alMenosUno++;
    else scope.qrCobertura.sinQr++;
  }

  if (hasHab) scope.porRequisito.qrHabitatVivienda++;
  if (hasCol) scope.porRequisito.qrColapsoVivienda++;

  if (tipo === "ALQUILER") {
    scope.alquiler.total++;
    if (it.cartaCompromiso === "SI") scope.alquiler.porRequisito.cartaCompromiso++;
    if (it.fotosAlquiler === "SI" || (it.cantidadFotosAlquiler && it.cantidadFotosAlquiler > 0)) scope.alquiler.porRequisito.fotosAlquiler++;
    if (it.referenciaBancariaAlquiler === "SI") scope.alquiler.porRequisito.referenciaBancariaAlquiler++;
    if (it.cedulaArrendador === "SI") scope.alquiler.porRequisito.cedulaArrendador++;
    if (it.cedulaArrendatario === "SI") scope.alquiler.porRequisito.cedulaArrendatario++;
    if (it.rifArrendador === "SI") scope.alquiler.porRequisito.rifArrendador++;
    if (it.rifArrendatario === "SI") scope.alquiler.porRequisito.rifArrendatario++;
  } else if (tipo === "PLAN_VENEZUELA_RENACE") {
    scope.venezuelaRenace.total++;
    if (it.rifViviendaDanos === "SI") scope.venezuelaRenace.porRequisito.rifViviendaDanos++;
    if (it.fotosViviendaRenace === "SI" || (it.cantidadFotosRenace && it.cantidadFotosRenace > 0)) scope.venezuelaRenace.porRequisito.fotosViviendaRenace++;
    const hasMat = Boolean(
      (it.sacosCemento && it.sacosCemento > 0) ||
      (it.metrosArena && it.metrosArena > 0) ||
      (it.bloques && it.bloques > 0) ||
      (it.cabillas && it.cabillas > 0) ||
      (it.pego && it.pego > 0)
    );
    if (hasMat) scope.venezuelaRenace.porRequisito.conMateriales++;
    scope.venezuelaRenace.materialesTotales.sacosCemento += Math.max(0, Number(it.sacosCemento || 0));
    scope.venezuelaRenace.materialesTotales.metrosArena += Math.max(0, Number(it.metrosArena || 0));
    scope.venezuelaRenace.materialesTotales.bloques += Math.max(0, Number(it.bloques || 0));
    scope.venezuelaRenace.materialesTotales.cabillas += Math.max(0, Number(it.cabillas || 0));
    scope.venezuelaRenace.materialesTotales.pego += Math.max(0, Number(it.pego || 0));
  } else if (tipo === "CAMPAMENTO_MAYOR_PERMANENCIA" || tipo === "ASIGNACION_GMVV") {
    // Modalidades institucionales
  } else {
    // MERCADO_SECUNDARIO
    scope.mercadoSecundario.total++;
    if (it.planillaCaracterizacion === "SI") {
      scope.mercadoSecundario.porRequisito.planillaCaracterizacion++;
      scope.porRequisito.planillaCaracterizacion++;
    }
    if (it.cedulaCatastral === "SI") {
      scope.mercadoSecundario.porRequisito.cedulaCatastral++;
      scope.porRequisito.cedulaCatastral++;
    }
    if (it.tituloCasa && it.tituloCasa !== "NINGUNO") {
      scope.mercadoSecundario.porRequisito.conTituloCasa++;
      scope.porRequisito.conTituloCasa++;
    }
    if (it.referenciaBancariaVendedor === "SI") {
      scope.mercadoSecundario.porRequisito.referenciaBancariaVendedor++;
      scope.porRequisito.referenciaBancariaVendedor++;
    }
    if (it.qrHabitatVivienda === "SI") {
      scope.mercadoSecundario.porRequisito.qrHabitatVivienda++;
    }
    if (it.cedulaVendedor === "SI") {
      scope.mercadoSecundario.porRequisito.cedulaVendedor++;
      scope.porRequisito.cedulaVendedor++;
    }
    if (it.cedulaComprador === "SI") {
      scope.mercadoSecundario.porRequisito.cedulaComprador++;
      scope.porRequisito.cedulaComprador++;
    }
    if (it.fotosVivienda === "SI" || (it.cantidadFotos && it.cantidadFotos > 0)) {
      scope.mercadoSecundario.porRequisito.fotosVivienda++;
      scope.porRequisito.fotosVivienda++;
    }
    if (it.vendedorPoseePatria === "SI") {
      scope.mercadoSecundario.porRequisito.vendedorPoseePatria++;
      scope.porRequisito.vendedorPoseePatria++;
    }
    if (it.qrColapsoVivienda === "SI") {
      scope.mercadoSecundario.porRequisito.qrColapsoVivienda++;
    }

    const tipoTit = (it.tituloCasa && scope.mercadoSecundario.titulosCasaDesglose[it.tituloCasa as TituloCasaTipo] !== undefined)
      ? (it.tituloCasa as TituloCasaTipo)
      : "NINGUNO";
    scope.mercadoSecundario.titulosCasaDesglose[tipoTit]++;
    scope.titulosCasaDesglose[tipoTit]++;
  }
}

interface ServerCacheEntry {
  etag: string;
  stats: PlanteamientoSalaStats;
  timestamp: number;
}

// Cache global en memoria del proceso
const globalCache = global as unknown as {
  _salaStatsCache?: ServerCacheEntry | null;
  _salaStatsInFlight?: Promise<{ stats: PlanteamientoSalaStats; etag: string }> | null;
};

export function invalidatePlanteamientoStatsCache(): void {
  globalCache._salaStatsCache = null;
  globalCache._salaStatsInFlight = null;
}

export async function getOrComputePlanteamientoSalaStats(clientEtag?: string | null): Promise<{
  stats: PlanteamientoSalaStats;
  etag: string;
  notModified: boolean;
}> {
  // 1. Si el cache está fresco (< 15 segundos), respondemos instantáneamente sin tocar la BD
  const now = Date.now();
  if (globalCache._salaStatsCache && now - globalCache._salaStatsCache.timestamp < 15000) {
    const entry = globalCache._salaStatsCache;
    if (clientEtag && clientEtag === entry.etag) {
      return { stats: entry.stats, etag: entry.etag, notModified: true };
    }
    return { stats: entry.stats, etag: entry.etag, notModified: false };
  }

  // 2. Si hay un cálculo en curso, esperar la misma promesa (deduplicación concurrente)
  if (globalCache._salaStatsInFlight) {
    const result = await globalCache._salaStatsInFlight;
    if (clientEtag && clientEtag === result.etag) {
      return { stats: result.stats, etag: result.etag, notModified: true };
    }
    return { stats: result.stats, etag: result.etag, notModified: false };
  }

  // 3. Verificamos sello ligero en BD (count + max updatedAt)
  const agg = await prisma.planteamientoSala.aggregate({
    _count: true,
    _max: { updatedAt: true },
  });
  const count = agg._count || 0;
  const maxUpdated = agg._max.updatedAt ? agg._max.updatedAt.getTime() : 0;
  const currentEtag = `"sala-stats-${count}-${maxUpdated}"`;

  // Si el cache en memoria tiene el mismo ETag aunque haya pasado más de 15s, lo refrescamos
  if (globalCache._salaStatsCache && globalCache._salaStatsCache.etag === currentEtag) {
    globalCache._salaStatsCache.timestamp = now;
    if (clientEtag && clientEtag === currentEtag) {
      return { stats: globalCache._salaStatsCache.stats, etag: currentEtag, notModified: true };
    }
    return { stats: globalCache._salaStatsCache.stats, etag: currentEtag, notModified: false };
  }

  // 4. Si el cliente ya tiene el ETag actual, retornamos 304 Not Modified de inmediato
  if (clientEtag && clientEtag === currentEtag && globalCache._salaStatsCache?.etag === currentEtag) {
    return { stats: globalCache._salaStatsCache.stats, etag: currentEtag, notModified: true };
  }

  // 5. Iniciar cálculo y compartir promesa con otras peticiones concurrentes
  const computePromise = (async () => {
    const items = await prisma.planteamientoSala.findMany({
      select: {
        id: true,
        refugio: true,
        refugioId: true,
        cedula: true,
        nombreApellido: true,
        genero: true,
        fechaNacimiento: true,
        edad: true,
        cargaFamiliar: true,
        tipoOpcion: true,
        estatus: true,
        porcentajeProgreso: true,
        fechaEntregaCarpeta: true,
        fechaEntregaSubsidio: true,
        createdAt: true,
        planillaCaracterizacion: true,
        cedulaCatastral: true,
        tituloCasa: true,
        referenciaBancariaVendedor: true,
        qrHabitatVivienda: true,
        cedulaVendedor: true,
        cedulaComprador: true,
        fotosVivienda: true,
        cantidadFotos: true,
        vendedorPoseePatria: true,
        qrColapsoVivienda: true,
        cartaCompromiso: true,
        fotosAlquiler: true,
        cantidadFotosAlquiler: true,
        referenciaBancariaAlquiler: true,
        cedulaArrendador: true,
        cedulaArrendatario: true,
        rifArrendador: true,
        rifArrendatario: true,
        rifViviendaDanos: true,
        fotosViviendaRenace: true,
        cantidadFotosRenace: true,
        sacosCemento: true,
        metrosArena: true,
        bloques: true,
        cabillas: true,
        pego: true,
      },
    });

    const globalScope = createScopeStats();
    let globalSumaProgreso = 0;

    const campMap = new Map<string, {
      refugio: string;
      refugioId?: string | null;
      scope: PlanteamientoSalaStatsScope;
      sumaProgreso: number;
    }>();

    for (const nom of CAMPAMENTOS_PLANTEAMIENTO_SALA) {
      campMap.set(nom, {
        refugio: nom,
        refugioId: null,
        scope: createScopeStats(),
        sumaProgreso: 0,
      });
    }

    const mesesMap = new Map<string, { carpetas: number; creditos: number }>();

    for (const it of items) {
      const prog = it.porcentajeProgreso || 0;
      globalSumaProgreso += prog;

      processItemInScope(globalScope, it);

      let campEntry = campMap.get(it.refugio);
      if (!campEntry) {
        campEntry = {
          refugio: it.refugio,
          refugioId: it.refugioId,
          scope: createScopeStats(),
          sumaProgreso: 0,
        };
        campMap.set(it.refugio, campEntry);
      }
      if (it.refugioId && !campEntry.refugioId) {
        campEntry.refugioId = it.refugioId;
      }
      campEntry.sumaProgreso += prog;
      processItemInScope(campEntry.scope, it);

      const dCarpeta = it.fechaEntregaCarpeta ? it.fechaEntregaCarpeta.slice(0, 7) : (it.createdAt ? it.createdAt.toISOString().slice(0, 7) : "");
      if (dCarpeta && dCarpeta.length === 7) {
        if (!mesesMap.has(dCarpeta)) mesesMap.set(dCarpeta, { carpetas: 0, creditos: 0 });
        mesesMap.get(dCarpeta)!.carpetas++;
      }
      if (it.estatus === "CREDITO ENTREGADO") {
        const dCredito = it.fechaEntregaSubsidio ? it.fechaEntregaSubsidio.slice(0, 7) : dCarpeta;
        if (dCredito && dCredito.length === 7) {
          if (!mesesMap.has(dCredito)) mesesMap.set(dCredito, { carpetas: 0, creditos: 0 });
          mesesMap.get(dCredito)!.creditos++;
        }
      }
    }

    globalScope.totalPoblacion = globalScope.totalPersonas + globalScope.totalCargaFamiliar;
    globalScope.promedioProgreso = globalScope.totalPersonas ? Math.round(globalSumaProgreso / globalScope.totalPersonas) : 0;

    const campamentos = Array.from(campMap.values()).map((c) => {
      c.scope.totalPoblacion = c.scope.totalPersonas + c.scope.totalCargaFamiliar;
      c.scope.promedioProgreso = c.scope.totalPersonas ? Math.round(c.sumaProgreso / c.scope.totalPersonas) : 0;
      return {
        ...c.scope,
        refugio: c.refugio,
        refugioId: c.refugioId,
      };
    }).sort((a, b) => b.totalPersonas - a.totalPersonas);

    const avanceTemporal = Array.from(mesesMap.entries())
      .map(([mes, vals]) => ({ mes, ...vals }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    const computedStats: PlanteamientoSalaStats = {
      global: globalScope,
      campamentos,
      avanceTemporal,
    };

    globalCache._salaStatsCache = {
      etag: currentEtag,
      stats: computedStats,
      timestamp: Date.now(),
    };

    return { stats: computedStats, etag: currentEtag };
  })();

  globalCache._salaStatsInFlight = computePromise;
  try {
    const res = await computePromise;
    if (clientEtag && clientEtag === res.etag) {
      return { stats: res.stats, etag: res.etag, notModified: true };
    }
    return { stats: res.stats, etag: res.etag, notModified: false };
  } finally {
    globalCache._salaStatsInFlight = null;
  }
}
