import { prisma } from "@/lib/prisma";

export async function POST() {
  const encoder = new TextEncoder();

  // Obtener el total antes de iniciar el stream para que el cliente pueda
  // verificar que recibió todos los registros y reintentar si faltan.
  const total = await prisma.padron.count();

  // Stream records as NDJSON in server-side batches of 500.
  // The client writes each batch to IndexedDB as it arrives, so even on a
  // 2G connection the padrón builds up progressively instead of waiting
  // for the entire payload to download before anything is persisted.
  const readable = new ReadableStream({
    async start(controller) {
      try {
        let skip = 0;
        const BATCH = 500;

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
            skip,
            take: BATCH,
            orderBy: { cedula: "asc" },
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

          skip += batch.length;
          if (batch.length < BATCH) break;
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      // Total de registros para que el cliente verifique integridad
      "X-Padron-Total": String(total),
      "Access-Control-Expose-Headers": "X-Padron-Total",
    },
  });
}
