import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone/server.js) so the
  // Docker runtime image can be lean — required for the Coolify deployment.
  output: "standalone",
};

export default nextConfig;
