import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const blockedPackages = [
  "ai",
  "@ai-sdk/",
  "ai-sdk",
  "@anthropic-ai/sdk",
  "@anthropic/",
  "anthropic",
  "@sentry/",
  "sentry",
  "@vercel/ai",
];

const sourceRoots = ["src", "electron", "scripts", ".storybook"];
const ignoredDirs = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "public",
]);
const sourceExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);

const importPattern =
  /(?:from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\))/g;

function isBlockedPackage(name) {
  return blockedPackages.some((blocked) =>
    blocked.endsWith("/") ? name.startsWith(blocked) : name === blocked,
  );
}

function isRelativeOrAlias(specifier) {
  return specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("@/");
}

async function collectSourceFiles(dir) {
  const absoluteDir = path.join(root, dir);
  const entries = await readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...(await collectSourceFiles(relative)));
      }
      continue;
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(relative);
    }
  }

  return files;
}

const failures = [];
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
  for (const packageName of Object.keys(packageJson[section] ?? {})) {
    if (isBlockedPackage(packageName)) {
      failures.push(`package.json ${section} includes blocked ${packageName}`);
    }
  }
}

for (const sourceRoot of sourceRoots) {
  for (const file of await collectSourceFiles(sourceRoot)) {
    const content = await readFile(path.join(root, file), "utf8");
    for (const match of content.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (specifier && !isRelativeOrAlias(specifier) && isBlockedPackage(specifier)) {
        failures.push(`${file} imports blocked provider package ${specifier}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Provider boundary check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider boundary check passed.");
