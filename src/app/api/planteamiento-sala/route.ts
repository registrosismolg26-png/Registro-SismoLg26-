import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canManagePlanteamientoSala } from "@/lib/auth";

export function calcularProgreso(item: {
  tipoOpcion?: string | null;
  // Mercado Secundario
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
  qrColapsoVivienda?: string | null;
  // Alquiler
  cartaCompromiso?: string | null;
  fotosAlquiler?: string | null;
  cantidadFotosAlquiler?: number | null;
  referenciaBancariaAlquiler?: string | null;
  cedulaArrendador?: string | null;
  cedulaArrendatario?: string | null;
  rifArrendador?: string | null;
  rifArrendatario?: string | null;
  // Plan Venezuela Renace
  rifViviendaDanos?: string | null;
  fotosViviendaRenace?: string | null;
  cantidadFotosRenace?: number | null;
  sacosCemento?: number | null;
  metrosArena?: number | null;
  bloques?: number | null;
  cabillas?: number | null;
  pego?: number | null;
}): number {
  const tipo = item.tipoOpcion || "MERCADO_SECUNDARIO";

  if (tipo === "ALQUILER") {
    let count = 0;
    if (item.cartaCompromiso === "SI") count++;
    if (item.fotosAlquiler === "SI" || (item.cantidadFotosAlquiler !== undefined && item.cantidadFotosAlquiler !== null && item.cantidadFotosAlquiler > 0)) count++;
    if (item.referenciaBancariaAlquiler === "SI") count++;
    if (item.cedulaArrendador === "SI") count++;
    if (item.cedulaArrendatario === "SI") count++;
    if (item.rifArrendador === "SI") count++;
    if (item.rifArrendatario === "SI") count++;
    return Math.min(100, Math.max(0, Math.round((count / 7) * 100)));
  }

  if (tipo === "PLAN_VENEZUELA_RENACE") {
    let count = 0;
    if (item.rifViviendaDanos === "SI") count++;
    if (item.fotosViviendaRenace === "SI" || (item.cantidadFotosRenace !== undefined && item.cantidadFotosRenace !== null && item.cantidadFotosRenace > 0)) count++;
    const tieneMaterial = Boolean(
      (item.sacosCemento && item.sacosCemento > 0) ||
      (item.metrosArena && item.metrosArena > 0) ||
      (item.bloques && item.bloques > 0) ||
      (item.cabillas && item.cabillas > 0) ||
      (item.pego && item.pego > 0)
    );
    if (tieneMaterial) count++;
    return Math.min(100, Math.max(0, Math.round((count / 3) * 100)));
  }

  // Por defecto MERCADO_SECUNDARIO (10 recaudos)
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
  if (item.qrColapsoVivienda === "SI") count++;
  return Math.min(100, Math.max(0, Math.round((count / 10) * 100)));
}

