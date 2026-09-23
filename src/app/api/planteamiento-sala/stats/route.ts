import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canManagePlanteamientoSala } from "@/lib/auth";
import { CAMPAMENTOS_PLANTEAMIENTO_SALA } from "@/lib/constants";

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
        estatus: true,
        porcentajeProgreso: true,
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
      },
    });

    const totalPersonas = items.length;
    let sumaProgreso = 0;

    const porEstatus: Record<string, number> = {
      "CREDITO ENTREGADO": 0,
      "EN PROCESO": 0,
      "CARPETA RETORNADA": 0,
      "CON NOVEDAD EN LA SEDE": 0,
    };

    const porRequisito = {
      planillaCaracterizacion: 0,
      cedulaCatastral: 0,
      conTituloCasa: 0,
      referenciaBancariaVendedor: 0,
      qrHabitatVivienda: 0,
      cedulaVendedor: 0,
      cedulaComprador: 0,
      fotosVivienda: 0,
      vendedorPoseePatria: 0,
    };

    const titulosCasaDesglose: Record<string, number> = {
      "NINGUNO": 0,
      "TITULO_PROPIEDAD": 0,
      "TITULO_SUPLETORIO": 0,
      "COMPRA_VENTA": 0,
    };

    // Agrupación por campamento con sus propios contadores (los 26 oficiales)
    const campMap = new Map<string, {
      refugio: string;
      refugioId?: string | null;
      totalPersonas: number;
      sumaProgreso: number;
      porEstatus: Record<string, number>;
      porRequisito: typeof porRequisito;
      titulosCasaDesglose: Record<string, number>;
    }>();

    for (const nom of CAMPAMENTOS_PLANTEAMIENTO_SALA) {
      campMap.set(nom, {
        refugio: nom,
        refugioId: null,
        totalPersonas: 0,
        sumaProgreso: 0,
        porEstatus: {
          "CREDITO ENTREGADO": 0,
          "EN PROCESO": 0,
          "CARPETA RETORNADA": 0,
          "CON NOVEDAD EN LA SEDE": 0,
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
        },
        titulosCasaDesglose: {
          "NINGUNO": 0,
          "TITULO_PROPIEDAD": 0,
          "TITULO_SUPLETORIO": 0,
          "COMPRA_VENTA": 0,
        },
      });
    }

    for (const it of items) {
      sumaProgreso += it.porcentajeProgreso || 0;

      if (porEstatus[it.estatus] !== undefined) {
        porEstatus[it.estatus]++;
      } else {
        porEstatus["EN PROCESO"]++;
      }

      const tienePlanilla = it.planillaCaracterizacion === "SI";
      const tieneCatastral = it.cedulaCatastral === "SI";
      const tieneTitulo = Boolean(it.tituloCasa && it.tituloCasa !== "NINGUNO");
      const tieneRefBancaria = it.referenciaBancariaVendedor === "SI";
      const tieneQr = it.qrHabitatVivienda === "SI";
      const tieneCedVendedor = it.cedulaVendedor === "SI";
      const tieneCedComprador = it.cedulaComprador === "SI";
      const tieneFotos = it.fotosVivienda === "SI" || (it.cantidadFotos !== null && it.cantidadFotos > 0);
      const tienePatria = it.vendedorPoseePatria === "SI";

      if (tienePlanilla) porRequisito.planillaCaracterizacion++;
      if (tieneCatastral) porRequisito.cedulaCatastral++;
      if (tieneTitulo) porRequisito.conTituloCasa++;
      if (tieneRefBancaria) porRequisito.referenciaBancariaVendedor++;
      if (tieneQr) porRequisito.qrHabitatVivienda++;
      if (tieneCedVendedor) porRequisito.cedulaVendedor++;
      if (tieneCedComprador) porRequisito.cedulaComprador++;
      if (tieneFotos) porRequisito.fotosVivienda++;
      if (tienePatria) porRequisito.vendedorPoseePatria++;

      const tipoTit = (it.tituloCasa && titulosCasaDesglose[it.tituloCasa] !== undefined)
        ? it.tituloCasa
        : "NINGUNO";
      titulosCasaDesglose[tipoTit]++;

      // Campamento
      let c = campMap.get(it.refugio);
      if (!c) {
        c = {
          refugio: it.refugio,
          refugioId: it.refugioId,
          totalPersonas: 0,
          sumaProgreso: 0,
          porEstatus: {
            "CREDITO ENTREGADO": 0,
            "EN PROCESO": 0,
            "CARPETA RETORNADA": 0,
            "CON NOVEDAD EN LA SEDE": 0,
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
          },
          titulosCasaDesglose: {
            "NINGUNO": 0,
            "TITULO_PROPIEDAD": 0,
            "TITULO_SUPLETORIO": 0,
            "COMPRA_VENTA": 0,
          },
        };
        campMap.set(it.refugio, c);
      }
      c.totalPersonas++;
      c.sumaProgreso += it.porcentajeProgreso || 0;
      if (c.porEstatus[it.estatus] !== undefined) {
        c.porEstatus[it.estatus]++;
      } else {
        c.porEstatus["EN PROCESO"]++;
      }

      if (tienePlanilla) c.porRequisito.planillaCaracterizacion++;
      if (tieneCatastral) c.porRequisito.cedulaCatastral++;
      if (tieneTitulo) c.porRequisito.conTituloCasa++;
      if (tieneRefBancaria) c.porRequisito.referenciaBancariaVendedor++;
      if (tieneQr) c.porRequisito.qrHabitatVivienda++;
      if (tieneCedVendedor) c.porRequisito.cedulaVendedor++;
      if (tieneCedComprador) c.porRequisito.cedulaComprador++;
      if (tieneFotos) c.porRequisito.fotosVivienda++;
      if (tienePatria) c.porRequisito.vendedorPoseePatria++;

      c.titulosCasaDesglose[tipoTit]++;
    }

    const campamentos = Array.from(campMap.values()).map((c) => ({
      refugio: c.refugio,
      refugioId: c.refugioId,
      totalPersonas: c.totalPersonas,
      promedioProgreso: c.totalPersonas ? Math.round(c.sumaProgreso / c.totalPersonas) : 0,
      porEstatus: c.porEstatus as any,
      porRequisito: c.porRequisito,
      titulosCasaDesglose: c.titulosCasaDesglose as any,
    })).sort((a, b) => b.totalPersonas - a.totalPersonas);

    const promedioProgreso = totalPersonas ? Math.round(sumaProgreso / totalPersonas) : 0;

    return NextResponse.json({
      success: true,
      stats: {
        global: {
          totalPersonas,
          promedioProgreso,
          porEstatus,
          porRequisito,
          titulosCasaDesglose,
        },
        campamentos,
      },
    });
  } catch (error: any) {
    console.error("Error en GET /api/planteamiento-sala/stats:", error);
    return NextResponse.json({ error: "Error al calcular estadísticas" }, { status: 500 });
  }
}
