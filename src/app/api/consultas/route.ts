import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, refugioScopeFor, canManageMorbilidad, isMaster, canActOnRefugio, hasRefugio } from "@/lib/auth";
import { withAuditUser } from "@/lib/audit";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const requested = new URL(req.url).searchParams.get("refugio");
    const consultas = await prisma.consultaMedica.findMany({
      where: refugioScopeFor(auth, requested),
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, consultas });
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

    return NextResponse.json({ success: true, consulta }, { status: 201 });
  } catch (error: any) {
    console.error("Error en POST /api/consultas:", error);
    return NextResponse.json(
      { error: "Error al registrar la consulta médica", code: error?.code, details: error?.message },
      { status: 500 }
    );
  }
}
