import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server bundle, which is what the Docker image runs.
  output: "standalone",
  // This is an npm-workspaces monorepo: tracing must start at the repository root so the
  // shared-types package is included in the standalone output.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
