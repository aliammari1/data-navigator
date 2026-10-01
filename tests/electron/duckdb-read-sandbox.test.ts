import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let userDataDir: string;
let tempDir: string;

vi.mock("electron", () => ({
  app: { getPath: () => userDataDir, on: () => {} },
}));
vi.mock("../../electron/settings-storage", () => ({ recordQueryAnalytics: () => {} }));

import * as duckdb from "../../electron/duckdb-service";

describe("renderer DuckDB SQL file access", () => {
  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dn-duckdb-sandbox-"));
    userDataDir = path.join(tempDir, "app-data");
    await fs.mkdir(userDataDir);
    await fs.writeFile(path.join(tempDir, "private.txt"), "private value");
  });

  afterAll(async () => {
    await duckdb.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("rejects a file reader separated from its call by a SQL comment", async () => {
    const target = path.join(tempDir, "private.txt").replaceAll("'", "''");
    await expect(
      duckdb.runReadOnlyQuery(`SELECT * FROM read_text/**/('${target}')`),
    ).rejects.toThrow();
  });
});
