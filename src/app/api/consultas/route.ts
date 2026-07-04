import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, refugioScopeFor, canManageMorbilidad } from "@/lib/auth";
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
      refugio,
      antecedentesPatologiaIds,
      antecedentesMedicamentoIds,
      diagnosticoPatologiaIds,
      diagnosticoMedicamentoIds,
      notasDoctor
    } = body;

    if (!cedula || !nombreApellido || !refugio) {
      return NextResponse.json({ error: "Cédula, nombre y refugio son obligatorios" }, { status: 400 });
    }

    const arr = (v: any) => (Array.isArray(v) ? v : []);
    const data = {
      cedula,
      nombreApellido,
      registroId: registroId || null,
      genero,
      edad: edad ? parseInt(String(edad)) : null,
      fechaNacimiento: fechaNacimiento || null,
      refugio,
      // Modelo por-ID (los campos legados quedan en su default).
      antecedentesPatologiaIds: arr(antecedentesPatologiaIds),
      antecedentesMedicamentoIds: arr(antecedentesMedicamentoIds),
      diagnosticoPatologiaIds: arr(diagnosticoPatologiaIds),
      diagnosticoMedicamentoIds: arr(diagnosticoMedicamentoIds),
      notasDoctor,
      userId: auth.email,
    };
    // Upsert por id: si es nueva se crea; si ya existe se ACTUALIZA con los datos
    // enviados (habilita la EDICIÓN de consultas). Re-enviar datos idénticos no genera
    // diff → el trigger de auditoría no registra cambio, así que reenviar es inocuo.
    const consulta = id
      ? await withAuditUser(auth.email, (tx) => tx.consultaMedica.upsert({ where: { id }, update: data, create: { id, ...data } }))
      : await withAuditUser(auth.email, (tx) => tx.consultaMedica.create({ data }));

    return NextResponse.json({ success: true, consulta }, { status: 201 });
  } catch (error: any) {
    console.error("Error en POST /api/consultas:", error);
    return NextResponse.json(
      { error: "Error al registrar la consulta médica", code: error?.code, details: error?.message },
      { status: 500 }
    );
  }
}
