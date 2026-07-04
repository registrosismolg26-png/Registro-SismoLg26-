import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToAdmins } from "@/lib/push";
import { getAuthUser, canRegister, canActOnRefugio, isMaster, hasRefugio } from "@/lib/auth";
import { withAuditUser } from "@/lib/audit";

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
      patologiaIds,
      gpsLat,
      gpsLng,
      telefono,
      medicamentos,
      medicamentoIds,
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
    // - Master: respeta body.refugio; si no lo manda, usa el suyo.
    // - Resto: se fuerza a su propio refugio, ignorando el body.
    const bodyRefugio = refugio && String(refugio).trim() ? String(refugio).trim() : null;
    const refugioForCreate = isMaster(auth) ? (bodyRefugio ?? auth.refugio) : auth.refugio;

    // Guarda: no se puede registrar sin un refugio válido asociado.
    if (!hasRefugio(refugioForCreate)) {
      return NextResponse.json(
        { error: "Tu usuario no tiene un campamento asignado. Un administrador debe asociarte a un campamento antes de registrar." },
        { status: 403 }
      );
    }

    if (existing) {
      // Al actualizar un registro existente, verificar que el usuario pueda
      // actuar sobre el refugio ACTUAL del registro (no master → solo el suyo).
      if (!canActOnRefugio(auth, existing.refugio)) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    // Un re-envío de una CREACIÓN ('new') de un registro que YA existe NO debe tocarlo:
    // ya está creado; sobrescribirlo podría revertirlo a un estado viejo o pisar una
    // edición hecha en otro dispositivo. Solo las EDICIONES ('update') modifican.
    if (existing && body?._localType === "new") {
      return NextResponse.json({ success: true, id: existing.id, alreadyExists: true }, { status: 200 });
    }

    // Guard (back) de duplicado al EDITAR: si la cédula cambió y ya pertenece a OTRO
    // registro ACTIVO (no retirado), rechazar con mensaje claro. El índice @unique es
    // el backstop final (P2002 → 409); esto da un error legible.
    if (existing && normalizedCedula !== existing.cedula) {
      const dup = await prisma.registro.findUnique({
        where: { cedula: normalizedCedula },
        select: { id: true, nombreApellido: true, retirado: true },
      });
      if (dup && dup.id !== existing.id && dup.retirado !== "SI") {
        return NextResponse.json(
          { error: `La cédula ${normalizedCedula} ya pertenece a otro afectado registrado (${dup.nombreApellido}).`, code: "DUPLICATED" },
          { status: 409 }
        );
      }
    }

    if (existing) {
      const updated = await withAuditUser(auth.email, (tx) => tx.registro.update({
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
          patologiaIds: Array.isArray(patologiaIds) ? patologiaIds : [],
          gpsLat: gpsLat ? Number(gpsLat) : null,
          gpsLng: gpsLng ? Number(gpsLng) : null,
          telefono: telefono ? String(telefono).trim() : null,
          medicamentos: Array.isArray(medicamentos) ? medicamentos : [],
          medicamentoIds: Array.isArray(medicamentoIds) ? medicamentoIds : [],
          refugio: existing.refugio, // editar MANTIENE el refugio del afectado (no lo mueve)
          cuarto: body.cuarto || undefined,
          retirado: body.retirado || undefined,
          retiradoRazon: body.retiradoRazon || undefined,
          intermitente: intermitenteVal,
          motivoIntermitente: intermitenteVal === "SI" ? String(motivoIntermitente).trim() : null,
          syncedAt: new Date(),
        }
      }));
      return NextResponse.json({ success: true, id: updated.id, updated: true }, { status: 200 });
    }

    // Guard explícito de cédula duplicada (además del índice @unique): no crear un
    // nuevo censo si ya existe uno ACTIVO (no retirado) con esa cédula. Mensaje
    // claro para el operador; el @unique queda como backstop ante carreras.
    const dupExistente = await prisma.registro.findUnique({
      where: { cedula: normalizedCedula },
      select: { id: true, nombreApellido: true, retirado: true },
    });
    if (dupExistente && dupExistente.retirado !== "SI") {
      return NextResponse.json(
        { error: `Ya existe un registro activo con la cédula ${normalizedCedula} (${dupExistente.nombreApellido}).`, code: "DUPLICATED" },
        { status: 409 }
      );
    }

    const newRegistro = await withAuditUser(auth.email, (tx) => tx.registro.create({
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
        patologiaIds: Array.isArray(patologiaIds) ? patologiaIds : [],
        gpsLat: gpsLat ? Number(gpsLat) : null,
        gpsLng: gpsLng ? Number(gpsLng) : null,
        telefono: telefono ? String(telefono).trim() : null,
        medicamentos: Array.isArray(medicamentos) ? medicamentos : [],
        medicamentoIds: Array.isArray(medicamentoIds) ? medicamentoIds : [],
        refugio: refugioForCreate,
        cuarto: (body.cuarto && String(body.cuarto).trim()) || undefined,
        intermitente: intermitenteVal,
        motivoIntermitente: intermitenteVal === "SI" ? String(motivoIntermitente).trim() : null,
        syncedAt: new Date(),
      },
    }));

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
