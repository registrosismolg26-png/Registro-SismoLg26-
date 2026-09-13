import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isMaster, canUseRenace, canEditRenace, type AuthUser } from "@/lib/auth";
import { refugioIdByName } from "@/lib/renaceScope";
import { withAuditUser } from "@/lib/audit";
import { normCedula } from "@/lib/renaceNormalize";
import { normalizeText, parseCedula, cedulaBaseDigits, composeRazonRetiro } from "@/lib/helpers";
import { Prisma } from "@prisma/client";

// ── VZLA RENACE — estado/ciclo de vida del núcleo (APROBADO/RETIRADO) ────────
// Ciclo: SIN PLAN → CON PLAN → APROBADO → RETIRADO.
// · aprobar/retirar = canEditRenace (Master/Admin/Registrador, scoped a su refugio).
// · revertir        = solo Master.
// Al RETIRAR se cruza CADA integrante (jefe + miembros) contra el censo por cédula, en
// UNA transacción todo-o-nada: si UNO no matchea, REBOTA nombrando a los que fallan.
// Los sin cédula se buscan por nombre + cédula del jefe y se les BACKFILLEA la cédula.

// Refugio DESTINO: no-master → su refugio (se ignora el enviado); Master → el del núcleo.
async function targetRefugioId(auth: AuthUser, sent: string): Promise<string | null> {
  if (isMaster(auth)) return sent?.trim() || null;
  return await refugioIdByName(auth.refugio);
}

// dd/mm/aaaa → Date (mediodía UTC para no cruzar el día por zona horaria). Inválida → null.
function parseFechaRetiro(s: string | null | undefined): Date | null {
  const m = String(s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900 || y > 2100) return null;
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
}

const up = (v: unknown) => { const s = String(v ?? "").trim().toUpperCase(); return s || null; };

// Símbolo por moneda para el detalle de la razón del censo.
const monedaSimbolo = (m: string | null | undefined) => (m === "USD" ? "$" : m === "VES" ? "Bs" : "");

// GET ?jefeNro=&jefeCedula=&refugioId= → el estado del núcleo (o null).
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canUseRenace(auth)) return NextResponse.json({ error: "Sin acceso a VZLA Renace." }, { status: 403 });

    const url = new URL(req.url);
    const jefeNro = parseInt(url.searchParams.get("jefeNro") ?? "", 10);
    const refugioId = await targetRefugioId(auth, url.searchParams.get("refugioId") ?? "");
    if (!refugioId) return NextResponse.json({ estado: null });

    let jefeCedula = normCedula(url.searchParams.get("jefeCedula") ?? "") || null;
    if (!jefeCedula && Number.isFinite(jefeNro)) {
      const jefe = await prisma.renaceJefe.findUnique({ where: { nro_refugioId: { nro: jefeNro, refugioId } } });
      jefeCedula = jefe?.cedula ? normCedula(jefe.cedula) : null;
    }
    if (!jefeCedula) return NextResponse.json({ estado: null });

    const estado = await prisma.renaceEstado.findFirst({ where: { refugioId, jefeCedula } });
    return NextResponse.json({ estado: estado ?? null });
  } catch (error: any) {
    console.error("Error en GET /api/vzlarenace/estado:", error);
    return NextResponse.json({ error: "Error al cargar el estado" }, { status: 500 });
  }
}

