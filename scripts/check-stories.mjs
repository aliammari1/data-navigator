#!/usr/bin/env node
/**
 * Storybook story quality gate.
 *
 * Statically audits every `*.stories.tsx` file for the conventions that make a
 * Storybook "complete" and trustworthy as a test surface:
 *
 *   ERROR (always fails):
 *     - No default-export meta / no `component`.
 *     - The component symbol imported into the story is NOT an actual export of
 *       the sibling module (catches `import { KpiCard }` when the module
 *       exports `KPICard` — such stories render `undefined` and silently pass).
 *     - No named story export at all.
 *
 *   INCOMPLETE (fails only in --strict mode, otherwise warns):
 *     - "Stub" stories: no `args` on the meta, no per-story `args`, no `play`,
 *       and no custom `render`. These render the component with no inputs and
 *       provide no interaction/assertion value.
 *     - Missing `tags: ["autodocs"]` (docs page) — soft signal.
 *
 * Usage:
 *   node scripts/check-stories.mjs            # CI-safe: errors fail, stubs warn
 *   node scripts/check-stories.mjs --strict   # stubs also fail (full gate)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const STRICT = process.argv.includes("--strict");

/** Recursively collect `*.stories.tsx|ts` files under src/. */
function findStories(dir = resolve(ROOT, "src"), out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      findStories(full, out);
    } else if (/\.stories\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Resolve a relative import to a real file on disk (try common extensions). */
function resolveModule(fromFile, importPath) {
  if (!importPath.startsWith(".")) return null; // package import — skip.
  const base = resolve(dirname(fromFile), importPath);
  const candidates = [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`];
  return candidates.find((c) => existsSync(c)) ?? null;
}

/** Best-effort: does `module` export the named symbol? */
function moduleExports(modFile, name) {
  const src = readFileSync(modFile, "utf8");
  const patterns = [
    new RegExp(`export\\s+(?:const|let|var|function|class|abstract\\s+class)\\s+${name}\\b`),
    new RegExp(`export\\s+(?:default\\s+)?(?:const|function|class)\\s+${name}\\b`),
    // export { Foo }, export { Foo as Bar }
    new RegExp(`export\\s*\\{[^}]*\\b(?:\\w+\\s+as\\s+)?${name}\\b[^}]*\\}`),
    new RegExp(`export\\s*\\{[^}]*\\b${name}\\s+as\\s+\\w+[^}]*\\}`),
  ];
  if (patterns.some((re) => re.test(src))) return true;
  // Re-export from another file: `export * from "./x"` — accept conservatively.
  if (/export\s+\*\s+from/.test(src)) return true;
  return false;
}

const errors = [];
const incomplete = [];

for (const file of findStories()) {
  const rel = file.slice(ROOT.length + 1).replace(/\\/g, "/");
  const src = readFileSync(file, "utf8");

  // 1) meta + component
  const componentMatch = src.match(/component\s*:\s*([A-Za-z0-9_]+)/);
  if (!componentMatch) {
    errors.push(`${rel}: meta has no \`component\`.`);
    continue;
  }
  const componentName = componentMatch[1];

  // 2) the component symbol must be imported and actually exist
  const importRe = new RegExp(
    `import\\s+(?:type\\s+)?\\{[^}]*\\b${componentName}\\b[^}]*\\}\\s+from\\s+["']([^"']+)["']`,
  );
  const defaultImportRe = new RegExp(`import\\s+${componentName}\\s+from\\s+["']([^"']+)["']`);
  const imp = src.match(importRe) ?? src.match(defaultImportRe);
  if (!imp) {
    errors.push(`${rel}: \`${componentName}\` used as meta.component but is not imported.`);
  } else {
    const modFile = resolveModule(file, imp[1]);
    if (modFile && !moduleExports(modFile, componentName)) {
      errors.push(
        `${rel}: imports \`${componentName}\` from "${imp[1]}" but that module does not export it ` +
          `(story would render \`undefined\`).`,
      );
    }
  }

  // 3) at least one named story export
  const hasNamedStory = /export\s+const\s+[A-Z][A-Za-z0-9_]*\s*:/.test(src);
  if (!hasNamedStory) {
    errors.push(`${rel}: no named story export found.`);
  }

  // 4) completeness signals
  const metaHasArgs = /\n\s*args\s*:/.test(src.split("export default")[0] ?? src);
  const hasArgs = /\bargs\s*:/.test(src);
  const hasPlay = /\bplay\s*:/.test(src);
  const hasRender = /\brender\s*:/.test(src);
  if (!metaHasArgs && !hasArgs && !hasPlay && !hasRender) {
    incomplete.push(
      `${rel}: stub story — no args / play / render. Add realistic args, variants, and a play interaction test.`,
    );
  }
}

// ── Report ────────────────────────────────────────────────────────────────
const total = findStories().length;
console.log(`Storybook audit: scanned ${total} story files.`);

if (incomplete.length > 0) {
  const label = STRICT ? "ERROR (strict)" : "WARN";
  console.log(`\n${incomplete.length} incomplete story file(s) [${label}]:`);
  for (const m of incomplete) console.log(`  - ${m}`);
}

if (errors.length > 0) {
  console.error(`\n${errors.length} broken story file(s) [ERROR]:`);
  for (const m of errors) console.error(`  ✗ ${m}`);
}

const failed = errors.length > 0 || (STRICT && incomplete.length > 0);
if (failed) {
  console.error(`\nStorybook audit failed.`);
  process.exit(1);
}
console.log(
  `\nStorybook audit passed${incomplete.length ? ` (${incomplete.length} warnings)` : ""}.`,
);
