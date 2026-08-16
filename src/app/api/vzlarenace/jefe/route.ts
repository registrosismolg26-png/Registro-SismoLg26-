import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canEditRenace, isMaster } from "@/lib/auth";
import { refugioIdByName } from "@/lib/renaceScope";
import { normCedula, normFechaNacimiento } from "@/lib/renaceNormalize";

// PATCH — edita los datos de un JEFE (por `id`). SCOPED por refugio (un no-master solo
// edita su campamento). El `nro` NO se edita (identidad del Excel). Si cambia la CÉDULA
// (ancla del vínculo) → CASCADA: actualiza `jefeCedula` en todos sus miembros y en su
// planteamiento (secuencial, sin $transaction por el pooler de Supabase). Cédula → solo
// dígitos; fechaNacimiento → dd/mm/yyyy (fuente compartida `renaceNormalize`).
export async function PATCH(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canEditRenace(auth)) return NextResponse.json({ error: "Sin permiso para editar." }, { status: 403 });

    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Falta el id del jefe." }, { status: 400 });

    const jefe = await prisma.renaceJefe.findUnique({ where: { id } });
    if (!jefe) return NextResponse.json({ error: "Jefe no encontrado." }, { status: 404 });
    if (!isMaster(auth)) {
      const myRefugioId = await refugioIdByName(auth.refugio);
      if (!myRefugioId || myRefugioId !== jefe.refugioId) {
        return NextResponse.json({ error: "No puedes editar datos de otro campamento." }, { status: 403 });
      }
    }

    const up = (v: any) => { const s = String(v ?? "").trim().toUpperCase(); return s || null; };
    const intOrNull = (v: any) => { const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : null; };
    const normSexo = (v: any) => { const s = up(v); if (!s) return null; if (s[0] === "F") return "FEMENINO"; if (s[0] === "M") return "MASCULINO"; return s; };

    const nombres = up(body?.nombres);
    if (!nombres) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
    const nuevaCedula = normCedula(body?.cedula);
    if (!nuevaCedula) return NextResponse.json({ error: "La cédula del jefe es obligatoria." }, { status: 400 });
    if (nuevaCedula.length < 6 || nuevaCedula.length > 8) return NextResponse.json({ error: "La cédula debe tener entre 6 y 8 dígitos." }, { status: 400 });

    const cedulaCambia = nuevaCedula !== jefe.cedula;
    if (cedulaCambia) {
      const dup = await prisma.renaceJefe.findFirst({ where: { refugioId: jefe.refugioId, cedula: nuevaCedula, id: { not: jefe.id } } });
      if (dup) return NextResponse.json({ error: `Ya existe otro jefe con la cédula ${nuevaCedula} en este campamento.` }, { status: 409 });
    }

    const data = {
      cedula: nuevaCedula,
      nombres,
      fechaNacimiento: normFechaNacimiento(body?.fechaNacimiento),
      sexo: normSexo(body?.sexo),
      edad: intOrNull(body?.edad),
      telefono: up(body?.telefono),
      profesion: up(body?.profesion),
      estadoProcedencia: up(body?.estadoProcedencia),
      parroquiaProcedencia: up(body?.parroquiaProcedencia),
      tipoAfectacion: up(body?.tipoAfectacion),
      condicionVivienda: up(body?.condicionVivienda),
      numeroCertificado: up(body?.numeroCertificado),
      planteamientoAfectacion: up(body?.planteamientoAfectacion),
      incidencias: up(body?.incidencias),
    };

    // Cascada de la cédula (ancla) a miembros + planteamiento del núcleo (por `jefeNro`,
    // estable dentro del refugio). Secuencial (el pooler da P2028 con $transaction larga).
    if (cedulaCambia) {
      await prisma.renaceMiembro.updateMany({ where: { refugioId: jefe.refugioId, jefeNro: jefe.nro }, data: { jefeCedula: nuevaCedula } });
      await prisma.renacePlanteamiento.updateMany({ where: { refugioId: jefe.refugioId, jefeNro: jefe.nro }, data: { jefeCedula: nuevaCedula } });
    }
    const saved = await prisma.renaceJefe.update({ where: { id: jefe.id }, data });

    return NextResponse.json({ success: true, jefe: saved });
  } catch (error: any) {
    console.error("Error en PATCH /api/vzlarenace/jefe:", error);
    return NextResponse.json({ error: "Error al guardar el jefe", details: error?.message }, { status: 500 });
  }
}
