import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, canManagePlanteamientoSala } from "@/lib/auth";

function calculateAge(fechaNacStr?: string | null): number | null {
  if (!fechaNacStr) return null;
  const d = new Date(fechaNacStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

async function fetchRepExterno(cedulaDigits: string) {
  if (!cedulaDigits || cedulaDigits.length < 5) return null;
  const API_BASE = "https://api.cedula.com.ve/api/v1";
  const appId = process.env.CEDULA_API_APP_ID || "9306";
  const token = process.env.CEDULA_API_TOKEN || "089a0ac861dadfe75a4c7ce0af5f94b0";
  const apiUrl = `${API_BASE}?app_id=${encodeURIComponent(appId)}&token=${encodeURIComponent(token)}&nacionalidad=V&cedula=${cedulaDigits}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(apiUrl, { signal: controller.signal, headers: { Accept: "application/json" } });
    const json = await res.json().catch(() => null);
    if (json && json.error === false && json.data) {
      const data = json.data;
      const nombreApellido = [data.primer_nombre, data.segundo_nombre, data.primer_apellido, data.segundo_apellido]
        .map((s: any) => (s == null ? "" : String(s).trim()))
        .filter(Boolean)
        .join(" ")
        .toUpperCase();
      const sexoRaw = String(data.sexo ?? data.genero ?? "").trim().toUpperCase();
      const genero = sexoRaw.startsWith("F") ? "FEMENINO" : sexoRaw.startsWith("M") ? "MASCULINO" : null;
      const fn = String(data.fecha_nac ?? "").trim().slice(0, 10);
      const fechaNacimiento = /^\d{4}-\d{2}-\d{2}$/.test(fn) ? fn : null;
      const edad = calculateAge(fechaNacimiento);
      return {
        nombreApellido,
        genero,
        fechaNacimiento,
        edad,
      };
    }
  } catch {
    // ignore timeout
  } finally {
    clearTimeout(timer);
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManagePlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado para gestionar Planteamiento Sala." }, { status: 403 });
    }

    const body = await req.json();
    const refugio = String(body?.refugio || "").trim();
    const rawItems = Array.isArray(body?.items) ? body.items : [];

    if (!refugio) {
      return NextResponse.json({ error: "El campamento es obligatorio." }, { status: 400 });
    }

    if (rawItems.length === 0) {
      return NextResponse.json({ error: "No se recibieron registros para importar." }, { status: 400 });
    }

    // 1. Obtener refugioId si existe en catálogo de Refugio
    const matchRefugio = await prisma.refugio.findFirst({
      where: {
        nombre: {
          equals: refugio,
          mode: "insensitive",
        },
      },
    });
    const refugioId = matchRefugio?.id || null;

    // 2. Extraer todas las cédulas que necesitan búsqueda CNE/Padrón
    const neededCedulas = new Set<string>();
    for (const item of rawItems) {
      const c = String(item.cedula || "").replace(/\D/g, "");
      if (c && !item.nombreApellido) {
        neededCedulas.add(c);
      }
      if (Array.isArray(item.cargaFamiliar)) {
        for (const fam of item.cargaFamiliar) {
          const fc = String(fam.cedula || "").replace(/\D/g, "");
          if (fc && !fam.nombreApellido) {
            neededCedulas.add(fc);
          }
        }
      }
    }

    // 3. Búsqueda en lote en Padron Electoral local
    const cedulasArr = Array.from(neededCedulas);
    const padronMap = new Map<string, any>();
    if (cedulasArr.length > 0) {
      const padronList = await prisma.padron.findMany({
        where: {
          cedula: { in: cedulasArr },
        },
      });
      for (const p of padronList) {
        padronMap.set(p.cedula, {
          nombreApellido: p.nombreCompleto.trim().toUpperCase(),
          genero: p.sexo === "M" || p.sexo === "MASCULINO" ? "MASCULINO" : "FEMENINO",
          fechaNacimiento: p.fechaNacimiento ? p.fechaNacimiento.toISOString().slice(0, 10) : null,
          edad: p.fechaNacimiento ? calculateAge(p.fechaNacimiento.toISOString().slice(0, 10)) : null,
          source: "PADRON",
        });
      }
    }

    // 4. Búsqueda en lote en Registro (Censo) para los que falten
    const missingFromPadron = cedulasArr.filter((c) => !padronMap.has(c));
    const registroMap = new Map<string, any>();
    if (missingFromPadron.length > 0) {
      const censoList = await prisma.registro.findMany({
        where: {
          OR: [
            { cedula: { in: missingFromPadron } },
            { cedula: { in: missingFromPadron.map((c) => `V-${c}`) } },
            { cedula: { in: missingFromPadron.map((c) => `E-${c}`) } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });

      for (const r of censoList) {
        const cleanCed = r.cedula.replace(/\D/g, "");
        if (!registroMap.has(cleanCed) && !padronMap.has(cleanCed)) {
          const fn = r.fechaNacimiento ? r.fechaNacimiento.toISOString().slice(0, 10) : null;
          registroMap.set(cleanCed, {
            id: r.id,
            nombreApellido: r.nombreApellido.trim().toUpperCase(),
            genero: r.genero || null,
            fechaNacimiento: fn,
            edad: r.edad ?? calculateAge(fn),
            telefono: r.telefono || null,
            source: "CENSO",
          });
        }
      }
    }

    // 5. Fallback para los que aún falten (API REP Externa con throttle y presupuesto corto)
    const externalRepMap = new Map<string, any>();
    const missingStill = missingFromPadron.filter((c) => !registroMap.has(c) && c.length >= 5);
    const maxExternal = Math.min(missingStill.length, 10);
    if (maxExternal > 0) {
      const slice = missingStill.slice(0, maxExternal);
      await Promise.allSettled(
        slice.map(async (c) => {
          const rep = await fetchRepExterno(c);
          if (rep && rep.nombreApellido) {
            externalRepMap.set(c, rep);
          }
        })
      );
    }

    // Helper para resolver identidad
    const resolveIdentity = (cedula: string, fallbackName?: string) => {
      if (padronMap.has(cedula)) return padronMap.get(cedula);
      if (registroMap.has(cedula)) return registroMap.get(cedula);
      if (externalRepMap.has(cedula)) return externalRepMap.get(cedula);
      if (fallbackName && fallbackName.trim()) {
        return {
          nombreApellido: fallbackName.trim().toUpperCase(),
          genero: null,
          fechaNacimiento: null,
          edad: null,
          source: "MANUAL",
        };
      }
      return null;
    };

    let countTitulares = 0;
    let countFamiliares = 0;
    let countCreados = 0;
    let countActualizados = 0;
    let countCne = 0;

    const todayYMD = new Date().toISOString().slice(0, 10);
    const createdBy = auth.email || auth.nombre || "CARGA_MASIVA";

    // 6. Pre-consultar todos los registros existentes en un solo query eficiente
    const allCedulas = rawItems
      .map((it: any) => String(it.cedula || "").replace(/\D/g, ""))
      .filter(Boolean);

    const existingList = await prisma.planteamientoSala.findMany({
      where: {
        refugio,
        cedula: { in: allCedulas },
      },
    });
    const existingMap = new Map<string, any>(existingList.map((e) => [e.cedula, e]));

    // 7. Procesar y guardar en lotes concurrentes para máxima velocidad y evitar timeouts
    const PARALLEL_BATCH = 15;
    for (let i = 0; i < rawItems.length; i += PARALLEL_BATCH) {
      const chunk = rawItems.slice(i, i + PARALLEL_BATCH);
      await Promise.all(
        chunk.map(async (item: any) => {
          const cedula = String(item.cedula || "").replace(/\D/g, "");
          if (!cedula) return;

          const idInfo = resolveIdentity(cedula, item.nombreApellido);
          const nombreApellido = idInfo?.nombreApellido || item.nombreApellido?.trim().toUpperCase() || `V-${cedula}`;
          const genero = item.genero || idInfo?.genero || null;
          const fechaNacimiento = item.fechaNacimiento || idInfo?.fechaNacimiento || null;
          const edad = item.edad !== undefined && item.edad !== null ? item.edad : (idInfo?.edad ?? calculateAge(fechaNacimiento));
          const telefono = item.telefono || idInfo?.telefono || null;
          const registroId = idInfo?.id || null;

          if (idInfo && idInfo.source !== "MANUAL") {
            countCne++;
          }

          // Procesar carga familiar
          const formattedCargaFamiliar: any[] = [];
          if (Array.isArray(item.cargaFamiliar)) {
            for (const fam of item.cargaFamiliar) {
              const fCed = String(fam.cedula || "").replace(/\D/g, "");
              const fIdInfo = fCed ? resolveIdentity(fCed, fam.nombreApellido) : null;
              const fNombre = fIdInfo?.nombreApellido || fam.nombreApellido?.trim().toUpperCase() || (fCed ? `V-${fCed}` : "FAMILIAR");
              let fGenero = fam.genero || fIdInfo?.genero || null;

              // Inferencia rápida de género por parentesco si viene nulo
              if (!fGenero && fam.parentesco) {
                const pUp = fam.parentesco.toUpperCase();
                if (["HIJA", "MADRE", "ESPOSA", "HERMANA", "NIETA"].some((p) => pUp.includes(p))) {
                  fGenero = "FEMENINO";
                } else if (["HIJO", "PADRE", "ESPOSO", "HERMANO", "NIETO"].some((p) => pUp.includes(p))) {
                  fGenero = "MASCULINO";
                }
              }

              const fFn = fam.fechaNacimiento || fIdInfo?.fechaNacimiento || null;
              const fEdad = fam.edad !== undefined && fam.edad !== null ? fam.edad : (fIdInfo?.edad ?? calculateAge(fFn));

              formattedCargaFamiliar.push({
                id: fam.id || crypto.randomUUID(),
                cedula: fCed,
                nombreApellido: fNombre,
                parentesco: fam.parentesco || "Otro",
                genero: fGenero,
                fechaNacimiento: fFn,
                edad: fEdad,
                telefono: fam.telefono || null,
              });
              countFamiliares++;
            }
          }

          const tipoOpcionValida = ["MERCADO_SECUNDARIO", "ALQUILER", "PLAN_VENEZUELA_RENACE", "CAMPAMENTO_MAYOR_PERMANENCIA", "ASIGNACION_GMVV"].includes(item.tipoOpcion)
            ? item.tipoOpcion
            : "MERCADO_SECUNDARIO";

          const existing = existingMap.get(cedula);

          if (existing) {
            // Combinar o actualizar carga familiar existente si no está vacía
            let mergedCarga = formattedCargaFamiliar;
            if (Array.isArray(existing.cargaFamiliar) && existing.cargaFamiliar.length > 0 && formattedCargaFamiliar.length > 0) {
              const mapExisting = new Map<string, any>();
              for (const ef of existing.cargaFamiliar as any[]) {
                const key = ef.cedula ? `C_${ef.cedula}` : `N_${ef.nombreApellido}_${ef.parentesco}`;
                mapExisting.set(key, ef);
              }
              for (const nf of formattedCargaFamiliar) {
                const key = nf.cedula ? `C_${nf.cedula}` : `N_${nf.nombreApellido}_${nf.parentesco}`;
                mapExisting.set(key, nf); // actualiza o agrega
              }
              mergedCarga = Array.from(mapExisting.values());
            } else if (formattedCargaFamiliar.length === 0 && Array.isArray(existing.cargaFamiliar)) {
              mergedCarga = existing.cargaFamiliar as any[];
            }

            await prisma.planteamientoSala.update({
              where: { id: existing.id },
              data: {
                nombreApellido: nombreApellido || existing.nombreApellido,
                telefono: telefono || existing.telefono,
                genero: genero || existing.genero,
                fechaNacimiento: fechaNacimiento || existing.fechaNacimiento,
                edad: edad ?? existing.edad,
                registroId: registroId || existing.registroId,
                cargaFamiliar: mergedCarga,
                observacion: item.observacion ? String(item.observacion).trim() : existing.observacion,
              },
            });
            countActualizados++;
          } else {
            await prisma.planteamientoSala.create({
              data: {
                id: crypto.randomUUID(),
                refugioId,
                refugio,
                cedula,
                nombreApellido,
                telefono,
                genero,
                fechaNacimiento,
                edad,
                registroId,
                tipoOpcion: tipoOpcionValida,
                cargaFamiliar: formattedCargaFamiliar,
                estatus: "SIN ESTATUS",
                porcentajeProgreso: 0,
                observacion: item.observacion ? String(item.observacion).trim() : null,
                fechaEntregaCarpeta: todayYMD,
                createdBy,
              },
            });
            countCreados++;
          }
          countTitulares++;
        })
      );
    }

    return NextResponse.json({
      success: true,
      refugio,
      countTitulares,
      countFamiliares,
      countCreados,
      countActualizados,
      countCne,
    });
  } catch (error: any) {
    console.error("Error en POST /api/planteamiento-sala/bulk:", error);
    return NextResponse.json(
      { error: "Error al procesar la carga masiva", details: error?.message },
      { status: 500 }
    );
  }
}
