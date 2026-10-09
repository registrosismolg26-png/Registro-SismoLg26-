import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canViewComedor } from "@/lib/auth";
import { cedulaFamilia } from "@/lib/helpers";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canViewComedor(auth)) {
      return NextResponse.json({ error: "No autorizado. Solo Master y Master Comedor tienen acceso al módulo Comedor." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "beneficiarios";
    const refugio = searchParams.get("refugio")?.trim() || "";
    const fecha = searchParams.get("fecha")?.trim() || "";
    const servicio = searchParams.get("servicio")?.trim() || "";

    // ── 1. BENEFICIARIOS (Jefes de Familia y Personas Solas activos en el campamento) ──
    if (type === "beneficiarios") {
      const whereClause: any = {
        retirado: { not: "SI" },
      };
      if (refugio && refugio !== "TODOS") {
        whereClause.refugio = refugio;
      }

      // Obtener todos los registros activos del campamento (solo columnas necesarias para máxima velocidad)
      const registros = await prisma.registro.findMany({
        where: whereClause,
        select: {
          id: true,
          cedula: true,
          nombreApellido: true,
          telefono: true,
          refugio: true,
          cuarto: true,
          jefeFamilia: true,
          perteneceNucleo: true,
          cedulaJefeFamilia: true,
          edad: true,
          genero: true,
          createdAt: true,
        },
        orderBy: [{ jefeFamilia: "desc" }, { createdAt: "asc" }],
      });

      // Agrupar por núcleo familiar usando cedulaFamilia
      // La clave de familia es: cédula base del jefe si es jefe, o cedulaJefeFamilia, o su propia cédula
      const groups = new Map<string, any[]>();
      registros.forEach((r) => {
        const k = cedulaFamilia(r.jefeFamilia === "SI" ? r.cedula : r.cedulaJefeFamilia || r.cedula) || r.id;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r);
      });

      const beneficiarios: any[] = [];

      groups.forEach((members, _famKey) => {
        // Encontrar el jefe del grupo familiar
        const jefe = members.find((m) => m.jefeFamilia === "SI");
        if (jefe) {
          // El jefe representa a toda su familia
          const carga = members.length;
          beneficiarios.push({
            id: jefe.id,
            cedula: jefe.cedula,
            nombreApellido: jefe.nombreApellido,
            telefono: jefe.telefono || null,
            refugio: jefe.refugio,
            cuarto: jefe.cuarto || null,
            tipoBeneficiario: carga === 1 ? "SOLO" : "JEFE",
            raciones: carga,
            integrantes: members.map((m) => ({
              id: m.id,
              cedula: m.cedula,
              nombreApellido: m.nombreApellido,
              edad: m.edad,
              genero: m.genero,
              parentesco: m.id === jefe.id ? "Jefe de Familia" : (m.perteneceNucleo === "SI" ? "Integrante de Núcleo" : "Familiar"),
            })),
          });
        } else {
          // Si no hay ninguno explícito como jefe, cada uno es persona sola o el primero asume
          if (members.length === 1) {
            const p = members[0];
            beneficiarios.push({
              id: p.id,
              cedula: p.cedula,
              nombreApellido: p.nombreApellido,
              telefono: p.telefono || null,
              refugio: p.refugio,
              cuarto: p.cuarto || null,
              tipoBeneficiario: "SOLO",
              raciones: 1,
              integrantes: [{
                id: p.id,
                cedula: p.cedula,
                nombreApellido: p.nombreApellido,
                edad: p.edad,
                genero: p.genero,
                parentesco: "Persona Sola",
              }],
            });
          } else {
            // Núcleo sin marca de jefe: el más adulto o primero encabeza
            const sorted = members.slice().sort((a, b) => (b.edad || 0) - (a.edad || 0));
            const head = sorted[0];
            beneficiarios.push({
              id: head.id,
              cedula: head.cedula,
              nombreApellido: head.nombreApellido,
              telefono: head.telefono || null,
              refugio: head.refugio,
              cuarto: head.cuarto || null,
              tipoBeneficiario: "JEFE",
              raciones: members.length,
              integrantes: members.map((m) => ({
                id: m.id,
                cedula: m.cedula,
                nombreApellido: m.nombreApellido,
                edad: m.edad,
                genero: m.genero,
                parentesco: m.id === head.id ? "Responsable" : "Integrante",
              })),
            });
          }
        }
      });

      // Incorporar beneficiarios creados exclusivamente en el módulo Comedor (sin alterar Registro)
      try {
        const whereManual: any = {};
        if (refugio && refugio !== "TODOS") {
          whereManual.refugio = refugio;
        }
        const manuales = await prisma.comedorBeneficiario.findMany({
          where: whereManual,
          orderBy: { createdAt: "desc" },
        });

        manuales.forEach((m) => {
          let parsedIntegrantes: any[] = [];
          try {
            if (m.integrantes) parsedIntegrantes = JSON.parse(m.integrantes);
          } catch {}
          if (!Array.isArray(parsedIntegrantes) || parsedIntegrantes.length === 0) {
            parsedIntegrantes = [
              {
                id: m.id,
                cedula: m.cedula,
                nombreApellido: m.nombreApellido,
                parentesco: m.tipoBeneficiario === "SOLO" ? "Persona Sola" : "Jefe de Familia",
              },
            ];
          }

          beneficiarios.push({
            id: m.id,
            cedula: m.cedula,
            nombreApellido: m.nombreApellido,
            telefono: m.telefono || null,
            refugio: m.refugio,
            cuarto: null,
            tipoBeneficiario: m.tipoBeneficiario as any,
            raciones: m.raciones,
            integrantes: parsedIntegrantes,
            origen: "COMEDOR",
            isManual: true,
            observacion: m.observacion || null,
            createdAt: m.createdAt,
          });
        });
      } catch (errManual) {
        console.error("Error al obtener beneficiarios manuales de comedor:", errManual);
      }

      // Ordenar alfabéticamente por nombre
      beneficiarios.sort((a, b) => a.nombreApellido.localeCompare(b.nombreApellido));

      return NextResponse.json({ success: true, beneficiarios });
    }

    // ── 2. ENTREGAS (Registro de personas que retiraron comida por día y servicio) ──
    if (type === "entregas") {
      const whereClause: any = {};
      if (refugio && refugio !== "TODOS") {
        whereClause.refugio = refugio;
      }
      if (fecha) {
        whereClause.fecha = fecha;
      }
      if (servicio && ["DESAYUNO", "ALMUERZO", "CENA"].includes(servicio.toUpperCase())) {
        whereClause.servicio = servicio.toUpperCase();
      }

      const entregas = await prisma.comedorRegistro.findMany({
        where: whereClause,
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      });

      // Totales calculados
      let totalRaciones = 0;
      let totalAtendidos = entregas.length;
      let desayunoRaciones = 0;
      let almuerzoRaciones = 0;
      let cenaRaciones = 0;
      let desayunoAtendidos = 0;
      let almuerzoAtendidos = 0;
      let cenaAtendidos = 0;

      entregas.forEach((e) => {
        const r = e.raciones || 1;
        totalRaciones += r;
        if (e.servicio === "DESAYUNO") {
          desayunoRaciones += r;
          desayunoAtendidos++;
        } else if (e.servicio === "ALMUERZO") {
          almuerzoRaciones += r;
          almuerzoAtendidos++;
        } else if (e.servicio === "CENA") {
          cenaRaciones += r;
          cenaAtendidos++;
        }
      });

      return NextResponse.json({
        success: true,
        entregas,
        totales: {
          totalRaciones,
          totalAtendidos,
          desayunoRaciones,
          almuerzoRaciones,
          cenaRaciones,
          desayunoAtendidos,
          almuerzoAtendidos,
          cenaAtendidos,
        },
      });
    }

    // ── 3. ESTADÍSTICAS Y GRÁFICAS (Agrupación por día y servicio) ──────────────
    if (type === "stats") {
      const desde = searchParams.get("desde")?.trim() || "";
      const hasta = searchParams.get("hasta")?.trim() || "";

      const whereClause: any = {};
      if (refugio && refugio !== "TODOS") {
        whereClause.refugio = refugio;
      }
      if (desde && hasta) {
        whereClause.fecha = { gte: desde, lte: hasta };
      } else if (desde) {
        whereClause.fecha = { gte: desde };
      } else if (hasta) {
        whereClause.fecha = { lte: hasta };
      }

      const entregas = await prisma.comedorRegistro.findMany({
        where: whereClause,
        orderBy: { fecha: "asc" },
      });

      const mapDias = new Map<string, { fecha: string; desayuno: number; almuerzo: number; cena: number; total: number; beneficiarios: number }>();
      let totalRaciones = 0;
      let totalAtendidos = entregas.length;
      let desayunoRaciones = 0;
      let almuerzoRaciones = 0;
      let cenaRaciones = 0;
      let desayunoAtendidos = 0;
      let almuerzoAtendidos = 0;
      let cenaAtendidos = 0;

      entregas.forEach((e) => {
        const r = e.raciones || 1;
        totalRaciones += r;
        if (e.servicio === "DESAYUNO") {
          desayunoRaciones += r;
          desayunoAtendidos++;
        } else if (e.servicio === "ALMUERZO") {
          almuerzoRaciones += r;
          almuerzoAtendidos++;
        } else if (e.servicio === "CENA") {
          cenaRaciones += r;
          cenaAtendidos++;
        }

        if (!mapDias.has(e.fecha)) {
          mapDias.set(e.fecha, { fecha: e.fecha, desayuno: 0, almuerzo: 0, cena: 0, total: 0, beneficiarios: 0 });
        }
        const item = mapDias.get(e.fecha)!;
        item.total += r;
        item.beneficiarios++;
        if (e.servicio === "DESAYUNO") item.desayuno += r;
        else if (e.servicio === "ALMUERZO") item.almuerzo += r;
        else if (e.servicio === "CENA") item.cena += r;
      });

      const porDia = Array.from(mapDias.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));

      return NextResponse.json({
        success: true,
        stats: {
          totalRaciones,
          totalAtendidos,
          desayunoRaciones,
          almuerzoRaciones,
          cenaRaciones,
          desayunoAtendidos,
          almuerzoAtendidos,
          cenaAtendidos,
          porDia,
        },
      });
    }

    return NextResponse.json({ error: "Tipo de consulta no válido" }, { status: 400 });
  } catch (error: any) {
    console.error("Error en GET /api/comedor:", error);
    return NextResponse.json({ error: "Error interno al obtener datos del comedor", details: error?.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canViewComedor(auth)) {
      return NextResponse.json({ error: "No autorizado. Solo Master y Master Comedor pueden registrar entregas de comedor." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "entrega";

    // ── ACCIÓN: LOOKUP POR QR / CÉDULA ──────────────────────────────────────────
    if (action === "lookup") {
      const qrInput = String(body.qrInput || body.cedula || "").trim();
      const refugio = body.refugio?.trim() || "";
      const fecha = body.fecha?.trim() || "";
      const servicio = (body.servicio || "ALMUERZO").toUpperCase();

      if (!qrInput) {
        return NextResponse.json({ error: "Debe ingresar una cédula o escanear un código QR válido." }, { status: 400 });
      }

      // El QR puede venir como "COMEDOR|V-12345678|Campamento|4" o "V-12345678" o "12345678"
      let cleanCedula = qrInput;
      if (qrInput.startsWith("COMEDOR|")) {
        const parts = qrInput.split("|");
        cleanCedula = parts[1] || qrInput;
      }
      const rawDigits = cleanCedula.replace(/\D/g, "");

      if (rawDigits.length < 5) {
        return NextResponse.json({ error: "Cédula o formato de QR inválido." }, { status: 400 });
      }

      // 1. Primero verificar si coincide con un beneficiario creado exclusivamente en Comedor
      try {
        const whereManual: any = {};
        if (refugio && refugio !== "TODOS") {
          whereManual.refugio = refugio;
        }
        const manualRecords = await prisma.comedorBeneficiario.findMany({
          where: whereManual,
        });
        const manualMatch = manualRecords.find((m) => {
          const cDigits = (m.cedula || "").replace(/\D/g, "");
          return cDigits === rawDigits;
        });

        if (manualMatch) {
          let parsedIntegrantes: any[] = [];
          try {
            if (manualMatch.integrantes) parsedIntegrantes = JSON.parse(manualMatch.integrantes);
          } catch {}
          if (!Array.isArray(parsedIntegrantes) || parsedIntegrantes.length === 0) {
            parsedIntegrantes = [
              {
                id: manualMatch.id,
                cedula: manualMatch.cedula,
                nombreApellido: manualMatch.nombreApellido,
                parentesco: manualMatch.tipoBeneficiario === "SOLO" ? "Persona Sola" : "Jefe de Familia",
              },
            ];
          }

          let yaRetiro = false;
          let entregaExistente: any = null;
          if (fecha && servicio) {
            entregaExistente = await prisma.comedorRegistro.findUnique({
              where: {
                cedula_fecha_servicio_refugio: {
                  cedula: manualMatch.cedula,
                  fecha,
                  servicio,
                  refugio: manualMatch.refugio,
                },
              },
            });
            if (entregaExistente) yaRetiro = true;
          }

          return NextResponse.json({
            success: true,
            encontrado: true,
            beneficiario: {
              id: manualMatch.id,
              cedula: manualMatch.cedula,
              nombreApellido: manualMatch.nombreApellido,
              telefono: manualMatch.telefono,
              refugio: manualMatch.refugio,
              cuarto: null,
              tipoBeneficiario: manualMatch.tipoBeneficiario,
              raciones: manualMatch.raciones,
              integrantes: parsedIntegrantes,
              origen: "COMEDOR",
              isManual: true,
              observacion: manualMatch.observacion,
            },
            yaRetiro,
            entregaExistente,
          });
        }
      } catch (errManual) {
        console.error("Error al buscar en ComedorBeneficiario:", errManual);
      }

      // 2. Si no es manual de Comedor, buscar en los registros censados de la BD
      const whereClause: any = {
        retirado: { not: "SI" },
      };
      if (refugio && refugio !== "TODOS") {
        whereClause.refugio = refugio;
      }

      const matchingRecords = await prisma.registro.findMany({
        where: whereClause,
      });

      // Localizar a la persona por su cédula exacta o por dígitos base
      const personMatch = matchingRecords.find((r) => {
        const cDigits = (r.cedula || "").replace(/\D/g, "");
        return cDigits === rawDigits;
      });

      if (!personMatch) {
        return NextResponse.json({
          error: `No se encontró a ningún beneficiario con la cédula "${cleanCedula}" en el campamento seleccionado.`,
          encontrado: false,
        }, { status: 404 });
      }

      // Si la persona encontrada es un integrante (no jefe), ubicar al jefe de su núcleo
      const famKey = cedulaFamilia(personMatch.jefeFamilia === "SI" ? personMatch.cedula : personMatch.cedulaJefeFamilia || personMatch.cedula) || personMatch.id;
      const familyMembers = matchingRecords.filter((r) => {
        const k = cedulaFamilia(r.jefeFamilia === "SI" ? r.cedula : r.cedulaJefeFamilia || r.cedula) || r.id;
        return k === famKey;
      });

      const jefe = familyMembers.find((m) => m.jefeFamilia === "SI") || personMatch;
      const raciones = familyMembers.length > 0 ? familyMembers.length : 1;
      const tipoBeneficiario = raciones === 1 ? "SOLO" : "JEFE";

      // Comprobar si ya retiró para la fecha y servicio dados
      let yaRetiro = false;
      let entregaExistente: any = null;
      if (fecha && servicio) {
        entregaExistente = await prisma.comedorRegistro.findUnique({
          where: {
            cedula_fecha_servicio_refugio: {
              cedula: jefe.cedula,
              fecha,
              servicio,
              refugio: jefe.refugio,
            },
          },
        });
        if (entregaExistente) yaRetiro = true;
      }

      return NextResponse.json({
        success: true,
        encontrado: true,
        beneficiario: {
          id: jefe.id,
          cedula: jefe.cedula,
          nombreApellido: jefe.nombreApellido,
          telefono: jefe.telefono,
          refugio: jefe.refugio,
          cuarto: jefe.cuarto,
          tipoBeneficiario,
          raciones,
          integrantes: familyMembers.map((m) => ({
            id: m.id,
            cedula: m.cedula,
            nombreApellido: m.nombreApellido,
            edad: m.edad,
            genero: m.genero,
            parentesco: m.id === jefe.id ? "Jefe de Familia" : "Integrante",
          })),
        },
        yaRetiro,
        entregaExistente,
      });
    }

    // ── ACCIÓN: CREAR BENEFICIARIO MANUAL / EXCLUSIVO DE COMEDOR ───────────────
    if (action === "create_beneficiario") {
      const {
        cedula,
        nombreApellido,
        telefono,
        refugio,
        tipoBeneficiario,
        raciones,
        integrantes,
        observacion,
      } = body;

      if (!cedula || !nombreApellido || !refugio) {
        return NextResponse.json(
          { error: "Cédula, Nombre y Apellido, y Campamento son obligatorios." },
          { status: 400 }
        );
      }

      const cleanCedula = String(cedula).trim().toUpperCase();
      const cleanNombre = String(nombreApellido).trim();
      const cleanRefugio = String(refugio).trim();
      const cleanTipo = tipoBeneficiario === "SOLO" ? "SOLO" : "JEFE";

      // Verificar si ya existe en ComedorBeneficiario en ese refugio
      const existente = await prisma.comedorBeneficiario.findUnique({
        where: {
          cedula_refugio: {
            cedula: cleanCedula,
            refugio: cleanRefugio,
          },
        },
      });

      if (existente) {
        return NextResponse.json(
          { error: `Ya existe un beneficiario registrado con la cédula "${cleanCedula}" en el campamento ${cleanRefugio}.` },
          { status: 409 }
        );
      }

      // Preparar integrantes
      let integrantesArray: any[] = [];
      if (Array.isArray(integrantes)) {
        integrantesArray = integrantes.filter((i: any) => i && i.nombreApellido && i.nombreApellido.trim() !== "");
      }

      // Raciones: si es SOLO, 1 ración; si es JEFE, jefe + integrantes o raciones explícitas
      let numRaciones = 1;
      if (cleanTipo === "SOLO") {
        numRaciones = 1;
      } else {
        const cantIntegrantes = integrantesArray.length;
        if (typeof raciones === "number" && raciones > 0) {
          numRaciones = raciones;
        } else {
          numRaciones = cantIntegrantes > 0 ? cantIntegrantes + 1 : 1;
        }
      }

      const nuevo = await prisma.comedorBeneficiario.create({
        data: {
          cedula: cleanCedula,
          nombreApellido: cleanNombre,
          telefono: telefono ? String(telefono).trim() : null,
          refugio: cleanRefugio,
          tipoBeneficiario: cleanTipo,
          raciones: numRaciones,
          integrantes: integrantesArray.length > 0 ? JSON.stringify(integrantesArray) : null,
          observacion: observacion ? String(observacion).trim() : null,
          creadoPor: auth.nombre || auth.email,
        },
      });

      return NextResponse.json({
        success: true,
        beneficiario: {
          id: nuevo.id,
          cedula: nuevo.cedula,
          nombreApellido: nuevo.nombreApellido,
          telefono: nuevo.telefono,
          refugio: nuevo.refugio,
          cuarto: null,
          tipoBeneficiario: nuevo.tipoBeneficiario,
          raciones: nuevo.raciones,
          integrantes: [
            {
              id: nuevo.id,
              cedula: nuevo.cedula,
              nombreApellido: nuevo.nombreApellido,
              parentesco: nuevo.tipoBeneficiario === "SOLO" ? "Persona Sola" : "Jefe de Familia",
            },
            ...integrantesArray,
          ],
          origen: "COMEDOR",
          isManual: true,
          observacion: nuevo.observacion,
          createdAt: nuevo.createdAt,
        },
      }, { status: 201 });
    }

    // ── ACCIÓN: EDITAR BENEFICIARIO MANUAL / EXCLUSIVO DE COMEDOR ───────────────
    if (action === "update_beneficiario") {
      const {
        id,
        nombreApellido,
        telefono,
        refugio,
        tipoBeneficiario,
        raciones,
        integrantes,
        observacion,
      } = body;

      if (!id) {
        return NextResponse.json({ error: "ID de beneficiario requerido." }, { status: 400 });
      }

      let integrantesArray: any[] = [];
      if (Array.isArray(integrantes)) {
        integrantesArray = integrantes.filter((i: any) => i && i.nombreApellido && i.nombreApellido.trim() !== "");
      }

      const cleanTipo = tipoBeneficiario === "SOLO" ? "SOLO" : "JEFE";
      let numRaciones = 1;
      if (cleanTipo === "SOLO") {
        numRaciones = 1;
      } else {
        const cantIntegrantes = integrantesArray.length;
        if (typeof raciones === "number" && raciones > 0) {
          numRaciones = raciones;
        } else {
          numRaciones = cantIntegrantes > 0 ? cantIntegrantes + 1 : 1;
        }
      }

      const actualizado = await prisma.comedorBeneficiario.update({
        where: { id },
        data: {
          nombreApellido: nombreApellido ? String(nombreApellido).trim() : undefined,
          telefono: telefono !== undefined ? (telefono ? String(telefono).trim() : null) : undefined,
          refugio: refugio ? String(refugio).trim() : undefined,
          tipoBeneficiario: cleanTipo,
          raciones: numRaciones,
          integrantes: JSON.stringify(integrantesArray),
          observacion: observacion !== undefined ? (observacion ? String(observacion).trim() : null) : undefined,
        },
      });

      return NextResponse.json({ success: true, beneficiario: actualizado });
    }

    // ── ACCIÓN: ELIMINAR BENEFICIARIO MANUAL ────────────────────────────────────
    if (action === "delete_beneficiario") {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ error: "ID de beneficiario requerido." }, { status: 400 });
      }
      await prisma.comedorBeneficiario.delete({
        where: { id },
      });
      return NextResponse.json({ success: true, message: "Beneficiario de comedor eliminado correctamente" });
    }

    // ── ACCIÓN: REGISTRAR ENTREGA DE COMIDA ────────────────────────────────────
    const {
      cedula,
      nombre,
      telefono,
      refugio,
      tipoBeneficiario,
      fecha,
      servicio,
      raciones,
      registroId,
      observacion,
    } = body;

    if (!cedula || !nombre || !refugio || !fecha || !servicio) {
      return NextResponse.json({ error: "Faltan campos obligatorios para registrar la entrega de comida." }, { status: 400 });
    }

    const servicioUpper = String(servicio).toUpperCase();
    if (!["DESAYUNO", "ALMUERZO", "CENA"].includes(servicioUpper)) {
      return NextResponse.json({ error: "Servicio no válido. Debe ser DESAYUNO, ALMUERZO o CENA." }, { status: 400 });
    }

    // Validar si ya existe un registro de retiro para esta persona, fecha, servicio y refugio
    const existente = await prisma.comedorRegistro.findUnique({
      where: {
        cedula_fecha_servicio_refugio: {
          cedula: String(cedula).trim(),
          fecha: String(fecha).trim(),
          servicio: servicioUpper,
          refugio: String(refugio).trim(),
        },
      },
    });

    if (existente) {
      return NextResponse.json(
        {
          error: `⚠️ Esta persona ya retiró el servicio de ${servicioUpper} hoy (${fecha}) a las ${existente.hora}.`,
          yaRegistrado: true,
          entrega: existente,
        },
        { status: 409 }
      );
    }

    // Formatear hora local de Caracas (HH:mm:ss)
    const now = new Date();
    const hora = now.toLocaleTimeString("es-VE", { hour12: false });

    const entrega = await prisma.comedorRegistro.create({
      data: {
        registroId: registroId || null,
        cedula: String(cedula).trim(),
        nombre: String(nombre).trim(),
        telefono: telefono ? String(telefono).trim() : null,
        refugio: String(refugio).trim(),
        tipoBeneficiario: tipoBeneficiario || "JEFE",
        fecha: String(fecha).trim(),
        servicio: servicioUpper,
        raciones: typeof raciones === "number" && raciones > 0 ? raciones : 1,
        hora,
        registradoPor: auth.nombre || auth.email,
        observacion: observacion ? String(observacion).trim() : null,
      },
    });

    return NextResponse.json({ success: true, entrega }, { status: 201 });
  } catch (error: any) {
    console.error("Error en POST /api/comedor:", error);
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe un registro de entrega para esta persona en este servicio y fecha.", yaRegistrado: true },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Error interno al registrar entrega en comedor", details: error?.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canViewComedor(auth)) {
      return NextResponse.json({ error: "No autorizado. Solo Master y Master Comedor pueden eliminar registros del comedor." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const beneficiarioId = searchParams.get("beneficiarioId");

    // Eliminar beneficiario manual de comedor
    if (beneficiarioId) {
      await prisma.comedorBeneficiario.delete({
        where: { id: beneficiarioId },
      });
      return NextResponse.json({ success: true, message: "Beneficiario de comedor eliminado correctamente" });
    }

    if (!id) {
      return NextResponse.json({ error: "ID de entrega o de beneficiario requerido para eliminar" }, { status: 400 });
    }

    await prisma.comedorRegistro.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Registro de entrega eliminado correctamente" });
  } catch (error: any) {
    console.error("Error en DELETE /api/comedor:", error);
    return NextResponse.json({ error: "Error interno al eliminar registro del comedor", details: error?.message }, { status: 500 });
  }
}
