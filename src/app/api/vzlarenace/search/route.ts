import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { cedulaFamilia } from "@/lib/helpers";

// GET ?cedula= — busca un NÚCLEO por cédula (del jefe o de cualquier miembro) y
// devuelve { jefe, miembros[], planteamiento|null }. Se compara por DÍGITOS BASE
// (cedulaFamilia): se estrecha con `contains` y se confirma la igualdad exacta en
// JS (el dataset es pequeño). Cualquier operador autenticado puede consultar.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const cedula = new URL(req.url).searchParams.get("cedula") ?? "";
    const digits = cedulaFamilia(cedula);
    if (!digits || digits.length < 4) {
      return NextResponse.json({ error: "Cédula inválida" }, { status: 400 });
    }

    // 1) ¿Es la cédula de un jefe?
    const jefeCands = await prisma.renaceJefe.findMany({ where: { cedula: { contains: digits } } });
    let jefe = jefeCands.find((j) => cedulaFamilia(j.cedula) === digits) ?? null;

    // 2) Si no, ¿es de un miembro? → subir a su jefeNro.
    if (!jefe) {
      const miemCands = await prisma.renaceMiembro.findMany({ where: { cedula: { contains: digits } } });
      const miem = miemCands.find((m) => cedulaFamilia(m.cedula) === digits);
      if (miem) jefe = await prisma.renaceJefe.findUnique({ where: { nro: miem.jefeNro } });
    }

    if (!jefe) return NextResponse.json({ jefe: null, miembros: [], planteamiento: null });

    const [miembros, planteamiento] = await Promise.all([
      prisma.renaceMiembro.findMany({ where: { jefeNro: jefe.nro }, orderBy: { nombres: "asc" } }),
      prisma.renacePlanteamiento.findUnique({ where: { jefeNro: jefe.nro } }),
    ]);

    return NextResponse.json({ jefe, miembros, planteamiento });
  } catch (error: any) {
    console.error("Error en GET /api/vzlarenace/search:", error);
    return NextResponse.json({ error: "Error al buscar" }, { status: 500 });
  }
}
