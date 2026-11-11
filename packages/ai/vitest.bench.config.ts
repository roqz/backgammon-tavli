import { defineConfig } from "vitest/config";

/** Separate config so the slow strength benchmark only runs on demand (`pnpm bench`). */
export default defineConfig({
  test: { include: ["test/**/*.bench-test.ts"], reporters: ["verbose"] },
});
