import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir() } }));

import { sha256FileMatches } from "../../electron/pyodide-downloader";

describe("Pyodide download integrity", () => {
  it("accepts only a complete file matching its pinned SHA-256", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dn-pyodide-integrity-"));
    const target = path.join(dir, "runtime.bin");
    try {
      await fs.writeFile(target, "expected runtime");
      const digest = createHash("sha256").update("expected runtime").digest("hex");
      expect(await sha256FileMatches(target, digest)).toBe(true);
      await fs.writeFile(target, "partial");
      expect(await sha256FileMatches(target, digest)).toBe(false);
      await fs.rm(target);
      expect(await sha256FileMatches(target, digest)).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
