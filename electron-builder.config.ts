import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Configuration } from "electron-builder";
import { PRODUCTION_FUSE_CONFIG } from "./electron/security";

const root =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

const appName = "Data Navigator";
const appSlug = "data-navigator";
const appExe = "data-navigator";
const appId = "com.data-navigator.app";
const manufacturer = "Ali Ammari";
const protocolScheme = "com.data-navigator.app";
const wixUpgradeCode = "9f2b6c1e-7a3d-4e58-bc90-1f2a3b4c5d6e";

const stageDir = path.join(root, ".app-stage");
const publicDir = path.join(root, "public");
const iconIco = path.join(publicDir, "icon.ico");
const iconPng = path.join(publicDir, "icon.png");

const nextStandaloneDir = path.join(root, ".next", "standalone");
const nextStaticDir = path.join(root, ".next", "static");
const electronMainBuild = path.join(root, "build", "main.js");
const drizzleDir = path.join(root, "drizzle");
const modelsDir = path.join(root, "models");

const githubOwner = process.env.GITHUB_REPOSITORY_OWNER ?? "aliammari1";
const githubRepo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "data-navigator";
const isPrerelease =
  process.env.PRERELEASE === "true" ||
  process.env.CHANNEL === "alpha" ||
  process.env.CHANNEL === "beta";

// ─── Windows Certificate Detection ──────────────────────────────────────────
const defaultLocalCert = path.join(root, "certs", "windows-code-signing.pfx");
const certPassword = process.env.WINDOWS_CERTIFICATE_PASSWORD;
const certPath =
  process.env.WINDOWS_CERTIFICATE_FILE ||
  (certPassword && fs.existsSync(defaultLocalCert) ? defaultLocalCert : undefined);
const hasWindowsCert = Boolean(certPath && fs.existsSync(certPath) && certPassword);

const COPY_OPTS = { recursive: true, force: true } as const;

/** External packages needed by the Electron main process */
const MAIN_RUNTIME_PACKAGES = [
  "@better-auth",
  "better-auth",
  "better-call",
  "better-sqlite3",
  "better-sqlite3-multiple-ciphers",
  "bonjour-service",
  "conf",
  "drizzle-orm",
  "@duckdb",
  "@hocuspocus",
  "@img",
  "jsonrepair",
  "@lancedb",
  "@mlc-ai",
  "nanoid",
  "@next/env",
  "node-llama-cpp",
  "@node-llama-cpp",
  "onnxruntime-node",
  "p-queue",
  "sharp",
  "sqlite-vec",
  "zod",
];

function requirePath(label: string, targetPath: string): void {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`[stage] Missing ${label}: ${targetPath}`);
  }
}

function safeCopyDir(src: string, dest: string, visited = new Set<string>()): void {
  if (!fs.existsSync(src)) return;
  let real: string;
  try {
    real = fs.realpathSync(src);
  } catch {
    real = src;
  }
  if (visited.has(real)) return;
  visited.add(real);

  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    try {
      if (entry.isDirectory()) {
        safeCopyDir(srcPath, destPath, visited);
      } else if (entry.isSymbolicLink()) {
        const realTarget = fs.realpathSync(srcPath);
        const stat = fs.statSync(realTarget);
        if (stat.isDirectory()) {
          safeCopyDir(realTarget, destPath, visited);
        } else {
          fs.copyFileSync(realTarget, destPath);
        }
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    } catch {
      // Ignore unreadable files or circular link errors
    }
  }
}

function copyPackageIfExists(packageName: string, destDir: string): void {
  const from = path.join(root, "node_modules", packageName);
  const to = path.join(destDir, "node_modules", packageName);
  if (!fs.existsSync(from)) return;
  safeCopyDir(from, to);
}

/**
 * Prune build artifacts, C/C++ source trees, tests, source maps,
 * and foreign OS prebuilds to minimize final executable size.
 */
