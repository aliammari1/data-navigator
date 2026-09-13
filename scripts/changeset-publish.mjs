import { execSync } from "node:child_process";
import fs from "node:fs";

try {
  const output = execSync("pnpm exec changeset publish", { encoding: "utf8" });
  console.log(output);

  // In @changesets/cli v3, the output format changed from "New tag: vX.Y.Z" to "Created git tags: - vX.Y.Z".
  // @changesets/action explicitly parses stdout for the pattern `/New tag:/` to detect published packages,
  // push git tags to remote, create the GitHub Release, and set published: true.
  const pkg = JSON.parse(fs.readFileSync("./package.json", "utf8"));
  if (output.includes("Created git tags:") || output.includes(`v${pkg.version}`)) {
    console.log(`New tag: v${pkg.version}`);
  }
} catch (error) {
  console.error(error.stdout || error.message);
  process.exit(1);
}
