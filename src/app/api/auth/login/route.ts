import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// scrypt with random salt. Format: "scrypt$<hex-salt>$<hex-hash>"
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

// Supports legacy SHA-256 hashes and new scrypt hashes.
// On legacy match, re-hashes with scrypt automatically.
function verifyPassword(input: string, stored: string): boolean {
  if (stored.startsWith("scrypt$")) {
    const parts = stored.split("$");
    if (parts.length !== 3) return false;
    const [, salt, storedHash] = parts;
    try {
      const derived = crypto.scryptSync(input, salt, 64).toString("hex");
      return crypto.timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(storedHash, "hex"));
    } catch {
      return false;
    }
  }
  // Legacy SHA-256 fallback
  const legacyHash = crypto.createHash("sha256").update(input).digest("hex");
  return legacyHash === stored;
}

type UserRow = { id: string; email: string; nombre: string; password: string; role: string; campamentoTransitorio: string };

// Retry once on transient TCP errors caused by VPN/NAT connection drops
async function dbWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const msg = String(err?.message ?? "").toLowerCase();
    const transient =
      msg.includes("connection terminated") ||
      msg.includes("connection timeout") ||
      msg.includes("econnreset") ||
      msg.includes("socket timeout") ||
      msg.includes("epipe");
    if (!transient) throw err;
    await new Promise(r => setTimeout(r, 400));
    return fn();
  }
}

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Correo y contraseña son obligatorios" },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const user = await dbWithRetry<UserRow | null>(() =>
      prisma.user.findUnique({
        where: { email: cleanEmail },
        select: { id: true, email: true, nombre: true, password: true, role: true, campamentoTransitorio: true },
      }) as Promise<UserRow | null>
    );

    if (!user) {
      return NextResponse.json({ error: "Usuario no registrado" }, { status: 401 });
    }

    if (!verifyPassword(password, user.password)) {
      return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
    }

    // Silently migrate legacy SHA-256 hash to scrypt on successful login
    if (!user.password.startsWith("scrypt$")) {
      const upgraded = hashPassword(password);
      await prisma.user.update({ where: { id: user.id }, data: { password: upgraded } });
    }

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, nombre: user.nombre, role: user.role, campamentoTransitorio: user.campamentoTransitorio },
    });
  } catch (error: any) {
    console.error("Error en login API:", error);
    const msg = String(error?.message ?? "").toLowerCase();
    if (msg.includes("connection") || msg.includes("timeout") || msg.includes("econnreset")) {
      return NextResponse.json(
        { error: "No se pudo conectar a la base de datos. Verifique su red e intente de nuevo." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Error interno en el servidor" }, { status: 500 });
  }
}
