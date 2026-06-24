import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { PRODUCTION_FUSE_CONFIG } from "../../electron/security";

/**
 * electron-builder flips @electron/fuses from its own `electronFuses` block
 * (electron-builder.config.cjs) — a hand-maintained camelCase mirror of the
 * PascalCase PRODUCTION_FUSE_CONFIG policy in electron/security.ts (the single
 * source of truth). The two live in different files and there is no compiler
 * link between them, so a fuse hardened in the policy but forgotten in the
 * packager config would silently ship an UNHARDENED build. This test fails the
 * moment the packager drifts from the policy.
 *
 * The key mapping is purely cosmetic: @electron/fuses' programmatic API (which
 * electron-builder consumes) lower-cases the first letter of each FuseV1Options
 * member, e.g. `RunAsNode` -> `runAsNode`.
 */

// Load the CommonJS packager config from an ESM test without tripping interop.
const require = createRequire(import.meta.url);
const { electronFuses } = require("../../electron-builder.config.cjs") as {
  electronFuses: Record<string, boolean>;
};

/** `RunAsNode` -> `runAsNode` (lower-case the first character only). */
const toCamel = (key: string): string => key.charAt(0).toLowerCase() + key.slice(1);

describe("electron-builder electronFuses ↔ PRODUCTION_FUSE_CONFIG", () => {
  it("flips every security-policy fuse to the same value the policy mandates", () => {
    for (const [policyKey, policyValue] of Object.entries(PRODUCTION_FUSE_CONFIG)) {
      const fuseKey = toCamel(policyKey);
      expect(
        electronFuses,
        `electron-builder.config.cjs is missing the "${fuseKey}" fuse (policy: ${policyKey})`,
      ).toHaveProperty(fuseKey);
      expect(
        electronFuses[fuseKey],
        `fuse "${fuseKey}" must match PRODUCTION_FUSE_CONFIG.${policyKey}`,
      ).toBe(policyValue);
    }
  });

  it("does not silently set extra fuses outside the darwin-signature reset", () => {
    // resetAdHocDarwinSignature is a macOS-only re-sign toggle with no PascalCase
    // policy counterpart; every OTHER packager fuse must trace back to the policy.
    const policyKeys = new Set(Object.keys(PRODUCTION_FUSE_CONFIG).map(toCamel));
    const allowedExtras = new Set(["resetAdHocDarwinSignature"]);
    for (const fuseKey of Object.keys(electronFuses)) {
      if (allowedExtras.has(fuseKey)) continue;
      expect(
        policyKeys.has(fuseKey),
        `packager sets fuse "${fuseKey}" with no PRODUCTION_FUSE_CONFIG counterpart`,
      ).toBe(true);
    }
  });
});
