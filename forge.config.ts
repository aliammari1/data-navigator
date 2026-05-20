import path from "node:path";
import { MakerWix } from "@electron-forge/maker-wix";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { ElectronegativityPlugin } from "@electron-forge/plugin-electronegativity";
import type { ForgeConfig } from "@electron-forge/shared-types";

const config: ForgeConfig = {
  packagerConfig: {
    name: "Data Navigator",
    executableName: "Data Navigator",
    appBundleId: "com.data-navigator.app",
    appCategoryType: "public.app-category.productivity",
    icon: path.resolve(__dirname, "public/icon"),
    asar: true,
  },

  plugins: [
    new ElectronegativityPlugin({
      isSarif: true,
    }),
    new AutoUnpackNativesPlugin({}),
  ],

  makers: [
    new MakerWix(
      {
        language: 1033,
        manufacturer: "Ali Ammari",
        arch: "x64",
        name: "Data Navigator",
        exe: "Data Navigator",
        shortName: "DataNavigator",
        icon: path.resolve(__dirname, "public/icon.ico"),
        upgradeCode: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      },
      ["win32"],
    ),
  ],
};

export default config;
