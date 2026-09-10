import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The suite-wide DN_SQLITE_DRIVER=node-sqlite flag (vitest.config.ts) routes
// the default path to the adapter; the mocked loader below only serves the
// test that explicitly unsets the flag to exercise the ERR_DLOPEN_FAILED
// fallback.
vi.mock("better-sqlite3", () => {
  throw Object.assign(new Error("mocked dlopen failure"), { code: "ERR_DLOPEN_FAILED" });
});

import { createSqliteConnection, openSqliteHandle } from "@/platform/storage/db-bootstrap";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "dn-db-bootstrap-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

type MiniDb = {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    get: (...args: unknown[]) => unknown;
    all: (...args: unknown[]) => { k: string }[];
    run: (...args: unknown[]) => unknown;
  };
  transaction: (fn: () => void) => () => void;
  pragma: (s: string) => void;
  close: () => void;
};

function openMiniDb(name: string): { sqlite: MiniDb; path: string } {
  const handle = openSqliteHandle({
    path: path.join(dir, name),
    schema: {},
    applyPragmas: false,
  });
  return { sqlite: handle.sqlite as unknown as MiniDb, path: handle.path };
}

describe("createSqliteConnection", () => {
  it("uses an injected custom driver without touching the loader", () => {
    const seen: unknown[] = [];
    class FakeDriver {
      constructor(...args: unknown[]) {
        seen.push(args);
      }
    }
    const conn = createSqliteConnection(":memory:", undefined, FakeDriver as never);
    expect(conn).toBeInstanceOf(FakeDriver);
    expect(seen[0]).toEqual([":memory:", undefined]);
  });

  it("rethrows non-DLOPEN driver errors", () => {
    class ExplodingDriver {
      constructor() {
        throw new Error("disk full");
      }
    }
    expect(() => createSqliteConnection(":memory:", undefined, ExplodingDriver as never)).toThrow(
      "disk full",
    );
  });

  it("falls back to the adapter when the native loader fails without the flag", () => {
    vi.stubEnv("DN_SQLITE_DRIVER", "");
    try {
      const conn = createSqliteConnection(path.join(dir, "dlopen.db"));
      expect(typeof (conn as unknown as { exec: unknown }).exec).toBe("function");
      (conn as unknown as { close: () => void }).close();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("node:sqlite fallback adapter", () => {
  it("opens a file handle, applies pre-pragmas, and runs queries", () => {
    const prePragmas = vi.fn();
    const handle = openSqliteHandle({
      path: path.join(dir, "app.db"),
      schema: {},
      applyPragmas: false,
      prePragmas,
    });
    const sqlite = handle.sqlite as unknown as MiniDb;

    expect(prePragmas).toHaveBeenCalledOnce();
    sqlite.exec("CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT)");
    sqlite.exec("INSERT INTO kv VALUES ('a', 'b')");
    expect(sqlite.prepare("SELECT v FROM kv WHERE k = 'a'").get()).toMatchObject({ v: "b" });
    expect(handle.path).toContain("app.db");
    sqlite.close();
  });

  it("commits successful transactions and rolls back failures", () => {
    const { sqlite } = openMiniDb("tx.db");
    sqlite.exec("CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT)");

    sqlite.transaction(() => {
      sqlite.exec("INSERT INTO kv VALUES ('a', 'b')");
    })();
    expect(() =>
      sqlite.transaction(() => {
        sqlite.exec("INSERT INTO kv VALUES ('c', 'c')");
        throw new Error("boom");
      })(),
    ).toThrow("boom");

    const rows = sqlite.prepare("SELECT k FROM kv").all();
    expect(rows.map((r) => r.k).sort()).toEqual(["a"]);
    sqlite.close();
  });

  it("treats pragmas as best-effort", () => {
    const { sqlite } = openMiniDb("pragma.db");
    expect(() => sqlite.pragma("not_a_real_pragma = 1")).not.toThrow();
    sqlite.close();
  });
});
