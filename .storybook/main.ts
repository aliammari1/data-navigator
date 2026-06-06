// .storybook/main.ts
import type { StorybookConfig } from "@storybook/nextjs";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.storybook", quiet: true });

const publicFigmaEnvironment = {
  STORYBOOK_FIGMA_FILE_URL: process.env.STORYBOOK_FIGMA_FILE_URL ?? "",
  STORYBOOK_FIGMA_BUTTON_NODE_ID:
    process.env.STORYBOOK_FIGMA_BUTTON_NODE_ID ?? "",
  STORYBOOK_FIGMA_EMPTY_NODE_ID:
    process.env.STORYBOOK_FIGMA_EMPTY_NODE_ID ?? "",
};

const config: StorybookConfig = {
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },

  stories: ["../src/**/*.stories.@(ts|tsx|mdx)"],

  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-designs"],

  staticDirs: ["../public"],

  env: (environment) => ({
    ...environment,
    ...publicFigmaEnvironment,
  }),

  typescript: {
    reactDocgen: "react-docgen-typescript",
  },

  webpackFinal: async (config) => {
    config.resolve ??= {};
    config.resolve.alias ??= {};

    /**
     * Prevent Storybook renderer from trying to bundle Electron main/preload
     * modules. Components should use the mocked window APIs instead.
     */
    config.resolve.alias = {
      ...config.resolve.alias,
      electron: false,
      "node:fs": false,
      "node:path": false,
      "node:os": false,
      "node:crypto": false,
    };

    return config;
  },
};

export default config;
