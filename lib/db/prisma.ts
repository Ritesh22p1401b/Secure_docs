import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * node-postgres currently treats sslmode=prefer/require/verify-ca as verify-full and warns
 * that a future major version will weaken them to libpq semantics. Pin verify-full
 * (certificate + hostname verification) so behaviour stays strict and the warning goes away.
 */
export function withStrictSsl(connectionString: string | undefined): string | undefined {
  if (!connectionString) return connectionString;
  try {
    const url = new URL(connectionString);
    const mode = url.searchParams.get("sslmode");
    if (mode && ["prefer", "require", "verify-ca"].includes(mode) && !url.searchParams.has("uselibpqcompat")) {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
  } catch {
    /* not a URL (e.g. key=value form): leave as is */
  }
  return connectionString;
}

function createClient() {
  // Small pools suit serverless (each instance holds its own pool). Use a pooled
  // connection string (e.g. Neon's -pooler host) in production.
  const max = Number(process.env.DATABASE_POOL_MAX ?? "5");
  const adapter = new PrismaPg({
    connectionString: withStrictSsl(process.env.DATABASE_URL),
    max: Number.isInteger(max) && max > 0 ? max : 5,
  });
  return new PrismaClient({ adapter, log: ["error"] });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
