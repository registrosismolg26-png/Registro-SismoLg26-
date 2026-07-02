import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToAdmins } from "@/lib/push";
import { getAuthUser, canRegister, canActOnRefugio, isMaster } from "@/lib/auth";

const VALID_GENERO = ["MASCULINO", "FEMENINO"];
const VALID_ESTADO_FISICO = ["ILESO", "LESIONADO"];
const VALID_SI_NO = ["SI", "NO"];

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!canRegister(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();

    const {
      id,
      parroquia,
      sector,
      comunidad,
      direccionExacta,
      nombreApellido,
      cedula,
      jefeFamilia,
      genero,
      fechaNacimiento,
      edad,
      perteneceNucleo,
      cedulaJefeFamilia,
      estadoFisico,
      patologia,
      patologiaDescripcion,
      gpsLat,
      gpsLng,
      telefono,
      medicamentos,
      refugio,
      intermitente,
      motivoIntermitente,
    } = body;

    // Required field presence check
    if (
      !parroquia || !sector || !comunidad || !direccionExacta ||
      !nombreApellido || !cedula || !jefeFamilia || !genero ||
      !fechaNacimiento || !perteneceNucleo ||
      !estadoFisico || !patologia
    ) {
      return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
    }

    // Enum validation
    if (!VALID_GENERO.includes(genero)) {
      return NextResponse.json({ error: "Género inválido" }, { status: 400 });
    }
    if (!VALID_ESTADO_FISICO.includes(estadoFisico)) {
      return NextResponse.json({ error: "Estado físico inválido" }, { status: 400 });
    }
    if (!VALID_SI_NO.includes(jefeFamilia)) {
      return NextResponse.json({ error: "Valor de jefeFamilia inválido" }, { status: 400 });
    }
    if (!VALID_SI_NO.includes(perteneceNucleo)) {
      return NextResponse.json({ error: "Valor de perteneceNucleo inválido" }, { status: 400 });
    }
    if (!VALID_SI_NO.includes(patologia)) {
      return NextResponse.json({ error: "Valor de patología inválido" }, { status: 400 });
    }

    // Validar campo intermitente
    const intermitenteVal = intermitente && VALID_SI_NO.includes(intermitente) ? intermitente : "NO";
    if (intermitenteVal === "SI" && (!motivoIntermitente || String(motivoIntermitente).trim() === "")) {
      return NextResponse.json({ error: "El motivo es obligatorio cuando el residente es intermitente" }, { status: 400 });
    }

    // Date validation
    const fechaObj = new Date(fechaNacimiento);
    if (isNaN(fechaObj.getTime())) {
      return NextResponse.json({ error: "Fecha de nacimiento inválida" }, { status: 400 });
    }
    const now = new Date();
    if (fechaObj > now) {
      return NextResponse.json({ error: "La fecha de nacimiento no puede ser futura" }, { status: 400 });
    }

    // Calculate age if not provided
    let edadNum = Number(edad);
    if (edad === undefined || edad === null) {
      let age = now.getFullYear() - fechaObj.getFullYear();
      const m = now.getMonth() - fechaObj.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < fechaObj.getDate())) {
        age--;
      }
      edadNum = age >= 0 ? age : 0;
    }

    // Age sanity check
    if (!Number.isInteger(edadNum) || edadNum < 0 || edadNum > 120) {
      return NextResponse.json({ error: "Edad fuera de rango válido" }, { status: 400 });
    }

    // Normalize Cédulas (V- / E-)
    const cleanCedula = String(cedula).trim().toUpperCase();
    const normalizedCedula = (cleanCedula.startsWith("V-") || cleanCedula.startsWith("E-"))
      ? cleanCedula
      : `V-${cleanCedula}`;

    const cleanJefeCedula = cedulaJefeFamilia ? String(cedulaJefeFamilia).trim().toUpperCase() : null;
    const normalizedJefeCedula = cleanJefeCedula
      ? ((cleanJefeCedula.startsWith("V-") || cleanJefeCedula.startsWith("E-")) ? cleanJefeCedula : `V-${cleanJefeCedula}`)
      : null;

    // Check if record already exists by ID (for offline updates)
    let existing = null;
    if (id) {
      existing = await prisma.registro.findUnique({ where: { id } });
    }

    // Refugio efectivo: el servidor nunca confía en el body.
    // - Master: respeta body.refugio (o el default al crear).
    // - Resto: se fuerza a su propio refugio, ignorando el body.
    const refugioForCreate = isMaster(auth)
      ? (refugio ? String(refugio).trim() : "Complejo Educativo República de Panamá")
      : auth.refugio;

    if (existing) {
      // Al actualizar un registro existente, verificar que el usuario pueda
      // actuar sobre el refugio ACTUAL del registro (no master → solo el suyo).
      if (!canActOnRefugio(auth, existing.refugio)) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    if (existing) {
      const updated = await prisma.registro.update({
        where: { id },
        data: {
          parroquia,
          sector,
          comunidad,
          direccionExacta,
          nombreApellido: nombreApellido.toUpperCase().trim(),
          cedula: normalizedCedula,
          jefeFamilia,
          genero,
          fechaNacimiento: fechaObj,
          edad: edadNum,
          perteneceNucleo,
          cedulaJefeFamilia: normalizedJefeCedula,
          estadoFisico,
          patologia,
          patologiaDescripcion: patologiaDescripcion || null,
          gpsLat: gpsLat ? Number(gpsLat) : null,
          gpsLng: gpsLng ? Number(gpsLng) : null,
          telefono: telefono ? String(telefono).trim() : null,
          medicamentos: Array.isArray(medicamentos) ? medicamentos : [],
          refugio: isMaster(auth) ? refugioForCreate : auth.refugio,
          cuarto: body.cuarto || undefined,
          retirado: body.retirado || undefined,
          retiradoRazon: body.retiradoRazon || undefined,
          intermitente: intermitenteVal,
          motivoIntermitente: intermitenteVal === "SI" ? String(motivoIntermitente).trim() : null,
          syncedAt: new Date(),
        }
      });
      return NextResponse.json({ success: true, id: updated.id, updated: true }, { status: 200 });
    }

    const newRegistro = await prisma.registro.create({
      data: {
        id: id || undefined,
        parroquia,
        sector,
        comunidad,
        direccionExacta,
        nombreApellido: nombreApellido.toUpperCase().trim(),
        cedula: normalizedCedula,
        jefeFamilia,
        genero,
        fechaNacimiento: fechaObj,
        edad: edadNum,
        perteneceNucleo,
        cedulaJefeFamilia: normalizedJefeCedula,
        estadoFisico,
        patologia,
        patologiaDescripcion: patologiaDescripcion || null,
        gpsLat: gpsLat ? Number(gpsLat) : null,
        gpsLng: gpsLng ? Number(gpsLng) : null,
        telefono: telefono ? String(telefono).trim() : null,
        medicamentos: Array.isArray(medicamentos) ? medicamentos : [],
        refugio: refugioForCreate,
        intermitente: intermitenteVal,
        motivoIntermitente: intermitenteVal === "SI" ? String(motivoIntermitente).trim() : null,
        syncedAt: new Date(),
      },
    });

    // Notify admins
    await sendPushToAdmins(newRegistro).catch((err) => {
      console.error("Error triggering push notifications to admins:", err);
    });

    return NextResponse.json({ success: true, id: newRegistro.id }, { status: 201 });
  } catch (error: any) {
    console.error("Error en API /api/register:", error);

    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Registro ya existe", code: "DUPLICATED" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 }
    );
  }
}
