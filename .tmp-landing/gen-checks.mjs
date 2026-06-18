/**
 * Per-fragment typecheck harness generator.
 *
 * For each fragment produces .tmp-landing/check/check-NN.tsx =
 * preamble (+ the fragment's extra lucide icons) + fragment + a render probe,
 * so `tsc -p tsconfig.tmp.json` validates every fragment in isolation BEFORE
 * assembly — errors map cleanly to one section.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const TMP = join(ROOT, ".tmp-landing");
const FRAGMENTS = join(TMP, "fragments");
const CHECK = join(TMP, "check");

rmSync(CHECK, { recursive: true, force: true });
mkdirSync(CHECK, { recursive: true });

const preamble = readFileSync(join(TMP, "preamble.tsx"), "utf8");
const baseIcons = new Set(
  preamble
    .match(/import \{([\s\S]*?)\} from "lucide-react";/)[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const fragFiles = readdirSync(FRAGMENTS)
  .filter((f) => f.endsWith(".tsx"))
  .sort();

for (const file of fragFiles) {
  const nn = file.slice(0, 2);
  const manifest = JSON.parse(
    readFileSync(join(FRAGMENTS, file.replace(/\.tsx$/, ".manifest.json")), "utf8"),
  );
  const extra = (manifest.icons ?? []).filter((i) => !baseIcons.has(i));
  const extraImport = extra.length
    ? `import { ${[...new Set(extra)].sort().join(", ")} } from "lucide-react";\n`
    : "";
  const fragment = readFileSync(join(FRAGMENTS, file), "utf8");
  const probe = `\nexport function CheckProbe${nn}() {\n  return <${manifest.component} />;\n}\n`;
  // preamble keeps its "use client" first; extra import goes after it
  const head = preamble.replace(/^"use client";\n/, `"use client";\n${extraImport}`);
  writeFileSync(join(CHECK, `check-${nn}.tsx`), `${head}\n${fragment}\n${probe}`);
}
console.log(`Generated ${fragFiles.length} check files in .tmp-landing/check`);
