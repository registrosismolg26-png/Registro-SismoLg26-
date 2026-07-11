// ── Mapa de calor del censo (agregado por rejilla) ──────────────────────────
// Toma el GPS guardado en el censo (Registro.gpsLat/gpsLng) y lo agrega a una
// REJILLA (~3 decimales ≈ 110 m): 1 fila por celda con su densidad. NO trae puntos
// crudos → egress mínimo y las coordenadas EXACTAS de cada persona nunca salen al
// cliente (solo densidades). Master-only. Descarta null-island (0,0) y fuera de rango.

import { prisma } from "@/lib/prisma";

export interface HeatCell { lat: number; lng: number; peso: number; }

export async function computeMapaCalor(): Promise<{ celdas: HeatCell[]; total: number }> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number; peso: number }[]>`
    SELECT ROUND("gpsLat"::numeric, 3)::float8 AS lat,
           ROUND("gpsLng"::numeric, 3)::float8 AS lng,
           COUNT(*)::int AS peso
    FROM "Registro"
    WHERE "gpsLat" IS NOT NULL AND "gpsLng" IS NOT NULL
      AND "gpsLat" BETWEEN -90 AND 90 AND "gpsLng" BETWEEN -180 AND 180
      AND NOT ("gpsLat" = 0 AND "gpsLng" = 0)
    GROUP BY 1, 2
  `;
  const celdas = rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lng), peso: Number(r.peso) }));
  const total = celdas.reduce((s, c) => s + c.peso, 0);
  return { celdas, total };
}
