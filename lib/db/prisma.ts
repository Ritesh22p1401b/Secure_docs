import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // Small pools suit serverless (each instance holds its own pool). Use a pooled
  // connection string (e.g. Neon's -pooler host) in production.
  const max = Number(process.env.DATABASE_POOL_MAX ?? "5");
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: Number.isInteger(max) && max > 0 ? max : 5,
  });
  return new PrismaClient({ adapter, log: ["error"] });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
