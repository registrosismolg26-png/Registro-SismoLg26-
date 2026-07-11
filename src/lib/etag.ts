// ── Validadores ETag baratos para lecturas de lista (ahorro de egress) ──────
// Idea: antes de traer TODAS las filas de un refugio, calculamos un "sello" barato
// del estado de esa vista —  (nº de filas, última modificación) — y lo mandamos como
// ETag. Si el cliente reenvía el mismo sello en `If-None-Match` y no cambió nada, la
// ruta responde 304 (sin cuerpo) en vez de re-descargar toda la lista. El sello se
// calcula con un COUNT + MAX(fecha) (un par de escalares), no trae filas: por eso es
// barato aunque el censo/consultas crezcan.
//
// Correctitud del sello:
//   · registros → (count, max(syncedAt)). `syncedAt` se refresca en CADA mutación del
//     censo (create/update del registro, traslado, renombrar refugio/salón, evolución
//     clínica). Un DELETE cambia el count. Cualquier cambio ⇒ cambia el par ⇒ no hay
//     304 obsoleto.
//   · consultas → (count, max(updatedAt)). `updatedAt` NO está en el modelo Prisma; se
//     añade en Supabase (columna + trigger BEFORE UPDATE, ver prisma/etag_triggers.sql).
//     Por eso se consulta con SQL crudo y try/catch: si la columna aún no existe,
//     devuelve null → la ruta responde 200 normal (sin ETag), sin romper nada.

import { prisma } from "@/lib/prisma";

type Scope = { refugio?: string };

/** Sello (count, max(syncedAt)) del censo para el ámbito dado. null si falla (→ sin ETag). */
export async function registrosETag(scope: Scope): Promise<string | null> {
  try {
    const agg = await prisma.registro.aggregate({
      where: scope,
      _count: true,
      _max: { syncedAt: true },
    });
    const max = agg._max.syncedAt ? agg._max.syncedAt.getTime() : 0;
    return `"reg-${agg._count}-${max}"`;
  } catch {
    return null;
  }
}

/** Sello GLOBAL para el monitoreo de campamentos (Master ve todo): (count, max(syncedAt))
 *  del censo + count de salones. Cubre altas/bajas/ediciones del censo (syncedAt) y
 *  altas/bajas de salones. Barato (unos escalares). */
export async function monitoreoETag(): Promise<string | null> {
  try {
    const [reg, rooms] = await Promise.all([
      prisma.registro.aggregate({ _count: true, _max: { syncedAt: true } }),
      prisma.customRoom.count(),
    ]);
    const max = reg._max.syncedAt ? reg._max.syncedAt.getTime() : 0;
    return `"mon-${reg._count}-${max}-${rooms}"`;
  } catch {
    return null;
  }
}

/** Sello GLOBAL para el mapa de calor: (count, max(syncedAt)) de los registros CON
 *  GPS. Cambia al agregar/editar/borrar un registro con GPS; barato (unos escalares). */
export async function mapaCalorETag(): Promise<string | null> {
  try {
    const agg = await prisma.registro.aggregate({
      where: { gpsLat: { not: null }, gpsLng: { not: null } },
      _count: true,
      _max: { syncedAt: true },
    });
    const max = agg._max.syncedAt ? agg._max.syncedAt.getTime() : 0;
    return `"mapa-${agg._count}-${max}"`;
  } catch {
    return null;
  }
}

/** Sello (count, max(updatedAt)) de consultas para el ámbito dado. null si la columna
 *  `updatedAt` aún no está migrada (→ la ruta responde 200 normal, sin optimizar). */
export async function consultasETag(scope: Scope): Promise<string | null> {
  try {
    const rows = scope.refugio
      ? await prisma.$queryRaw<{ c: number; m: Date | null }[]>`SELECT COUNT(*)::int AS c, MAX("updatedAt") AS m FROM "ConsultaMedica" WHERE "refugio" = ${scope.refugio}`
      : await prisma.$queryRaw<{ c: number; m: Date | null }[]>`SELECT COUNT(*)::int AS c, MAX("updatedAt") AS m FROM "ConsultaMedica"`;
    const r = rows[0];
    if (!r) return null;
    const max = r.m ? new Date(r.m).getTime() : 0;
    return `"cons-${Number(r.c)}-${max}"`;
  } catch {
    return null;
  }
}
