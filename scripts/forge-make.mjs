import { createRequire } from "node:module";

/**
 * Run `electron-forge make` IN-PROCESS instead of via the `electron-forge make` CLI.
 *
 * Why: the electron-forge CLI uses commander "external executable subcommands", so
 * `electron-forge make` SPAWNS a separate `electron-forge-make.js` child process.
 * On the GitHub Windows runner that child exits 0 in the middle of @electron/packager's
 * Electron-binary extraction (its event loop drains during extract-zip under the
 * runner's non-interactive/inherited stdin), and the parent dispatcher forwards the
 * exit — so `make` ends ~4s in with no out/ and no .msi. Confirmed via NODE_OPTIONS=
 * --trace-exit + NODE_DEBUG=child_process: the killing event is
 *   ChildProcess._handle.onexit -> maybeClose -> emit('exit') -> process.exit(0)
 * forwarding the spawned electron-forge-make.js child's exit. It works locally because
 * the local process/stdin setup keeps the loop alive.
 *
 * Calling api.make() directly removes the child process entirely (one process, no
 * commander dispatch). The ref'd keep-alive interval additionally guarantees the event
 * loop cannot drain during the async extraction; it is cleared in `finally` so the
 * process still exits normally once make() resolves.
 */

// @electron-forge/core is a transitive dep of the @electron-forge/cli devDep. Resolve
// it from the CLI package's location so this works under BOTH pnpm isolated and hoisted
// node_modules layouts without adding a direct dependency.
const require = createRequire(import.meta.url);
const requireFromCli = createRequire(require.resolve("@electron-forge/cli/package.json"));
const { api } = requireFromCli("@electron-forge/core");

const keepAlive = setInterval(() => {}, 1 << 30); // ref'd; keeps the loop alive during extract

try {
  const results = await api.make({
    dir: process.cwd(),
    arch: "x64",
    platform: "win32",
  });
  const artifacts = results.flatMap((r) => r.artifacts ?? []);
  console.log(`[forge-make] make() completed — ${artifacts.length} artifact(s):`);
  for (const a of artifacts) console.log(`  ${a}`);
} catch (err) {
  console.error("[forge-make] make() failed:", err);
  process.exitCode = 1;
} finally {
  clearInterval(keepAlive);
}
