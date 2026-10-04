import "server-only";
import { z } from "zod";

const WEAK_SECRETS = new Set(["secret", "password", "123456", "my-secret", "changeme", "jwt-secret"]);

const secret = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .min(32, `${name} must be at least 32 characters (use: openssl rand -base64 64)`)
    .refine((v) => !WEAK_SECRETS.has(v.toLowerCase()), `${name} is a known weak value`);

const intWithDefault = (def: number, max = 100_000) =>
  z.coerce.number().int().positive().max(max).default(def);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_SECRET: secret("JWT_SECRET"),
    JWT_REFRESH_SECRET: secret("JWT_REFRESH_SECRET"),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    MAX_DOCUMENT_SIZE_MB: intWithDefault(25, 500),
    APP_URL: z.url().optional().or(z.literal("").transform(() => undefined)),
    CRON_SECRET: z.string().min(16).optional().or(z.literal("").transform(() => undefined)),
    RATE_LIMIT_LOGIN_FAILURES: intWithDefault(5),
    RATE_LIMIT_LOGIN_IP: intWithDefault(50),
    RATE_LIMIT_SIGNUP_IP: intWithDefault(10),
    RATE_LIMIT_UPLOADS: intWithDefault(10),
    RATE_LIMIT_VIEW: intWithDefault(600),
    RATE_LIMIT_DELETE: intWithDefault(60),
    RATE_LIMIT_REFRESH: intWithDefault(60),
    RATE_LIMIT_SHARES: intWithDefault(30),
  })
  .refine((e) => e.JWT_SECRET !== e.JWT_REFRESH_SECRET, {
    message: "JWT_SECRET and JWT_REFRESH_SECRET must be different",
    path: ["JWT_REFRESH_SECRET"],
  });

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | undefined;

/** Validated server environment. Throws (without echoing secret values) if misconfigured. */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment configuration — ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test hook: forget the cached environment. */
export function resetEnvCache() {
  cached = undefined;
}

export const isProduction = () => process.env.NODE_ENV === "production";
