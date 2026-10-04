import { NextResponse } from "next/server";
import { getAuthUser, canViewPlanteamientoSala, isPlanteamientoVisualizador } from "@/lib/auth";
import { getOrComputePlanteamientoSalaStats } from "@/lib/planteamientoStatsCache";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canViewPlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const clientEtag = req.headers.get("if-none-match");
    const { stats, etag, notModified } = await getOrComputePlanteamientoSalaStats(clientEtag);

    if (isPlanteamientoVisualizador(auth)) {
      const campRefugio = auth.refugio;
      const targetCamp = stats.campamentos.find((c) => c.refugio === campRefugio);
      const emptyScope = {
        totalPersonas: 0,
        totalCargaFamiliar: 0,
        totalPoblacion: 0,
        promedioProgreso: 0,
        porEstatus: { "SIN ESTATUS": 0, "EN PROCESO": 0, "CREDITO ENTREGADO": 0, "CARPETA RETORNADA": 0, "CON NOVEDAD EN LA SEDE": 0 },
        porTipoOpcion: { MERCADO_SECUNDARIO: 0, ALQUILER: 0, PLAN_VENEZUELA_RENACE: 0, CAMPAMENTO_MAYOR_PERMANENCIA: 0, ASIGNACION_GMVV: 0 },
        demografia: {
          generoTitulares: { femenino: 0, masculino: 0, noEspecificado: 0 },
          generoTotal: { femenino: 0, masculino: 0, noEspecificado: 0 },
          gruposEdad: { ninosAdolescentes: 0, jovenes: 0, adultos: 0, adultosMayores: 0, sinDato: 0 },
          parentescos: {},
        },
        mercadoSecundario: {
          total: 0,
          porRequisito: { planillaCaracterizacion: 0, cedulaCatastral: 0, conTituloCasa: 0, referenciaBancariaVendedor: 0, qrHabitatVivienda: 0, cedulaVendedor: 0, cedulaComprador: 0, fotosVivienda: 0, vendedorPoseePatria: 0, qrColapsoVivienda: 0 },
          titulosCasaDesglose: { NINGUNO: 0, TITULO_PROPIEDAD: 0, TITULO_SUPLETORIO: 0, COMPRA_VENTA: 0 },
        },
        alquiler: {
          total: 0,
          porRequisito: { cartaCompromiso: 0, fotosAlquiler: 0, referenciaBancariaAlquiler: 0, cedulaArrendador: 0, cedulaArrendatario: 0, rifArrendador: 0, rifArrendatario: 0 },
        },
        venezuelaRenace: {
          total: 0,
          porRequisito: { rifViviendaDanos: 0, fotosViviendaRenace: 0, conMateriales: 0 },
          materialesTotales: { sacosCemento: 0, metrosArena: 0, bloques: 0, cabillas: 0, pego: 0 },
        },
        porRequisito: { planillaCaracterizacion: 0, cedulaCatastral: 0, conTituloCasa: 0, referenciaBancariaVendedor: 0, qrHabitatVivienda: 0, cedulaVendedor: 0, cedulaComprador: 0, fotosVivienda: 0, vendedorPoseePatria: 0, qrColapsoVivienda: 0 },
        titulosCasaDesglose: { NINGUNO: 0, TITULO_PROPIEDAD: 0, TITULO_SUPLETORIO: 0, COMPRA_VENTA: 0 },
      };
      const scopeData = targetCamp || { ...emptyScope, refugio: campRefugio };
      const scopedStats = {
        global: scopeData,
        campamentos: [scopeData],
        avanceTemporal: stats.avanceTemporal || [],
      };
      return NextResponse.json(
        {
          success: true,
          stats: scopedStats,
        },
        { headers: { "Cache-Control": "private, no-cache" } }
      );
    }

    const headers: Record<string, string> = {
      ETag: etag,
      "Cache-Control": "private, no-cache",
    };

    if (notModified) {
      return new NextResponse(null, { status: 304, headers });
    }

    return NextResponse.json(
      {
        success: true,
        stats,
      },
      { headers }
    );
  } catch (error: any) {
    console.error("Error en GET /api/planteamiento-sala/stats:", error);
    return NextResponse.json(
      { error: "Error al calcular estadísticas", details: error?.message },
      { status: 500 }
    );
  }
}
