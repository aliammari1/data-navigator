import fs from "node:fs";
import path from "node:path";
import { FuseV1Options, FuseVersion, flipFuses } from "@electron/fuses";
// import { MakerMSIX } from "@electron-forge/maker-msix";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
// import { MakerWix } from "@electron-forge/maker-wix";
// import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { PublisherGithub } from "@electron-forge/publisher-github";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { PRODUCTION_FUSE_CONFIG } from "./electron/security";

/**
 * Forge configuration sources:
 *
 * TypeScript constructor syntax:
 * https://www.electronforge.io/config/typescript-configuration
 *
 * Makers:
 * https://www.electronforge.io/config/makers
 * https://www.electronforge.io/config/makers/zip
 * https://www.electronforge.io/config/makers/msix
 *
 * GitHub Publisher:
 * https://www.electronforge.io/config/publishers/github
 *
 * Lifecycle hooks:
 * https://www.electronforge.io/config/hooks
 *
 * Native module unpacking:
 * https://www.electronforge.io/config/plugins/auto-unpack-natives
 *
 * Fuses / ASAR integrity:
 * https://www.electronforge.io/config/plugins/fuses
 * https://www.electronjs.org/docs/latest/tutorial/asar-integrity
 *
 * Windows signing:
 * https://www.electronforge.io/guides/code-signing/code-signing-windows
 */

const root = __dirname;

const appName = "Data Navigator";
const appSlug = "data-navigator";
const appExe = "data-navigator";
const appId = "com.data-navigator.app";
const manufacturer = "Ali Ammari";
const protocolScheme = "com.data-navigator.app";

const publicDir = path.join(root, "public");
const iconBase = path.join(publicDir, "icon");
const iconIco = path.join(publicDir, "icon.ico");

const nextStandaloneDir = path.join(root, ".next", "standalone");
const nextStaticDir = path.join(root, ".next", "static");
const electronMainBuild = path.join(root, "build", "main.js");

const githubOwner = process.env.GITHUB_REPOSITORY_OWNER ?? "The-Data-Navigator";
const githubRepo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "data-navigator";

const hasWindowsCertificate =
  Boolean(process.env.WINDOWS_CERTIFICATE_FILE) &&
  Boolean(process.env.WINDOWS_CERTIFICATE_PASSWORD);

const windowsCertificateConfig = hasWindowsCertificate
  ? {
      certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
      certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
    }
  : {};

function requirePath(label: string, targetPath: string) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`[forge] Missing ${label}: ${targetPath}`);
  }
}

/**
 * Shared copy options for the bulk directory copies below. `dereference: true`
 * is set as a best-effort hint, but note it is INERT for Windows DIRECTORY
 * symlinks on this build host (verified) — cpSync copies pnpm's dir symlinks
 * verbatim regardless. The real portability fix is `makeNodeModulesPortable`,
 * which runs AFTER these copies and manually resolves every symlink to real
 * files (see that function). These copies just stage the trees (including the
 * local `.pnpm` store under `app/node_modules`) for the flattening pass.
 */
const COPY_OPTS = { recursive: true, force: true, dereference: true } as const;

function copyDir(label: string, from: string, to: string) {
  requirePath(label, from);

  console.log(`[forge] Copying ${label}`);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, COPY_OPTS);
}

function copyDirIfExists(label: string, from: string, to: string) {
  if (!fs.existsSync(from)) return;

  console.log(`[forge] Copying ${label}`);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, COPY_OPTS);
}

/**
 * Resolve the packaged Electron binary inside a Forge output directory, so
 * @electron/fuses can flip the production hardening fuses into it.
 */
function resolveElectronBinary(outputPath: string, platform: string): string {
  if (platform === "darwin") {
    return path.join(outputPath, `${appName}.app`, "Contents", "MacOS", appExe);
  }
  if (platform === "win32") {
    return path.join(outputPath, `${appExe}.exe`);
  }
  return path.join(outputPath, appExe);
}

function copyPackageIfExists(packageName: string, buildPath: string) {
  const from = path.join(root, "node_modules", packageName);
  const to = path.join(buildPath, "node_modules", packageName);

  if (!fs.existsSync(from)) return;

  console.log(`[forge] Copying runtime package: ${packageName}`);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, COPY_OPTS);
}

// ─── pnpm → flat node_modules dereferencing ──────────────────────────────────
//
// fs.cpSync({ dereference: true }) does NOT follow Windows directory symlinks
// (verified on this build host), so the copies above preserve pnpm's symlink
// web: top-level `next`/`react`/… and the nested `.pnpm/<id>/node_modules/<pkg>`
// trees are SYMLINKS whose targets are ABSOLUTE dev paths
// (`D:\data-navigator\node_modules\.pnpm\<id>\node_modules\<pkg>`). Those dangle
// on every end-user install → the "Cannot find module
// next/dist/server/lib/start-server" crash after MSI install.
//
// The functions below rewrite BOTH packaged node_modules into a FLAT, real-file,
// npm-style layout: every package a real directory, no symlinks anywhere, no
// `.pnpm` dir. Name-level hoisting is correct here because the runtime closures
// are simple (this is what `next build` standalone produces under npm).

