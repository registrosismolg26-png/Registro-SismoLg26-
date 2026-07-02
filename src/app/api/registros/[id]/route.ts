import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canRegister, canDeleteRegistro, canActOnRefugio } from "@/lib/auth";

const VALID_GENERO = ["MASCULINO", "FEMENINO"];
const VALID_ESTADO_FISICO = ["ILESO", "LESIONADO"];
const VALID_SI_NO = ["SI", "NO"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!canRegister(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;

    // Cargar el registro y verificar pertenencia al refugio del usuario.
    const registro = await prisma.registro.findUnique({ where: { id } });
    if (!registro) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }
    if (!canActOnRefugio(auth, registro.refugio)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();

    const {
      cedula,
      cuarto,
      nombreApellido,
      parroquia,
      sector,
      comunidad,
      direccionExacta,
      genero,
      estadoFisico,
      patologia,
      patologiaDescripcion,
      telefono,
      retirado,
      retiradoRazon,
      fechaNacimiento,
      jefeFamilia,
      perteneceNucleo,
      cedulaJefeFamilia,
      intermitente,
      motivoIntermitente,
    } = body;

    // Build update payload — only include fields present in the request body
    const data: Record<string, any> = {};

    if ("cedula" in body) {
      if (!cedula || !String(cedula).trim()) {
        return NextResponse.json({ error: "La cédula no puede estar vacía" }, { status: 400 });
      }
      const cleanCed = String(cedula).trim().toUpperCase();
      const normalizedCedula = (cleanCed.startsWith("V-") || cleanCed.startsWith("E-"))
        ? cleanCed
        : `V-${cleanCed}`;
      data.cedula = normalizedCedula;
    }
    if ("cuarto" in body) {
      data.cuarto = cuarto ? String(cuarto).trim() : null;
    }
    if ("nombreApellido" in body) {
      if (!nombreApellido?.trim()) {
        return NextResponse.json({ error: "Nombre no puede estar vacío" }, { status: 400 });
      }
      data.nombreApellido = String(nombreApellido).trim();
    }
    if ("parroquia" in body) data.parroquia = String(parroquia).trim();
    if ("sector" in body) data.sector = String(sector).trim();
    if ("comunidad" in body) data.comunidad = String(comunidad).trim();
    if ("direccionExacta" in body) data.direccionExacta = String(direccionExacta).trim();

    if ("genero" in body) {
      if (!VALID_GENERO.includes(genero)) {
        return NextResponse.json({ error: "Género inválido" }, { status: 400 });
      }
      data.genero = genero;
    }
    if ("estadoFisico" in body) {
      if (!VALID_ESTADO_FISICO.includes(estadoFisico)) {
        return NextResponse.json({ error: "Estado físico inválido" }, { status: 400 });
      }
      data.estadoFisico = estadoFisico;
    }
    if ("patologia" in body) {
      if (!VALID_SI_NO.includes(patologia)) {
        return NextResponse.json({ error: "Valor de patología inválido" }, { status: 400 });
      }
      data.patologia = patologia;
    }
    if ("patologiaDescripcion" in body) {
      data.patologiaDescripcion = patologiaDescripcion ? String(patologiaDescripcion).trim() : null;
    }
    if ("telefono" in body) {
      data.telefono = telefono ? String(telefono).trim() : null;
    }
    if ("retirado" in body) {
      if (!VALID_SI_NO.includes(retirado)) {
        return NextResponse.json({ error: "Valor de retirado inválido" }, { status: 400 });
      }
      data.retirado = retirado;
      if (retirado === "SI") {
        data.retiradoFecha = new Date();
      } else {
        data.retiradoFecha = null;
        data.retiradoRazon = null;
      }
    }
    if ("retiradoRazon" in body) {
      data.retiradoRazon = retiradoRazon ? String(retiradoRazon).trim() : null;
    }
    if ("fechaNacimiento" in body) {
      if (!fechaNacimiento) {
        return NextResponse.json({ error: "La fecha de nacimiento no puede estar vacía" }, { status: 400 });
      }
      const date = new Date(fechaNacimiento);
      if (isNaN(date.getTime())) {
        return NextResponse.json({ error: "Fecha de nacimiento inválida" }, { status: 400 });
      }
      data.fechaNacimiento = date;
      
      // Calculate age
      const today = new Date();
      let age = today.getFullYear() - date.getFullYear();
      const m = today.getMonth() - date.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < date.getDate())) {
        age--;
      }
      data.edad = age >= 0 ? age : 0;
    }
    if ("jefeFamilia" in body) {
      if (!VALID_SI_NO.includes(jefeFamilia)) {
        return NextResponse.json({ error: "Valor de jefeFamilia inválido" }, { status: 400 });
      }
      data.jefeFamilia = jefeFamilia;
    }
    if ("perteneceNucleo" in body) {
      if (!VALID_SI_NO.includes(perteneceNucleo)) {
        return NextResponse.json({ error: "Valor de perteneceNucleo inválido" }, { status: 400 });
      }
      data.perteneceNucleo = perteneceNucleo;
    }
    if ("cedulaJefeFamilia" in body) {
      const cleanJefeCedula = cedulaJefeFamilia ? String(cedulaJefeFamilia).trim().toUpperCase() : null;
      const normalizedJefeCedula = cleanJefeCedula
        ? ((cleanJefeCedula.startsWith("V-") || cleanJefeCedula.startsWith("E-")) ? cleanJefeCedula : `V-${cleanJefeCedula}`)
        : null;
      data.cedulaJefeFamilia = normalizedJefeCedula;
    }
    if ("medicamentos" in body) {
      data.medicamentos = Array.isArray(body.medicamentos) ? body.medicamentos : [];
    }

    // Intermitente y motivo
    if ("intermitente" in body) {
      if (!VALID_SI_NO.includes(intermitente)) {
        return NextResponse.json({ error: "Valor de intermitente inválido" }, { status: 400 });
      }
      if (intermitente === "SI" && (!motivoIntermitente || String(motivoIntermitente).trim() === "")) {
        return NextResponse.json({ error: "El motivo es obligatorio cuando el residente es intermitente" }, { status: 400 });
      }
      data.intermitente = intermitente;
      data.motivoIntermitente = intermitente === "SI" ? String(motivoIntermitente).trim() : null;
    } else if ("motivoIntermitente" in body) {
      // Allow updating just the motivo without changing intermitente state
      data.motivoIntermitente = motivoIntermitente ? String(motivoIntermitente).trim() : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    const updated = await prisma.registro.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, registro: updated });
  } catch (error: any) {
    console.error("Error en PATCH /api/registros/[id]:", error);
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "La cédula ingresada ya pertenece a otra persona registrada." },
        { status: 409 }
      );
    }
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!canDeleteRegistro(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;

    // Cargar el registro y verificar pertenencia al refugio del usuario.
    const registro = await prisma.registro.findUnique({ where: { id } });
    if (!registro) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }
    if (!canActOnRefugio(auth, registro.refugio)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const deleted = await prisma.registro.delete({
      where: { id },
    });
    return NextResponse.json({ success: true, registro: deleted });
  } catch (error: any) {
    console.error("Error en DELETE /api/registros/[id]:", error);
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
