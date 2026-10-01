import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

async function openAuthDb() {
  vi.resetModules();
  const { authDb } = await import("../../src/platform/auth/auth-database");
  return "select" in authDb;
}

describe("opt-in auth database encryption", () => {
  it("refuses to create a plaintext database when its key is absent", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dn-auth-closed-"));
    tempDirs.push(dir);
    vi.stubEnv("APP_USER_DATA", dir);
    vi.stubEnv("DN_ENCRYPT_AUTH_DB", "1");
    vi.stubEnv("DN_AUTH_DB_KEY", "");

    await expect(openAuthDb()).rejects.toThrow(/encryption key/i);
    expect(fs.existsSync(path.join(dir, "databases", "auth.db"))).toBe(false);
  });

  it("preserves an existing database when encryption migration fails", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dn-auth-closed-"));
    tempDirs.push(dir);
    const dbDir = path.join(dir, "databases");
    fs.mkdirSync(dbDir);
    const dbPath = path.join(dbDir, "auth.db");
    const corruptDb = Buffer.from("SQLite format 3\0invalid database body");
    fs.writeFileSync(dbPath, corruptDb);
    vi.stubEnv("APP_USER_DATA", dir);
    vi.stubEnv("DN_ENCRYPT_AUTH_DB", "1");
    vi.stubEnv("DN_AUTH_DB_KEY", "a".repeat(64));

    await expect(openAuthDb()).rejects.toThrow(/encryption migration failed/i);
    expect(fs.readFileSync(dbPath)).toEqual(corruptDb);
  });
});
