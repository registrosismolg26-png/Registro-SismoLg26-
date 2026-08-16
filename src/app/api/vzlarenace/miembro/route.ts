import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canEditRenace, isMaster } from "@/lib/auth";
import { refugioIdByName } from "@/lib/renaceScope";
import { normCedula, normFechaNacimiento } from "@/lib/renaceNormalize";

const up = (v: any) => { const s = String(v ?? "").trim().toUpperCase(); return s || null; };
const intOrNull = (v: any) => { const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : null; };
const normSexo = (v: any) => { const s = up(v); if (!s) return null; if (s[0] === "F") return "FEMENINO"; if (s[0] === "M") return "MASCULINO"; return s; };

// Campos editables/creables del miembro, normalizados. `nombres` obligatorio; cédula 6-8 si viene.
function buildMiembroData(body: any): { data: any } | { error: string } {
  const nombres = up(body?.nombres);
  if (!nombres) return { error: "El nombre es obligatorio." };
  const cedula = normCedula(body?.cedula);
  if (cedula && (cedula.length < 6 || cedula.length > 8)) return { error: "La cédula debe tener entre 6 y 8 dígitos." };
  return {
    data: {
      cedula,
      nombres,
      fechaNacimiento: normFechaNacimiento(body?.fechaNacimiento),
      sexo: normSexo(body?.sexo),
      edad: intOrNull(body?.edad),
      parentesco: up(body?.parentesco),
      telefono: up(body?.telefono),
      profesion: up(body?.profesion),
      estadoProcedencia: up(body?.estadoProcedencia),
      parroquiaProcedencia: up(body?.parroquiaProcedencia),
    },
  };
}

// PATCH — edita un MIEMBRO (por `id`). SCOPED por refugio. NO cambia a qué núcleo pertenece
// (`jefeNro`/`jefeCedula` quedan igual). La cédula PROPIA del miembro no es enlace → sin cascada.
export async function PATCH(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canEditRenace(auth)) return NextResponse.json({ error: "Sin permiso para editar." }, { status: 403 });

    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Falta el id del miembro." }, { status: 400 });

    const miembro = await prisma.renaceMiembro.findUnique({ where: { id } });
    if (!miembro) return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });
    if (!isMaster(auth)) {
      const myRefugioId = await refugioIdByName(auth.refugio);
      if (!myRefugioId || myRefugioId !== miembro.refugioId) {
        return NextResponse.json({ error: "No puedes editar datos de otro campamento." }, { status: 403 });
      }
    }

    const built = buildMiembroData(body);
    if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });
    const saved = await prisma.renaceMiembro.update({ where: { id: miembro.id }, data: built.data });
    return NextResponse.json({ success: true, miembro: saved });
  } catch (error: any) {
    console.error("Error en PATCH /api/vzlarenace/miembro:", error);
    return NextResponse.json({ error: "Error al guardar el miembro", details: error?.message }, { status: 500 });
  }
}

// POST — AGREGA un miembro nuevo a un núcleo. SCOPED por refugio (no-master → su refugio;
// master → el enviado). Se deriva `jefeCedula` del jefe destino (ancla de familia). Body:
// { jefeNro, refugioId?, ...campos del miembro }.
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canEditRenace(auth)) return NextResponse.json({ error: "Sin permiso para agregar miembros." }, { status: 403 });

    const body = await req.json();
    const jefeNro = parseInt(String(body?.jefeNro), 10);
    if (!Number.isFinite(jefeNro)) return NextResponse.json({ error: "Falta el núcleo (jefeNro)." }, { status: 400 });

    const refugioId = isMaster(auth)
      ? (String(body?.refugioId ?? "").trim() || null)
      : await refugioIdByName(auth.refugio);
    if (!refugioId) return NextResponse.json({ error: "No se pudo determinar el campamento." }, { status: 400 });

    const jefe = await prisma.renaceJefe.findUnique({ where: { nro_refugioId: { nro: jefeNro, refugioId } } });
    if (!jefe) return NextResponse.json({ error: "El núcleo no existe en ese campamento." }, { status: 404 });

    const built = buildMiembroData(body);
    if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

    const saved = await prisma.renaceMiembro.create({
      data: { refugioId, jefeNro: jefe.nro, jefeCedula: jefe.cedula, ...built.data },
    });
    return NextResponse.json({ success: true, miembro: saved }, { status: 201 });
  } catch (error: any) {
    console.error("Error en POST /api/vzlarenace/miembro:", error);
    return NextResponse.json({ error: "Error al agregar el miembro", details: error?.message }, { status: 500 });
  }
}

// DELETE ?id= — elimina un MIEMBRO. SOLO Master (normal); Master Renace/Admin/Registrador NO.
export async function DELETE(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isMaster(auth)) return NextResponse.json({ error: "Solo Master puede eliminar miembros." }, { status: 403 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta el id del miembro." }, { status: 400 });

    await prisma.renaceMiembro.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });
    console.error("Error en DELETE /api/vzlarenace/miembro:", error);
    return NextResponse.json({ error: "Error al eliminar el miembro" }, { status: 500 });
  }
}
