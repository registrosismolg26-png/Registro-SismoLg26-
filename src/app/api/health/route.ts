import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Diagnóstico completo (público a propósito, no expone datos): dice si la BD conectada
// (DATABASE_URL) tiene las columnas nuevas Y si las consultas reales de Prisma funcionan.
// Abrir /api/health en el navegador reproduce el 500 y muestra el error exacto.
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

  const out: any = { ok: true };

  // 1) Conexión + columnas vía SQL crudo (no depende del cliente Prisma).
  try {
    const rows = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_name IN ('Registro', 'ConsultaMedica', 'MedicamentoPredefinido')
    `;
    const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    const columns: Record<string, boolean> = {};
    const missing: string[] = [];
    for (const [t, cols] of Object.entries(REQUIRED)) {
      for (const c of cols) {
        const key = `${t}.${c}`;
        const ok = present.has(key);
        columns[key] = ok;
        if (!ok) missing.push(key);
      }
    }
    out.dbConnected = true;
    out.columns = columns;
    out.missingColumns = missing;
    if (missing.length) out.ok = false;
  } catch (e: any) {
    // Falla la conexión → aquí sale el error real (auth/host/DATABASE_URL).
    return NextResponse.json({ ok: false, dbConnected: false, code: e?.code, error: e?.message }, { status: 500 });
  }

  // 2) Consultas REALES del cliente Prisma (reproducen el 500 de la app).
  out.queries = {};
  const tryQuery = async (name: string, fn: () => Promise<unknown>) => {
    try { await fn(); out.queries[name] = "ok"; }
    catch (e: any) { out.queries[name] = { code: e?.code, error: e?.message }; out.ok = false; }
  };
  await tryQuery("registro.findMany", () => prisma.registro.findMany({ take: 1 }));
  await tryQuery("consultaMedica.findMany", () => prisma.consultaMedica.findMany({ take: 1 }));
  await tryQuery("medicamentoPredefinido.findMany", () => prisma.medicamentoPredefinido.findMany({ take: 1 }));
  await tryQuery("patologia.findMany", () => prisma.patologia.findMany({ take: 1 }));

  out.hint = out.ok
    ? "Todo OK: conexión, columnas y consultas del cliente Prisma funcionan."
    : "Mira 'missingColumns' y 'queries' para ver qué falla y su error de Prisma.";
  return NextResponse.json(out, { status: out.ok ? 200 : 500 });
}
