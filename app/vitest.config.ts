import { configDefaults, defineConfig } from "vitest/config";

// Le prove nel browser (e2e/) le lancia Playwright: pnpm e2e
export default defineConfig({ test: { exclude: [...configDefaults.exclude, "e2e/**"] } });
