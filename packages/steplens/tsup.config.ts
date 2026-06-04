import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  // The steplens wrapper delegates entirely to @agent-replay/cli;
  // both CLI and its transitive deps stay external.
  external: [
    "@agent-replay/cli",
    "@agent-replay/core",
    "@agent-replay/sdk",
    "@agent-replay/otel",
    "@agent-replay/studio",
    "better-sqlite3",
  ],
});