const DEV_PNPM_STORE = path.join(root, "node_modules", ".pnpm");

/** Strip Windows extended-length (`\\?\`) prefixes from realpath/readlink. */
function stripExtendedPrefix(p: string): string {
  if (p.startsWith("\\\\?\\UNC\\")) return `\\\\${p.slice("\\\\?\\UNC\\".length)}`;
  if (p.startsWith("\\\\?\\")) return p.slice("\\\\?\\".length);
  return p;
}

/** True if the dirent at `p` is a symlink/junction. */
function isLink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Resolve a path (following symlinks) to its real absolute location, or null. */
function tryRealpath(p: string): string | null {
  try {
    return stripExtendedPrefix(fs.realpathSync.native(p));
  } catch {
    try {
      return stripExtendedPrefix(fs.realpathSync(p));
    } catch {
      return null;
    }
  }
}

/**
 * Copy a directory of REAL files to `dest`, dereferencing any symlink it
 * encounters (manually — cpSync's dereference is inert for dir symlinks here).
 * Package dirs inside `.pnpm/<id>/node_modules/<name>` normally contain only
 * real files, so this is mostly a plain recursive copy; the symlink handling is
 * defensive (and resolves any stray nested links to real files).
 */
function copyRealTree(src: string, dest: string, seen: Set<string> = new Set()): void {
  const realSrc = tryRealpath(src);
  if (!realSrc) return;
  if (seen.has(realSrc)) return; // guard against symlink cycles
  seen.add(realSrc);

  const stat = fs.statSync(realSrc); // follows links → real target
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(realSrc, { withFileTypes: true })) {
      copyRealTree(path.join(realSrc, entry.name), path.join(dest, entry.name), seen);
    }
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(realSrc, dest);
  }
}

/**
 * From a pnpm id node_modules dir (`.pnpm/<id>/node_modules`), list the package
 * entries present: `<pkg>` and `@scope/<pkg>`. Returns objects describing each
 * package's name and its on-disk path (which may be a symlink to another store
 * entry, or a real dir for the id's own package).
 */