function pruneDeadWeight(targetDir: string, platform: NodeJS.Platform): void {
  console.log("[stage] Pruning dead weight, source maps, compiler artifacts, and tests...");

  const dropIfExists = (relPath: string) => {
    const full = path.join(targetDir, relPath);
    if (fs.existsSync(full)) {
      fs.rmSync(full, { recursive: true, force: true });
    }
  };

  // 1. node-llama-cpp: remove upstream C++ source trees (187 MB) and intermediate builds (55 MB)
  for (const nm of ["node_modules", "app/node_modules"]) {
    dropIfExists(path.join(nm, "node-llama-cpp", "llama", "llama.cpp"));
    dropIfExists(path.join(nm, "node-llama-cpp", "llama", "localBuilds"));

    // Drop foreign OS backends for @node-llama-cpp
    if (platform === "linux") {
      for (const backend of [
        "win-x64",
        "win-x64-vulkan",
        "win-x64-cuda",
        "win-x64-cuda-ext",
        "win-arm64",
        "linux-arm64",
        "linux-armv7l",
        "darwin-x64",
        "darwin-arm64",
      ]) {
        dropIfExists(path.join(nm, "@node-llama-cpp", backend));
      }
    } else if (platform === "win32") {
      for (const backend of [
        "linux-x64",
        "linux-x64-vulkan",
        "linux-x64-cuda",
        "linux-x64-cuda-ext",
        "linux-arm64",
        "linux-armv7l",
        "darwin-x64",
        "darwin-arm64",
      ]) {
        dropIfExists(path.join(nm, "@node-llama-cpp", backend));
      }
    }

    // Drop foreign OS prebuilds for better-sqlite3-multiple-ciphers
    const ciphersPrebuilds = path.join(nm, "better-sqlite3-multiple-ciphers", "prebuilds");
    if (fs.existsSync(path.join(targetDir, ciphersPrebuilds))) {
      const needed = platform === "win32" ? "win32-x64.node" : "linux-x64.node";
      try {
        const fullDir = path.join(targetDir, ciphersPrebuilds);
        for (const file of fs.readdirSync(fullDir)) {
          if (file !== needed) {
            fs.rmSync(path.join(fullDir, file), { recursive: true, force: true });
          }
        }
      } catch {}
    }

    // onnxruntime-node pruning
    const onnxBin = path.join(targetDir, nm, "onnxruntime-node", "bin", "napi-v6");
    if (fs.existsSync(onnxBin)) {
      const currentPlatform = platform === "win32" ? "win32" : "linux";
      try {
        for (const osDir of fs.readdirSync(onnxBin)) {
          if (osDir !== currentPlatform) {
            fs.rmSync(path.join(onnxBin, osDir), { recursive: true, force: true });
          } else {
            const archFolder = path.join(onnxBin, osDir);
            for (const arch of fs.readdirSync(archFolder)) {
              if (arch !== "x64")
                fs.rmSync(path.join(archFolder, arch), { recursive: true, force: true });
            }
          }
        }
      } catch {}
    }
  }

  // 2. Recursive prune of source maps (.map), types (.d.ts), compiler artifacts (.c, .o, .a), and docs/tests
  const DEAD_DIRS = new Set([
    "__tests__",
    "test",
    "tests",
    "example",
    "examples",
    "docs",
    ".github",
    ".vscode",
  ]);

  const DEAD_EXTENSIONS = new Set([
    ".map",
    ".d.ts",
    ".d.mts",
    ".d.cts",
    ".c",
    ".cc",
    ".cpp",
    ".h",
    ".hpp",
    ".o",
    ".a",
    ".obj",
  ]);

  const walkAndPrune = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (DEAD_DIRS.has(entry.name.toLowerCase())) {
          fs.rmSync(full, { recursive: true, force: true });
        } else {
          walkAndPrune(full);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (DEAD_EXTENSIONS.has(ext) || entry.name.endsWith(".d.ts")) {
          try {
            fs.unlinkSync(full);
          } catch {}
        }
      }
    }
  };

  walkAndPrune(targetDir);
}

