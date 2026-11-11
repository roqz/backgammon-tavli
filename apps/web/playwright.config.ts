import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the production build and a real game server.
 *   pnpm --filter @tavli/web e2e                 (bundled Chromium, e.g. in CI)
 *   PW_CHANNEL=msedge pnpm --filter @tavli/web e2e (use an installed browser)
 */
const WEB_PORT = 4180;
export const E2E_SERVER_PORT = 2580;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    channel: process.env.PW_CHANNEL,
    locale: "de-DE",
    trace: "retain-on-failure",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL } }],
  webServer: [
    {
      command: `pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node ../server/dist/server.js",
      url: `http://localhost:${E2E_SERVER_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(E2E_SERVER_PORT), DB_PATH: ":memory:", ALLOW_SAME_NETWORK: "1" },
    },
  ],
});
