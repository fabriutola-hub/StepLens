import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/simple.ts",
    "src/integrations/openai.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // Share common modules across entries instead of duplicating them.
  splitting: true,
  external: ["@agent-replay/core"],
});
