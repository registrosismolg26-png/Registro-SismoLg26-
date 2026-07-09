import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, refugioScopeFor, canManageMorbilidad, canDeleteConsulta, isMaster, canActOnRefugio, hasRefugio } from "@/lib/auth";
import { withAuditUser } from "@/lib/audit";
import { consultasETag } from "@/lib/etag";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const requested = new URL(req.url).searchParams.get("refugio");
    const scope = refugioScopeFor(auth, requested);

    // Sello barato (count + max(updatedAt)): 304 si nada cambió (ahorro de egress).
    // Si `updatedAt` aún no está migrada en Supabase, consultasETag → null → 200 normal.
    const etag = await consultasETag(scope);
    if (etag && req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
    }

    const consultas = await prisma.consultaMedica.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
    });

    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (etag) headers.ETag = etag;
    return NextResponse.json({ success: true, consultas }, { headers });
  } catch (error: any) {
    console.error("Error en GET /api/consultas:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!canManageMorbilidad(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const {
      id,
      cedula,
      nombreApellido,
      registroId,
      genero,
      edad,
      fechaNacimiento,
      tipoPaciente,
      tipoNota,
      fechaConsulta,
      lesiones,
      estadoFisico,
      embarazo,
      refugio,
      antecedentesPatologiaIds,
      antecedentesMedicamentoIds,
      diagnosticoPatologiaIds,
      diagnosticoMedicamentoIds,
      notasDoctor
    } = body;

    if (!cedula || !nombreApellido) {
      return NextResponse.json({ error: "Cédula y nombre son obligatorios" }, { status: 400 });
    }

    const arr = (v: any) => (Array.isArray(v) ? v : []);
    // Lesiones: cada ítem = { tipoId, zona, estado, cura } (se sanea).
    const ESTADOS_LESION = ["NUEVA", "EN_TRATAMIENTO", "INFECTADA", "CICATRIZADA"];
    const lesionesClean = arr(lesiones)
      .map((l: any) => ({
        tipoId: String(l?.tipoId ?? "").trim(),
        zona: String(l?.zona ?? "").trim(),
        estado: ESTADOS_LESION.includes(l?.estado) ? l.estado : "NUEVA",
        cura: String(l?.cura ?? "").trim(),
      }))
      .filter((l: any) => l.tipoId); // sin tipo no es una lesión válida
    // Fecha-hora manual de la consulta (si viene inválida → null → se usa createdAt).
    const fc = fechaConsulta ? new Date(fechaConsulta) : null;
    const fechaConsultaClean = fc && !isNaN(fc.getTime()) ? fc : null;
    // Estados explícitos del paciente (saneados a los valores válidos; fuera de rango → null).
    const estadoFisicoClean = ["ILESO", "LESIONADO"].includes(estadoFisico) ? estadoFisico : null;
    const embarazoClean = ["SI", "NO"].includes(embarazo) ? embarazo : null;

    // Datos SIN refugio: el refugio lo decide el backend (nunca el cliente).
    const baseData = {
      cedula,
      nombreApellido,
      registroId: registroId || null,
      genero,
      edad: edad ? parseInt(String(edad)) : null,
      fechaNacimiento: fechaNacimiento || null,
      tipoPaciente: ["REFUGIADO", "APOYO_INSTITUCIONAL", "APOYO_COMUNITARIO", "EMERGENCIA"].includes(tipoPaciente) ? tipoPaciente : "REFUGIADO",
      tipoNota: tipoNota ? String(tipoNota).trim() : null,
      fechaConsulta: fechaConsultaClean,
      lesiones: lesionesClean,
      estadoFisico: estadoFisicoClean,
      embarazo: embarazoClean,
      // Modelo por-ID (los campos legados quedan en su default).
      antecedentesPatologiaIds: arr(antecedentesPatologiaIds),
      antecedentesMedicamentoIds: arr(antecedentesMedicamentoIds),
      diagnosticoPatologiaIds: arr(diagnosticoPatologiaIds),
      diagnosticoMedicamentoIds: arr(diagnosticoMedicamentoIds),
      notasDoctor,
      userId: auth.email,
    };

    // Refugio = el del USUARIO (no se confía en el cliente). Master respeta el refugio
    // de vista que envía (o el suyo); el resto se FUERZA a su propio refugio. Así toda
    // consulta queda vinculada al refugio de quien la crea.
    const bodyRefugio = refugio && String(refugio).trim() ? String(refugio).trim() : null;
    const refugioForCreate = isMaster(auth) ? (bodyRefugio ?? auth.refugio) : auth.refugio;
    if (!hasRefugio(refugioForCreate)) {
      return NextResponse.json({ error: "Tu usuario no tiene un campamento asignado." }, { status: 400 });
    }

    let consulta;
    if (id) {
      const existing = await prisma.consultaMedica.findUnique({ where: { id } });
      if (existing) {
        // EDICIÓN: solo si el usuario puede actuar sobre el refugio de esa consulta
        // (no master → únicamente las de su propio refugio). Mantiene el refugio original.
        if (!canActOnRefugio(auth, existing.refugio)) {
          return NextResponse.json({ error: "No puede editar consultas de otro campamento." }, { status: 403 });
        }
        consulta = await withAuditUser(auth.email, (tx) => tx.consultaMedica.update({ where: { id }, data: { ...baseData, refugio: existing.refugio } }));
      } else {
        // NUEVA con id provisto (cola offline): se crea con el refugio derivado.
        consulta = await withAuditUser(auth.email, (tx) => tx.consultaMedica.create({ data: { id, ...baseData, refugio: refugioForCreate } }));
      }
    } else {
      consulta = await withAuditUser(auth.email, (tx) => tx.consultaMedica.create({ data: { ...baseData, refugio: refugioForCreate } }));
    }

    // ── Propagación al censo (Registro) ───────────────────────────────────────
    // La EVOLUCIÓN clínica mantiene el censo al día AUTOMÁTICAMENTE: si la consulta
    // está vinculada a una persona del censo (registroId), se copian los estados
    // EXPLÍCITOS de esta consulta al registro —estado físico siempre; embarazo solo
    // en mujeres—. Nunca pisa con valores nulos. A prueba de fallos (no rompe la
    // consulta si el registro no existe o si la columna aún no está migrada).
    try {
      const linkRegId = (consulta as any)?.registroId as string | null | undefined;
      if (linkRegId && (estadoFisicoClean || embarazoClean)) {
        const reg = await prisma.registro.findUnique({ where: { id: linkRegId } });
        if (reg) {
          const regData: Record<string, string> = {};
          if (estadoFisicoClean && reg.estadoFisico !== estadoFisicoClean) regData.estadoFisico = estadoFisicoClean;
          if (embarazoClean && String(reg.genero || "").toUpperCase() === "FEMENINO" && reg.embarazo !== embarazoClean) regData.embarazo = embarazoClean;
          if (Object.keys(regData).length) {
            // syncedAt: la evolución clínica también "toca" el censo → refresca la marca
            // de última modificación para que el validador ETag del censo no sirva un 304 obsoleto.
            // undefined en un campo = Prisma no lo cambia (solo se envía el que realmente cambió).
            await withAuditUser(auth.email, (tx) => tx.registro.update({
              where: { id: reg.id },
              data: { estadoFisico: regData.estadoFisico, embarazo: regData.embarazo, syncedAt: new Date() },
            }));
          }
        }
      }
    } catch (e) {
      console.error("No se pudo propagar los estados de la consulta al censo:", e);
    }

    return NextResponse.json({ success: true, consulta }, { status: 201 });
  } catch (error: any) {
    console.error("Error en POST /api/consultas:", error);
    return NextResponse.json(
      { error: "Error al registrar la consulta médica", code: error?.code, details: error?.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    // Eliminar consultas: SOLO AdminMedico y Master.
    if (!canDeleteConsulta(auth)) {
      return NextResponse.json({ error: "No autorizado para eliminar consultas" }, { status: 403 });
    }

    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta el id de la consulta" }, { status: 400 });
    }

    const existing = await prisma.consultaMedica.findUnique({ where: { id } });
    if (!existing) {
      // Ya no existe (p. ej. consulta local nunca sincronizada): el cliente igual la borra local.
      return NextResponse.json({ success: true, alreadyGone: true });
    }
    // Solo se pueden eliminar consultas del propio refugio (Master: cualquiera).
    if (!canActOnRefugio(auth, existing.refugio)) {
      return NextResponse.json({ error: "No puede eliminar consultas de otro campamento." }, { status: 403 });
    }

    await withAuditUser(auth.email, (tx) => tx.consultaMedica.delete({ where: { id } }));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en DELETE /api/consultas:", error);
    return NextResponse.json({ error: "Error al eliminar la consulta médica" }, { status: 500 });
  }
}
