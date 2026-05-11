const path = require("node:path");

module.exports = {
  packagerConfig: {
    name: "Data Navigator",
    executableName: "Data Navigator",
    appBundleId: "com.data-navigator.app",
    appCategoryType: "public.app-category.productivity",

    asar: true,

    icon: path.resolve(__dirname, "build/icon"),

    prune: true,

    ignore: [
      /^\/src($|\/)/,
      /^\/electron\/.*\.ts$/,
      /^\/scripts\/(?!prepare-standalone\.mjs$)/,
      /^\/dist($|\/)/,
      /^\/out\/make($|\/)/,
      /^\/\.next\/cache($|\/)/,
      /^\/\.next\/trace$/,
      /^\/\.git($|\/)/,
      /^\/\.vscode($|\/)/,
      /^\/\.idea($|\/)/,
      /^\/.*\.log$/
    ]
  },

  rebuildConfig: {},

  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "data_navigator",
        setupExe: "Data-Navigator-Setup.exe",
        setupIcon: path.resolve(__dirname, "build/icon.ico")
      }
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"]
    },
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: {
        name: "Data Navigator",
        icon: path.resolve(__dirname, "build/icon.icns")
      }
    },
    {
      name: "@electron-forge/maker-deb",
      config: {
        options: {
          name: "data-navigator",
          productName: "Data Navigator",
          genericName: "Data Navigator",
          categories: ["Utility"]
        }
      }
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {}
    }
  ],

  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {}
    }
  ]
};
