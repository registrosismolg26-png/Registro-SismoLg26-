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
    // Envuelto en withAuditUser → el trigger de BD registra la consulta en AuditLog
    // (CREATE con la fila completa: incluye el uuid de la consulta y el registroId vinculado).
    const consulta = await withAuditUser(auth.email, (tx) => tx.consultaMedica.create({
      data: {
        id: id || undefined,
        cedula,
        nombreApellido,
        registroId: registroId || null,
        genero,
        edad: edad ? parseInt(String(edad)) : null,
        refugio,
        // Modelo por-ID (los campos legados quedan en su default).
        antecedentesPatologiaIds: arr(antecedentesPatologiaIds),
        antecedentesMedicamentoIds: arr(antecedentesMedicamentoIds),
        diagnosticoPatologiaIds: arr(diagnosticoPatologiaIds),
        diagnosticoMedicamentoIds: arr(diagnosticoMedicamentoIds),
        notasDoctor,
        userId: auth.email
      }
    }));

    return NextResponse.json({ success: true, consulta }, { status: 201 });
  } catch (error: any) {
    console.error("Error en POST /api/consultas:", error);
    return NextResponse.json({ error: "Error al registrar la consulta médica" }, { status: 500 });
  }
}
