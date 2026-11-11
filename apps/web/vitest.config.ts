import { defineConfig } from "vitest/config";

/** Unit tests only; end-to-end tests in e2e/ run with Playwright. */
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
