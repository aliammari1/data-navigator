import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAuthMigrationsFolder } from "@/platform/auth/auth-database";

const originalEnv = process.env.APP_MIGRATIONS_DIR;

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.APP_MIGRATIONS_DIR;
  } else {
    process.env.APP_MIGRATIONS_DIR = originalEnv;
  }
});

describe("resolveAuthMigrationsFolder", () => {
  it("uses the packaged migration bundle exported by Electron", () => {
    process.env.APP_MIGRATIONS_DIR = "/opt/Data Navigator/resources/app.asar/drizzle";

    expect(resolveAuthMigrationsFolder({ cwd: "/home/user/Downloads" })).toBe(
      "/opt/Data Navigator/resources/app.asar/drizzle",
    );
  });

  it("falls back to <cwd>/drizzle outside packaged Electron", () => {
    delete process.env.APP_MIGRATIONS_DIR;

    expect(resolveAuthMigrationsFolder({ cwd: "/workspace/data-navigator" })).toBe(
      path.join("/workspace/data-navigator", "drizzle"),
    );
  });

  it("prefers an explicit caller override", () => {
    process.env.APP_MIGRATIONS_DIR = "/packaged/drizzle";

    expect(
      resolveAuthMigrationsFolder({
        cwd: "/workspace/data-navigator",
        migrationsFolder: "/custom/migrations",
      }),
    ).toBe("/custom/migrations");
  });
});
