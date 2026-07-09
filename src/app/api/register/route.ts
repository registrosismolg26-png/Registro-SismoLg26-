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
      embarazo,
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
    // Embarazo: "SI"/"NO". Si no viene, en UPDATE se deja como está; en CREATE usa "NO".
    const embarazoClean = VALID_SI_NO.includes(embarazo) ? embarazo : null;
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

    // Integridad al EDITAR — mantener la regla "≤1 fila ACTIVA por cédula".
    if (existing) {
      const finalRetirado = (typeof body.retirado === "string" && VALID_SI_NO.includes(body.retirado))
        ? body.retirado
        : existing.retirado;
      // (a) Si CAMBIA la cédula, no puede chocar con OTRA fila de esa cédula en el MISMO
      //     campamento (unicidad (cedula, refugio); el índice es el backstop P2002).
      if (normalizedCedula !== existing.cedula) {
        const sameRef = await prisma.registro.findFirst({
          where: { cedula: normalizedCedula, refugio: existing.refugio, id: { not: existing.id } },
          select: { nombreApellido: true },
        });
        if (sameRef) {
          return NextResponse.json(
            { error: `La cédula ${normalizedCedula} ya pertenece a otro afectado registrado (${sameRef.nombreApellido}) en este campamento.`, code: "DUPLICATED" },
            { status: 409 }
          );
        }
      }
      // (b) Si esta fila queda ACTIVA, NO puede haber otra fila ACTIVA con la misma cédula
      //     en NINGÚN campamento. Cubre el caso de REACTIVAR (retirado→NO) a alguien que
      //     está activo en otro campamento: se bloquea y se le indica dónde está.
      if (finalRetirado !== "SI") {
        const activo = await prisma.registro.findFirst({
          where: { cedula: normalizedCedula, id: { not: existing.id }, retirado: { not: "SI" }, refugio: { not: existing.refugio } },
          select: { nombreApellido: true, refugio: true },
        });
        if (activo) {
          return NextResponse.json(
            { error: `No se puede dejar este registro activo: ${activo.nombreApellido} (cédula ${normalizedCedula}) ya está ACTIVO en el campamento "${activo.refugio}". Retíralo allá primero.`, code: "ACTIVE_ELSEWHERE", refugio: activo.refugio },
            { status: 409 }
          );
        }
      }
    }

    // Motivo/fecha de retiro coherentes: solo persisten si retirado = "SI"; si pasa a
    // "NO" (o cualquier otro valor) se BORRAN. Si el body no trae `retirado`, no se tocan.
    let retiradoRazonSave: string | null | undefined;
    let retiradoFechaSave: Date | null | undefined;
    if (body.retirado === "SI") {
      retiradoRazonSave = (typeof body.retiradoRazon === "string" && body.retiradoRazon.trim()) ? body.retiradoRazon.trim() : null;
      retiradoFechaSave = existing?.retiradoFecha ?? new Date();
    } else if (body.retirado) {
      retiradoRazonSave = null;
      retiradoFechaSave = null;
    } else {
      retiradoRazonSave = body.retiradoRazon || undefined;
      retiradoFechaSave = undefined;
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
          embarazo: embarazoClean ?? undefined, // undefined = no cambiar el valor existente
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
          retiradoRazon: retiradoRazonSave,
          retiradoFecha: retiradoFechaSave,
          intermitente: intermitenteVal,
          motivoIntermitente: intermitenteVal === "SI" ? String(motivoIntermitente).trim() : null,
          syncedAt: new Date(),
        }
      }));
      return NextResponse.json({ success: true, id: updated.id, updated: true }, { status: 200 });
    }

    // (1) ¿Ya hay una fila para esta cédula EN ESTE campamento? (única por cedula+refugio)
    const sameRef = await prisma.registro.findUnique({
      where: { cedula_refugio: { cedula: normalizedCedula, refugio: refugioForCreate } },
      select: { id: true, nombreApellido: true, retirado: true },
    });
    if (sameRef) {
      if (sameRef.retirado !== "SI") {
        return NextResponse.json(
          { error: `Ya existe un registro activo con la cédula ${normalizedCedula} (${sameRef.nombreApellido}) en este campamento.`, code: "DUPLICATED", refugio: refugioForCreate },
          { status: 409 }
        );
      }
      // Retirada en ESTE campamento → la persona regresó. Se reactiva desde Registros
      // (editar el registro existente), no se crea una nueva fila.
      return NextResponse.json(
        { error: `Esta persona ya estuvo registrada en este campamento y figura como RETIRADA (${sameRef.nombreApellido}). Reactívala desde Registros en vez de crear una nueva.`, code: "RETIRED_HERE", id: sameRef.id, refugio: refugioForCreate },
        { status: 409 }
      );
    }

    // (2) Crear en ESTE campamento. Si la persona está ACTIVA en OTRO(S) campamento(s),
    // se trata como un TRASLADO AUTOMÁTICO: en la MISMA transacción se retira allá
    // (retirado=SI, razón "Trasladado al campamento <destino>") y se crea aquí. Así la
    // persona cuenta como retirada en el origen y como nueva/activa en el destino, sin
    // quedar activa en dos lugares a la vez.
    const { nuevo, transferredFrom } = await withAuditUser(auth.email, async (tx) => {
      const activasEnOtros = await tx.registro.findMany({
        where: { cedula: normalizedCedula, refugio: { not: refugioForCreate }, retirado: { not: "SI" } },
        select: { refugio: true },
      });
      const origenes = [...new Set(activasEnOtros.map((r) => r.refugio))];
      if (origenes.length) {
        await tx.registro.updateMany({
          where: { cedula: normalizedCedula, refugio: { not: refugioForCreate }, retirado: { not: "SI" } },
          // syncedAt: marca de "última modificación" para el validador ETag del censo
          // (así el refugio de ORIGEN detecta el retiro por traslado y no sirve un 304 obsoleto).
          data: { retirado: "SI", retiradoRazon: `Trasladado al campamento ${refugioForCreate}`, retiradoFecha: new Date(), syncedAt: new Date() },
        });
      }
      const nuevo = await tx.registro.create({
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
          embarazo: embarazoClean ?? "NO",
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
          // Un registro nuevo puede nacer ya retirado (p. ej. "Se retira a Hogar
          // Solidario" desde el censo). Reusa la misma normalización que el update.
          retirado: body.retirado || undefined,
          retiradoRazon: retiradoRazonSave,
          retiradoFecha: retiradoFechaSave,
          intermitente: intermitenteVal,
          motivoIntermitente: intermitenteVal === "SI" ? String(motivoIntermitente).trim() : null,
          syncedAt: new Date(),
        },
      });
      return { nuevo, transferredFrom: origenes };
    });

    // Notify admins
    await sendPushToAdmins(nuevo).catch((err) => {
      console.error("Error triggering push notifications to admins:", err);
    });

    return NextResponse.json({ success: true, id: nuevo.id, transferredFrom }, { status: 201 });
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
