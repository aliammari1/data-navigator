// .storybook/main.ts
import type { StorybookConfig } from "@storybook/nextjs-vite";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.storybook", quiet: true });

const publicFigmaEnvironment = {
  STORYBOOK_FIGMA_FILE_URL: process.env.STORYBOOK_FIGMA_FILE_URL ?? "",
  STORYBOOK_FIGMA_BUTTON_NODE_ID: process.env.STORYBOOK_FIGMA_BUTTON_NODE_ID ?? "",
  STORYBOOK_FIGMA_EMPTY_NODE_ID: process.env.STORYBOOK_FIGMA_EMPTY_NODE_ID ?? "",
};

// Electron + Node built-ins are referenced transitively by app modules that get
// pulled into stories. The (old) webpack builder stubbed them via
// `resolve.alias = false`; under the Vite builder we resolve the exact bare/`node:`
// specifiers to a virtual empty module instead. Scoped to exact ids so Vite's own
// tooling (which uses Node directly, not the bundler graph) is unaffected.
const STUBBED_BROWSER_EXTERNALS = new Set<string>([
  "electron",
  "fs",
  "path",
  "os",
  "crypto",
  "node:fs",
  "node:path",
  "node:os",
  "node:crypto",
]);
const EMPTY_STUB_ID = "\0sb-empty-node-stub";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },

  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)", "../src/**/*.mdx"],

  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
    "@storybook/addon-designs",
  ],

  staticDirs: ["../public"],

  env: (environment) => ({
    ...environment,
    ...publicFigmaEnvironment,
  }),

  typescript: {
    reactDocgen: "react-docgen-typescript",
  },

  viteFinal: async (viteConfig) => {
    viteConfig.plugins ??= [];
    viteConfig.plugins.push({
      name: "stub-node-builtins-for-storybook",
      enforce: "pre",
      resolveId(id) {
        return STUBBED_BROWSER_EXTERNALS.has(id) ? EMPTY_STUB_ID : null;
      },
      load(id) {
        return id === EMPTY_STUB_ID ? "export default {};" : null;
      },
    });
    return viteConfig;
  },
};

export default config;
