import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function POST(req: Request) {
  // Descargar el padrón a local lo puede hacer CUALQUIER operador autenticado:
  // el Registrador lo necesita para el autocompletado de cédulas offline al censar.
  // (Subir/reemplazar el padrón CNE sí queda restringido — ver upload-cne.)
  const auth = await getAuthUser(req);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const encoder = new TextEncoder();

  // Obtener el total antes de iniciar el stream para que el cliente pueda
  // verificar que recibió todos los registros y reintentar si faltan.
  const total = await prisma.padron.count();

  // Stream NDJSON paginando con KEYSET (cursor sobre `cedula`) en lotes — evita el O(n²)
  // del skip/take en offsets profundos para 335k filas. El cliente escribe cada lote a
  // IndexedDB conforme llega (progresivo incluso en 2G).
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const BATCH = 1000;
        // Keyset: arranca en "" (todas las cédulas son > "") y avanza por la última leída.
        let lastCedula = "";

        while (true) {
          const batch = await prisma.padron.findMany({
            select: {
              cedula: true,
              nacionalidad: true,
              nombreCompleto: true,
              sexo: true,
              fechaNacimiento: true,
              parroquia: true,
            },
            take: BATCH,
            orderBy: { cedula: "asc" },
            where: { cedula: { gt: lastCedula } },
          });

          if (batch.length === 0) break;

          for (const c of batch) {
            const line =
              JSON.stringify([
                c.cedula,
                c.nacionalidad,
                c.nombreCompleto,
                c.sexo,
                c.fechaNacimiento.toISOString().slice(0, 10),
                c.parroquia,
              ]) + "\n";
            controller.enqueue(encoder.encode(line));
          }

          lastCedula = batch[batch.length - 1].cedula;
          if (batch.length < BATCH) break;
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  // Comprime la respuesta con gzip: el navegador la descomprime SOLO por el header
  // Content-Encoding → el cliente no cambia y sigue leyendo NDJSON. Fallback sin comprimir
  // si el runtime no expone CompressionStream.
  const headers: Record<string, string> = {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Padron-Total": String(total),
    "Access-Control-Expose-Headers": "X-Padron-Total",
  };
  let body: ReadableStream<Uint8Array> = readable;
  try {
    if (typeof CompressionStream !== "undefined") {
      body = readable.pipeThrough(new CompressionStream("gzip") as any);
      headers["Content-Encoding"] = "gzip";
    }
  } catch { /* runtime sin CompressionStream → se envía sin comprimir */ }

  return new Response(body, { headers });
}
