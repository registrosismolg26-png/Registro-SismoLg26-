import { NextResponse } from "next/server";

// A small sample dataset simulating local voters/citizens database of the parishes.
// In a production disaster recovery server, we can query a local SQLite database file containing 
// the region's official CNE electoral registry for instant offline-speed lookup without external internet.
const MOCK_CITIZENS_DB: Record<string, { nombre: string; genero: string; fechaNacimiento: string; edad: number }> = {
  "12345678": {
    nombre: "MARIA ALEJANDRA PEREZ GOMEZ",
    genero: "FEMENINO",
    fechaNacimiento: "1980-05-15",
    edad: 46
  },
  "20111222": {
    nombre: "JUAN CARLOS RODRIGUEZ URDANETA",
    genero: "MASCULINO",
    fechaNacimiento: "1992-11-23",
    edad: 33
  },
  "25333444": {
    nombre: "YUSMEIRY DEL CARMEN RONDON",
    genero: "FEMENINO",
    fechaNacimiento: "1996-08-04",
    edad: 29
  },
  "18222999": {
    nombre: "FRANKLIN JOSE TOVAR DIAZ",
    genero: "MASCULINO",
    fechaNacimiento: "1988-02-14",
    edad: 38
  },
  "30555666": {
    nombre: "SANTIAGO ALEJANDRO MARCANO",
    genero: "MASCULINO",
    fechaNacimiento: "2004-09-12",
    edad: 21
  }
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cedula = body.cedula?.replace(/\D/g, ""); // Extract only numbers

    if (!cedula) {
      return NextResponse.json({ error: "Cédula requerida" }, { status: 400 });
    }

    // Simulate 200ms latency of a fast local lookup database
    await new Promise(resolve => setTimeout(resolve, 200));

    const citizen = MOCK_CITIZENS_DB[cedula];

    if (citizen) {
      return NextResponse.json({
        found: true,
        nombre: citizen.nombre,
        genero: citizen.genero,
        fechaNacimiento: citizen.fechaNacimiento,
        edad: citizen.edad
      });
    } else {
      return NextResponse.json({
        found: false,
        message: "No encontrado en el padrón local. Ingrese los datos manualmente."
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error en la consulta local", details: error.message },
      { status: 500 }
    );
  }
}
