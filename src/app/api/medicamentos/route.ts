import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const MEDICAMENTOS_SEMILLA = [
  { nombre: "Acetaminofén", dosis: "500mg", periodo: "cada 8 horas", nota: "Analgésico y antipirético" },
  { nombre: "Ibuprofeno", dosis: "400mg", periodo: "cada 8 horas", nota: "Antiinflamatorio y analgésico" },
  { nombre: "Losartán Potásico", dosis: "50mg", periodo: "cada 24 horas (mañana)", nota: "Antihipertensivo" },
  { nombre: "Metformina", dosis: "500mg", periodo: "cada 12 horas", nota: "Hipoglucemiante oral" },
  { nombre: "Salbutamol Inhalador", dosis: "100mcg", periodo: "2 inhalaciones cada 6 horas", nota: "Broncodilatador" },
  { nombre: "Amoxicilina", dosis: "500mg", periodo: "cada 8 horas", nota: "Antibiótico de amplio espectro" },
  { nombre: "Omeprazol", dosis: "20mg", periodo: "cada 24 horas (ayunas)", nota: "Protector gástrico" },
  { nombre: "Loratadina", dosis: "10mg", periodo: "cada 24 horas (noche)", nota: "Antihistamínico" },
  { nombre: "Aspirina (Ácido Acetilsalicílico)", dosis: "81mg", periodo: "cada 24 horas", nota: "Antiagregante plaquetario" },
  { nombre: "Captopril", dosis: "25mg", periodo: "cada 12 horas", nota: "Antihipertensivo (IECA)" }
];

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let list = await prisma.medicamentoPredefinido.findMany({
      orderBy: { nombre: "asc" }
    });

    if (list.length === 0) {
      // Auto-sembrado
      await prisma.medicamentoPredefinido.createMany({
        data: MEDICAMENTOS_SEMILLA,
        skipDuplicates: true
      });
      list = await prisma.medicamentoPredefinido.findMany({
        orderBy: { nombre: "asc" }
      });
    }

    return NextResponse.json({ success: true, medicamentos: list });
  } catch (error: any) {
    console.error("Error en GET /api/medicamentos:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
