import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canManagePadron } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManagePadron(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const list = await req.json();

    if (!Array.isArray(list)) {
      return NextResponse.json({ error: "El cuerpo debe ser un arreglo de registros" }, { status: 400 });
    }

    console.log(`Recibiendo lote de carga de padrón de ${list.length} registros...`);

    const records = list.map((item: any) => {
      // Parse DD/MM/AAAA to standard Date object
      const rawDate = item.FECHA || item.fecha;
      let dateObj: Date;

      try {
        if (typeof rawDate === "string" && rawDate.includes("/")) {
          const [day, month, year] = rawDate.split("/");
          dateObj = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
        } else if (rawDate) {
          dateObj = new Date(rawDate);
        } else {
          dateObj = new Date("1900-01-01");
        }
      } catch (e) {
        dateObj = new Date("1900-01-01");
      }

      return {
        cedula: String(item.CEDULA || item.cedula).trim(),
        nacionalidad: String(item.NACIONALIDAD || item.nacionalidad || "V").trim().slice(0, 1),
        nombreCompleto: String(item["NOMBRE COMPLETO"] || item.nombreCompleto || "").toUpperCase().trim(),
        sexo: String(item.SEXO || item.sexo || "M").trim().slice(0, 1),
        fechaNacimiento: dateObj,
        parroquia: String(item.PARROQUIA || item.parroquia || "DESCONOCIDA").toUpperCase().trim()
      };
    });

    // Execute bulk insert, skipping duplicates
    const res = await prisma.padron.createMany({
      data: records,
      skipDuplicates: true
    });

    return NextResponse.json({
      success: true,
      inserted: res.count,
      message: `Lote procesado. Se insertaron ${res.count} registros nuevos.`
    });
  } catch (error: any) {
    console.error("Error en API /api/padron/upload-cne:", error);
    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 }
    );
  }
}
