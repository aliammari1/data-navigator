import fs from "node:fs";
import path from "node:path";
// import { FuseV1Options, FuseVersion } from "@electron/fuses";
// import { MakerMSIX } from "@electron-forge/maker-msix";
// import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerWix } from "@electron-forge/maker-wix";
// import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { ElectronegativityPlugin } from "@electron-forge/plugin-electronegativity";
import { PublisherGithub } from "@electron-forge/publisher-github";
import type { ForgeConfig } from "@electron-forge/shared-types";

/**
 * Forge configuration sources:
 *
 * TypeScript constructor syntax:
 * https://www.electronforge.io/config/typescript-configuration
 *
 * Makers:
 * https://www.electronforge.io/config/makers
 * https://www.electronforge.io/config/makers/zip
 * https://www.electronforge.io/config/makers/msix
 *
 * GitHub Publisher:
 * https://www.electronforge.io/config/publishers/github
 *
 * Lifecycle hooks:
 * https://www.electronforge.io/config/hooks
 *
 * Native module unpacking:
 * https://www.electronforge.io/config/plugins/auto-unpack-natives
 *
 * Fuses / ASAR integrity:
 * https://www.electronforge.io/config/plugins/fuses
 * https://www.electronjs.org/docs/latest/tutorial/asar-integrity
 *
 * Windows signing:
 * https://www.electronforge.io/guides/code-signing/code-signing-windows
 */

const root = __dirname;

const appName = "Data Navigator";
const appSlug = "data-navigator";
const appExe = "data-navigator";
const appId = "com.data-navigator.app";
const manufacturer = "Ali Ammari";

const publicDir = path.join(root, "public");
const iconBase = path.join(publicDir, "icon");
const iconIco = path.join(publicDir, "icon.ico");

const nextStandaloneDir = path.join(root, ".next", "standalone");
const nextStaticDir = path.join(root, ".next", "static");
const electronMainBuild = path.join(root, "build", "main.js");

const githubOwner = process.env.GITHUB_REPOSITORY_OWNER ?? "aliammari1";
const githubRepo =
  process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "data-navigator";

const hasWindowsCertificate =
  Boolean(process.env.WINDOWS_CERTIFICATE_FILE) &&
  Boolean(process.env.WINDOWS_CERTIFICATE_PASSWORD);

const windowsCertificateConfig = hasWindowsCertificate
  ? {
      certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
      certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
    }
  : {};

function requirePath(label: string, targetPath: string) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`[forge] Missing ${label}: ${targetPath}`);
  }
}

function copyDir(label: string, from: string, to: string) {
  requirePath(label, from);

  console.log(`[forge] Copying ${label}`);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true, force: true });
}

function copyDirIfExists(label: string, from: string, to: string) {
  if (!fs.existsSync(from)) return;

  console.log(`[forge] Copying ${label}`);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true, force: true });
}

function copyPackageIfExists(packageName: string, buildPath: string) {
  const from = path.join(root, "node_modules", packageName);
  const to = path.join(buildPath, "node_modules", packageName);

  if (!fs.existsSync(from)) return;

  console.log(`[forge] Copying runtime package: ${packageName}`);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true, force: true });
}

const asarUnpackDirs = [
  "node_modules/@duckdb",
  "node_modules/@img",
  "node_modules/@lancedb",
  "node_modules/@mlc-ai",
  "node_modules/detect-libc",
  "node_modules/next",
  "node_modules/onnxruntime-node",
  "node_modules/sharp",
  "node_modules/sherpa-onnx-node",
  "node_modules/sqlite-vec",

  "app/node_modules/@duckdb",
  "app/node_modules/@img",
  "app/node_modules/@lancedb",
  "app/node_modules/@mlc-ai",
  "app/node_modules/detect-libc",
  "app/node_modules/next",
  "app/node_modules/onnxruntime-node",
  "app/node_modules/sharp",
  "app/node_modules/sherpa-onnx-node",
  "app/node_modules/sqlite-vec",
].join(",");