// GET — Master o Planteamiento Master. Lista todos los registros o los filtra por campamento (?refugio=) y/o tipoOpcion (?tipoOpcion=)
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManagePlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const refugio = (searchParams.get("refugio") || "").trim();
    const tipoOpcion = (searchParams.get("tipoOpcion") || "").trim();
    const where: any = {};
    if (refugio && refugio !== "TODOS") {
      where.refugio = refugio;
    }
    if (tipoOpcion && tipoOpcion !== "TODOS") {
      where.tipoOpcion = tipoOpcion;
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

    const tiposValidos = ["MERCADO_SECUNDARIO", "ALQUILER", "PLAN_VENEZUELA_RENACE"];
    const tipoOpcion = tiposValidos.includes(body.tipoOpcion) ? body.tipoOpcion : "MERCADO_SECUNDARIO";

    // 1. Mercado Secundario
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
    const qrColapsoVivienda = body.qrColapsoVivienda === "SI" ? "SI" : "NO";

    // 2. Alquiler
    const cartaCompromiso = body.cartaCompromiso === "SI" ? "SI" : "NO";
    const fotosAlquiler = body.fotosAlquiler === "SI" ? "SI" : "NO";
    const cantidadFotosAlquiler = Math.max(0, parseInt(body.cantidadFotosAlquiler || "0", 10) || 0);
    const referenciaBancariaAlquiler = body.referenciaBancariaAlquiler === "SI" ? "SI" : "NO";
    const cedulaArrendador = body.cedulaArrendador === "SI" ? "SI" : "NO";
    const cedulaArrendatario = body.cedulaArrendatario === "SI" ? "SI" : "NO";
    const rifArrendador = body.rifArrendador === "SI" ? "SI" : "NO";
    const rifArrendatario = body.rifArrendatario === "SI" ? "SI" : "NO";

    // 3. Plan Venezuela Renace
    const rifViviendaDanos = body.rifViviendaDanos === "SI" ? "SI" : "NO";
    const fotosViviendaRenace = body.fotosViviendaRenace === "SI" ? "SI" : "NO";
    const cantidadFotosRenace = Math.max(0, parseInt(body.cantidadFotosRenace || "0", 10) || 0);
    const sacosCemento = Math.max(0, parseInt(body.sacosCemento || "0", 10) || 0);
    const metrosArena = Math.max(0, parseFloat(body.metrosArena || "0") || 0);
    const bloques = Math.max(0, parseInt(body.bloques || "0", 10) || 0);
    const cabillas = Math.max(0, parseInt(body.cabillas || "0", 10) || 0);
    const pego = Math.max(0, parseInt(body.pego || "0", 10) || 0);

    const porcentajeProgreso = calcularProgreso({
      tipoOpcion,
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
      qrColapsoVivienda,
      cartaCompromiso,
      fotosAlquiler,
      cantidadFotosAlquiler,
      referenciaBancariaAlquiler,
      cedulaArrendador,
      cedulaArrendatario,
      rifArrendador,
      rifArrendatario,
      rifViviendaDanos,
      fotosViviendaRenace,
      cantidadFotosRenace,
      sacosCemento,
      metrosArena,
      bloques,
      cabillas,
      pego,
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

    // Datos de la Persona: Género, Fecha de Nacimiento y Edad
    const genero = ["MASCULINO", "FEMENINO"].includes(String(body.genero || "").toUpperCase())
      ? String(body.genero).toUpperCase()
      : null;
    const fechaNacimiento = body.fechaNacimiento ? String(body.fechaNacimiento).trim().slice(0, 10) : null;
    let edad: number | null = null;
    if (body.edad !== undefined && body.edad !== null && body.edad !== "") {
      const parsedAge = parseInt(String(body.edad), 10);
      if (!isNaN(parsedAge) && parsedAge >= 0 && parsedAge <= 130) {
        edad = parsedAge;
      }
    } else if (fechaNacimiento) {
      const d = new Date(fechaNacimiento + "T00:00:00");
      if (!isNaN(d.getTime())) {
        const t = new Date();
        let calcAge = t.getFullYear() - d.getFullYear();
        const m = t.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && t.getDate() < d.getDate())) calcAge--;
        if (calcAge >= 0) edad = calcAge;
      }
    }

    // Fechas de avance
    const todayYMD = new Date().toISOString().slice(0, 10);
    const fechaEntregaCarpeta = body.fechaEntregaCarpeta
      ? String(body.fechaEntregaCarpeta).trim().slice(0, 10)
      : todayYMD;

    let fechaEntregaSubsidio: string | null = null;
    if (estatus === "CREDITO ENTREGADO") {
      fechaEntregaSubsidio = body.fechaEntregaSubsidio
        ? String(body.fechaEntregaSubsidio).trim().slice(0, 10)
        : todayYMD;
    }

    // Carga Familiar
    let cargaFamiliar: any = [];
    if (Array.isArray(body.cargaFamiliar)) {
      cargaFamiliar = body.cargaFamiliar
        .filter((m: any) => m && (m.cedula || m.nombreApellido))
        .map((m: any) => ({
          id: m.id || crypto.randomUUID(),
          cedula: String(m.cedula || "").replace(/\D/g, ""),
          nombreApellido: String(m.nombreApellido || "").trim().toUpperCase(),
          parentesco: String(m.parentesco || "OTRO").trim().toUpperCase(),
          genero: ["MASCULINO", "FEMENINO"].includes(String(m.genero || "").toUpperCase())
            ? String(m.genero).toUpperCase()
            : null,
          fechaNacimiento: m.fechaNacimiento ? String(m.fechaNacimiento).trim().slice(0, 10) : null,
          edad: m.edad !== undefined && m.edad !== null && m.edad !== "" ? parseInt(String(m.edad), 10) : null,
          telefono: m.telefono ? String(m.telefono).trim() : null,
        }));
    }

    const cleanCargaFamiliar = JSON.parse(JSON.stringify(cargaFamiliar));

    const dataToSave = {
      refugioId,
      refugio,
      cedula,
      nombreApellido,
      telefono,
      genero,
      fechaNacimiento,
      edad,
      cargaFamiliar: cleanCargaFamiliar,
      viviendaTipo: body.viviendaTipo ? String(body.viviendaTipo).trim() : null,
      viviendaEdificacion: body.viviendaEdificacion ? String(body.viviendaEdificacion).trim() : null,
      viviendaPisoApto: body.viviendaPisoApto ? String(body.viviendaPisoApto).trim() : null,
      viviendaDireccion: body.viviendaDireccion ? String(body.viviendaDireccion).trim() : null,
      viviendaZona: body.viviendaZona ? String(body.viviendaZona).trim() : null,
      viviendaCircuitoComunal: body.viviendaCircuitoComunal ? String(body.viviendaCircuitoComunal).trim() : null,
      viviendaGps: body.viviendaGps ? String(body.viviendaGps).trim() : null,
      viviendaQrUrl: body.viviendaQrUrl ? String(body.viviendaQrUrl).trim() : null,
      viviendaQrFamilia: Array.isArray(body.viviendaQrFamilia) ? JSON.parse(JSON.stringify(body.viviendaQrFamilia)) : [],
      viviendaOperador: body.viviendaOperador ? String(body.viviendaOperador).trim() : null,
      fechaEntregaCarpeta,
      fechaEntregaSubsidio,
      registroId,
      tipoOpcion,
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
      qrColapsoVivienda,
      cartaCompromiso,
      fotosAlquiler,
      cantidadFotosAlquiler,
      referenciaBancariaAlquiler,
      cedulaArrendador,
      cedulaArrendatario,
      rifArrendador,
      rifArrendatario,
      rifViviendaDanos,
      fotosViviendaRenace,
      cantidadFotosRenace,
      sacosCemento,
      metrosArena,
      bloques,
      cabillas,
      pego,
      porcentajeProgreso,
      estatus,
      observacion,
      createdBy: auth.email || auth.nombre,
    };

    let item;
    if (body.id) {
      item = await prisma.planteamientoSala.update({
        where: { id: String(body.id) },
        data: dataToSave,
      });
    } else {
      item = await prisma.planteamientoSala.upsert({
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
    }

    return NextResponse.json({ success: true, item });
  } catch (error: any) {
    console.error("Error en POST /api/planteamiento-sala:", error);
    return NextResponse.json({ error: "Error al guardar planteamiento", details: error?.message }, { status: 500 });
  }
}
