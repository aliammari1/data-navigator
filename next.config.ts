import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  serverExternalPackages: [
    "@duckdb/node-api",
    "@duckdb/node-bindings",
    "better-sqlite3",
  ],
};

export default nextConfig;
