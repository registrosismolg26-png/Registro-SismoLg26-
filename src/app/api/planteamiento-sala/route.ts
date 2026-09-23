import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canManagePlanteamientoSala } from "@/lib/auth";

export function calcularProgreso(item: {
  planillaCaracterizacion?: string | null;
  cedulaCatastral?: string | null;
  tituloCasa?: string | null;
  referenciaBancariaVendedor?: string | null;
  qrHabitatVivienda?: string | null;
  cedulaVendedor?: string | null;
  cedulaComprador?: string | null;
  fotosVivienda?: string | null;
  cantidadFotos?: number | null;
  vendedorPoseePatria?: string | null;
}): number {
  let count = 0;
  if (item.planillaCaracterizacion === "SI") count++;
  if (item.cedulaCatastral === "SI") count++;
  if (item.tituloCasa && item.tituloCasa !== "NINGUNO") count++;
  if (item.referenciaBancariaVendedor === "SI") count++;
  if (item.qrHabitatVivienda === "SI") count++;
  if (item.cedulaVendedor === "SI") count++;
  if (item.cedulaComprador === "SI") count++;
  if (item.fotosVivienda === "SI" || (item.cantidadFotos && item.cantidadFotos > 0)) count++;
  if (item.vendedorPoseePatria === "SI") count++;
  return Math.min(100, Math.max(0, Math.round((count / 9) * 100)));
}

// GET — Master o Planteamiento Master. Lista todos los registros o los filtra por campamento (?refugio=)
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManagePlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const refugio = (searchParams.get("refugio") || "").trim();
    const where: any = {};
    if (refugio && refugio !== "TODOS") {
      where.refugio = refugio;
    }

    const items = await prisma.planteamientoSala.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    console.error("Error en GET /api/planteamiento-sala:", error);
    return NextResponse.json({ error: "Error al obtener planteamientos" }, { status: 500 });
  }
}

// POST — Master o Planteamiento Master. Crea o actualiza un planteamiento (upsert por cedula + refugio)
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManagePlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const cedula = (body.cedula || "").replace(/\D/g, "");
    const refugio = (body.refugio || "").trim();
    const nombreApellido = (body.nombreApellido || "").trim().toUpperCase();

    if (!cedula || !refugio || !nombreApellido) {
      return NextResponse.json(
        { error: "Cédula, nombre y campamento son obligatorios." },
        { status: 400 }
      );
    }

    const planillaCaracterizacion = body.planillaCaracterizacion === "SI" ? "SI" : "NO";
    const cedulaCatastral = body.cedulaCatastral === "SI" ? "SI" : "NO";
    const tituloCasa = ["TITULO_PROPIEDAD", "TITULO_SUPLETORIO", "COMPRA_VENTA"].includes(body.tituloCasa)
      ? body.tituloCasa
      : "NINGUNO";
    const referenciaBancariaVendedor = body.referenciaBancariaVendedor === "SI" ? "SI" : "NO";
    const qrHabitatVivienda = body.qrHabitatVivienda === "SI" ? "SI" : "NO";
    const cedulaVendedor = body.cedulaVendedor === "SI" ? "SI" : "NO";
    const cedulaComprador = body.cedulaComprador === "SI" ? "SI" : "NO";
    const fotosVivienda = body.fotosVivienda === "SI" ? "SI" : "NO";
    const cantidadFotos = Math.max(0, parseInt(body.cantidadFotos || "0", 10) || 0);
    const vendedorPoseePatria = body.vendedorPoseePatria === "SI" ? "SI" : "NO";

    const porcentajeProgreso = calcularProgreso({
      planillaCaracterizacion,
      cedulaCatastral,
      tituloCasa,
      referenciaBancariaVendedor,
      qrHabitatVivienda,
      cedulaVendedor,
      cedulaComprador,
      fotosVivienda,
      cantidadFotos,
      vendedorPoseePatria,
    });

    const estatusValidos = [
      "CREDITO ENTREGADO",
      "EN PROCESO",
      "CARPETA RETORNADA",
      "CON NOVEDAD EN LA SEDE",
    ];
    const estatus = estatusValidos.includes(body.estatus) ? body.estatus : "EN PROCESO";
    const observacion = body.observacion ? String(body.observacion).trim() : null;
    const telefono = body.telefono ? String(body.telefono).trim() : null;
    const refugioId = body.refugioId ? String(body.refugioId).trim() : null;
    const registroId = body.registroId ? String(body.registroId).trim() : null;

    const dataToSave = {
      refugioId,
      refugio,
      cedula,
      nombreApellido,
      telefono,
      registroId,
      planillaCaracterizacion,
      cedulaCatastral,
      tituloCasa,
      referenciaBancariaVendedor,
      qrHabitatVivienda,
      cedulaVendedor,
      cedulaComprador,
      fotosVivienda,
      cantidadFotos,
      vendedorPoseePatria,
      porcentajeProgreso,
      estatus,
      observacion,
      createdBy: auth.email || auth.nombre,
    };

    const item = await prisma.planteamientoSala.upsert({
      where: {
        cedula_refugio: {
          cedula,
          refugio,
        },
      },
      create: {
        id: crypto.randomUUID(),
        ...dataToSave,
      },
      update: dataToSave,
    });

    return NextResponse.json({ success: true, item });
  } catch (error: any) {
    console.error("Error en POST /api/planteamiento-sala:", error);
    return NextResponse.json({ error: "Error al guardar planteamiento", details: error?.message }, { status: 500 });
  }
}
