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

// GET ?jefeNro=&refugioId= — planteamiento del núcleo (o null). Autenticado.
export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canUseRenace(auth)) return NextResponse.json({ error: "Sin acceso a VZLA Renace." }, { status: 403 });

    const url = new URL(req.url);
    const jefeNro = parseInt(url.searchParams.get("jefeNro") ?? "", 10);
    const refugioId = await targetRefugioId(auth, url.searchParams.get("refugioId") ?? "");
    if (!Number.isFinite(jefeNro) || !refugioId) return NextResponse.json({ planteamiento: null });

    const planteamiento = await prisma.renacePlanteamiento.findUnique({
      where: { jefeNro_refugioId: { jefeNro, refugioId } },
    });
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
    if (!Number.isFinite(jefeNro)) {
      return NextResponse.json({ error: "Falta el núcleo (jefeNro)." }, { status: 400 });
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

    // El núcleo debe existir EN ESE REFUGIO (evita planear en un campamento ajeno).
    const jefe = await prisma.renaceJefe.findUnique({ where: { nro_refugioId: { nro: jefeNro, refugioId } } });
    if (!jefe) return NextResponse.json({ error: "El núcleo no existe en ese campamento." }, { status: 404 });

    const up = (v: any) => { const s = String(v ?? "").trim().toUpperCase(); return s || null; };

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
    const data = {
      tipo,
      modalidadPlan: tipo === "PLAN_RENACE" ? up(body?.modalidadPlan) : null,
      precioOCanon: esCompraAlquiler ? precioOCanon : null,
      nombreContraparte: esCompraAlquiler ? up(body?.nombreContraparte) : null,
      cedulaContraparte: esCompraAlquiler ? up(body?.cedulaContraparte) : null,
      contacto: esCompraAlquiler ? up(body?.contacto) : null,
      contactoSecundario: esCompraAlquiler ? up(body?.contactoSecundario) : null,
      estado: esCompraAlquiler ? up(body?.estado) : null,
      municipio: esCompraAlquiler ? up(body?.municipio) : null,
      parroquia: esCompraAlquiler ? up(body?.parroquia) : null,
      direccionEspecifica: esCompraAlquiler ? up(body?.direccionEspecifica) : null,
      estadoPreferencia: tipo === "GMVV_INTERIOR" ? up(body?.estadoPreferencia) : null,
      observacion: up(body?.observacion), // SIEMPRE
    };

    const saved = await prisma.renacePlanteamiento.upsert({
      where: { jefeNro_refugioId: { jefeNro, refugioId } },
      create: { jefeNro, refugioId, ...data, createdBy: auth.email },
      update: data,
    });

    return NextResponse.json({ success: true, planteamiento: saved }, { status: 201 });
  } catch (error: any) {
    console.error("Error en POST /api/vzlarenace/planteamiento:", error);
    return NextResponse.json({ error: "Error al guardar el planteamiento", details: error?.message }, { status: 500 });
  }
}
