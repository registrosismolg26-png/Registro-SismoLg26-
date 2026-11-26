import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthUser,
  canViewPlanteamientoSala,
  canManagePlanteamientoSala,
  isPlanteamientoVisualizador,
} from "@/lib/auth";
import { invalidatePlanteamientoStatsCache } from "@/lib/planteamientoStatsCache";
import { ensurePlanteamientoPdfSchema } from "@/app/api/planteamiento-sala/route";
import crypto from "crypto";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// GET: Descarga o visualiza el documento PDF asociado al expediente
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canViewPlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await ensurePlanteamientoPdfSchema();

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const expediente = await prisma.planteamientoSala.findUnique({
      where: { id },
      select: { id: true, refugio: true, nombreApellido: true },
    });

    if (!expediente) {
      return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    }

    if (isPlanteamientoVisualizador(auth) && expediente.refugio !== auth.refugio) {
      return NextResponse.json({ error: "No autorizado para este campamento" }, { status: 403 });
    }

    const url = new URL(req.url);
    const onlyInfo = url.searchParams.get("info") === "true" || url.searchParams.get("meta") === "true";

    const doc = await prisma.planteamientoSalaDocumento.findUnique({
      where: { planteamientoId: id },
    });

    if (!doc) {
      return NextResponse.json({ error: "Documento PDF no encontrado" }, { status: 404 });
    }

    if (onlyInfo) {
      return NextResponse.json({
        success: true,
        documento: {
          id: doc.id,
          nombre: doc.nombre,
          mimeType: doc.mimeType,
          size: doc.size,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        },
      });
    }

    const buffer = Buffer.from(doc.base64, "base64");
    const download = url.searchParams.get("download") === "true";
    const disposition = download ? "attachment" : "inline";

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType || "application/pdf",
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(doc.nombre)}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("Error en GET /api/planteamiento-sala/[id]/documento:", error);
    return NextResponse.json({ error: "Error al obtener el documento PDF" }, { status: 500 });
  }
}

// POST: Sube o reemplaza el documento PDF para el expediente
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManagePlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado para subir documentos" }, { status: 403 });
    }

    await ensurePlanteamientoPdfSchema();

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const expediente = await prisma.planteamientoSala.findUnique({
      where: { id },
      select: { id: true, refugio: true },
    });

    if (!expediente) {
      return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    }

    let fileName = "documento.pdf";
    let fileSize = 0;
    let base64 = "";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No se proporcionó ningún archivo" }, { status: 400 });
      }

      fileName = file.name || "documento.pdf";
      fileSize = file.size;

      if (fileSize > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `El archivo supera el tamaño máximo permitido de ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
          { status: 400 }
        );
      }

      const isPdf =
        file.type === "application/pdf" ||
        fileName.toLowerCase().endsWith(".pdf");

      if (!isPdf) {
        return NextResponse.json({ error: "Solo se admiten documentos en formato PDF (.pdf)" }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      base64 = Buffer.from(arrayBuffer).toString("base64");
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      base64 = (body.base64 || body.fileBase64 || "").replace(/^data:application\/pdf;base64,/, "");
      fileName = body.nombre || body.fileName || "documento.pdf";
      fileSize = body.size || body.fileSize || Math.round((base64.length * 3) / 4);

      if (!base64) {
        return NextResponse.json({ error: "Contenido del archivo no proporcionado" }, { status: 400 });
      }

      if (fileSize > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `El archivo supera el límite de ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json({ error: "Tipo de contenido no soportado" }, { status: 400 });
    }

    const now = new Date();

    // Guardar o actualizar en PlanteamientoSalaDocumento
    await prisma.planteamientoSalaDocumento.upsert({
      where: { planteamientoId: id },
      create: {
        id: crypto.randomUUID(),
        planteamientoId: id,
        nombre: fileName,
        mimeType: "application/pdf",
        size: fileSize,
        base64: base64,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        nombre: fileName,
        mimeType: "application/pdf",
        size: fileSize,
        base64: base64,
        updatedAt: now,
      },
    });

    // Actualizar metadatos en PlanteamientoSala
    const updated = await prisma.planteamientoSala.update({
      where: { id },
      data: {
        tieneDocumentoPdf: true,
        documentoPdfNombre: fileName,
        documentoPdfFecha: now,
        documentoPdfSize: fileSize,
      },
    });

    invalidatePlanteamientoStatsCache();

    return NextResponse.json({
      success: true,
      message: "Documento PDF subido exitosamente",
      documento: {
        nombre: fileName,
        size: fileSize,
        fecha: now.toISOString(),
      },
      item: updated,
    });
  } catch (error: any) {
    console.error("Error en POST /api/planteamiento-sala/[id]/documento:", error);
    return NextResponse.json({ error: "Error al subir documento PDF" }, { status: 500 });
  }
}

// DELETE: Elimina el documento PDF del expediente
export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || !canManagePlanteamientoSala(auth)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const expediente = await prisma.planteamientoSala.findUnique({
      where: { id },
      select: { id: true, refugio: true },
    });

    if (!expediente) {
      return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    }

    await prisma.planteamientoSalaDocumento.deleteMany({
      where: { planteamientoId: id },
    });

    const updated = await prisma.planteamientoSala.update({
      where: { id },
      data: {
        tieneDocumentoPdf: false,
        documentoPdfNombre: null,
        documentoPdfFecha: null,
        documentoPdfSize: null,
      },
    });

    invalidatePlanteamientoStatsCache();

    return NextResponse.json({
      success: true,
      message: "Documento PDF eliminado",
      item: updated,
    });
  } catch (error: any) {
    console.error("Error en DELETE /api/planteamiento-sala/[id]/documento:", error);
    return NextResponse.json({ error: "Error al eliminar documento PDF" }, { status: 500 });
  }
}
