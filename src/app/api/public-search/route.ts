import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Normaliza cualquier formato de cédula a solo dígitos y retorna
 * también el prefijo de nacionalidad si viene incluido.
 * Ejemplos:
 *   "V-26597356"  → { digits: "26597356", nac: "V" }
 *   "E-52525225"  → { digits: "52525225", nac: "E" }
 *   "26.597.356"  → { digits: "26597356", nac: null }
 *   "26597356"    → { digits: "26597356", nac: null }
 */
function parseCedula(q: string): { digits: string; nac: string | null } | null {
  const upper = q.trim().toUpperCase();
  const match = upper.match(/^([VE])-?(\d[\d.]+)$|^(\d[\d.]+)$/);
  if (!match) return null;
  const nac    = match[1] ?? null;          // "V", "E" o null
  const rawNum = (match[2] ?? match[3]).replace(/\./g, ""); // quitar puntos
  if (rawNum.length < 5) return null;       // demasiado corto para ser cédula
  return { digits: rawNum, nac };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q     = searchParams.get("q") || "";
    const cleanQ = q.trim();

    if (cleanQ.length < 3) {
      return NextResponse.json({ success: true, registros: [], padronHit: null });
    }

    // ── Búsqueda principal en la tabla Registro ──────────────────────────────
    // Si el término es una cédula (V-/E-/solo dígitos), busca por sus dígitos
    // tanto en la persona como en cedulaJefeFamilia, para que al buscar la cédula
    // de un jefe de familia aparezcan también los integrantes de su núcleo.
    const parsed = parseCedula(cleanQ);
    const orConditions: any[] = [
      { nombreApellido:  { contains: cleanQ, mode: "insensitive" } },
      { telefono:        { contains: cleanQ, mode: "insensitive" } },
      { sector:          { contains: cleanQ, mode: "insensitive" } },
      { comunidad:       { contains: cleanQ, mode: "insensitive" } },
      { direccionExacta: { contains: cleanQ, mode: "insensitive" } }
    ];
    if (parsed) {
      orConditions.push({ cedula:            { contains: parsed.digits } });
      orConditions.push({ cedulaJefeFamilia: { contains: parsed.digits } });
    } else {
      orConditions.push({ cedula: { contains: cleanQ, mode: "insensitive" } });
    }

    const registros = await prisma.registro.findMany({
      where: { OR: orConditions },
      select: {
        id: true,
        nombreApellido: true,
        cedula: true,
        parroquia: true,
        sector: true,
        comunidad: true,
        direccionExacta: true,
        genero: true,
        fechaNacimiento: true,
        edad: true,
        estadoFisico: true,
        cuarto: true,
        retirado: true,
        retiradoRazon: true,
        telefono: true,
        refugio: true,
        intermitente: true,
        motivoIntermitente: true
      },
      take: 20
    });

    // Si hay resultados no necesitamos buscar en el padrón
    if (registros.length > 0) {
      return NextResponse.json({ success: true, registros, padronHit: null });
    }

    // ── Fallback: buscar en el Padrón solo si la consulta parece una cédula ──
    let padronHit: { nombreCompleto: string; cedula: string; nacionalidad: string } | null = null;

    if (parsed) {
      const { digits, nac } = parsed;

      // Si viene con prefijo buscamos exacto; si no, probamos V- y E-
      const nacVariants = nac ? [nac] : ["V", "E"];

      for (const n of nacVariants) {
        const hit = await prisma.padron.findFirst({
          where: { cedula: digits, nacionalidad: n },
          select: { nombreCompleto: true, cedula: true, nacionalidad: true }
        });
        if (hit) {
          padronHit = hit;
          break;
        }
      }
    }

    return NextResponse.json({ success: true, registros: [], padronHit });
  } catch (error) {
    console.error("Error in public-search API:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
