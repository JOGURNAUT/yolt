import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@yolt/api", "@yolt/core", "@yolt/db", "@yolt/shared"],
};

export default nextConfig;
