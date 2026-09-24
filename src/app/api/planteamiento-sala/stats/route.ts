import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canManagePlanteamientoSala } from "@/lib/auth";
import { CAMPAMENTOS_PLANTEAMIENTO_SALA } from "@/lib/constants";
import type { PlanteamientoSalaStatsScope, TituloCasaTipo } from "@/types";

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
      "CREDITO ENTREGADO": 0,
      "EN PROCESO": 0,
      "CARPETA RETORNADA": 0,
      "CON NOVEDAD EN LA SEDE": 0,
    },
    porTipoOpcion: {
      MERCADO_SECUNDARIO: 0,
      ALQUILER: 0,
      PLAN_VENEZUELA_RENACE: 0,
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

  // Estatus
  if (scope.porEstatus[it.estatus as keyof typeof scope.porEstatus] !== undefined) {
    scope.porEstatus[it.estatus as keyof typeof scope.porEstatus]++;
  } else {
    scope.porEstatus["EN PROCESO"]++;
  }

  // Modalidad
  const tipo = it.tipoOpcion || "MERCADO_SECUNDARIO";
  if (scope.porTipoOpcion[tipo as keyof typeof scope.porTipoOpcion] !== undefined) {
    scope.porTipoOpcion[tipo as keyof typeof scope.porTipoOpcion]++;
  } else {
    scope.porTipoOpcion["MERCADO_SECUNDARIO"]++;
  }

  // Demografía: Titular
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

  // Carga Familiar
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

    // Género familiar
    const gf = String(m.genero || "").toUpperCase().trim();
    if (gf.startsWith("F")) {
      scope.demografia.generoTotal.femenino++;
    } else if (gf.startsWith("M")) {
      scope.demografia.generoTotal.masculino++;
    } else {
      scope.demografia.generoTotal.noEspecificado++;
    }

    // Edad familiar
    const ageF = m.edad != null && !isNaN(Number(m.edad)) ? Number(m.edad) : computeAge(m.fechaNacimiento);
    if (ageF != null && !isNaN(ageF) && ageF >= 0) {
      if (ageF <= 17) scope.demografia.gruposEdad.ninosAdolescentes++;
      else if (ageF <= 29) scope.demografia.gruposEdad.jovenes++;
      else if (ageF <= 59) scope.demografia.gruposEdad.adultos++;
      else scope.demografia.gruposEdad.adultosMayores++;
    } else {
      scope.demografia.gruposEdad.sinDato++;
    }

    // Parentesco
    const p = String(m.parentesco || "").toUpperCase().trim();
    if (p.includes("HIJ")) scope.demografia.parentescos["Hijos / Hijas"]++;
    else if (p.includes("ESPOS") || p.includes("CONYUG") || p.includes("PAREJ")) scope.demografia.parentescos["Cónyuges / Parejas"]++;
    else if (p.includes("NIET")) scope.demografia.parentescos["Nietos / Nietas"]++;
    else if (p.includes("HERMAN")) scope.demografia.parentescos["Hermanos / Hermanas"]++;
    else if (p.includes("MADRE") || p.includes("PADRE") || p.includes("MAMA") || p.includes("PAPA")) scope.demografia.parentescos["Padres / Madres"]++;
    else scope.demografia.parentescos["Otros"]++;
  }

  // Requisitos según modalidad
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
      scope.porRequisito.qrHabitatVivienda++;
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
      scope.porRequisito.qrColapsoVivienda++;
    }

    const tipoTit = (it.tituloCasa && scope.mercadoSecundario.titulosCasaDesglose[it.tituloCasa as TituloCasaTipo] !== undefined)
      ? (it.tituloCasa as TituloCasaTipo)
      : "NINGUNO";
    scope.mercadoSecundario.titulosCasaDesglose[tipoTit]++;
    scope.titulosCasaDesglose[tipoTit]++;
  }
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManagePlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

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
        // Mercado Secundario
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
        // Alquiler
        cartaCompromiso: true,
        fotosAlquiler: true,
        cantidadFotosAlquiler: true,
        referenciaBancariaAlquiler: true,
        cedulaArrendador: true,
        cedulaArrendatario: true,
        rifArrendador: true,
        rifArrendatario: true,
        // Plan Venezuela Renace
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

    // Inicializar mapa de los 26 campamentos oficiales
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

    // Registro de meses para avance temporal
    const mesesMap = new Map<string, { carpetas: number; creditos: number }>();

    for (const it of items) {
      const prog = it.porcentajeProgreso || 0;
      globalSumaProgreso += prog;

      // Procesar en scope global
      processItemInScope(globalScope, it);

      // Procesar en scope de campamento
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

      // Avance temporal (mes YYYY-MM)
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

    // Calcular totales derivados en global
    globalScope.totalPoblacion = globalScope.totalPersonas + globalScope.totalCargaFamiliar;
    globalScope.promedioProgreso = globalScope.totalPersonas ? Math.round(globalSumaProgreso / globalScope.totalPersonas) : 0;

    // Calcular totales derivados en campamentos
    const campamentos = Array.from(campMap.values()).map((c) => {
      c.scope.totalPoblacion = c.scope.totalPersonas + c.scope.totalCargaFamiliar;
      c.scope.promedioProgreso = c.scope.totalPersonas ? Math.round(c.sumaProgreso / c.scope.totalPersonas) : 0;
      return {
        ...c.scope,
        refugio: c.refugio,
        refugioId: c.refugioId,
      };
    }).sort((a, b) => b.totalPersonas - a.totalPersonas);

    // Meses ordenados
    const avanceTemporal = Array.from(mesesMap.entries())
      .map(([mes, vals]) => ({ mes, ...vals }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    return NextResponse.json({
      success: true,
      stats: {
        global: globalScope,
        campamentos,
        avanceTemporal,
      },
    });
  } catch (error: any) {
    console.error("Error en GET /api/planteamiento-sala/stats:", error);
    return NextResponse.json({ error: "Error al calcular estadísticas", details: error?.message }, { status: 500 });
  }
}