function listPackagesInDir(nmDir: string): { name: string; entryPath: string }[] {
  const out: { name: string; entryPath: string }[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(nmDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === ".bin" || entry.name === ".pnpm") continue;
    const full = path.join(nmDir, entry.name);
    if (entry.name.startsWith("@")) {
      // scope dir: real directory whose children are the actual packages/links
      let scoped: fs.Dirent[];
      try {
        scoped = fs.readdirSync(full, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const child of scoped) {
        out.push({
          name: `${entry.name}/${child.name}`,
          entryPath: path.join(full, child.name),
        });
      }
    } else {
      out.push({ name: entry.name, entryPath: full });
    }
  }
  return out;
}

/**
 * Given the realpath of a package directory living under the pnpm store
 * (`.../.pnpm/<id>/node_modules/<name>`), return its `<id>` segment, the store
 * root, and the id's `node_modules` dir — so we can enumerate its sibling deps.
 */
function parsePnpmEntry(
  realPkgPath: string,
): { storeRoot: string; id: string; idNodeModules: string } | null {
  const norm = realPkgPath.replaceAll("\\", "/");
  const marker = "/.pnpm/";
  const idx = norm.lastIndexOf(marker);
  if (idx === -1) return null;
  const storeRoot = realPkgPath.slice(0, idx + marker.length - 1); // .../.pnpm
  const rest = norm.slice(idx + marker.length); // "<id>/node_modules/<name>..."
  const id = rest.split("/")[0];
  if (!id) return null;
  return {
    storeRoot,
    id,
    idNodeModules: path.join(storeRoot, id, "node_modules"),
  };
}

/** A package to flatten: its npm name plus its on-disk location (link or real). */
type FlattenSeed = { name: string; entryPath: string };

/** Derive the package name from a `.../node_modules/<name>` realpath, or null. */
function nameFromNodeModulesPath(realPkg: string): string | null {
  const norm = realPkg.replaceAll("\\", "/");
  const marker = "/node_modules/";
  const idx = norm.lastIndexOf(marker);
  if (idx === -1) return null;
  const afterNm = norm.slice(idx + marker.length);
  const segs = afterNm.split("/").filter(Boolean);
  if (segs.length === 0) return null;
  return afterNm.startsWith("@") && segs.length >= 2 ? `${segs[0]}/${segs[1]}` : segs[0];
}

/** List dependency symlinks/dirs in a package's OWN nested `node_modules`, if any. */
function nestedDeps(realPkg: string): FlattenSeed[] {
  const nested = path.join(realPkg, "node_modules");
  if (!fs.existsSync(nested)) return [];
  return listPackagesInDir(nested);
}

/**
 * BFS the full dependency closure starting from a set of seed packages, copying
 * each discovered package to a flat `<destNodeModules>/<name>` (first-writer-wins
 * / npm-style hoist). Seeds (and discovered deps) may be:
 *   - symlinks into the pnpm store (`.pnpm/<id>/node_modules/<name>`) — we follow
 *     the id's sibling deps transitively to pull the whole closure; or
 *   - already-real package dirs (cpSync dereferenced the top-level symlink) — we
 *     copy them under their known name and scan their nested `node_modules`.
 * The package NAME always comes from the seed's source location, so it survives
 * even when the realpath has been dereferenced out of the `.pnpm/` store.
 */
/**
 * Given a package realpath in SOME pnpm store, return the most COMPLETE source
 * to copy from. The Next.js standalone store (`app/node_modules/.pnpm`) only
 * contains the files `next build` traced — it can be PARTIAL (e.g. it shipped
 * `onnxruntime-common@1.24.3` with only `dist/cjs`, omitting `dist/esm` that a
 * later ESM import needs). The DEV store always has the full published package.
 * So when the dev store has the SAME `<id>/node_modules/<name>`, prefer it.
 */
function resolveCompleteSource(realPkg: string): string {
  const parsed = parsePnpmEntry(realPkg);
  if (!parsed) return realPkg;
  // Already in the dev store → it's complete.
  if (parsed.storeRoot.replaceAll("\\", "/") === DEV_PNPM_STORE.replaceAll("\\", "/")) {
    return realPkg;
  }
  const norm = realPkg.replaceAll("\\", "/");
  const afterId = norm.slice(norm.indexOf(`/.pnpm/${parsed.id}/`) + `/.pnpm/${parsed.id}/`.length);
  const devCandidate = path.join(DEV_PNPM_STORE, parsed.id, afterId);
  return fs.existsSync(devCandidate) ? devCandidate : realPkg;
}

// Build-only packages that some runtime deps DECLARE as `dependencies` but never
// need once prebuilt native binaries are present (node-llama-cpp lists `cmake-js`
// for source compilation; we ship the `@node-llama-cpp/*` prebuilds instead).
// Excluding them — and their large transitive trees — keeps the package lean
// without affecting runtime. Add only deps proven build-only for THIS app.
const BUILD_ONLY_DEPS = new Set<string>(["cmake-js"]);

/**
 * Read a package's RUNTIME dependency names from its package.json:
 * `dependencies` + `optionalDependencies`. We deliberately EXCLUDE:
 *   - `devDependencies` — pnpm co-locates them as `.pnpm/<id>/node_modules`
 *     siblings; following every sibling drags in huge build-only trees (babel,
 *     typescript, playwright…), bloating the package to multiple GB and making
 *     asar packing crawl;
 *   - `peerDependencies` — host/consumer-provided, not bundled by the dependency
 *     (e.g. node-llama-cpp's `typescript` peer);
 *   - explicit BUILD_ONLY_DEPS (e.g. `cmake-js`).
 * Following only declared runtime deps yields the correct, lean production set.
 */
function runtimeDepNames(realPkg: string): Set<string> {
  const out = new Set<string>();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(realPkg, "package.json"), "utf8"));
    for (const field of ["dependencies", "optionalDependencies"]) {
      const deps = pkg[field];
      if (deps && typeof deps === "object") {
        for (const dep of Object.keys(deps)) {
          if (!BUILD_ONLY_DEPS.has(dep)) out.add(dep);
        }
      }
    }
  } catch {
    // missing/unreadable package.json → no declared deps (leaf-safe)
  }
  return out;
}

function flattenClosure(
  seeds: FlattenSeed[],
  destNodeModules: string,
  resolveRoot?: string,
): void {
  const visitedIds = new Set<string>();
  const writtenNames = new Set<string>();
  // Flat (hoisted) packages have no pnpm id; guard their dep-walk by realpath so a
  // dependency cycle among flat packages terminates.
  const flatWalked = new Set<string>();
  // Seeds are top-level/required entries: always written. Each package then
  // enqueues only ITS declared runtime deps, so the closure stays production-lean.
  const queue: FlattenSeed[] = [...seeds];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) continue;

    const realPkg = tryRealpath(item.entryPath);
    if (!realPkg || !fs.existsSync(realPkg)) continue;

    // Prefer the store-derived name (canonical), else the seed's known name.
    const name = nameFromNodeModulesPath(realPkg) ?? item.name;
    if (!name) continue;

    // Enqueue this package's RUNTIME dependencies (only), once per pnpm id.
    const enqueueRuntimeDeps = (candidates: FlattenSeed[]) => {
      const allowed = runtimeDepNames(realPkg);
      for (const dep of candidates) {
        if (allowed.has(dep.name)) queue.push(dep);
      }
    };

    const parsed = parsePnpmEntry(realPkg);
    if (parsed && !visitedIds.has(parsed.id)) {
      visitedIds.add(parsed.id);
      enqueueRuntimeDeps(listPackagesInDir(parsed.idNodeModules));
    }

    // For already-real (dereferenced) packages, follow their nested runtime deps.
    enqueueRuntimeDeps(nestedDeps(realPkg));

    // Flat/hoisted layout (node-linker=hoisted, the forge+pnpm requirement): there
    // is NO .pnpm store (parsed === null) and deps are NOT nested — they sit as
    // siblings under `resolveRoot` (the flat node_modules). Resolve each declared
    // runtime dep from there so the transitive closure is still captured. Without
    // this, build/node_modules ships seeds with ZERO transitive deps and the packaged
    // app crashes on its first require ("bindings", "jose", …).
    if (!parsed && resolveRoot && !flatWalked.has(realPkg)) {
      flatWalked.add(realPkg);
      for (const depName of runtimeDepNames(realPkg)) {
        const flat = path.join(resolveRoot, ...depName.split("/"));
        if (fs.existsSync(flat)) queue.push({ name: depName, entryPath: flat });
      }
    }

    if (!writtenNames.has(name)) {
      writtenNames.add(name);
      // Copy from the most complete source (dev store beats a pruned standalone).
      copyRealTree(resolveCompleteSource(realPkg), path.join(destNodeModules, name));
    }
  }
}

