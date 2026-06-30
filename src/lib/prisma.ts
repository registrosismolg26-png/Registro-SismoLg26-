import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Append PostgreSQL-level timeout and keepalive params to the connection string.
// connect_timeout (seconds) controls the TCP handshake + protocol negotiation —
// different from pg.Pool's connectionTimeoutMillis (pool queue wait time).
function buildConnectionString(base: string): string {
  try {
    const url = new URL(base);
    if (!url.searchParams.has("connect_timeout"))
      url.searchParams.set("connect_timeout", "30");
    if (!url.searchParams.has("keepalives_idle"))
      url.searchParams.set("keepalives_idle", "30");
    if (!url.searchParams.has("keepalives_interval"))
      url.searchParams.set("keepalives_interval", "5");
    if (!url.searchParams.has("keepalives_count"))
      url.searchParams.set("keepalives_count", "3");
    return url.toString();
  } catch {
    return base;
  }
}

if (!globalForPrisma.prisma) {
  const connectionString =
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/postgres";

  const pool = new pg.Pool({
    connectionString: buildConnectionString(connectionString),
    max: 2,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  // Prevent unhandled 'error' events from crashing the Node process on idle drops
  pool.on("error", (err) => {
    console.error("[pool] background client error:", err.message);
  });

  const adapter = new PrismaPg(pool);
  globalForPrisma.prisma = new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma;
