import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Diagnóstico de esquema: dice si la BD conectada (DATABASE_URL) tiene las columnas
// que el código nuevo necesita. Público a propósito (no expone datos, solo si existen
// columnas) para poder abrirlo directo en el navegador: /api/health
export async function GET() {
  const REQUIRED: Record<string, string[]> = {
    Registro: ["patologiaIds", "medicamentoIds"],
    ConsultaMedica: [
      "registroId",
      "antecedentesPatologiaIds",
      "diagnosticoPatologiaIds",
      "antecedentesMedicamentoIds",
      "diagnosticoMedicamentoIds",
    ],
    MedicamentoPredefinido: ["concentracion", "presentacion"],
  };

  try {
    const rows = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_name IN ('Registro', 'ConsultaMedica', 'MedicamentoPredefinido')
    `;
    const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));

    const columns: Record<string, boolean> = {};
    const missing: string[] = [];
    for (const [table, cols] of Object.entries(REQUIRED)) {
      for (const c of cols) {
        const key = `${table}.${c}`;
        const ok = present.has(key);
        columns[key] = ok;
        if (!ok) missing.push(key);
      }
    }

    return NextResponse.json({
      ok: missing.length === 0,
      dbConnected: true,
      missing,
      columns,
      hint: missing.length
        ? "Faltan columnas → corre prisma/fix_missing_columns.sql en ESTE proyecto de Supabase."
        : "Esquema al día.",
    });
  } catch (error: any) {
    // Si falla la conexión, aquí sale el error real (auth / host / DATABASE_URL).
    return NextResponse.json(
      { ok: false, dbConnected: false, code: error?.code, error: error?.message },
      { status: 500 }
    );
  }
}
