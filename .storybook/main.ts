// .storybook/main.ts
import type { StorybookConfig } from "@storybook/nextjs";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },

  stories: [
    "../app/**/*.stories.@(ts|tsx|mdx)",
    "../src/**/*.stories.@(ts|tsx|mdx)",
    "../features/**/*.stories.@(ts|tsx|mdx)",
    "../components/**/*.stories.@(ts|tsx|mdx)",
  ],

  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-designs",
  ],

  staticDirs: [
    "../public",
    {
      from: "../models",
      to: "/models",
    },
  ],

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
