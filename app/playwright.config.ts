import { defineConfig } from "@playwright/test";

// Prove nel browser contro l'ambiente di sviluppo acceso (pnpm dev): niente server avviato da qui.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    colorScheme: "dark",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