const config: ForgeConfig = {
  packagerConfig: {
    name: appName,
    executableName: appExe,
    appBundleId: appId,
    appCategoryType: "public.app-category.productivity",
    icon: iconBase,
    overwrite: true,
    prune: true,

    win32metadata: {
      CompanyName: manufacturer,
      FileDescription: appName,
      InternalName: appName,
      OriginalFilename: `${appExe}.exe`,
      ProductName: appName,
    },

    asar: {
      unpack: "**/*.{node,dll,so,dylib,wasm,onnx,ort,bin,gguf,safetensors}",
      unpackDir: `{${asarUnpackDirs}}`,
    },

    ignore: (filePath) => {
      if (!filePath) return false;

      const keep = [
        /^\/build(?:\/|$)/,
        /^\/app(?:\/|$)/,
        /^\/public(?:\/|$)/,
        /^\/models(?:\/|$)/,
        /^\/package\.json$/,
        /^\/node_modules(?:\/|$)/,
      ];

      return !keep.some((pattern) => pattern.test(filePath));
    },
  },

  rebuildConfig: {
    force: true,
    onlyModules: [
      "@duckdb/node-bindings",
      "sherpa-onnx-node",
      "sqlite-vec",
    ],
  },

  makers: [
    new MakerWix(
      {
        language: 1033,
        manufacturer,
        arch: "x64",
        name: appName,
        exe: appExe,
        shortName: "DataNavigator",
        icon: iconIco,
        upgradeCode: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        ...windowsCertificateConfig,
      },
      ["win32"],
    ),

    // new MakerSquirrel(
    //   {
    //     name: appSlug.replaceAll("-", "_"),
    //     authors: manufacturer,
    //     description:
    //       "AI-powered local data analysis and visualization platform",
    //     setupExe: "DataNavigatorSetup.exe",
    //     setupIcon: iconIco,
    //     noMsi: true,
    //     ...windowsCertificateConfig,
    //   },
    //   ["win32"],
    // ),

    // new MakerMSIX(
    //   {
    //     manifestVariables: {
    //       packageIdentity: "AliAmmari.DataNavigator",
    //       appDisplayName: appName,
    //       publisher: process.env.WINDOWS_PUBLISHER ?? "CN=Ali Ammari",
    //       publisherDisplayName: manufacturer,
    //       packageDescription:
    //         "AI-powered local data analysis and visualization platform",
    //     },

    //     ...(hasWindowsCertificate
    //       ? {
    //           windowsSignOptions: {
    //             certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
    //             certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
    //           },
    //         }
    //       : {}),
    //   },
    //   ["win32"],
    // ),

    // new MakerZIP({}, ["win32"]),
  ],

  publishers: [
    new PublisherGithub({
      repository: {
        owner: githubOwner,
        name: githubRepo,
      },
      draft: true,
      prerelease:
        process.env.PRERELEASE === "true" ||
        process.env.CHANNEL === "alpha" ||
        process.env.CHANNEL === "beta",
    }),
  ],

  plugins: [
    new AutoUnpackNativesPlugin({}),

    new ElectronegativityPlugin({
      isSarif: true,
    }),
  ],

  hooks: {
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      requirePath("Electron main build", electronMainBuild);
      requirePath("Next standalone output", nextStandaloneDir);
      requirePath("Next static output", nextStaticDir);
      requirePath("public assets", publicDir);
      requirePath("Windows icon", iconIco);

      const appDest = path.join(buildPath, "app");

      copyDir("Next standalone app", nextStandaloneDir, appDest);

      copyDir(
        "Next static assets",
        nextStaticDir,
        path.join(appDest, ".next", "static"),
      );

      copyDir("public assets", publicDir, path.join(appDest, "public"));

      copyDirIfExists(
        "local edge-AI models",
        path.join(root, "models"),
        path.join(appDest, "models"),
      );

      for (const packageName of [
        "@duckdb",
        "@lancedb",
        "@mlc-ai",
        "detect-libc",
        "onnxruntime-node",
        "sharp",
        "sherpa-onnx-node",
        "sqlite-vec",
      ]) {
        copyPackageIfExists(packageName, buildPath);
      }
    },

    packageAfterPrune: async (_forgeConfig, buildPath) => {
      const packageJsonPath = path.join(buildPath, "package.json");

      if (!fs.existsSync(packageJsonPath)) return;

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

      packageJson.name = appSlug;
      packageJson.productName = appName;
      packageJson.author = manufacturer;
      packageJson.description =
        "AI-powered local data analysis and visualization platform";
      packageJson.main = "build/main.js";

      fs.writeFileSync(
        packageJsonPath,
        `${JSON.stringify(packageJson, null, 2)}\n`,
      );
    },
  },
};

export default config;
