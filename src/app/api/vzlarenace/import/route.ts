import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canImportRenace } from "@/lib/auth";
import { renaceWriteRefugio } from "@/lib/renaceScope";

// POST — importa jefes + miembros del Excel de VZLA RENACE AL CAMPAMENTO indicado
// (body.refugio). El cliente parsea el .xlsx y envía { refugio, jefes, miembros };
// aquí se NORMALIZA a MAYÚSCULA y se hace REEMPLAZO COMPLETO SOLO de ese refugio (el
// Excel es la fuente única de ese campamento). Los planteamientos NO se tocan → sobreviven.
// SOLO Master. El `nro` del Excel es único POR refugio.
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canImportRenace(auth)) {
      return NextResponse.json({ error: "Solo Master puede importar." }, { status: 403 });
    }

    const body = await req.json();
    const { refugioId } = await renaceWriteRefugio(auth, body?.refugio ?? null);
    if (!refugioId) {
      return NextResponse.json({ error: "Selecciona un campamento válido antes de importar." }, { status: 400 });
    }
    const rawJefes = Array.isArray(body?.jefes) ? body.jefes : [];
    const rawMiembros = Array.isArray(body?.miembros) ? body.miembros : [];

    const up = (v: any) => { const s = String(v ?? "").trim().toUpperCase(); return s || null; };
    const intOrNull = (v: any) => { const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : null; };
    const normSexo = (v: any) => { const s = up(v); if (!s) return null; if (s[0] === "F") return "FEMENINO"; if (s[0] === "M") return "MASCULINO"; return s; };

    const jefesData = rawJefes
      .map((r: any) => ({
        refugioId,
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
        refugioId,
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

    // Reemplazo completo, SIN transacción larga: el pooler de transacción de Supabase
    // (6543) a veces no puede ARRANCAR una transacción a tiempo bajo carga → P2028.
    // Cada statement usa/suelta su propia conexión del pool. El import es idempotente
    // (re-ejecutable), así que un fallo parcial se corrige re-importando. createMany
    // por lotes por si el dataset crece. skipDuplicates cubre NRO repetidos en el Excel.
    const CHUNK = 500;
    await prisma.renaceMiembro.deleteMany({ where: { refugioId } });
    await prisma.renaceJefe.deleteMany({ where: { refugioId } });
    for (let i = 0; i < jefesData.length; i += CHUNK) {
      await prisma.renaceJefe.createMany({ data: jefesData.slice(i, i + CHUNK), skipDuplicates: true });
    }
    for (let i = 0; i < miembrosData.length; i += CHUNK) {
      await prisma.renaceMiembro.createMany({ data: miembrosData.slice(i, i + CHUNK) });
    }

    return NextResponse.json({ success: true, jefes: jefesData.length, miembros: miembrosData.length });
  } catch (error: any) {
    console.error("Error en POST /api/vzlarenace/import:", error);
    return NextResponse.json({ error: "Error al importar los datos", details: error?.message }, { status: 500 });
  }
}
