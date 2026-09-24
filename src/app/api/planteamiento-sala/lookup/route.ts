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
      const fn = matchRegistro.fechaNacimiento
        ? matchRegistro.fechaNacimiento.toISOString().slice(0, 10)
        : "";
      return NextResponse.json({
        found: true,
        source: "censo",
        persona: {
          registroId: matchRegistro.id,
          cedula: digits,
          nombreApellido: matchRegistro.nombreApellido,
          telefono: matchRegistro.telefono || "",
          genero: matchRegistro.genero || "",
          fechaNacimiento: fn,
          edad: matchRegistro.edad ?? null,
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
      const fn = matchPadron.fechaNacimiento
        ? matchPadron.fechaNacimiento.toISOString().slice(0, 10)
        : "";
      let edad: number | null = null;
      if (fn) {
        const d = new Date(fn + "T00:00:00");
        if (!isNaN(d.getTime())) {
          const t = new Date();
          let age = t.getFullYear() - d.getFullYear();
          const m = t.getMonth() - d.getMonth();
          if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
          if (age >= 0) edad = age;
        }
      }
      return NextResponse.json({
        found: true,
        source: "padron",
        persona: {
          registroId: null,
          cedula: digits,
          nombreApellido: matchPadron.nombreCompleto,
          telefono: "",
          genero: matchPadron.sexo === "M" || matchPadron.sexo === "MASCULINO" ? "MASCULINO" : "FEMENINO",
          fechaNacimiento: fn,
          edad,
          refugio: "",
          parroquia: matchPadron.parroquia || "",
          cuarto: "",
        },
      });
    }

    // 3) Fallback: Buscar en REP externo (api.cedula.com.ve)
    if (digits.length >= 5) {
      try {
        const API_BASE = "https://api.cedula.com.ve/api/v1";
        const DEFAULT_APP_ID = "9306";
        const DEFAULT_TOKEN = "089a0ac861dadfe75a4c7ce0af5f94b0";
        const appId = process.env.CEDULA_API_APP_ID || DEFAULT_APP_ID;
        const token = process.env.CEDULA_API_TOKEN || DEFAULT_TOKEN;

        const apiUrl = `${API_BASE}?app_id=${encodeURIComponent(appId)}&token=${encodeURIComponent(token)}&nacionalidad=V&cedula=${digits}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        let json: any = null;
        try {
          const res = await fetch(apiUrl, { signal: controller.signal, headers: { Accept: "application/json" } });
          json = await res.json().catch(() => null);
        } finally {
          clearTimeout(timer);
        }

        const data = json && json.error === false ? json.data : null;
        if (data) {
          const nombreApellido = [data.primer_nombre, data.segundo_nombre, data.primer_apellido, data.segundo_apellido]
            .map((s: any) => (s == null ? "" : String(s).trim()))
            .filter(Boolean)
            .join(" ");

          const sexoRaw = String(data.sexo ?? data.genero ?? "").trim().toUpperCase();
          const genero = sexoRaw.startsWith("F") ? "FEMENINO" : sexoRaw.startsWith("M") ? "MASCULINO" : "";
          const fn = String(data.fecha_nac ?? "").trim().slice(0, 10);
          let edad: number | null = null;
          if (fn) {
            const d = new Date(fn + "T00:00:00");
            if (!isNaN(d.getTime())) {
              const t = new Date();
              let age = t.getFullYear() - d.getFullYear();
              const m = t.getMonth() - d.getMonth();
              if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
              if (age >= 0) edad = age;
            }
          }

          if (nombreApellido) {
            return NextResponse.json({
              found: true,
              source: "rep",
              persona: {
                registroId: null,
                cedula: digits,
                nombreApellido,
                telefono: "",
                genero,
                fechaNacimiento: fn,
                edad,
                refugio: "",
                parroquia: "",
                cuarto: "",
              },
            });
          }
        }
      } catch (e) {
        console.warn("Error en fallback REP para PlanteamientoSala:", e);
      }
    }

    return NextResponse.json({ found: false });
  } catch (error: any) {
    console.error("Error en GET /api/planteamiento-sala/lookup:", error);
    return NextResponse.json({ error: "Error en búsqueda de persona" }, { status: 500 });
  }
}
