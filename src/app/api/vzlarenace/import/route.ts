import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canImportRenace } from "@/lib/auth";

// POST — importa jefes + miembros del Excel de VZLA RENACE. El cliente parsea el
// .xlsx y envía { jefes:[], miembros:[] }; aquí se NORMALIZA a MAYÚSCULA y se hace
// REEMPLAZO COMPLETO (el Excel es la fuente única). Los planteamientos (por jefeNro)
// NO se tocan → sobreviven a la re-importación. Solo Master/Admin.
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canImportRenace(auth)) {
      return NextResponse.json({ error: "Solo Master/Admin pueden importar." }, { status: 403 });
    }

    const body = await req.json();
    const rawJefes = Array.isArray(body?.jefes) ? body.jefes : [];
    const rawMiembros = Array.isArray(body?.miembros) ? body.miembros : [];

    const up = (v: any) => { const s = String(v ?? "").trim().toUpperCase(); return s || null; };
    const intOrNull = (v: any) => { const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : null; };
    const normSexo = (v: any) => { const s = up(v); if (!s) return null; if (s[0] === "F") return "FEMENINO"; if (s[0] === "M") return "MASCULINO"; return s; };

    const jefesData = rawJefes
      .map((r: any) => ({
        nro: intOrNull(r.nro),
        cantMiembros: intOrNull(r.cantMiembros),
        nombres: up(r.nombres) || "",
        cedula: up(r.cedula) || "",
        fechaNacimiento: up(r.fechaNacimiento),
        sexo: normSexo(r.sexo),
        edad: intOrNull(r.edad),
        telefono: up(r.telefono),
        profesion: up(r.profesion),
        estadoProcedencia: up(r.estadoProcedencia),
        parroquiaProcedencia: up(r.parroquiaProcedencia),
        tipoAfectacion: up(r.tipoAfectacion),
        condicionVivienda: up(r.condicionVivienda),
        incidencias: up(r.incidencias),
        numeroCertificado: up(r.numeroCertificado),
        planteamientoAfectacion: up(r.planteamientoAfectacion),
        observaciones: up(r.observaciones),
      }))
      .filter((j: any) => j.nro != null && j.nombres); // fila válida = nro + nombre

    const miembrosData = rawMiembros
      .map((r: any) => ({
        jefeNro: intOrNull(r.jefeNro),
        nombres: up(r.nombres) || "",
        cedula: up(r.cedula) || "",
        fechaNacimiento: up(r.fechaNacimiento),
        sexo: normSexo(r.sexo),
        edad: intOrNull(r.edad),
        parentesco: up(r.parentesco),
        telefono: up(r.telefono),
        profesion: up(r.profesion),
        estadoProcedencia: up(r.estadoProcedencia),
        parroquiaProcedencia: up(r.parroquiaProcedencia),
      }))
      .filter((m: any) => m.jefeNro != null && m.nombres);

    if (jefesData.length === 0) {
      return NextResponse.json({ error: "El archivo no trae jefes válidos (falta NRO o nombre)." }, { status: 400 });
    }

    // Reemplazo completo (borra y recrea). skipDuplicates cubre NRO repetidos en el Excel.
    await prisma.$transaction(
      [
        prisma.renaceMiembro.deleteMany({}),
        prisma.renaceJefe.deleteMany({}),
        prisma.renaceJefe.createMany({ data: jefesData, skipDuplicates: true }),
        prisma.renaceMiembro.createMany({ data: miembrosData }),
      ],
      { timeout: 60000 },
    );

    return NextResponse.json({ success: true, jefes: jefesData.length, miembros: miembrosData.length });
  } catch (error: any) {
    console.error("Error en POST /api/vzlarenace/import:", error);
    return NextResponse.json({ error: "Error al importar los datos", details: error?.message }, { status: 500 });
  }
}
