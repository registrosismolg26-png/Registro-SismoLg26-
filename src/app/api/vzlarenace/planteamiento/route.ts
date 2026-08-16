import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isMaster, canUseRenace, type AuthUser } from "@/lib/auth";
import { refugioIdByName } from "@/lib/renaceScope";

// Refugio DESTINO del planteamiento: se usa el refugioId del NÚCLEO (que el cliente
// envía desde el jefe). Seguridad: un NO-master solo puede operar en SU refugio →
// se fuerza el suyo (se ignora el enviado); Master puede operar en el del núcleo.
async function targetRefugioId(auth: AuthUser, sent: string): Promise<string | null> {
  if (isMaster(auth)) return sent?.trim() || null;
  return await refugioIdByName(auth.refugio); // fuerza el refugio del usuario
}

// GET ?jefeNro=&refugioId= (o &jefeCedula=) — planteamiento del núcleo (o null). El ancla
// que MANDA es la cédula del jefe: se resuelve la cédula (por la enviada o por el NRO) y se
// busca el planteamiento por [jefeCedula, refugioId]. Autenticado.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canUseRenace(auth)) return NextResponse.json({ error: "Sin acceso a VZLA Renace." }, { status: 403 });

    const url = new URL(req.url);
    const jefeNro = parseInt(url.searchParams.get("jefeNro") ?? "", 10);
    const refugioId = await targetRefugioId(auth, url.searchParams.get("refugioId") ?? "");
    if (!refugioId) return NextResponse.json({ planteamiento: null });

    let jefeCedula = (url.searchParams.get("jefeCedula") ?? "").replace(/\D/g, "") || null;
    if (!jefeCedula && Number.isFinite(jefeNro)) {
      const jefe = await prisma.renaceJefe.findUnique({ where: { nro_refugioId: { nro: jefeNro, refugioId } } });
      jefeCedula = jefe?.cedula ?? null;
    }
    if (!jefeCedula) return NextResponse.json({ planteamiento: null });

    const planteamiento = await prisma.renacePlanteamiento.findFirst({ where: { refugioId, jefeCedula } });
    return NextResponse.json({ planteamiento: planteamiento ?? null });
  } catch (error: any) {
    console.error("Error en GET /api/vzlarenace/planteamiento:", error);
    return NextResponse.json({ error: "Error al cargar el planteamiento" }, { status: 500 });
  }
}

