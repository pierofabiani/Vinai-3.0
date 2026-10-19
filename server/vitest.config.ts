import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// In locale le variabili arrivano da ../.env; nel CI dall'ambiente del job.
if (existsSync("../.env")) process.loadEnvFile("../.env");

export default defineConfig({
  test: {
    globalSetup: ["src/test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