/**
 * Convert an import/require specifier to its package name:
 *   "better-auth/api" → "better-auth"; "@scope/pkg/sub" → "@scope/pkg".
 * Returns null for relative/builtin specifiers.
 */
function specifierToPackageName(spec: string): string | null {
  if (!spec || spec.startsWith(".") || spec.startsWith("/")) return null;
  if (spec.startsWith("node:")) return null;
  const segs = spec.split("/");
  return spec.startsWith("@") ? `${segs[0]}/${segs[1]}` : segs[0];
}

/** Node builtin module names that must never be treated as packages. */
const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

/**
 * Scan a built CJS bundle for top-level `require("<bare>")` specifiers, returning
 * the set of external PACKAGE names it loads at runtime. The Electron main bundle
 * (build/main.js) externalizes more than tsup's explicit `external` list (some
 * deps like `better-auth`, `conf`, `apache-arrow`, `zod` are left external
 * automatically), and EVERY one of those must exist in the packaged
 * node_modules or the main process crashes on its first require — before it can
 * even start the Next server. Deriving the set from the bundle keeps this in sync
 * automatically as imports change.
 */
function externalPackagesFromBundle(bundlePath: string): Set<string> {
  const names = new Set<string>();
  if (!fs.existsSync(bundlePath)) return names;
  const src = fs.readFileSync(bundlePath, "utf8");
  const re = /require\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of src.matchAll(re)) {
    const spec = match[1];
    if (NODE_BUILTINS.has(spec) || NODE_BUILTINS.has(spec.replace(/^node:/, ""))) continue;
    const name = specifierToPackageName(spec);
    // `electron` is provided by the runtime, never resolved from node_modules.
    if (name && name !== "electron") names.add(name);
  }
  return names;
}

/**
 * Replace the symlinked top-level entries in a packaged `node_modules` with flat
 * real-file packages, computing the full transitive dependency closure from the
 * dev pnpm store. Used for `<buildPath>/node_modules` (the Electron MAIN deps),
 * which has NO local `.pnpm` store of its own.
 */