// POST — registra/actualiza el PLANTEAMIENTO (1 por núcleo, upsert por [jefeNro,
// refugioId]). Todo texto en MAYÚSCULA; solo se persisten los campos del `tipo`.
// ALQUILER: cánon ≤ 500 $ (formato venezolano ##.###,##).
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canUseRenace(auth)) return NextResponse.json({ error: "Sin acceso a VZLA Renace." }, { status: 403 });

    const body = await req.json();
    const jefeNro = parseInt(String(body?.jefeNro), 10);
    const jefeCedulaSent = String(body?.jefeCedula ?? "").replace(/\D/g, "") || null;
    if (!Number.isFinite(jefeNro) && !jefeCedulaSent) {
      return NextResponse.json({ error: "Falta el núcleo (jefeNro o jefeCedula)." }, { status: 400 });
    }

    const refugioId = await targetRefugioId(auth, String(body?.refugioId ?? ""));
    if (!refugioId) {
      return NextResponse.json({ error: "No se pudo determinar el campamento del núcleo." }, { status: 400 });
    }

    const tipo = String(body?.tipo ?? "").trim().toUpperCase();
    const TIPOS = ["COMPRA", "ALQUILER", "GMVV_INTERIOR", "PLAN_RENACE"];
    if (!TIPOS.includes(tipo)) {
      return NextResponse.json({ error: "Tipo de planteamiento inválido." }, { status: 400 });
    }

    // El núcleo debe existir EN ESE REFUGIO. Se busca por NRO (unívoco) y, si no aparece
    // (p. ej. un pendiente offline creado antes de un re-import que cambió el NRO), por la
    // cédula del jefe. La cédula del jefe hallado es la que MANDA como ancla.
    let jefe = Number.isFinite(jefeNro)
      ? await prisma.renaceJefe.findUnique({ where: { nro_refugioId: { nro: jefeNro, refugioId } } })
      : null;
    if (!jefe && jefeCedulaSent) {
      jefe = await prisma.renaceJefe.findFirst({ where: { refugioId, cedula: jefeCedulaSent } });
    }
    if (!jefe) return NextResponse.json({ error: "El núcleo no existe en ese campamento." }, { status: 404 });
    const jefeCedula = jefe.cedula;
    if (!jefeCedula) return NextResponse.json({ error: "El jefe del núcleo no tiene cédula registrada." }, { status: 400 });

    const up = (v: any) => { const s = String(v ?? "").trim().toUpperCase(); return s || null; };
    const ced = (v: any) => String(v ?? "").replace(/\D/g, "") || null; // cédula = solo dígitos

    // Cánon de alquiler acotado a 500 $. El monto llega en formato venezolano
    // ("52.000.055,55"): se quitan los puntos de miles y la coma decimal pasa a punto.
    const precioOCanon = up(body?.precioOCanon);
    if (tipo === "ALQUILER" && precioOCanon) {
      const monto = parseFloat(String(precioOCanon).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
      if (Number.isFinite(monto) && monto > 500) {
        return NextResponse.json({ error: "El cánon de alquiler no puede exceder 500 $." }, { status: 400 });
      }
    }

    const esCompraAlquiler = tipo === "COMPRA" || tipo === "ALQUILER";
    const cedContra = esCompraAlquiler ? ced(body?.cedulaContraparte) : null;
    if (cedContra && (cedContra.length < 6 || cedContra.length > 8)) {
      return NextResponse.json({ error: "La cédula de la contraparte debe tener entre 6 y 8 dígitos." }, { status: 400 });
    }
    const data = {
      tipo,
      modalidadPlan: tipo === "PLAN_RENACE" ? up(body?.modalidadPlan) : null,
      precioOCanon: esCompraAlquiler ? precioOCanon : null,
      nombreContraparte: esCompraAlquiler ? up(body?.nombreContraparte) : null,
      cedulaContraparte: cedContra,
      contacto: esCompraAlquiler ? up(body?.contacto) : null,
      contactoSecundario: esCompraAlquiler ? up(body?.contactoSecundario) : null,
      estado: esCompraAlquiler ? up(body?.estado) : null,
      municipio: esCompraAlquiler ? up(body?.municipio) : null,
      parroquia: esCompraAlquiler ? up(body?.parroquia) : null,
      direccionEspecifica: esCompraAlquiler ? up(body?.direccionEspecifica) : null,
      estadoPreferencia: tipo === "GMVV_INTERIOR" ? up(body?.estadoPreferencia) : null,
      observacion: up(body?.observacion), // SIEMPRE
    };

    // Ancla por CÉDULA del jefe (find-then-write; el `@@unique([jefeCedula, refugioId])`
    // protege la integridad). Se mantiene `jefeNro` sincronizado con el jefe actual.
    const existing = await prisma.renacePlanteamiento.findFirst({ where: { refugioId, jefeCedula } });
    const saved = existing
      ? await prisma.renacePlanteamiento.update({ where: { id: existing.id }, data: { jefeNro: jefe.nro, ...data } })
      : await prisma.renacePlanteamiento.create({ data: { jefeNro: jefe.nro, jefeCedula, refugioId, ...data, createdBy: auth.email } });

    return NextResponse.json({ success: true, planteamiento: saved }, { status: 201 });
  } catch (error: any) {
    console.error("Error en POST /api/vzlarenace/planteamiento:", error);
    return NextResponse.json({ error: "Error al guardar el planteamiento", details: error?.message }, { status: 500 });
  }
}
