import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// POST — registra/actualiza el PLANTEAMIENTO de un núcleo (1 por jefe, upsert por
// jefeNro). Todo texto en MAYÚSCULA; solo se persisten los campos pertinentes al
// `tipo` elegido (las ramas no elegidas se guardan en null). ALQUILER: cánon ≤ 500 $.
// `createdBy` = email del operador (solo al crear). Cualquier autenticado.
export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json();
    const jefeNro = parseInt(String(body?.jefeNro), 10);
    if (!Number.isFinite(jefeNro)) {
      return NextResponse.json({ error: "Falta el núcleo (jefeNro)." }, { status: 400 });
    }

    const tipo = String(body?.tipo ?? "").trim().toUpperCase();
    const TIPOS = ["COMPRA", "ALQUILER", "GMVV_INTERIOR", "PLAN_RENACE"];
    if (!TIPOS.includes(tipo)) {
      return NextResponse.json({ error: "Tipo de planteamiento inválido." }, { status: 400 });
    }

    // El núcleo debe existir (evita planteamientos huérfanos).
    const jefe = await prisma.renaceJefe.findUnique({ where: { nro: jefeNro } });
    if (!jefe) return NextResponse.json({ error: "El núcleo no existe." }, { status: 404 });

    const up = (v: any) => { const s = String(v ?? "").trim().toUpperCase(); return s || null; };

    // Cánon de alquiler acotado a 500 $ (regla del dueño).
    const precioOCanon = up(body?.precioOCanon);
    if (tipo === "ALQUILER" && precioOCanon) {
      const monto = parseFloat(String(precioOCanon).replace(/[^\d.]/g, ""));
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
      where: { jefeNro },
      create: { jefeNro, ...data, createdBy: auth.email },
      update: data,
    });

    return NextResponse.json({ success: true, planteamiento: saved }, { status: 201 });
  } catch (error: any) {
    console.error("Error en POST /api/vzlarenace/planteamiento:", error);
    return NextResponse.json({ error: "Error al guardar el planteamiento", details: error?.message }, { status: 500 });
  }
}
