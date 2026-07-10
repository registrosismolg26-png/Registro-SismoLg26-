import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canRegister, isMaster, hasRefugio, refugioScopeFor } from "@/lib/auth";

// Caracterización (ficha por familia). GET = estado LIGERO por refugio (qué familias
// tienen hogar y qué personas tienen ficha) para pintar cobertura sin traer todo.
// POST = upsert de una ficha completa (hogar + N personas) en una transacción,
// con el refugio FORZADO al del operador (nunca del cliente).

// ── helpers de saneo ────────────────────────────────────────────────────────
const s = (v: any): string | null => { const t = v == null ? "" : String(v).trim(); return t ? t : null; };
const arr = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);
const num = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const intOrNull = (v: any): number | null => { const n = parseInt(String(v), 10); return Number.isFinite(n) ? n : null; };
const dateOrNull = (v: any): Date | null => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };

function sanitizeHogar(raw: any, refugio: string) {
  return {
    jefeRegistroId: String(raw?.jefeRegistroId ?? "").trim(),
    familiaCedula: String(raw?.familiaCedula ?? "").trim(),
    refugio,
    fechaIngresoRefugio: dateOrNull(raw?.fechaIngresoRefugio),
    gpsViviendaLat: num(raw?.gpsViviendaLat),
    gpsViviendaLng: num(raw?.gpsViviendaLng),
    tenenciaId: s(raw?.tenenciaId), misionVivienda: s(raw?.misionVivienda), tipoViviendaId: s(raw?.tipoViviendaId),
    materialId: s(raw?.materialId), nivelDanoId: s(raw?.nivelDanoId), estadoEnseresId: s(raw?.estadoEnseresId),
    servicioAfectadoIds: arr(raw?.servicioAfectadoIds), riesgoEntornoIds: arr(raw?.riesgoEntornoIds),
    rangoIngresoId: s(raw?.rangoIngresoId), recibeRemesas: s(raw?.recibeRemesas), recibeClap: s(raw?.recibeClap),
    accesoPatriaId: s(raw?.accesoPatriaId), recibeBonosPatria: s(raw?.recibeBonosPatria), bonoContingenciaId: s(raw?.bonoContingenciaId),
  };
}

function sanitizePersona(raw: any, refugio: string) {
  return {
    registroId: String(raw?.registroId ?? "").trim(),
    cedula: String(raw?.cedula ?? "").trim(),
    familiaCedula: String(raw?.familiaCedula ?? "").trim(),
    refugio,
    estadoCivilId: s(raw?.estadoCivilId), correo: s(raw?.correo), telefonoAlt: s(raw?.telefonoAlt),
    parentescoId: s(raw?.parentescoId), asisteEscuela: s(raw?.asisteEscuela), vulnerabilidadId: s(raw?.vulnerabilidadId),
    grupoSanguineoId: s(raw?.grupoSanguineoId), alergiaIds: arr(raw?.alergiaIds), discapacidad: s(raw?.discapacidad),
    discapacidadTipoId: s(raw?.discapacidadTipoId), discapacidadDesc: s(raw?.discapacidadDesc), vacunaAntitetanicaId: s(raw?.vacunaAntitetanicaId),
    saludMental: s(raw?.saludMental), requiereAtencion: s(raw?.requiereAtencion), detalleAtencion: s(raw?.detalleAtencion),
    semanasGestacion: intOrNull(raw?.semanasGestacion),
    pesoKg: num(raw?.pesoKg), estaturaCm: num(raw?.estaturaCm),
    tallaCamisaId: s(raw?.tallaCamisaId), tallaPantalonId: s(raw?.tallaPantalonId), tallaCalzadoId: s(raw?.tallaCalzadoId),
    necesidadIds: arr(raw?.necesidadIds),
    nivelEducativoId: s(raw?.nivelEducativoId), impactoLaboralId: s(raw?.impactoLaboralId), sectorEconomicoId: s(raw?.sectorEconomicoId),
    oficioId: s(raw?.oficioId), aniosExperiencia: intOrNull(raw?.aniosExperiencia), rescatoHerramientas: s(raw?.rescatoHerramientas),
    aptitudFisicaLaboralId: s(raw?.aptitudFisicaLaboralId), disponibilidadId: s(raw?.disponibilidadId),
    puedeTrabajarInmediato: s(raw?.puedeTrabajarInmediato),
    validacionDestreza: s(raw?.validacionDestreza) ?? "PENDIENTE",
  };
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const requested = new URL(req.url).searchParams.get("refugio");
    const scope = refugioScopeFor(auth, requested);

    // Sello barato (count + max(syncedAt) de hogares y personas) → 304 si nada cambió.
    let etag: string | null = null;
    try {
      const [ha, pa] = await Promise.all([
        prisma.caracterizacionHogar.aggregate({ where: scope, _count: true, _max: { syncedAt: true } }),
        prisma.caracterizacionPersona.aggregate({ where: scope, _count: true, _max: { syncedAt: true } }),
      ]);
      const hm = ha._max.syncedAt ? ha._max.syncedAt.getTime() : 0;
      const pm = pa._max.syncedAt ? pa._max.syncedAt.getTime() : 0;
      etag = `"carac-${ha._count}-${hm}-${pa._count}-${pm}"`;
    } catch { etag = null; }
    if (etag && req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
    }

    const [hogares, personas] = await Promise.all([
      prisma.caracterizacionHogar.findMany({ where: scope, select: { jefeRegistroId: true, familiaCedula: true } }),
      prisma.caracterizacionPersona.findMany({ where: scope, select: { registroId: true } }),
    ]);

    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (etag) headers.ETag = etag;
    return NextResponse.json(
      { success: true, hogares, personas: personas.map((p) => p.registroId) },
      { headers }
    );
  } catch (error: any) {
    console.error("Error en GET /api/caracterizacion:", error);
    return NextResponse.json({ error: "Error al listar caracterización" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canRegister(auth)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const body = await req.json();

    // Refugio = el del USUARIO (no se confía en el cliente). Master respeta el de vista.
    const bodyRefugio = body?.refugio && String(body.refugio).trim() ? String(body.refugio).trim() : null;
    const refugio = isMaster(auth) ? (bodyRefugio ?? auth.refugio) : auth.refugio;
    if (!hasRefugio(refugio)) {
      return NextResponse.json({ error: "Tu usuario no tiene un campamento asignado." }, { status: 400 });
    }

    const hogar = sanitizeHogar(body?.hogar ?? {}, refugio);
    if (!hogar.jefeRegistroId || !hogar.familiaCedula) {
      return NextResponse.json({ error: "Falta el jefe de familia de la ficha." }, { status: 400 });
    }
    const personas = (Array.isArray(body?.personas) ? body.personas : [])
      .map((p: any) => sanitizePersona(p, refugio))
      .filter((p: { registroId: string }) => p.registroId);

    await prisma.$transaction(async (tx) => {
      const { jefeRegistroId, ...hogarRest } = hogar;
      await tx.caracterizacionHogar.upsert({
        where: { jefeRegistroId },
        create: { jefeRegistroId, ...hogarRest },
        update: hogarRest,
      });
      for (const p of personas) {
        const { registroId, ...personaRest } = p;
        await tx.caracterizacionPersona.upsert({
          where: { registroId },
          create: { registroId, ...personaRest },
          update: personaRest,
        });
      }
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    console.error("Error en POST /api/caracterizacion:", error);
    return NextResponse.json(
      { error: "Error al guardar la ficha", code: error?.code, details: error?.message },
      { status: 500 }
    );
  }
}