function flattenMainNodeModules(buildNodeModules: string): void {
  if (!fs.existsSync(buildNodeModules)) return;
  console.log(`[forge] Flattening main node_modules: ${buildNodeModules}`);

  const devNodeModules = path.join(root, "node_modules");
  const seeds: FlattenSeed[] = [];
  const seededNames = new Set<string>();

  const addSeed = (name: string) => {
    if (seededNames.has(name)) return;
    const devEntry = path.join(devNodeModules, ...name.split("/"));
    if (!fs.existsSync(devEntry)) return;
    seededNames.add(name);
    seeds.push({ name, entryPath: devEntry });
  };

  // The staged packages were copied by copyPackageIfExists; cpSync dereferenced
  // the TOP-LEVEL symlinks, so they are real dirs whose deps are missing. To
  // recover the full transitive closure we re-seed from the DEV pnpm store: for
  // every package name present in staging, resolve the matching dev
  // `node_modules/<name>` symlink (which points into `.pnpm/<id>`), then BFS its
  // sibling deps. This pulls in transitive deps like `@duckdb/node-bindings`,
  // `bindings`, and `prebuild-install` that are NOT present at the dev top level.
  for (const top of listPackagesInDir(buildNodeModules)) {
    const devEntry = path.join(devNodeModules, ...top.name.split("/"));
    seededNames.add(top.name);
    seeds.push({
      name: top.name,
      // Prefer the dev symlink (resolves into the store → BFS closure); fall back
      // to the already-real staged copy if the dev entry is gone.
      entryPath: fs.existsSync(devEntry) ? devEntry : top.entryPath,
    });
  }

  // CRITICAL: also seed every external package the Electron main/preload bundles
  // `require()` at runtime (e.g. better-auth, conf, apache-arrow, nanoid, zod).
  // These are NOT in copyPackageIfExists; without them the main process throws
  // "Cannot find module <x>" on its FIRST require and never boots.
  for (const bundle of ["main.js", "preload.js"]) {
    for (const name of externalPackagesFromBundle(path.join(root, "build", bundle))) {
      addSeed(name);
    }
  }

  // Build the flat tree into a fresh temp dir, then swap it in.
  const tmp = `${buildNodeModules}.flat-tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  // Pass the flat dev node_modules as the resolve-root so that under node-linker=
  // hoisted (the forge+pnpm requirement; no .pnpm store) the closure walk can still
  // find each seed's transitive runtime deps as flat siblings.
  flattenClosure(seeds, tmp, devNodeModules);

  fs.rmSync(buildNodeModules, { recursive: true, force: true });
  fs.renameSync(tmp, buildNodeModules);

  const flatNames = fs.readdirSync(buildNodeModules);
  console.log(
    `[forge] main node_modules flattened: ${flatNames.length} top-level entries (seeds=${seeds.length})`,
  );

  // Canary: `bindings` is a transitive dep of better-sqlite3 — never a direct dep
  // and never require()d by the bundle, so it lands here ONLY if the closure walk
  // resolved transitive deps. If it's missing the walk silently dropped the closure
  // (e.g. a node_modules layout change) and the packaged app would crash at runtime
  // — fail the BUILD loudly rather than ship a launch-broken MSI.
  const missingCanary = ["bindings"].filter(
    (d) => !fs.existsSync(path.join(buildNodeModules, d)),
  );
  if (missingCanary.length > 0) {
    throw new Error(
      `[forge] build node_modules is missing transitive dep(s) [${missingCanary.join(", ")}] ` +
        `after flattening — the dependency-closure walk failed (node_modules layout mismatch?). ` +
        `The packaged app would crash at runtime; aborting.`,
    );
  }
}

/**
 * Flatten `<buildPath>/app/node_modules` (the Next.js standalone closure). The
 * `.pnpm` store is ALREADY present here (copied verbatim by copyDir), so we can
 * flatten directly from `app/node_modules/.pnpm` plus the existing top-level
 * symlinks, then drop `.pnpm` entirely.
 */
function flattenAppNodeModules(appNodeModules: string): void {
  if (!fs.existsSync(appNodeModules)) return;
  console.log(`[forge] Flattening app node_modules: ${appNodeModules}`);

  const localPnpm = path.join(appNodeModules, ".pnpm");
  const seeds: FlattenSeed[] = [];

  // Seed 1: existing top-level entries (next, react, react-dom, …).
  for (const top of listPackagesInDir(appNodeModules)) {
    seeds.push(top);
  }

  // Seed 2: every real package inside the local `.pnpm` store, so the entire
  // standalone closure is captured even if a top-level symlink is missing.
  if (fs.existsSync(localPnpm)) {
    for (const entry of fs.readdirSync(localPnpm, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const idNm = path.join(localPnpm, entry.name, "node_modules");
      for (const pkg of listPackagesInDir(idNm)) {
        seeds.push(pkg);
      }
    }
    // The `.pnpm/node_modules` hoist dir also lists shared deps.
    const hoist = path.join(localPnpm, "node_modules");
    for (const pkg of listPackagesInDir(hoist)) {
      seeds.push(pkg);
    }
  }

  const tmp = `${appNodeModules}.flat-tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  // Resolve-root = the standalone's own node_modules; under hoisted it is already
  // flat, under isolated the .pnpm seeds above already cover the closure so the
  // fallback is a harmless no-op.
  flattenClosure(seeds, tmp, appNodeModules);

  fs.rmSync(appNodeModules, { recursive: true, force: true });
  fs.renameSync(tmp, appNodeModules);
}

/**
 * Final safety net: walk a tree and replace ANY remaining symlink with a
 * real-file copy of its target. Guarantees ZERO symlinks survive into the MSI
 * (relative symlinks are NOT used — they may not survive MSI install). When a
 * link points into the pnpm store, the target package also gets its private
 * dependency closure nested under it, so version-specific imports resolve.
 */
function dereferenceAnyRemainingLinks(rootDir: string): number {
  let replaced = 0;
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink() || isLink(full)) {
        const real = tryRealpath(full);
        fs.rmSync(full, { recursive: true, force: true });
        if (real && fs.existsSync(real)) {
          // Copy the package itself from the most COMPLETE source (dev store beats
          // a pruned standalone). We deliberately do NOT materialize a private
          // nested node_modules here: the dependents (e.g. Next-externalized
          // @huggingface/transformers) resolve their deps from the fully-hoisted,
          // fully-UNPACKED top-level `app/node_modules` (which `asarUnpackDirs`
          // already covers, including sharp's libvips DLLs). Nesting a second copy
          // of a native module would leave its dependent DLLs packed inside the
          // asar and break dlopen.
          copyRealTree(resolveCompleteSource(real), full);
          replaced += 1;
        }
        continue;
      }
      if (entry.isDirectory()) {
        walk(full);
      }
    }
  };
  walk(rootDir);
  return replaced;
}

/** Count remaining symlinks under a tree (verification helper). */
function countSymlinks(rootDir: string): number {
  let count = 0;
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        count += 1;
        continue;
      }
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(rootDir);
  return count;
}

