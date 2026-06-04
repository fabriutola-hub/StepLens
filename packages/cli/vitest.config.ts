import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // These tests spawn the built CLI (real subprocesses) and run concurrently
    // with the rest of the monorepo under `turbo run test`, so they need more
    // headroom than vitest's 5s default — especially on loaded CI machines.
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
