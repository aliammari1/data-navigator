import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "src");
const sourceExt = new Set([".ts", ".tsx"]);

// Hard failures (block CI): the legacy-module retirement, moved feature UI, and
// the shared-layer dependency budget are actively enforced invariants.
const errors = [];
// Advisory only (printed, non-fatal): the core/platform independence rules
// mirror dependency-cruiser's `core-stays-independent` / `platform-stays-independent`,
// which are configured at WARN severity there. Store/query persistence
// legitimately reaches platform infra (drizzle/duckdb); keep this visible as
// debt without failing the build, so the two checkers stay consistent.
const warnings = [];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      files.push(...walk(full));
      continue;
    }
    if (entry.isFile() && sourceExt.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function area(file) {
  const relative = rel(file);
  if (relative.startsWith("src/app/")) return "app";
  if (relative.startsWith("src/features/")) return "features";
  if (relative.startsWith("src/platform/")) return "platform";
  if (relative.startsWith("src/core/")) return "core";
  if (relative.startsWith("src/shared/")) return "shared";
  if (relative.startsWith("src/components/")) return "components";
  if (relative.startsWith("src/design/")) return "design";
  if (relative.startsWith("src/workers/")) return "workers";
  return "other";
}

function checkImport(file, specifier, line) {
  const fileArea = area(file);
  const location = `${rel(file)}:${line}`;

  if (specifier.startsWith("@/lib/")) {
    errors.push(`${location} imports retired legacy module ${specifier}`);
  }

  if (
    specifier.startsWith("@/components/dashboard/") ||
    specifier.startsWith("@/components/agent-canvas/")
  ) {
    errors.push(`${location} imports moved feature UI ${specifier}`);
  }

  if (fileArea === "core") {
    if (
      specifier.startsWith("@/features/") ||
      specifier.startsWith("@/platform/") ||
      specifier.startsWith("@/app/") ||
      specifier.startsWith("@/components/")
    ) {
      warnings.push(`${location} core should stay independent of ${specifier}`);
    }
  }

  if (fileArea === "platform") {
    if (
      specifier.startsWith("@/features/") ||
      specifier.startsWith("@/app/") ||
      specifier.startsWith("@/components/")
    ) {
      warnings.push(`${location} platform should stay independent of ${specifier}`);
    }
  }

  if (fileArea === "shared") {
    if (specifier.startsWith("@/") && specifier !== "@/shared/utils") {
      errors.push(`${location} shared must stay dependency-light: ${specifier}`);
    }
  }
}

const importPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;

for (const file of walk(src)) {
  if (!statSync(file).isFile()) continue;
  const text = readFileSync(file, "utf8");
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }

  let match;
  while ((match = importPattern.exec(text)) !== null) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (!specifier) continue;
    const index = match.index;
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lineStarts[mid] <= index) low = mid + 1;
      else high = mid - 1;
    }
    checkImport(file, specifier, high + 1);
  }
}

if (warnings.length > 0) {
  console.warn(
    `Architecture guard — ${warnings.length} advisory warning(s) (mirror dependency-cruiser, non-blocking):`,
  );
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length > 0) {
  console.error("Architecture guard failed:");
  for (const violation of errors) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(
  `Architecture guard passed.${warnings.length ? ` (${warnings.length} advisory warnings)` : ""}`,
);