/** Best-effort recursive byte size of a directory, for prune logging. */
function dirSizeBytes(dir: string): number {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const d = stack.pop();
    if (!d) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else {
        try {
          total += fs.statSync(full).size;
        } catch {
          /* unreadable file — skip */
        }
      }
    }
  }
  return total;
}

/**
 * Strip dead weight from BOTH packaged node_modules trees so the Windows installer
 * is a tractable size (the unpruned package is ~3.8\,GB, almost all of it unused):
 *   - node-llama-cpp GPU / wrong-arch backends. The app runs CPU-only by default
 *     (GPU is opt-in via DN\_LLAMA\_GPU and falls back to CPU); CUDA (~580\,MB) needs
 *     an NVIDIA GPU, and the arm64 backend is the wrong architecture for this x64
 *     build. We keep win-x64 (CPU) and win-x64-vulkan (the opt-in Vulkan path).
 *   - onnxruntime-node binaries for platforms we never ship. The package bundles
 *     darwin, linux and win32/arm64 prebuilts; only win32/x64 is ever loaded.
 * Together these remove roughly 0.9\,GB without changing the default runtime.
 */
function pruneOversizedNativeBinaries(buildPath: string): void {
  const trees = [
    path.join(buildPath, "node_modules"),
    path.join(buildPath, "app", "node_modules"),
  ];
  let removedBytes = 0;
  const drop = (target: string) => {
    if (!fs.existsSync(target)) return;
    removedBytes += dirSizeBytes(target);
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[forge] pruned ${target}`);
  };

  for (const nm of trees) {
    if (!fs.existsSync(nm)) continue;

    // 1. node-llama-cpp: drop GPU/wrong-arch backends; keep win-x64 + win-x64-vulkan.
    for (const backend of ["win-x64-cuda", "win-x64-cuda-ext", "win-arm64"]) {
      drop(path.join(nm, "@node-llama-cpp", backend));
    }

    // 2. onnxruntime-node: keep only the win32/x64 prebuilt, drop every other
    //    platform and architecture under bin/napi-v6.
    const onnxBin = path.join(nm, "onnxruntime-node", "bin", "napi-v6");
    if (fs.existsSync(onnxBin)) {
      for (const osDir of fs.readdirSync(onnxBin)) {
        if (osDir !== "win32") {
          drop(path.join(onnxBin, osDir));
          continue;
        }
        const win = path.join(onnxBin, "win32");
        for (const archDir of fs.readdirSync(win)) {
          if (archDir !== "x64") drop(path.join(win, archDir));
        }
      }
    }
  }

  console.log(
    `[forge] pruned ~${(removedBytes / 1048576).toFixed(0)} MB of unused GPU / wrong-platform native binaries`,
  );
}

/**
 * Top-level entry: make BOTH packaged node_modules fully portable. Called from
 * the packageAfterCopy hook after all copies are done.
 */
function makeNodeModulesPortable(buildPath: string): void {
  requirePath("dev pnpm store", DEV_PNPM_STORE);

  const appDir = path.join(buildPath, "app");
  const appNm = path.join(appDir, "node_modules");
  const mainNm = path.join(buildPath, "node_modules");

  flattenAppNodeModules(appNm);
  flattenMainNodeModules(mainNm);

  // Dereference + verify the ENTIRE `app` subtree and the main `node_modules`.
  // The whole-`app` sweep is essential: Next.js standalone places externalized
  // native modules under `app/.next/node_modules/<name>-<hash>` as ABSOLUTE-path
  // symlinks (e.g. `better-sqlite3-…` → dev `.pnpm` store), and may scatter more
  // traced-module links under `.next/server`. Any one of these dangling on a
  // clean machine produces "Failed to load external module <x>" 500s at runtime.
  // Walking all of `app/` (not just `app/node_modules`) replaces every remaining
  // symlink with real files, guaranteeing the server can resolve them.
  for (const target of [appDir, mainNm]) {
    if (!fs.existsSync(target)) continue;
    const replaced = dereferenceAnyRemainingLinks(target);
    if (replaced > 0) {
      console.log(`[forge] Dereferenced ${replaced} stray symlink(s) in ${target}`);
    }
    const remaining = countSymlinks(target);
    if (remaining > 0) {
      throw new Error(
        `[forge] Portability check FAILED: ${remaining} symlink(s) remain in ${target}`,
      );
    }
    console.log(`[forge] Portability OK (0 symlinks): ${target}`);
  }
}

const asarUnpackDirs = [
  "node_modules/@duckdb",
  "node_modules/@img",
  "node_modules/@lancedb",
  "node_modules/@mlc-ai",
  "node_modules/detect-libc",
  "node_modules/next",
  "node_modules/onnxruntime-node",
  "node_modules/sharp",
  "node_modules/sherpa-onnx-node",
  "node_modules/sqlite-vec",
  "node_modules/better-sqlite3",
  // node-llama-cpp ships a JS wrapper + prebuilt native binaries in the
  // @node-llama-cpp/* platform subpackages — both must stay OUTSIDE the asar.
  "node_modules/node-llama-cpp",
  "node_modules/@node-llama-cpp",

  "app/node_modules/@duckdb",
  "app/node_modules/@img",
  "app/node_modules/@lancedb",
  "app/node_modules/@mlc-ai",
  "app/node_modules/detect-libc",
  "app/node_modules/next",
  "app/node_modules/onnxruntime-node",
  "app/node_modules/sharp",
  "app/node_modules/sherpa-onnx-node",
  "app/node_modules/sqlite-vec",
  "app/node_modules/better-sqlite3",
  "app/node_modules/node-llama-cpp",
  "app/node_modules/@node-llama-cpp",
].join(",");

const config: ForgeConfig = {
  packagerConfig: {
    name: appName,
    executableName: appExe,
    appBundleId: appId,
    appCategoryType: "public.app-category.productivity",
    icon: iconBase,
    overwrite: true,
    // prune:false — do NOT let packager run the package manager to prune devDeps.
    // The `ignore` function below already excludes everything except build/, app/
    // (staged), public/, models/, package.json and node_modules/next|@next, and
    // packageAfterCopy stages the full production closure itself, so the pm prune is
    // redundant. Critically, that prune spawns a pnpm child during packaging, and on
    // the hosted runner a pnpm child's exit fires an .on('exit') handler that calls
    // process.exit(0) on the make process mid-extraction (confirmed via --trace-exit),
    // killing the build before any .msi is produced. Removing the prune removes a
    // pnpm child spawn.
    prune: false,
    protocols: [
      {
        name: "Data Navigator Protocol",
        schemes: [protocolScheme],
      },
    ],

    win32metadata: {
      CompanyName: manufacturer,
      FileDescription: appName,
      InternalName: appName,
      OriginalFilename: `${appExe}.exe`,
      ProductName: appName,
    },

    asar: {
      unpack: "**/*.{node,dll,so,dylib,wasm,onnx,ort,bin,gguf,safetensors}",
      unpackDir: `{${asarUnpackDirs}}`,
    },

    ignore: (filePath) => {
      if (!filePath) return false;

      const normalizedPath = filePath.replaceAll("\\", "/");

      const keep = [
        /^\/build(?:\/|$)/,
        /^\/app(?:\/|$)/,
        /^\/public(?:\/|$)/,
        /^\/models(?:\/|$)/,
        /^\/package\.json$/,
        /^\/node_modules\/next(?:\/|$)/,
        /^\/node_modules\/@next(?:\/|$)/,
      ];

      return !keep.some((pattern) => pattern.test(normalizedPath));
    },
  },

  // NO rebuildConfig. Forge's in-`make` native rebuild (@electron/rebuild) spawns a
  // node-gyp child process per native module; on the hosted Windows runner that is
  // both the documented "Preparing native dependencies" hang (forge #3474/#3619) AND
  // the source of the early process.exit(0) that previously killed `make` ~4s in
  // during packaging (a child-process exit handler fired on the main process). The
  // native modules are instead rebuilt for the Electron ABI in a dedicated CI step
  // (`pnpm run native:rebuild`) BEFORE `make`, so the staged .node files already
  // carry the right ABI and `make` never spawns a rebuild child.

  makers: [
    // Squirrel.Windows maker — forge's default Windows target. Chosen over MakerWix
    // because WiX compiling this ~1.2 GB app into an .msi takes 30-40+ min; Squirrel's
    // NuGet-based Setup.exe is far faster, and it is the format update-electron-app /
    // the autoUpdater consume, so it also unblocks auto-update. noMsi:true skips
    // Squirrel's optional MSI wrapper (we only want the fast Setup.exe + nupkg).
    new MakerSquirrel(
      {
        // NuGet package id — no hyphens allowed, so data-navigator -> data_navigator.
        name: appSlug.replaceAll("-", "_"),
        authors: manufacturer,
        description: "AI-powered local data analysis and visualization platform",
        setupExe: "DataNavigatorSetup.exe",
        setupIcon: iconIco,
        noMsi: true,
        ...windowsCertificateConfig,
      },
      ["win32"],
    ),

    // new MakerMSIX(
    //   {
    //     manifestVariables: {
    //       packageIdentity: "AliAmmari.DataNavigator",
    //       appDisplayName: appName,
    //       publisher: process.env.WINDOWS_PUBLISHER ?? "CN=Ali Ammari",
    //       publisherDisplayName: manufacturer,
    //       packageDescription:
    //         "AI-powered local data analysis and visualization platform",
    //     },

    //     ...(hasWindowsCertificate
    //       ? {
    //           windowsSignOptions: {
    //             certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
    //             certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
    //           },
    //         }
    //       : {}),
    //   },
    //   ["win32"],
    // ),

    // new MakerZIP({}, ["win32"]),
  ],

  publishers: [
    new PublisherGithub({
      repository: {
        owner: githubOwner,
        name: githubRepo,
      },
      draft: true,
      prerelease:
        process.env.PRERELEASE === "true" ||
        process.env.CHANNEL === "alpha" ||
        process.env.CHANNEL === "beta",
    }),
  ],

  plugins: [new AutoUnpackNativesPlugin({})],

  hooks: {
    // Fires AFTER the Electron zip is extracted into buildPath, BEFORE the app is
    // copied. Diagnostic marker: if this prints in CI, extraction completed and any
    // failure is downstream (the node_modules copy/flatten below); if it never
    // prints, the build died during Electron extraction itself.
    packageAfterExtract: async (_forgeConfig, buildPath) => {
      console.log(`[forge] packageAfterExtract OK — Electron extracted to ${buildPath}`);
    },

    packageAfterCopy: async (_forgeConfig, buildPath) => {
      console.log(`[forge] packageAfterCopy START — staging app + node_modules into ${buildPath}`);
      requirePath("Electron main build", electronMainBuild);
      requirePath("Next standalone output", nextStandaloneDir);
      requirePath("Next static output", nextStaticDir);
      requirePath("public assets", publicDir);
      requirePath("Windows icon", iconIco);

      const appDest = path.join(buildPath, "app");

      copyDir("Next standalone app", nextStandaloneDir, appDest);

      copyDir("Next static assets", nextStaticDir, path.join(appDest, ".next", "static"));

      copyDir("public assets", publicDir, path.join(appDest, "public"));

      copyDirIfExists(
        "local edge-AI models",
        path.join(root, "models"),
        path.join(appDest, "models"),
      );

      for (const packageName of [
        "next",
        "@next/env",
        "better-sqlite3",
        "@duckdb",
        "@lancedb",
        "@mlc-ai",
        "detect-libc",
        "onnxruntime-node",
        "sharp",
        "sherpa-onnx-node",
        "sqlite-vec",
        // node-llama-cpp generative lane (Electron main) + its platform binaries.
        "node-llama-cpp",
        "@node-llama-cpp",
        // Embedded LAN collaboration hub (optional) + mDNS discovery.
        "@hocuspocus",
        "bonjour-service",
      ]) {
        copyPackageIfExists(packageName, buildPath);
      }

      // The copies above preserve pnpm's symlink web (cpSync dereference is inert
      // for Windows dir symlinks). Rewrite BOTH packaged node_modules into a
      // flat, real-file, npm-style layout so the MSI is fully portable — zero
      // symlinks, full dependency closure resolvable on a clean machine. This is
      // the actual fix for "Cannot find module next/dist/server/lib/start-server".
      makeNodeModulesPortable(buildPath);

      // Strip dead weight (GPU/wrong-platform native binaries) so the installer is a
      // tractable size. The app is ~3.8\,GB before this, almost entirely unused
      // node-llama-cpp CUDA backends and multi-platform onnxruntime binaries.
      pruneOversizedNativeBinaries(buildPath);
    },

    packageAfterPrune: async (_forgeConfig, buildPath) => {
      const packageJsonPath = path.join(buildPath, "package.json");

      if (!fs.existsSync(packageJsonPath)) return;

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

      packageJson.name = appSlug;
      packageJson.productName = appName;
      packageJson.author = manufacturer;
      packageJson.description = "AI-powered local data analysis and visualization platform";
      packageJson.main = "build/main.js";

      fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    },

    // ── @electron/fuses production hardening (architecture §12) ──
    // Bake the hardening fuses into the packaged binary so they cannot be
    // re-enabled at runtime via env vars / CLI flags. Driven by the single
    // source of truth in electron/security.ts (PRODUCTION_FUSE_CONFIG).
    postPackage: async (_forgeConfig, { platform, outputPaths }) => {
      for (const outputPath of outputPaths) {
        const electronBinary = resolveElectronBinary(outputPath, platform);

        if (!fs.existsSync(electronBinary)) {
          console.warn(`[forge] fuses: binary not found, skipping: ${electronBinary}`);
          continue;
        }

        console.log(`[forge] Flipping @electron/fuses on ${electronBinary}`);
        await flipFuses(electronBinary, {
          version: FuseVersion.V1,
          resetAdHocDarwinSignature: platform === "darwin",
          [FuseV1Options.RunAsNode]: PRODUCTION_FUSE_CONFIG.RunAsNode,
          [FuseV1Options.EnableCookieEncryption]: PRODUCTION_FUSE_CONFIG.EnableCookieEncryption,
          [FuseV1Options.EnableNodeOptionsEnvironmentVariable]:
            PRODUCTION_FUSE_CONFIG.EnableNodeOptionsEnvironmentVariable,
          [FuseV1Options.EnableNodeCliInspectArguments]:
            PRODUCTION_FUSE_CONFIG.EnableNodeCliInspectArguments,
          [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]:
            PRODUCTION_FUSE_CONFIG.EnableEmbeddedAsarIntegrityValidation,
          [FuseV1Options.OnlyLoadAppFromAsar]: PRODUCTION_FUSE_CONFIG.OnlyLoadAppFromAsar,
          [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]:
            PRODUCTION_FUSE_CONFIG.LoadBrowserProcessSpecificV8Snapshot,
          [FuseV1Options.GrantFileProtocolExtraPrivileges]:
            PRODUCTION_FUSE_CONFIG.GrantFileProtocolExtraPrivileges,
        });
      }
    },
  },
};

export default config;
