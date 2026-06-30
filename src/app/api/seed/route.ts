import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// One-time seed endpoint. Call POST /api/seed once after first deploy.
// Returns 409 if admin already exists so it is safe to call repeatedly.
export async function POST() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_SEED) {
    return NextResponse.json({ error: "Seed deshabilitado en producción" }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email: "admin@sismo.gob.ve" } });
  if (existing) {
    return NextResponse.json({ message: "Admin ya existe" }, { status: 409 });
  }

  function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `scrypt$${salt}$${hash}`;
  }

  await prisma.user.create({
    data: {
      email: "admin@sismo.gob.ve",
      nombre: "Administrador General",
      password: hashPassword("admin123456"),
      role: "ADMIN",
    },
  });

  return NextResponse.json({ success: true, message: "Admin creado. Cambie la contraseña desde el panel." });
}
