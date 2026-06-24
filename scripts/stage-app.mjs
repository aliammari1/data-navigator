// scripts/stage-app.mjs
//
// Stage the Electron app tree (Next.js standalone + Electron-main runtime
// packages) into REAL-file, npm-style node_modules at the repo root BEFORE
// electron-builder runs. electron-builder cannot walk pnpm's isolated store, so
// we produce the flattened (zero-symlink) trees ourselves here.
//
// This is a straight port of forge.config.ts's `packageAfterCopy` hook +
// `makeNodeModulesPortable`, re-rooted from `<buildPath>` to the repo root
// (`process.cwd()`). All the pnpm → flat node_modules dereferencing helpers are
// ported VERBATIM from forge.config.ts (TS type annotations stripped).
//
// Runnable as: node scripts/stage-app.mjs

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

/** Synchronous sleep (no async available in this straight-line fs script). */
function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // SharedArrayBuffer may be unavailable; fall back to a cheap busy-wait.
    const end = performance.now() + ms;
    while (performance.now() < end) {
      /* spin */
    }
  }
}

/**
 * Windows can EPERM/EBUSY a directory rename when AV / the search indexer briefly
 * holds a handle on the just-removed destination (the `.flat-tmp` -> real swap).
 * Retry the clear+rename with backoff; this is purely a robustness wrapper around
 * `fs.rmSync(to) + fs.renameSync(from, to)`.
 */
