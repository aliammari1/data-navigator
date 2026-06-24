// electron-builder configuration — replaces electron-forge (forge.config.ts).
//
// Run: pnpm exec electron-builder --win --x64 --publish never --config electron-builder.config.cjs
//
// PREREQUISITE: scripts/stage-app.mjs has already produced REAL-FILE (zero-symlink)
// ./app (the Next.js standalone the Electron main serves from app.getAppPath()/app)
// and ./build/node_modules (the Electron main's external native deps). electron-builder
// packs those verbatim and never has to walk pnpm's isolated/symlinked store.

// camelCase mirror of electron/security.ts -> PRODUCTION_FUSE_CONFIG (the single source
// of truth). Asserted-equal by electron/__tests__/eb-fuses-sync.test.ts. electron-builder
// flips these AFTER packing and BEFORE signing, and writes the Windows ElectronAsar
// integrity resource that EnableEmbeddedAsarIntegrityValidation needs.
const electronFuses = {
  resetAdHocDarwinSignature: false, // win32 build; no-op
  runAsNode: false,
  enableCookieEncryption: true,
  enableNodeOptionsEnvironmentVariable: false,
  enableNodeCliInspectArguments: false,
  enableEmbeddedAsarIntegrityValidation: true,
  onlyLoadAppFromAsar: true,
  loadBrowserProcessSpecificV8Snapshot: true,
  grantFileProtocolExtraPrivileges: false,
};

// Native dirs whose .node files dlopen ADJACENT .dll/.bin/.gguf — unpack the whole dir
// out of the asar, for BOTH the Electron-main tree (build/node_modules) and the Next
// standalone tree (app/node_modules). Mirrors forge.config.ts asarUnpackDirs.
const nativePkgs = [
  "@duckdb",
  "@img",
  "@lancedb",
  "@mlc-ai",
  "detect-libc",
  "next",
  "onnxruntime-node",
  "sharp",
  "sherpa-onnx-node",
  "sqlite-vec",
  "better-sqlite3",
  "node-llama-cpp",
  "@node-llama-cpp",
];

const asarUnpack = [
  // Catch-all for any loose binary the explicit dirs miss (matches forge's unpack glob).
  "**/*.{node,dll,so,dylib,wasm,onnx,ort,bin,gguf,safetensors}",
  ...nativePkgs.map((p) => `build/node_modules/${p}/**`),
  ...nativePkgs.map((p) => `app/node_modules/${p}/**`),
];

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: "com.data-navigator.app",
  productName: "Data Navigator",
  copyright: "Copyright © 2026 Ali Ammari",

  // Pin so a mismatched Electron in CI can't build the wrong ABI for fuses/native rebuild.
  electronVersion: "42.4.1",

  directories: {
    output: "dist",
    buildResources: "build-resources",
  },

  // Keep asar ON so OnlyLoadAppFromAsar + EnableEmbeddedAsarIntegrityValidation are
  // meaningful and electron-builder writes the Win32 ElectronAsar integrity resource.
  asar: true,

  // We pre-stage REAL files; ship only what we staged. The first non-"!" pattern
  // disables electron-builder's implicit **/*, so the dev/root node_modules (pnpm's
  // isolated symlink web, which electron-builder cannot collect) is NOT pulled in.
  // build/node_modules (the staged Electron-main tree) rides along inside build/**.
  // The Next standalone is staged at ./electron-app (NOT ./app — see stage-app.mjs)
  // and remapped to app/ INSIDE the package by the {from:"electron-app",to:"app"}
  // FileSet, so the Electron main still resolves app.getAppPath()/app at runtime and
  // its staged ./electron-app/node_modules lands at app/node_modules in the asar.
  // "!node_modules/**/*" hard-excludes the root pnpm symlink web so electron-builder's
  // production-dependency collector never tries to walk it (it would fail on the
  // isolated .pnpm store). Our real deps ride inside build/** and electron-app/**.
  files: [
    "build/**/*",
    "package.json",
    { from: "electron-app", to: "app" },
    "!node_modules/**/*",
    "!**/*.{map,md,markdown,ts,tsx,d.ts}",
    "!**/{test,__tests__,tests,powered-test,example,examples,.bin,.cache}/**",
  ],

  asarUnpack,

  // We stage prebuilt native binaries and rebuild for the Electron ABI in a dedicated
  // CI step (`native:rebuild`, mirroring forge rebuildConfig.onlyModules). Do NOT let
  // electron-builder rebuild the flattened tree (wrong ABI / source-compile risk).
  npmRebuild: false,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,

  electronFuses,

  protocols: [{ name: "Data Navigator Protocol", schemes: ["com.data-navigator.app"] }],

  win: {
    // NSIS is electron-builder's most-exercised, CI-reliable Windows target and avoids
    // the WiX path entirely. MSI is a second target for the project's MSI preference;
    // delete the {target:"msi"} object if it proves flaky in CI.
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "msi", arch: ["x64"] },
    ],
    icon: "public/icon.ico",
    executableName: "data-navigator",
    requestedExecutionLevel: "asInvoker",
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Data Navigator",
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },

  msi: {
    // CRITICAL: reuse forge's GUID so already-installed users get an upgrade, not a
    // side-by-side install. Must stay stable across releases.
    upgradeCode: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    oneClick: false,
    perMachine: false,
    runAfterFinish: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Data Navigator",
    artifactName: "${productName}-${version}-${arch}.${ext}",
    // WiX warnings must not hard-fail CI (electron-builder defaults this true for msi),
    // and -sval skips ICE validation which fixes the hosted-runner WiX light.exe exit 217.
    warningsAsErrors: false,
    additionalLightArgs: ["-sval"],
  },
};

module.exports = config;
module.exports.electronFuses = electronFuses;
