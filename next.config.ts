import type { NextConfig } from "next";

// No `output: 'standalone'` — the Dockerfile ships full node_modules so the
// Prisma CLI is available for migrate-on-start. See Dockerfile header.
const nextConfig: NextConfig = {
  transpilePackages: ["@travel-architect/contracts", "@travel-architect/db"],
};

export default nextConfig;