/** Stage application files into .app-stage */
function stageApplication(): void {
  try {
    console.log(`[stage] Preparing clean staging directory at ${stageDir}`);
    fs.rmSync(stageDir, { recursive: true, force: true });
    fs.mkdirSync(stageDir, { recursive: true });

    requirePath("Electron main build", electronMainBuild);
    requirePath("Next standalone output", nextStandaloneDir);
    requirePath("Next static output", nextStaticDir);
    requirePath("public assets", publicDir);

    // 1. Electron main bundle
    safeCopyDir(path.join(root, "build"), path.join(stageDir, "build"));
    if (fs.existsSync(drizzleDir)) {
      safeCopyDir(drizzleDir, path.join(stageDir, "drizzle"));
    }

    // 2. Next.js standalone server and web assets
    const appDest = path.join(stageDir, "app");
    safeCopyDir(nextStandaloneDir, appDest);
    safeCopyDir(nextStaticDir, path.join(appDest, ".next", "static"));
    safeCopyDir(publicDir, path.join(appDest, "public"));
    if (fs.existsSync(modelsDir)) {
      safeCopyDir(modelsDir, path.join(appDest, "models"));
    }

    // Next.js standalone server.js calls process.chdir(__dirname).
    // Inside an ASAR archive, process.chdir fails with ENOTDIR because ASAR is an archive, not a real filesystem dir.
    // Patch server.js to safely wrap process.chdir.
    const standaloneServer = path.join(appDest, "server.js");
    if (fs.existsSync(standaloneServer)) {
      let content = fs.readFileSync(standaloneServer, "utf8");
      content = content.replace(
        "process.chdir(__dirname)",
        "try { process.chdir(__dirname); } catch {}",
      );
      fs.writeFileSync(standaloneServer, content, "utf8");
    }

    // 3. Copy main process runtime dependencies (next is omitted: app/ has its own copy)
    for (const pkg of MAIN_RUNTIME_PACKAGES) {
      copyPackageIfExists(pkg, stageDir);
    }

    // 4. Prune dead weight
    pruneDeadWeight(stageDir, process.platform);

    // 5. App package.json
    const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const appPkg = {
      name: appSlug,
      productName: appName,
      version: rootPkg.version,
      author: manufacturer,
      description:
        rootPkg.description ?? "AI-powered local data analysis and visualization platform",
      main: "build/main.js",
    };
    fs.writeFileSync(path.join(stageDir, "package.json"), `${JSON.stringify(appPkg, null, 2)}\n`);
    console.log("[stage] Staging completed successfully.");
  } catch (error) {
    console.error("[stage] FATAL ERROR during stageApplication:", error);
    throw error;
  }
}

/**
 * Return Clean Electron Builder Configuration
 */
