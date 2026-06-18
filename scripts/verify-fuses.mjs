#!/usr/bin/env node
/**
 * Fuse-drift audit for the packaged Electron binary.
 *
 * Reads the @electron/fuses "wire" baked into a packaged Data Navigator binary
 * and asserts it matches electron/security.ts → PRODUCTION_FUSE_CONFIG (the
 * single source of truth that forge.config.ts flips at package time).
 *
 * This is the runtime counterpart to the build-time flip: it proves the SHIPPED
 * binary actually carries the hardening, catching drift from an Electron upgrade,
 * a forge.config.ts regression, or a fuse the packager silently failed to flip.
 *
 * Usage:
 *   node scripts/verify-fuses.mjs <path-to-built-app-exe>
 *   node scripts/verify-fuses.mjs            # auto-discovers under ./out
 *
 * Exit codes: 0 = fuses match; 1 = drift or binary not found / unreadable.
 *
 * Pure-ish: imports the expected config from electron/security.ts via the loader
 * the caller provides (run with `tsx`/`node --import tsx`), and the actual wire
 * from @electron/fuses. No electron import.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FuseV1Options, getCurrentFuseWire } from "@electron/fuses";
import { PRODUCTION_FUSE_CONFIG } from "../electron/security.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// FuseState char codes the wire stores (see @electron/fuses constants).
const STATE_ENABLE = String.fromCharCode(49); // '1'
const STATE_DISABLE = String.fromCharCode(48); // '0'

/** Recursively find the first `<exe>.exe`/mac/linux Electron binary under `out/`. */
function discoverBinary() {
  const explicit = process.argv[2];
  if (explicit) return path.resolve(explicit);

  const outDir = path.join(repoRoot, "out");
  if (!existsSync(outDir)) return null;

  // Forge package output: out/<ProductName>-<platform>-<arch>/<exe>.
  const candidates = [];
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip make/ (installers) — we want the unpacked package dir.
        if (entry.name === "make") continue;
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (
          lower === "data-navigator.exe" ||
          lower === "data-navigator" ||
          lower === "electron.exe"
        ) {
          candidates.push(full);
        }
      }
    }
  };
  walk(outDir, 0);

  // Prefer the productName-matching exe over a stray electron.exe.
  candidates.sort((a, b) => {
    const aData = a.toLowerCase().includes("data-navigator") ? 0 : 1;
    const bData = b.toLowerCase().includes("data-navigator") ? 0 : 1;
    return aData - bData;
  });
  return candidates[0] ?? null;
}

async function main() {
  const binary = discoverBinary();
  if (!binary || !existsSync(binary)) {
    console.error(
      "[verify-fuses] No packaged Electron binary found.\n" +
        "  Pass a path explicitly: node scripts/verify-fuses.mjs <exe>\n" +
        "  or run `pnpm run electron:package` first so ./out exists.",
    );
    process.exit(1);
  }

  console.log(`[verify-fuses] Auditing fuses in: ${binary}`);

  let wire;
  try {
    wire = await getCurrentFuseWire(binary);
  } catch (error) {
    console.error(`[verify-fuses] Could not read fuses from binary: ${error?.message ?? error}`);
    process.exit(1);
  }

  // `wire` may be a string or a buffer-like; normalize to per-index char access.
  const wireAt = (index) => {
    const value = typeof wire === "string" ? wire[index] : wire?.[index];
    if (typeof value === "number") return String.fromCharCode(value);
    return value;
  };

  const drift = [];
  for (const [fuseName, expectedEnabled] of Object.entries(PRODUCTION_FUSE_CONFIG)) {
    const index = FuseV1Options[fuseName];
    if (typeof index !== "number") {
      drift.push(`  ${fuseName}: unknown fuse name (not in FuseV1Options) — config/security.ts skew`);
      continue;
    }

    const expectedChar = expectedEnabled ? STATE_ENABLE : STATE_DISABLE;
    const actualChar = wireAt(index);

    if (actualChar !== expectedChar) {
      drift.push(
        `  ${fuseName} (index ${index}): expected ${
          expectedEnabled ? "ENABLE" : "DISABLE"
        } ('${expectedChar}'), got '${actualChar ?? "?"}'`,
      );
    } else {
      console.log(`  OK ${fuseName} = ${expectedEnabled ? "ENABLE" : "DISABLE"}`);
    }
  }

  if (drift.length > 0) {
    console.error(
      `\n[verify-fuses] FUSE DRIFT DETECTED — shipped binary does not match ` +
        `electron/security.ts PRODUCTION_FUSE_CONFIG:\n${drift.join("\n")}\n\n` +
        "Re-run the build / fix forge.config.ts so the flipped fuses match the policy.",
    );
    process.exit(1);
  }

  console.log("\n[verify-fuses] PASS — all production fuses match PRODUCTION_FUSE_CONFIG.");
}

main().catch((error) => {
  console.error(`[verify-fuses] Unexpected error: ${error?.stack ?? error}`);
  process.exit(1);
});