function safeRename(from, to) {
  let lastErr;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      fs.rmSync(to, { recursive: true, force: true });
    } catch {
      /* ignore — renameSync below reports the real failure */
    }
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      lastErr = err;
      if (!["EPERM", "EBUSY", "ENOTEMPTY", "EEXIST", "EACCES"].includes(err.code)) throw err;
      sleepSync(250 * attempt);
    }
  }
  // Rename keeps failing (a Windows AV/indexer handle on the temp dir survives the
  // retries). The temp holds REAL files (flattenClosure dereferenced every symlink),
  // so copy it into place instead, then best-effort drop the temp. Slower but reliable.
  console.warn(`[stage] renameSync failed (${lastErr?.code}); copying ${from} -> ${to} instead.`);
  try {
    fs.rmSync(to, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  fs.cpSync(from, to, { recursive: true, force: true });
  try {
    fs.rmSync(from, { recursive: true, force: true });
  } catch {
    /* leftover .flat-tmp is harmless; it is not under any ship path */
  }
}

/**
 * Shared copy options for the bulk directory copies below. `dereference: true`
 * is set as a best-effort hint, but note it is INERT for Windows DIRECTORY
 * symlinks on this build host (verified) — cpSync copies pnpm's dir symlinks
 * verbatim regardless. The real portability fix is the flattening pass below,
 * which manually resolves every symlink to real files. These copies just stage
 * the trees (including the local `.pnpm` store under `app/node_modules`) for the
 * flattening pass.
 */
const COPY_OPTS = { recursive: true, force: true, dereference: true };

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
function stripExtendedPrefix(p) {
  if (p.startsWith("\\\\?\\UNC\\")) return `\\\\${p.slice("\\\\?\\UNC\\".length)}`;
  if (p.startsWith("\\\\?\\")) return p.slice("\\\\?\\".length);
  return p;
}

/** True if the dirent at `p` is a symlink/junction. */
function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Resolve a path (following symlinks) to its real absolute location, or null. */
function tryRealpath(p) {
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
function copyRealTree(src, dest, seen = new Set()) {
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
function listPackagesInDir(nmDir) {
  const out = [];
  let entries;
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
      let scoped;
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
function parsePnpmEntry(realPkgPath) {
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

/** Derive the package name from a `.../node_modules/<name>` realpath, or null. */
function nameFromNodeModulesPath(realPkg) {
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
function nestedDeps(realPkg) {
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
function resolveCompleteSource(realPkg) {
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
const BUILD_ONLY_DEPS = new Set(["cmake-js"]);

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
function runtimeDepNames(realPkg) {
  const out = new Set();
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

function flattenClosure(seeds, destNodeModules) {
  const visitedIds = new Set();
  const writtenNames = new Set();
  // Seeds are top-level/required entries: always written. Each package then
  // enqueues only ITS declared runtime deps, so the closure stays production-lean.
  const queue = [...seeds];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) continue;

    const realPkg = tryRealpath(item.entryPath);
    if (!realPkg || !fs.existsSync(realPkg)) continue;

    // Prefer the store-derived name (canonical), else the seed's known name.
    const name = nameFromNodeModulesPath(realPkg) ?? item.name;
    if (!name) continue;

    // Enqueue this package's RUNTIME dependencies (only), once per pnpm id.
    const enqueueRuntimeDeps = (candidates) => {
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
function specifierToPackageName(spec) {
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
function externalPackagesFromBundle(bundlePath) {
  const names = new Set();
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
 * dev pnpm store. Used for `build/node_modules` (the Electron MAIN deps), which
 * has NO local `.pnpm` store of its own.
 */
function flattenMainNodeModules(buildNodeModules) {
  if (!fs.existsSync(buildNodeModules)) return;
  console.log(`[stage] Flattening main node_modules: ${buildNodeModules}`);

  const devNodeModules = path.join(root, "node_modules");
  const seeds = [];
  const seededNames = new Set();

  const addSeed = (name) => {
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

  flattenClosure(seeds, tmp);

  fs.rmSync(buildNodeModules, { recursive: true, force: true });
  safeRename(tmp,buildNodeModules);

  const flatNames = fs.readdirSync(buildNodeModules);
  console.log(
    `[stage] main node_modules flattened: ${flatNames.length} top-level entries (seeds=${seeds.length})`,
  );
}

/**
 * Flatten `app/node_modules` (the Next.js standalone closure). The `.pnpm`
 * store is ALREADY present here (copied verbatim by the standalone copy), so we
 * can flatten directly from `app/node_modules/.pnpm` plus the existing top-level
 * symlinks, then drop `.pnpm` entirely.
 */
function flattenAppNodeModules(appNodeModules) {
  if (!fs.existsSync(appNodeModules)) return;
  console.log(`[stage] Flattening app node_modules: ${appNodeModules}`);

  const localPnpm = path.join(appNodeModules, ".pnpm");
  const seeds = [];

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

  flattenClosure(seeds, tmp);

  fs.rmSync(appNodeModules, { recursive: true, force: true });
  safeRename(tmp,appNodeModules);
}

/**
 * Final safety net: walk a tree and replace ANY remaining symlink with a
 * real-file copy of its target. Guarantees ZERO symlinks survive into the MSI
 * (relative symlinks are NOT used — they may not survive MSI install). When a
 * link points into the pnpm store, the target package also gets its private
 * dependency closure nested under it, so version-specific imports resolve.
 */
function dereferenceAnyRemainingLinks(rootDir) {
  let replaced = 0;
  const walk = (dir) => {
    let entries;
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
function countSymlinks(rootDir) {
  let count = 0;
  const walk = (dir) => {
    let entries;
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

// ─── Staging (forge's packageAfterCopy body, re-rooted to the repo root) ──────

const nextStandaloneDir = path.join(root, ".next", "standalone");
const nextStaticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");
const modelsDir = path.join(root, "models");

// Stage the Next standalone into ./electron-app, NOT ./app. A root-level ./app is
// resolved by `next build` as the App Router source in preference to ./src/app, so a
// leftover staged ./app poisons the very next `next build` (turbopack tries to compile
// the standalone's .next/server chunks -> "Module not found"). electron-builder remaps
// electron-app -> app INSIDE the package (files FileSet in electron-builder.config.cjs),
// so the Electron main still reads app.getAppPath()/app unchanged.
const appDest = path.join(root, "electron-app");
const buildNodeModules = path.join(root, "build", "node_modules");

// Electron-MAIN runtime packages to stage into build/node_modules. Mirrors
// forge.config.ts's copyPackageIfExists list.
const MAIN_RUNTIME_PACKAGES = [
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
];

/** Copy a runtime package from dev node_modules into build/node_modules. */
function copyPackageIfExists(packageName) {
  const from = path.join(root, "node_modules", packageName);
  const to = path.join(buildNodeModules, packageName);

  if (!fs.existsSync(from)) return;

  console.log(`[stage] Copying runtime package: ${packageName}`);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, COPY_OPTS);
}

// 1. Stage the Next.js standalone app tree at <root>/app.
console.log(`[stage] Staging app + node_modules into ${root}`);

fs.rmSync(appDest, { recursive: true, force: true });

console.log("[stage] Copying Next standalone app");
fs.cpSync(nextStandaloneDir, appDest, { recursive: true, force: true, dereference: true });

console.log("[stage] Copying Next static assets");
fs.cpSync(nextStaticDir, path.join(appDest, ".next", "static"), {
  recursive: true,
  force: true,
  dereference: true,
});

console.log("[stage] Copying public assets");
fs.cpSync(publicDir, path.join(appDest, "public"), {
  recursive: true,
  force: true,
  dereference: true,
});

if (fs.existsSync(modelsDir)) {
  console.log("[stage] Copying local edge-AI models");
  fs.cpSync(modelsDir, path.join(appDest, "models"), {
    recursive: true,
    force: true,
    dereference: true,
  });
}

// 2. Stage the Electron-MAIN runtime packages into build/node_modules.
for (const packageName of MAIN_RUNTIME_PACKAGES) {
  copyPackageIfExists(packageName);
}

// 3. Flatten BOTH trees into a flat, real-file, npm-style layout so the package
// is fully portable — zero symlinks, full dependency closure resolvable on a
// clean machine. This is the actual fix for "Cannot find module
// next/dist/server/lib/start-server".
flattenAppNodeModules(path.join(appDest, "node_modules"));
flattenMainNodeModules(buildNodeModules);

// 4. Dereference + verify the trees. The whole-`app` sweep is essential: Next.js
// standalone places externalized native modules under
// `app/.next/node_modules/<name>-<hash>` as ABSOLUTE-path symlinks (e.g.
// `better-sqlite3-…` → dev `.pnpm` store), and may scatter more traced-module
// links under `.next/server`. Any one of these dangling on a clean machine
// produces "Failed to load external module <x>" 500s at runtime. Walking all of
// `app/` (not just `app/node_modules`) replaces every remaining symlink with
// real files, guaranteeing the server can resolve them.
for (const target of [appDest, buildNodeModules]) {
  if (!fs.existsSync(target)) continue;
  const replaced = dereferenceAnyRemainingLinks(target);
  if (replaced > 0) {
    console.log(`[stage] Dereferenced ${replaced} stray symlink(s) in ${target}`);
  }
  const remaining = countSymlinks(target);
  if (remaining > 0) {
    throw new Error(`[stage] ${remaining} symlink(s) remain in ${target}`);
  }
  console.log(`[stage] Portability OK (0 symlinks): ${target}`);
}

console.log("[stage] Staging complete — app/ and build/node_modules are flat and portable.");