// POST { accion: "aprobar" | "retirar" | "revertir", jefeNro, jefeCedula, refugioId, ...retiro }
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canUseRenace(auth)) return NextResponse.json({ error: "Sin acceso a VZLA Renace." }, { status: 403 });

    const body = await req.json();
    const accion = String(body?.accion ?? "").trim().toLowerCase();
    if (!["aprobar", "retirar", "revertir"].includes(accion)) {
      return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
    }
    // Aprobar/Retirar = canEditRenace; Revertir = solo Master.
    if (accion === "revertir") {
      if (!isMaster(auth)) return NextResponse.json({ error: "Solo Master puede revertir." }, { status: 403 });
    } else if (!canEditRenace(auth)) {
      return NextResponse.json({ error: "Sin permiso para esta acción." }, { status: 403 });
    }

    const refugioId = await targetRefugioId(auth, String(body?.refugioId ?? ""));
    if (!refugioId) return NextResponse.json({ error: "No se pudo determinar el campamento." }, { status: 400 });

    // Resolver el jefe del núcleo (por NRO o por cédula) → ancla = su cédula (dígitos).
    const jefeNro = parseInt(String(body?.jefeNro), 10);
    const jefeCedulaSent = normCedula(body?.jefeCedula) || null;
    let jefe = Number.isFinite(jefeNro)
      ? await prisma.renaceJefe.findUnique({ where: { nro_refugioId: { nro: jefeNro, refugioId } } })
      : null;
    if (!jefe && jefeCedulaSent) jefe = await prisma.renaceJefe.findFirst({ where: { refugioId, cedula: jefeCedulaSent } });
    if (!jefe) return NextResponse.json({ error: "El núcleo no existe en ese campamento." }, { status: 404 });
    const jefeCedula = normCedula(jefe.cedula);
    if (!jefeCedula) return NextResponse.json({ error: "El jefe del núcleo no tiene cédula registrada." }, { status: 400 });

    const estadoActual = await prisma.renaceEstado.findFirst({ where: { refugioId, jefeCedula } });

    // ── APROBAR ───────────────────────────────────────────────────────────────
    if (accion === "aprobar") {
      if (estadoActual?.estado === "RETIRADO") {
        return NextResponse.json({ error: "El núcleo ya está retirado; revierte el retiro primero." }, { status: 409 });
      }
      const plan = await prisma.renacePlanteamiento.findFirst({ where: { refugioId, jefeCedula } });
      if (!plan) return NextResponse.json({ error: "El núcleo no tiene planteamiento; regístralo antes de aprobar." }, { status: 409 });

      const saved = estadoActual
        ? await prisma.renaceEstado.update({ where: { id: estadoActual.id }, data: { estado: "APROBADO", aprobadoPor: auth.email, aprobadoAt: new Date() } })
        : await prisma.renaceEstado.create({ data: { refugioId, jefeNro: jefe.nro, jefeCedula, estado: "APROBADO", aprobadoPor: auth.email, aprobadoAt: new Date() } });
      return NextResponse.json({ success: true, estado: saved }, { status: 200 });
    }

    // ── REVERTIR ────────────────────────────────────────────────────────────────
    if (accion === "revertir") {
      if (!estadoActual) return NextResponse.json({ error: "El núcleo no tiene un estado que revertir." }, { status: 409 });

      // Revertir una APROBACIÓN (sin retiro) = borrar la fila → vuelve a "con plan".
      if (estadoActual.estado === "APROBADO") {
        await prisma.renaceEstado.delete({ where: { id: estadoActual.id } });
        return NextResponse.json({ success: true, estado: null, reactivados: 0, conflictos: [] }, { status: 200 });
      }

      // Revertir un RETIRO = restaurar las fichas del censo a su foto anterior (best-effort,
      // reportando choques ≤1 activa) y dejar el núcleo de nuevo en APROBADO.
      const afectados = Array.isArray(estadoActual.censoAfectados) ? (estadoActual.censoAfectados as any[]) : [];
      const { reactivados, conflictos } = await withAuditUser(auth.email, async (tx) => {
        const conflictos: { nombre: string; refugio: string }[] = [];
        let reactivados = 0;
        for (const a of afectados) {
          const reg = await tx.registro.findUnique({ where: { id: a.id } });
          if (!reg) continue;
          const restaurarActivo = a.retirado !== "SI"; // antes del retiro estaba ACTIVO
          if (restaurarActivo) {
            // ¿la cédula ya está ACTIVA en otro campamento? (regla ≤1 activa) → saltar.
            const activoElsewhere = await tx.registro.findFirst({
              where: { cedula: reg.cedula, id: { not: reg.id }, retirado: { not: "SI" }, refugio: { not: reg.refugio } },
              select: { refugio: true },
            });
            if (activoElsewhere) { conflictos.push({ nombre: reg.nombreApellido, refugio: activoElsewhere.refugio }); continue; }
          }
          await tx.registro.update({
            where: { id: reg.id },
            data: {
              retirado: a.retirado ?? "NO",
              retiradoRazon: a.retiradoRazon ?? null,
              retiradoFecha: a.retiradoFecha ? new Date(a.retiradoFecha) : null,
            },
          });
          if (restaurarActivo) reactivados++;
        }
        await tx.renaceEstado.update({
          where: { id: estadoActual.id },
          data: {
            estado: "APROBADO",
            retiradoPor: null, retiradoAt: null, fechaRetiro: null, motivo: null,
            monto: null, moneda: null, destinoEstado: null, destinoMunicipio: null,
            destinoParroquia: null, destinoDireccion: null, observacion: null, censoAfectados: Prisma.DbNull,
          },
        });
        return { reactivados, conflictos };
      });
      return NextResponse.json({ success: true, reactivados, conflictos }, { status: 200 });
    }

    // ── RETIRAR ───────────────────────────────────────────────────────────────
    // Requiere estar APROBADO.
    if (estadoActual?.estado !== "APROBADO") {
      return NextResponse.json({ error: "Solo se puede retirar una familia APROBADA." }, { status: 409 });
    }

    // Nombre del refugio (el censo se scopea por NOMBRE de refugio, no por id).
    const refugio = await prisma.refugio.findUnique({ where: { id: refugioId }, select: { nombre: true } });
    if (!refugio) return NextResponse.json({ error: "Campamento no encontrado." }, { status: 404 });
    const refugioName = refugio.nombre;

    // Motivo (= RAZONES_RETIRO) + monto como detalle de la razón del censo.
    const motivo = up(body?.motivo);
    if (!motivo) return NextResponse.json({ error: "Indica el motivo del retiro." }, { status: 400 });
    const moneda = body?.moneda === "USD" ? "USD" : body?.moneda === "VES" ? "VES" : null;
    const monto = up(body?.monto);
    const fechaRetiroStr = String(body?.fechaRetiro ?? "").trim() || null;
    const fechaRetiroDate = parseFechaRetiro(fechaRetiroStr) ?? new Date();
    const montoDetalle = monto ? `${monedaSimbolo(moneda)} ${monto}`.trim() : "";
    const razonCenso = composeRazonRetiro(motivo, montoDetalle);

    // Integrantes del núcleo = jefe + miembros (ancla por cédula del jefe, respaldo NRO).
    const miembros = await prisma.renaceMiembro.findMany({
      where: { refugioId, OR: [{ jefeCedula }, { jefeNro: jefe.nro }] },
    });
    const familia = [
      { id: jefe.id, tipo: "jefe" as const, nombres: jefe.nombres, cedula: jefe.cedula },
      ...miembros.map((m) => ({ id: m.id, tipo: "miembro" as const, nombres: m.nombres, cedula: m.cedula })),
    ];

    // Fichas candidatas del censo: por cédula propia (con cédula) o por la familia del jefe.
    const jefeVar = [`V-${jefeCedula}`, `E-${jefeCedula}`];
    const cedulasConDigitos = familia.map((p) => normCedula(p.cedula)).filter(Boolean);
    const cedulaVars = cedulasConDigitos.flatMap((d) => [`V-${d}`, `E-${d}`]);
    const candidatos = await prisma.registro.findMany({
      where: {
        refugio: refugioName,
        OR: [
          { cedula: { in: cedulaVars } },
          { cedula: { in: jefeVar } },
          { cedulaJefeFamilia: { in: jefeVar } },
        ],
      },
      select: { id: true, nombreApellido: true, cedula: true, cedulaJefeFamilia: true, retirado: true, retiradoRazon: true, retiradoFecha: true },
    });

    // Cruce por integrante.
    const faltantes: string[] = [];
    const aRetirar: { id: string; retiradoPrev: string; razonPrev: string | null; fechaPrev: Date | null }[] = [];
    const backfills: { miembroId: string; cedula: string }[] = [];

    const nombreJefe = (c: { cedulaJefeFamilia: string | null }) => cedulaBaseDigits(c.cedulaJefeFamilia || "") === jefeCedula;
    for (const p of familia) {
      const parsed = parseCedula(p.cedula);
      let match: (typeof candidatos)[number] | undefined;

      if (parsed.isChild) {
        // Ya trae cédula de DEPENDIENTE (con sufijo -N): emparejar por cédula COMPLETA
        // (base + sufijo) o, de respaldo, por nombre + cédula del jefe.
        match = candidatos.find((c) => { const pc = parseCedula(c.cedula); return pc.isChild && pc.digits === parsed.digits && pc.depNum === parsed.depNum; })
          || candidatos.find((c) => normalizeText(c.nombreApellido) === normalizeText(p.nombres) && nombreJefe(c));
      } else if (parsed.digits) {
        // Cédula normal: contra una ficha NO dependiente del censo con la misma base.
        match = candidatos.find((c) => { const pc = parseCedula(c.cedula); return !pc.isChild && pc.digits === parsed.digits; });
      } else {
        // SIN cédula → nombre completo + cédula del jefe. Copia la cédula del censo a
        // RenaceMiembro en formato RENACE (SIN nacionalidad V/E), conservando el sufijo
        // -N del dependiente: "<dígitos>-<N>" (o "<dígitos>" si es normal).
        match = candidatos.find((c) => normalizeText(c.nombreApellido) === normalizeText(p.nombres) && nombreJefe(c));
        if (match && p.tipo === "miembro" && match.cedula) {
          const pc = parseCedula(match.cedula);
          const renaceCed = pc.isChild ? `${pc.digits}-${pc.depNum}` : pc.digits;
          if (renaceCed) backfills.push({ miembroId: p.id, cedula: renaceCed });
        }
      }

      if (!match) {
        const etiqueta = parsed.digits ? `C.I. ${parsed.digits}${parsed.isChild ? `-${parsed.depNum}` : ""}` : "sin cédula";
        faltantes.push(`${p.nombres} (${etiqueta})`);
        continue;
      }
      aRetirar.push({ id: match.id, retiradoPrev: match.retirado, razonPrev: match.retiradoRazon, fechaPrev: match.retiradoFecha });
    }

    // REBOTE: si UNO no matchea, no se toca nada.
    if (faltantes.length > 0) {
      return NextResponse.json(
        { error: "No se pudo retirar: hay integrantes sin ficha en el censo de este campamento.", faltantes, code: "SIN_MATCH" },
        { status: 422 },
      );
    }

    // Todo matchea → aplicar atómico: marcar/actualizar censo + escribir estado Renace.
    const saved = await withAuditUser(auth.email, async (tx) => {
      for (const b of backfills) {
        await tx.renaceMiembro.update({ where: { id: b.miembroId }, data: { cedula: b.cedula } });
      }
      for (const r of aRetirar) {
        await tx.registro.update({
          where: { id: r.id },
          data: { retirado: "SI", retiradoRazon: razonCenso, retiradoFecha: fechaRetiroDate },
        });
      }
      const censoAfectados = aRetirar.map((r) => ({
        id: r.id,
        retirado: r.retiradoPrev,
        retiradoRazon: r.razonPrev,
        retiradoFecha: r.fechaPrev ? r.fechaPrev.toISOString() : null,
      }));
      return tx.renaceEstado.update({
        where: { id: estadoActual.id },
        data: {
          estado: "RETIRADO", retiradoPor: auth.email, retiradoAt: new Date(),
          fechaRetiro: fechaRetiroStr, motivo, monto, moneda,
          destinoEstado: up(body?.destinoEstado), destinoMunicipio: up(body?.destinoMunicipio),
          destinoParroquia: up(body?.destinoParroquia), destinoDireccion: up(body?.destinoDireccion),
          observacion: up(body?.observacion), censoAfectados,
        },
      });
    });

    return NextResponse.json({ success: true, estado: saved, marcados: aRetirar.length, backfills: backfills.length }, { status: 200 });
  } catch (error: any) {
    console.error("Error en POST /api/vzlarenace/estado:", error);
    return NextResponse.json({ error: "Error al procesar el estado", details: error?.message }, { status: 500 });
  }
}
