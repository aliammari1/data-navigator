/**
 * Daily Edition assembler.
 *
 * Concatenates preamble + section fragments into one self-contained
 * src/app/page.tsx:
 *  - merges every manifest's lucide icons into the single import line
 *  - refuses icons whose names collide with preamble identifiers
 *  - strips `export ` from preamble declarations (Next.js app-router pages
 *    type-error on unknown exports)
 *  - appends the Page assembly in reading order
 *
 * Usage: node .tmp-landing/assemble.mjs [--check-only]
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const TMP = join(ROOT, ".tmp-landing");
const FRAGMENTS = join(TMP, "fragments");
const OUT = join(ROOT, "src", "app", "page.tsx");

const preamble = readFileSync(join(TMP, "preamble.tsx"), "utf8");

/* ── preamble identifiers (collision guard for icon names) ─────────────── */
const preambleIds = new Set(
  [...preamble.matchAll(/^export (?:function|const|type|interface) (\w+)/gm)].map((m) => m[1]),
);

/* ── base lucide imports from the preamble ─────────────────────────────── */
const lucideRe = /import \{([\s\S]*?)\} from "lucide-react";/;
const lucideMatch = preamble.match(lucideRe);
if (!lucideMatch) throw new Error("preamble: lucide import block not found");
const baseIcons = lucideMatch[1]
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/* ── fragments + manifests, in page order ──────────────────────────────── */
const fragFiles = readdirSync(FRAGMENTS)
  .filter((f) => f.endsWith(".tsx"))
  .sort();
if (fragFiles.length === 0) throw new Error("no fragments found");

const sections = fragFiles.map((file) => {
  const nn = file.slice(0, 2);
  const manifestFile = file.replace(/\.tsx$/, ".manifest.json");
  const manifest = JSON.parse(readFileSync(join(FRAGMENTS, manifestFile), "utf8"));
  const code = readFileSync(join(FRAGMENTS, file), "utf8");
  return { nn, file, code, ...manifest };
});

/* ── merge + guard icons ───────────────────────────────────────────────── */
const icons = new Set(baseIcons);
const collisions = [];
for (const s of sections) {
  for (const icon of s.icons ?? []) {
    if (preambleIds.has(icon)) collisions.push(`${s.file}: icon "${icon}" collides with preamble`);
    else icons.add(icon);
  }
}
if (collisions.length) {
  console.error(`ICON COLLISIONS:\n${collisions.join("\n")}`);
  process.exit(1);
}
const mergedImport = `import {\n${[...icons]
  .sort()
  .map((i) => `  ${i},`)
  .join("\n")}\n} from "lucide-react";`;

/* ── sanitize fragments: no imports / exports / "use client" ───────────── */
const offenses = [];
for (const s of sections) {
  if (/^\s*import\s/m.test(s.code)) offenses.push(`${s.file}: contains an import`);
  if (/^\s*export\s/m.test(s.code)) offenses.push(`${s.file}: contains an export`);
  if (/use client/.test(s.code)) offenses.push(`${s.file}: contains "use client"`);
  if (!new RegExp(`function ${s.component}\\b`).test(s.code))
    offenses.push(`${s.file}: missing component ${s.component}`);
}
if (offenses.length) {
  console.error(`FRAGMENT OFFENSES:\n${offenses.join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--check-only")) {
  console.log(`OK: ${sections.length} fragments, ${icons.size} icons merged`);
  process.exit(0);
}

/* ── compose the final module ──────────────────────────────────────────── */
let head = preamble.replace(lucideRe, mergedImport);
// page modules may only export Next-recognised fields — internalise the rest
head = head.replace(/^export (function|const|type|interface) /gm, "$1 ");

const body = sections
  .map(
    (s) =>
      `\n/* ╔══════════════════════════════════════════════════════════════════════════╗\n * ║  SECTION ${s.nn} — ${s.component}\n * ╚══════════════════════════════════════════════════════════════════════════╝ */\n\n${s.code.trim()}\n`,
  )
  .join("\n");

const tail = `
/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  THE PAGE — sections bound in reading order
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

export default function Page() {
  return (
    <div
      id="top"
      className="ed-fiber relative min-h-[100dvh] bg-[#f6f1e7] text-[#1c1914] selection:bg-[#bf3415]/25"
    >
${sections.map((s) => `      <${s.component} />`).join("\n")}
    </div>
  );
}
`;

writeFileSync(OUT, `${head}\n${body}\n${tail}`);
const lines = `${head}\n${body}\n${tail}`.split("\n").length;
console.log(`Assembled ${sections.length} sections → src/app/page.tsx (${lines} lines)`);
