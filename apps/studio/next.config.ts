import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a standalone server bundle only when building the Docker image
  // (the Dockerfile sets STUDIO_STANDALONE=1). Keeping it off for normal
  // `pnpm build` / CI avoids copying a large traced node_modules every build.
  output: process.env.STUDIO_STANDALONE ? "standalone" : undefined,
  // Keep better-sqlite3 as an external require() — it's a native C++ addon
  // that Next.js cannot bundle for the browser.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
