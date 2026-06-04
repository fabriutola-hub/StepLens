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
  // @agent-replay/examples is bundled (it stays private) so the published CLI's
  // `demo` command is self-contained. core/sdk are real deps; better-sqlite3 is
  // a native module and must stay external.
  external: [
    "@agent-replay/core",
    "@agent-replay/sdk",
    "better-sqlite3",
  ],
  noExternal: ["@agent-replay/examples"],
});
