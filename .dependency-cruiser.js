/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "warn",
      comment: "Circular imports make feature boundaries harder to change.",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment: "Every import must resolve through Node, TypeScript paths, or the local file tree.",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-non-package-json",
      severity: "error",
      comment: "Runtime npm imports must be declared in package.json.",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "not-to-test",
      severity: "error",
      comment: "Production code must not import tests.",
      from: { pathNot: "^(tests|src/.+[.](?:test|spec)[.])" },
      to: { path: "^(tests|src/.+[.](?:test|spec)[.])" },
    },
    {
      name: "not-to-story",
      severity: "error",
      comment: "Application code must not import Storybook-only stories.",
      from: { pathNot: "([.]stories[.](?:ts|tsx|mdx)$|^\\.storybook/)" },
      to: { path: "[.]stories[.](?:ts|tsx|mdx)$" },
    },
    {
      name: "core-stays-independent",
      severity: "warn",
      comment: "Core modules must not depend on app, feature, platform, or component layers.",
      from: { path: "^src/core/" },
      to: { path: "^src/(app|features|platform|components)/" },
    },
    {
      name: "platform-stays-independent",
      severity: "warn",
      comment: "Platform modules must not depend on app, feature, or component layers.",
      from: { path: "^src/platform/" },
      to: { path: "^src/(app|features|components)/" },
    },
    {
      name: "shared-stays-light",
      severity: "warn",
      comment: "Shared utilities stay dependency-light and must not reach into product layers.",
      from: { path: "^src/shared/" },
      to: {
        path: "^src/(app|core|features|platform|components|design|workers)/",
      },
    },
    {
      name: "not-to-dev-dep-from-src",
      severity: "error",
      comment: "Browser production code must not import packages declared only as devDependencies.",
      from: {
        path: "^src/",
        pathNot: [
          "[.](?:stories|test|spec)[.](?:ts|tsx|js|jsx|mjs|cjs)$",
          // Dev-only profiler: react-scan is gated behind `NODE_ENV !== "production"`
          // and loaded via dynamic `import()` so it is dead-code-eliminated from prod
          // bundles (see react-scan-dev.ts). It correctly stays a devDependency and
          // never ships, so this single file is exempt from the prod-import rule.
          "^src/platform/perf/react-scan-dev[.]ts$",
          // Same pattern for the React Query devtools island: NODE_ENV-gated
          // dynamic import, dead-code-eliminated from production bundles.
          "^src/components/query-devtools[.]tsx$",
        ],
      },
      to: {
        dependencyTypes: ["npm-dev"],
        dependencyTypesNot: ["type-only"],
        pathNot: ["^node_modules/@types/"],
      },
    },
    {
      name: "no-cloud-ai-or-telemetry",
      severity: "error",
      comment:
        "Offline-first: forbid cloud LLM SDKs and telemetry anywhere. Replaces scripts/check-provider-boundaries.mjs — all AI must run locally via @/platform/ai/provider.",
      from: {},
      to: {
        path: "node_modules/(?:[.]pnpm/)?(?:@ai-sdk[@+/]|@anthropic-ai[@+/]sdk|@anthropic[@+/]|@vercel[+/]ai|@sentry[@+/]|ai[@/]|ai-sdk[@/]|sentry[@/])",
        // `import type` references (e.g. UIMessage/ToolUIPart in ai-elements)
        // are erased at compile time and ship zero SDK code — same carve-out
        // as not-to-dev-dep-from-src. Only runtime imports can phone home.
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "ai-engine-only-in-platform-or-workers",
      severity: "error",
      comment:
        "Local-LLM engine packages may only be imported under src/platform/ai, src/workers, or a genuine Web Worker entry point (a *.worker.ts / *-worker.ts module run off-thread). Everything else (UI/feature code) must consume @/platform/ai/provider so capability routing + the WebGPU-safety demotion apply uniformly. Worker entry points are excluded because they already run in an isolated thread and load the engine directly via new Worker(new URL(...)).",
      from: {
        path: "^src/",
        // Allowed homes for the heavy engine import:
        //  - src/platform/ai/** (the central provider/adapter layer)
        //  - src/workers/** (shared worker pool)
        //  - any genuine Web Worker entry point, identified by a
        //    `*.worker.ts` / `*-worker.ts` filename, regardless of folder.
        //    This intentionally does NOT broaden to all of src/features.
        pathNot: ["^src/(?:platform/ai|workers)/", "[.-]worker[.]ts$"],
      },
      to: { path: "(?:@mlc-ai/web-llm|@huggingface/transformers|@xenova/transformers)" },
    },
    {
      name: "renderer-no-main-only-natives",
      severity: "error",
      comment:
        "Renderer code under src/ must not import main-process-only native packages (these have no browser build and would crash the renderer / leak the privileged boundary). They belong in electron/, scripts, or a main-only adapter that the renderer reaches via IPC. EXCEPTIONS: electron/, scripts/, *.config.*, and src/platform/auth/auth-database.ts (a Node-only better-auth adapter loaded lazily in the main/server context, never bundled into the browser).",
      from: {
        path: "^src/",
        pathNot: [
          "[.]config[.](?:ts|tsx|js|jsx|mjs|cjs)$",
          "[.](?:stories|test|spec)[.](?:ts|tsx|js|jsx|mjs|cjs)$",
          // Known main-only / server-only adapters consumed by the renderer via IPC
          // or only ever executed in the Node/server context, never bundled to the
          // browser. Keep this list tight so genuine renderer leaks are still caught.
          "^src/platform/auth/auth-database[.]ts$",
          // db-bootstrap's native access (better-sqlite3 require, node:sqlite
          // builtin) is function-scoped and guarded; its only importers are the
          // main-only auth-database adapter, electron/*, and tests — it is never
          // re-exported through src/platform/storage/index, so no renderer bundle
          // includes it.
          "^src/platform/storage/db-bootstrap[.]ts$",
        ],
      },
      to: {
        path: "node_modules/(?:@duckdb/node-api|@duckdb[+]node-api|better-sqlite3|better-sqlite3-multiple-ciphers|node-llama-cpp|@hocuspocus/server|@hocuspocus[+]server|bonjour-service)(?:[@/]|$)",
      },
    },
    {
      name: "renderer-no-node-builtins",
      severity: "error",
      comment:
        "Renderer code under src/ must not import Node core builtins (node:* / fs, path, crypto, child_process, …). These only exist in the privileged main process; importing them in renderer code either crashes in the browser or signals a main↔renderer boundary leak. Use the preload-exposed IPC bridge instead. EXCEPTIONS: electron/, scripts/, *.config.*, and src/platform/auth/auth-database.ts (Node-only better-auth adapter loaded lazily in the main/server context).",
      from: {
        path: "^src/",
        pathNot: [
          "[.]config[.](?:ts|tsx|js|jsx|mjs|cjs)$",
          "[.](?:stories|test|spec)[.](?:ts|tsx|js|jsx|mjs|cjs)$",
          "^src/platform/auth/auth-database[.]ts$",
          // Same main-only standing: db-bootstrap's node:sqlite access is
          // function-scoped behind process.getBuiltinModule?.() and never
          // executes in the browser. See renderer-no-main-only-natives.
          "^src/platform/storage/db-bootstrap[.]ts$",
          // Next.js server-side utilities (Node.js runtime only, never bundled to browser)
          "^src/server/",
          // Next.js server proxy / middleware (Node.js runtime only, never bundled to browser)
          "^src/proxy[.]ts$",
        ],
      },
      to: {
        dependencyTypes: ["core"],
      },
    },
    {
      name: "renderer-no-electron",
      severity: "error",
      comment:
        "Renderer code under src/ must not import the `electron` module. It only exists in the privileged main process; reaching for it from renderer code crashes in the browser and is a main↔renderer boundary leak. Use the preload-exposed IPC bridge instead. EXCEPTIONS: electron/, scripts/, *.config.*, and src/platform/auth/auth-database.ts.",
      from: {
        path: "^src/",
        pathNot: [
          "[.]config[.](?:ts|tsx|js|jsx|mjs|cjs)$",
          "[.](?:stories|test|spec)[.](?:ts|tsx|js|jsx|mjs|cjs)$",
          "^src/platform/auth/auth-database[.]ts$",
        ],
      },
      to: {
        path: "node_modules/electron(?:[/]|$)",
      },
    },
    {
      name: "no-cross-feature-imports",
      severity: "warn",
      comment:
        "A feature must not reach into another feature. Share via src/{platform,core,shared,components,design} instead. The telecom report engine is the product; support features must stay decoupled.",
      from: { path: "^src/features/([^/]+)/" },
      to: {
        path: "^src/features/([^/]+)/",
        pathNot: "^src/features/$1/",
      },
    },
    {
      name: "ui-primitives-stay-pure",
      severity: "warn",
      comment:
        "shadcn UI primitives (src/components/ui, src/design) must not import product layers, so they stay swappable and visually cohesive.",
      from: { path: "^src/(components/ui|design)/" },
      to: { path: "^src/(app|features|platform|core)/" },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment:
        "Modules nothing imports are likely dead or half-wired (the 'half-implemented stacks' problem). Wire them up or delete them.",
      from: {
        orphan: true,
        pathNot: [
          "[.]d[.]ts$",
          "[.]stories[.](?:ts|tsx|mdx)$",
          "[.](?:test|spec)[.](?:ts|tsx)$",
          "(?:^|/)src/app/.+/(?:page|layout|loading|error|template|not-found|route|default|global-error)[.]tsx?$",
          "(?:^|/)src/app/(?:layout|page|error|loading|not-found|global-error|sitemap|robots)[.]tsx?$",
          "(?:^|/)src/types/",
          "(?:^|/)src/workers/.+[.]worker[.]ts$",
          "(?:^|/)next-env[.]d[.]ts$",
          "[.]config[.](?:ts|js|mjs|cjs)$",
          "(?:^|/)[.]storybook/",
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: ["node_modules"] },
    exclude: {
      path: ["^src/app/favicon[.]ico$", "^src/app/globals[.]css$"],
    },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: "specify",
    enhancedResolveOptions: {
      conditionNames: ["import", "require", "node", "browser", "default", "types"],
      extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css"],
      exportsFields: ["exports"],
      mainFields: ["browser", "module", "main", "types", "typings"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/(?:@[^/]+/[^/]+|[^/]+)",
      },
      text: {
        highlightFocused: true,
      },
    },
  },
};
