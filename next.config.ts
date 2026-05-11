import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Electron renderer needs these headers for SharedArrayBuffer (DuckDB WASM)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
