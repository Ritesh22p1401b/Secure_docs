import { defineConfig, devices } from "@playwright/test";

// E2E smoke tests against a running app (needs DATABASE_URL + secrets in .env).
// Document upload/view E2E additionally needs a real PRIVATE Vercel Blob store
// (BLOB_READ_WRITE_TOKEN); those tests skip themselves without it.
const PORT = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    // Must be "localhost": the Next.js dev server blocks dev assets for other origins.
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next dev --turbopack --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: true,
    // E2E signs up many users from one IP.
    env: { RATE_LIMIT_SIGNUP_IP: "1000" },
    timeout: 120_000,
  },
});
