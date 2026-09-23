import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canManagePlanteamientoSala } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManagePlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const rawCedula = (searchParams.get("cedula") || "").trim();
    const digits = rawCedula.replace(/\D/g, "");

    if (digits.length < 4) {
      return NextResponse.json({ found: false, error: "Cédula muy corta" }, { status: 400 });
    }

    // 1) Buscar en Registro (Censo del sistema)
    const matchRegistro = await prisma.registro.findFirst({
      where: {
        OR: [
          { cedula: digits },
          { cedula: `V-${digits}` },
          { cedula: `E-${digits}` },
          { cedula: { contains: digits } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    if (matchRegistro) {
      return NextResponse.json({
        found: true,
        source: "censo",
        persona: {
          registroId: matchRegistro.id,
          cedula: digits,
          nombreApellido: matchRegistro.nombreApellido,
          telefono: matchRegistro.telefono || "",
          refugio: matchRegistro.refugio,
          parroquia: matchRegistro.parroquia,
          cuarto: matchRegistro.cuarto || "",
        },
      });
    }

    // 2) Buscar en Padron Electoral
    const matchPadron = await prisma.padron.findFirst({
      where: {
        cedula: digits,
      },
    });

    if (matchPadron) {
      return NextResponse.json({
        found: true,
        source: "padron",
        persona: {
          registroId: null,
          cedula: digits,
          nombreApellido: matchPadron.nombreCompleto,
          telefono: "",
          refugio: "",
          parroquia: matchPadron.parroquia || "",
          cuarto: "",
        },
      });
    }

    return NextResponse.json({ found: false });
  } catch (error: any) {
    console.error("Error en GET /api/planteamiento-sala/lookup:", error);
    return NextResponse.json({ error: "Error en búsqueda de persona" }, { status: 500 });
  }
}