export default async function (): Promise<Configuration> {
  stageApplication();

  return {
    appId,
    productName: appName,
    directories: {
      app: stageDir,
      output: "dist",
    },
    files: [
      "build/**/*",
      "app/**/*",
      "drizzle/**/*",
      "package.json",
      "node_modules/**/*",
      "app/node_modules/**/*",
      "app/.next/node_modules/**/*",
      "!**/*.map",
      "!**/*.d.ts",
      "!**/*.{c,cc,cpp,h,hpp,o,a,obj}",
    ],
    asar: true,
    // Only native bindings and sqlite module folders unpacked; everything else is in ASAR
    asarUnpack: [
      "**/*.{node,dll,so,dylib,wasm,onnx,ort,bin,gguf,safetensors}",
      "**/node_modules/better-sqlite3*/**",
      "**/node_modules/better-sqlite3-multiple-ciphers*/**",
    ],
    electronLanguages: ["en-US"],
    compression: "maximum",
    removePackageScripts: true,
    removePackageKeywords: true,
    npmRebuild: false,
    nodeGypRebuild: false,
    toolsets: {
      winCodeSign: "1.1.0",
    },
    protocols: [
      {
        name: "Data Navigator Protocol",
        schemes: [protocolScheme],
      },
      {
        name: "Pyodide Local",
        schemes: ["pyodide"],
      },
    ],

    // ─── Windows Configuration ──────────────────────────────────────────────
    win: {
      target: [
        { target: "msi", arch: ["x64"] },
        { target: "nsis", arch: ["x64"] },
      ],
      executableName: appExe,
      icon: iconIco,
      ...(hasWindowsCert
        ? {
            certificateFile: certPath,
            certificatePassword: certPassword,
            rfc3161TimeStampServer: "http://timestamp.digicert.com",
            signtoolOptions: {
              certificateFile: certPath,
              certificatePassword: certPassword,
              rfc3161TimeStampServer: "http://timestamp.digicert.com",
            },
          }
        : {
            signExecutable: false,
          }),
    },
    msi: {
      upgradeCode: wixUpgradeCode,
      oneClick: false,
      perMachine: false,
      runAfterFinish: true,
    },
    nsis: {
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      perMachine: false,
      runAfterFinish: true,
    },

    // ─── Linux Configuration ────────────────────────────────────────────────
    linux: {
      target: [
        { target: "dir", arch: ["x64"] },
        { target: "AppImage", arch: ["x64"] },
        { target: "deb", arch: ["x64"] },
      ],
      executableName: appExe,
      category: "Utility",
      maintainer: "Ali Ammari <ammari.ali.0001@gmail.com>",
      synopsis: "AI-powered local data analysis and visualization platform",
      description: "AI-powered local data analysis and visualization platform",
      icon: fs.existsSync(iconPng) ? iconPng : iconIco,
      desktop: {
        entry: {
          StartupWMClass: appExe,
          Terminal: "false",
          Categories: "Utility;Office;Development;",
        },
      },
    },
    deb: {
      priority: "optional",
      depends: ["gconf2", "gconf-service", "libnotify4", "libappindicator1", "libxtst6", "libnss3"],
    },

    afterPack: async (context) => {
      const unpackedDir = path.join(context.appOutDir, "resources", "app.asar.unpacked");
      if (!fs.existsSync(unpackedDir)) return;

      console.log(
        `[afterPack] Pruning foreign binaries from app.asar.unpacked for ${context.electronPlatformName}...`,
      );
      const targetPlatform = context.electronPlatformName;
      const walk = (current: string) => {
        if (!fs.existsSync(current)) return;
        for (const item of fs.readdirSync(current, { withFileTypes: true })) {
          const itemPath = path.join(current, item.name);
          if (item.isDirectory()) {
            if (
              (targetPlatform === "linux" &&
                (item.name === "linux-arm64" ||
                  item.name === "linux-armv7l" ||
                  item.name.includes("win32") ||
                  item.name.includes("darwin"))) ||
              (targetPlatform === "win32" &&
                (item.name.includes("linux") ||
                  item.name.includes("darwin") ||
                  item.name.includes("arm")))
            ) {
              fs.rmSync(itemPath, { recursive: true, force: true });
              continue;
            }
            walk(itemPath);
          } else if (item.isFile()) {
            const lower = item.name.toLowerCase();
            const isForeignBinary =
              (targetPlatform === "linux" &&
                (lower.endsWith(".exe") ||
                  lower.endsWith(".dll") ||
                  lower.endsWith(".dylib") ||
                  (lower.endsWith(".node") &&
                    (lower.includes("win32") ||
                      lower.includes("darwin") ||
                      lower.includes("arm64") ||
                      lower.includes("musl"))))) ||
              (targetPlatform === "win32" &&
                (lower.endsWith(".so") ||
                  lower.endsWith(".dylib") ||
                  (lower.endsWith(".node") &&
                    (lower.includes("linux") ||
                      lower.includes("darwin") ||
                      lower.includes("arm64")))));
            if (isForeignBinary) {
              fs.rmSync(itemPath, { force: true });
            }
          }
        }
      };
      walk(unpackedDir);
    },

    // ─── Linux GPG Signing Hook ─────────────────────────────────────────────
    afterAllArtifactBuild: async (buildResult) => {
      const extraArtifacts: string[] = [];
      const gpgKeyId = process.env.GPG_KEY_ID;

      for (const artifactPath of buildResult.artifactPaths) {
        if (artifactPath.endsWith(".AppImage") || artifactPath.endsWith(".deb")) {
          const sigPath = `${artifactPath}.asc`;
          try {
            console.log(`[sign] Signing Linux package with GPG: ${path.basename(artifactPath)}`);
            const args = ["--batch", "--yes", "--detach-sign", "--armor"];
            if (gpgKeyId) {
              args.push("--default-key", gpgKeyId);
            }
            args.push("--output", sigPath, artifactPath);

            execFileSync("gpg", args, { stdio: "inherit" });
            extraArtifacts.push(sigPath);
          } catch {
            console.warn(
              `[sign] Skipped GPG signing for ${path.basename(artifactPath)} (gpg command not found or no key available)`,
            );
          }
        }
      }
      return extraArtifacts;
    },

    // ─── Production Fuses ───────────────────────────────────────────────────
    electronFuses: {
      runAsNode: PRODUCTION_FUSE_CONFIG.RunAsNode,
      enableCookieEncryption: PRODUCTION_FUSE_CONFIG.EnableCookieEncryption,
      enableNodeOptionsEnvironmentVariable:
        PRODUCTION_FUSE_CONFIG.EnableNodeOptionsEnvironmentVariable,
      enableNodeCliInspectArguments: PRODUCTION_FUSE_CONFIG.EnableNodeCliInspectArguments,
      enableEmbeddedAsarIntegrityValidation:
        PRODUCTION_FUSE_CONFIG.EnableEmbeddedAsarIntegrityValidation,
      onlyLoadAppFromAsar: PRODUCTION_FUSE_CONFIG.OnlyLoadAppFromAsar,
      loadBrowserProcessSpecificV8Snapshot:
        PRODUCTION_FUSE_CONFIG.LoadBrowserProcessSpecificV8Snapshot,
      grantFileProtocolExtraPrivileges: PRODUCTION_FUSE_CONFIG.GrantFileProtocolExtraPrivileges,
    },

    publish: {
      provider: "github",
      owner: githubOwner,
      repo: githubRepo,
      releaseType: isPrerelease ? "prerelease" : "draft",
    },
  };
}
