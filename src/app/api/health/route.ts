import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Diagnóstico (público, no expone datos): conexión, columnas, y consultas reales de
// Prisma. Con ?write=1 además prueba la RUTA DE ESCRITURA (transacción withAuditUser +
// trigger de auditoría) haciendo un update que se REVIERTE (rollback → no toca datos).
export async function GET(req: Request) {
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

  // 1) Conexión + columnas vía SQL crudo.
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
        columns[key] = present.has(key);
        if (!present.has(key)) missing.push(key);
      }
    }
    out.dbConnected = true;
    out.columns = columns;
    out.missingColumns = missing;
    if (missing.length) out.ok = false;
  } catch (e: any) {
    return NextResponse.json({ ok: false, dbConnected: false, code: e?.code, error: e?.message }, { status: 500 });
  }

  // 2) Consultas de LECTURA del cliente Prisma.
  out.queries = {};
  const tryQuery = async (name: string, fn: () => Promise<unknown>) => {
    try { await fn(); out.queries[name] = "ok"; }
    catch (e: any) { out.queries[name] = { code: e?.code, error: e?.message }; out.ok = false; }
  };
  await tryQuery("registro.findMany", () => prisma.registro.findMany({ take: 1 }));
  await tryQuery("consultaMedica.findMany", () => prisma.consultaMedica.findMany({ take: 1 }));
  await tryQuery("medicamentoPredefinido.findMany", () => prisma.medicamentoPredefinido.findMany({ take: 1 }));
  await tryQuery("patologia.findMany", () => prisma.patologia.findMany({ take: 1 }));

  // 3) Prueba de ESCRITURA (solo con ?write=1): transacción + set_config + update + trigger
  //    de auditoría, todo revertido con rollback (no persiste nada).
  if (new URL(req.url).searchParams.get("write") === "1") {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_email', 'diag@health', true)`;
        const r = await tx.registro.findFirst({ select: { id: true } });
        if (r) {
          // valor distinto → fuerza el diff del trigger de auditoría (ejercita todo el camino)
          await tx.registro.update({ where: { id: r.id }, data: { patologiaIds: ["__diag__"] } });
        }
        throw new Error("__ROLLBACK_DIAG__"); // deshace update + auditoría: no toca datos
      });
      out.writeTest = "ok"; // (no debería llegar: siempre lanza para revertir)
    } catch (e: any) {
      if (e?.message === "__ROLLBACK_DIAG__") {
        out.writeTest = "ok (transacción + auditoría funcionan; revertida)";
      } else {
        out.writeTest = { code: e?.code, error: e?.message };
        out.ok = false;
      }
    }
  }

  out.hint = out.ok
    ? "OK. Si el 500 persiste al ESCRIBIR, abre /api/health?write=1 para probar la escritura."
    : "Revisa 'missingColumns', 'queries' y 'writeTest' para ver qué falla y su error.";
  return NextResponse.json(out, { status: out.ok ? 200 : 500 });
}
