import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// ── Auditoría: expone el correo del actor al trigger de BD ───────────────────
// El trigger `audit_row()` (ver prisma/audit_setup.sql) registra cada
// CREATE/UPDATE/DELETE de Registro y User en la tabla AuditLog. Para saber QUIÉN
// hizo el cambio, la app setea `app.user_email` (variable local a la transacción)
// y el trigger la lee. Sin esto, el trigger cae al rol de BD (db_role).
//
// Uso: envolver la escritura en esta función y operar con el `tx` que recibe.
//   await withAuditUser(auth.email, (tx) => tx.registro.update({ ... }));
export async function withAuditUser<T>(
  email: string | null | undefined,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    if (email) {
      // set_config(..., true) = solo dentro de esta transacción.
      await tx.$executeRaw`SELECT set_config('app.user_email', ${email}, true)`;
    }
    return fn(tx);
  });
}
