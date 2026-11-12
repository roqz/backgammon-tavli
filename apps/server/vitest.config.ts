import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Password hashing (scrypt) is deliberately slow and shares the CPU with the bot tests that
    // run in parallel; the default 5 s is too tight on a busy machine.
    testTimeout: 20_000,
  },
});
