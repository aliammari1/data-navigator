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
      name: "not-to-retired-lib",
      severity: "error",
      comment: "The legacy '@/lib' import surface is retired in this codebase.",
      from: {},
      to: { path: "^src/lib/" },
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
        pathNot: "[.](?:stories|test|spec)[.](?:ts|tsx|js|jsx|mjs|cjs)$",
      },
      to: {
        dependencyTypes: ["npm-dev"],
        dependencyTypesNot: ["type-only"],
        pathNot: ["^node_modules/@types/"],
      },
    },
  ],
  options: {
    doNotFollow: { path: ["node_modules"] },
    includeOnly: ["^(src|electron|scripts|\\.storybook)"],
    exclude: {
      path: ["^src/app/favicon[.]ico$", "^src/app/globals[.]css$", "^src/design/tokens[.]css$"],
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
