// scripts/generate-src-stories.ts

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const SRC_DIR = path.resolve(process.cwd(), "src");

const ignoredFileNames = new Set([
  "index.tsx",
  "layout.tsx",
  "page.tsx",
  "loading.tsx",
  "error.tsx",
  "not-found.tsx",
  "template.tsx",
  "default.tsx",
  "route.tsx",
]);

function toPascalCase(input: string) {
  return input
    .replace(/\.[^.]+$/, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toStoryTitle(filePath: string) {
  const relative = path
    .relative(SRC_DIR, filePath)
    .replace(/\\/g, "/")
    .replace(/\.tsx$/, "");

  return `Src/${relative
    .split("/")
    .map((part) => toPascalCase(part))
    .join("/")}`;
}

function getComponentName(filePath: string) {
  const baseName = path.basename(filePath).replace(/\.tsx$/, "");
  return toPascalCase(baseName);
}

function shouldSkip(filePath: string) {
  const fileName = path.basename(filePath);

  if (!fileName.endsWith(".tsx")) return true;
  if (fileName.endsWith(".stories.tsx")) return true;
  if (fileName.endsWith(".test.tsx")) return true;
  if (fileName.endsWith(".spec.tsx")) return true;
  if (ignoredFileNames.has(fileName)) return true;

  return false;
}

function makeStory(componentFile: string) {
  const baseName = path.basename(componentFile).replace(/\.tsx$/, "");
  const componentName = getComponentName(componentFile);
  const title = toStoryTitle(componentFile);

  return `import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ${componentName} } from "./${baseName}";

const meta = {
  title: "${title}",
  component: ${componentName},
  tags: ["autodocs"],
} satisfies Meta<typeof ${componentName}>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
`;
}

function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (shouldSkip(fullPath)) continue;

    const storyPath = fullPath.replace(/\.tsx$/, ".stories.tsx");

    if (existsSync(storyPath)) {
      console.log(`Skipped existing story: ${path.relative(process.cwd(), storyPath)}`);
      continue;
    }

    mkdirSync(path.dirname(storyPath), { recursive: true });
    writeFileSync(storyPath, makeStory(fullPath), "utf8");

    console.log(`Created story: ${path.relative(process.cwd(), storyPath)}`);
  }
}

if (!existsSync(SRC_DIR)) {
  throw new Error(`src directory not found: ${SRC_DIR}`);
}

walk(SRC_DIR);
