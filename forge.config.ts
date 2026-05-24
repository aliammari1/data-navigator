import fs from "node:fs";
import path from "node:path";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { MakerWix } from "@electron-forge/maker-wix";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { ElectronegativityPlugin } from "@electron-forge/plugin-electronegativity";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import type { ForgeConfig } from "@electron-forge/shared-types";

const config: ForgeConfig = {
  packagerConfig: {
    name: "Data Navigator",
    executableName: "data-navigator",
    appBundleId: "com.data-navigator.app",
    appCategoryType: "public.app-category.productivity",
    icon: path.resolve(__dirname, "public/icon"),
    asar: {
      unpack: "**/*.{node,dll}",
      unpackDir:
        "{node_modules/next,node_modules/@img,node_modules/sharp,app/node_modules/next,app/node_modules/@img,app/node_modules/sharp}",
    },
    ignore: (filePath) => {
      if (!filePath) return false;

      const keep = [
        /^\/build(?:\/|$)/,
        /^\/app(?:\/|$)/,
        /^\/public(?:\/|$)/,
        /^\/package\.json$/,

        // Keep production dependencies.
        /^\/node_modules(?:\/|$)/,
      ];

      return !keep.some((r) => r.test(filePath));
    },
  },

  makers: [
    new MakerWix(
      {
        language: 1033,
        manufacturer: "Ali Ammari",
        arch: "x64",
        name: "Data Navigator",
        exe: "data-navigator",
        shortName: "DataNavigator",
        icon: path.resolve(__dirname, "public/icon.ico"),
        upgradeCode: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      },
      ["win32"],
    ),
  ],

  plugins: [
    new AutoUnpackNativesPlugin({}),
    new ElectronegativityPlugin({
      isSarif: true,
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],

  hooks: {
    packageAfterCopy: async (
      _config,
      buildPath,
      _electronVersion,
      _platform,
      _arch,
    ) => {
      const appDest = path.join(buildPath, "app");

      console.log("[forge] Copying Next standalone app");
      fs.rmSync(appDest, { recursive: true, force: true });
      fs.cpSync(path.join(__dirname, ".next", "standalone"), appDest, {
        recursive: true,
        force: true,
      });

      console.log("[forge] Copying Next static assets");
      fs.cpSync(
        path.join(__dirname, ".next", "static"),
        path.join(appDest, ".next", "static"),
        {
          recursive: true,
          force: true,
        },
      );

      console.log("[forge] Copying public assets");
      fs.cpSync(path.join(__dirname, "public"), path.join(appDest, "public"), {
        recursive: true,
        force: true,
      });

      const nodeModulesSrc = path.join(__dirname, "node_modules");

      for (const name of ["@duckdb", "detect-libc"]) {
        const src = path.join(nodeModulesSrc, name);
        const dest = path.join(buildPath, "node_modules", name);

        if (fs.existsSync(src)) {
          console.log(`[forge] Copying ${name} to build directory`);
          fs.cpSync(src, dest, { recursive: true, force: true });
        }
      }
    },
  },
};

export default config;
