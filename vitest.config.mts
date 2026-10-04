import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.resolve(import.meta.dirname);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^server-only$/, replacement: path.join(root, "tests/stubs/server-only.ts") },
      { find: /^@\//, replacement: `${root}/` },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/security/**/*.test.ts"],
    // Integration/security suites share one database.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      // Integration tests run only when TEST_DATABASE_URL is provided (never the dev/prod DB).
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://unused:unused@127.0.0.1:1/unused",
      JWT_SECRET: "test-only-jwt-secret-0123456789abcdefghijklmnopqrstuvwxyz",
      JWT_REFRESH_SECRET: "test-only-refresh-secret-0123456789abcdefghijklmnopqrstuv",
      MAX_DOCUMENT_SIZE_MB: "2",
      RATE_LIMIT_SIGNUP_IP: "1000",
      RATE_LIMIT_LOGIN_IP: "1000",
      RATE_LIMIT_UPLOADS: "1000",
      RATE_LIMIT_VIEW: "1000",
      RATE_LIMIT_DELETE: "1000",
      RATE_LIMIT_REFRESH: "1000",
      RATE_LIMIT_SHARES: "1000",
      APP_URL: "http://localhost:3000",
      // Fake credential: storage is mocked in tests; only the "configured" check reads it.
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_teststore_fakefakefake",
      DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX ?? "1",
    },
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/api/**/*.ts", "proxy.ts"],
      exclude: ["lib/generated/**"],
    },
  },
});
