import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, refugioScopeFor } from "@/lib/auth";

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

    const body = await req.json();
    const {
      id,
      cedula,
      nombreApellido,
      genero,
      edad,
      refugio,
      antecedentesPatologia,
      antecedentesMedicamentos,
      diagnosticoPatologia,
      diagnosticoMedicamentos,
      notasDoctor
    } = body;

    if (!cedula || !nombreApellido || !refugio) {
      return NextResponse.json({ error: "Cédula, nombre y refugio son obligatorios" }, { status: 400 });
    }

    const consulta = await prisma.consultaMedica.create({
      data: {
        id: id || undefined,
        cedula,
        nombreApellido,
        genero,
        edad: edad ? parseInt(String(edad)) : null,
        refugio,
        antecedentesPatologia,
        antecedentesMedicamentos: antecedentesMedicamentos || [],
        diagnosticoPatologia,
        diagnosticoMedicamentos: diagnosticoMedicamentos || [],
        notasDoctor,
        userId: auth.email
      }
    });

    return NextResponse.json({ success: true, consulta }, { status: 201 });
  } catch (error: any) {
    console.error("Error en POST /api/consultas:", error);
    return NextResponse.json({ error: "Error al registrar la consulta médica" }, { status: 500 });
  }
}
