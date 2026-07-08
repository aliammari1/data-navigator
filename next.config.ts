import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Don't advertise the framework/version (anti-recon; OWASP A05 / CWE-200).
  poweredByHeader: false,
  typescript: {
    // The production build type-checks shipped application code only. Test,
    // eval, and benchmark trees (tests/, evals/) run under Vitest's own modern
    // target and legitimately use ES2020+ syntax (e.g. BigInt literals) that the
    // app's ES2017 target rejects — they must not gate `next build`.
    tsconfigPath: "tsconfig.build.json",
  },
  async redirects() {
    return [
      // Legacy raw-data route removed (dedup) — it was a hardcoded-table twin of
      // the canonical telecom grid. Keep the path resolving for bookmarks/links.
      {
        source: "/dashboard/browser",
        destination: "/dashboard/telecom-report/grid",
        permanent: false,
      },
    ];
  },
  async headers() {
    // Defense-in-depth for DIRECT localhost HTTP access (a local process or a
    // browser tab hitting http://localhost:3000 OUTSIDE the Electron renderer,
    // whose session injects the fuller CSP via onHeadersReceived). Static headers
    // only — these never break anything; the renderer CSP lives in
    // electron/security.ts.
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
  serverExternalPackages: [
    "@duckdb/node-api",
    "@duckdb/node-bindings",
    "better-sqlite3",
    // Drop-in encrypted (SQLCipher) variant of better-sqlite3 used by the
    // opt-in at-rest-encrypted auth DB path (DN_ENCRYPT_AUTH_DB=1). Native
    // prebuilt binary — must never be webpack-bundled, same as better-sqlite3.
    "better-sqlite3-multiple-ciphers",
    // node-llama-cpp + the embedded collab hub are Electron-main-only native
    // modules. They must never be webpack-bundled — their file structure
    // (prebuilt binaries) must be preserved and resolved via native require.
    "node-llama-cpp",
    "@hocuspocus/server",
    "@hocuspocus/extension-sqlite",
    "bonjour-service",
  ],
};

export default nextConfig;
