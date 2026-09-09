import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock node:fs (used by loadOrCreateAuthSecret) ───────────────────────────

vi.mock("node:fs", () => {
  const existsSyncMock = vi.fn();
  const readFileSyncMock = vi.fn();
  const writeFileSyncMock = vi.fn();
  const mkdirSyncMock = vi.fn();
  return {
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
    writeFileSync: writeFileSyncMock,
    mkdirSync: mkdirSyncMock,
    default: {
      existsSync: existsSyncMock,
      readFileSync: readFileSyncMock,
      writeFileSync: writeFileSyncMock,
      mkdirSync: mkdirSyncMock,
    },
  };
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  assertLoopbackHostname,
  buildRendererCsp,
  CROSS_ORIGIN_ISOLATION_HEADERS,
  ensureAuthSecretEnv,
  getStringProperty,
  isAllowedAppOrigin,
  isLoopbackHostname,
  isPathInside,
  loadOrCreateAuthSecret,
  normalizePath,
  PathAccessController,
  PRODUCTION_FUSE_CONFIG,
  STATIC_SECURITY_HEADERS,
  wantsMicrophone,
  withCrossOriginIsolationHeaders,
  withRendererSecurityHeaders,
} from "../../electron/security";

// ─── normalizePath ────────────────────────────────────────────────────────────

describe("normalizePath", () => {
  it("resolves an absolute path unchanged", () => {
    const abs = path.resolve("/some/absolute/path");
    expect(normalizePath("/some/absolute/path")).toBe(abs);
  });

  it("resolves a relative path to an absolute path", () => {
    const result = normalizePath("relative/path");
    expect(path.isAbsolute(result)).toBe(true);
  });
});

// ─── isPathInside ─────────────────────────────────────────────────────────────

describe("isPathInside", () => {
  const base = path.resolve("/data/app");

  it("returns true when child is exactly the parent", () => {
    expect(isPathInside(base, base)).toBe(true);
  });

  it("returns true when child is nested inside parent", () => {
    expect(isPathInside(path.join(base, "subdir", "file.txt"), base)).toBe(true);
  });

  it("returns false when child is outside parent via ..", () => {
    expect(isPathInside(path.resolve("/data/other"), base)).toBe(false);
  });

  it("returns false when child traverses up from parent", () => {
    expect(isPathInside(path.resolve("/data"), base)).toBe(false);
  });

  it("returns false for completely unrelated paths", () => {
    expect(isPathInside(path.resolve("/etc/passwd"), base)).toBe(false);
  });
});

// ─── isAllowedAppOrigin ───────────────────────────────────────────────────────

describe("isAllowedAppOrigin", () => {
  it("returns false for undefined", () => {
    expect(isAllowedAppOrigin()).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isAllowedAppOrigin("")).toBe(false);
  });

  it("returns true for file:// origin", () => {
    expect(isAllowedAppOrigin("file:///path/to/app/index.html")).toBe(true);
  });

  it("returns true for localhost origin", () => {
    expect(isAllowedAppOrigin("http://localhost:3000")).toBe(true);
  });

  it("returns true for 127.0.0.1 origin", () => {
    expect(isAllowedAppOrigin("http://127.0.0.1:3000")).toBe(true);
  });

  it("returns false for a remote http origin", () => {
    expect(isAllowedAppOrigin("https://evil.example.com")).toBe(false);
  });

  it("returns false for an invalid/malformed URL", () => {
    expect(isAllowedAppOrigin("not-a-url")).toBe(false);
  });

  it("returns false for data: URL", () => {
    expect(isAllowedAppOrigin("data:text/html,<html>")).toBe(false);
  });

  it("returns false for about:blank", () => {
    // about: protocol has no hostname, not file:, not localhost/127.0.0.1
    expect(isAllowedAppOrigin("about:blank")).toBe(false);
  });
});

// ─── wantsMicrophone ─────────────────────────────────────────────────────────

describe("wantsMicrophone", () => {
  it("returns true when details is undefined", () => {
    expect(wantsMicrophone()).toBe(true);
  });

  it("returns true when details is null-ish (no details passed)", () => {
    // Called with undefined details => true
    expect(wantsMicrophone()).toBe(true);
  });

  it("returns true when mediaTypes includes audio", () => {
    expect(wantsMicrophone({ mediaTypes: ["audio", "video"] })).toBe(true);
  });

  it("returns false when mediaTypes is present but does not include audio", () => {
    expect(wantsMicrophone({ mediaTypes: ["video"] })).toBe(false);
  });

  it("returns true when mediaType is audio", () => {
    expect(wantsMicrophone({ mediaType: "audio" })).toBe(true);
  });

  it("returns true when mediaType is unknown", () => {
    expect(wantsMicrophone({ mediaType: "unknown" })).toBe(true);
  });

  it("returns false when mediaType is video", () => {
    expect(wantsMicrophone({ mediaType: "video" })).toBe(false);
  });

  it("returns true when neither mediaTypes nor mediaType is set (empty details)", () => {
    expect(wantsMicrophone({})).toBe(true);
  });

  it("returns false when mediaTypes is empty array", () => {
    expect(wantsMicrophone({ mediaTypes: [] })).toBe(false);
  });
});

// ─── getStringProperty ────────────────────────────────────────────────────────

describe("getStringProperty", () => {
  it("returns the string value when valid", () => {
    expect(getStringProperty({ name: "Alice" }, "name")).toBe("Alice");
  });

  it("throws when input is null", () => {
    expect(() => getStringProperty(null, "key")).toThrow(
      'Expected object input with property "key".',
    );
  });

  it("throws when input is undefined", () => {
    expect(() => getStringProperty(undefined, "key")).toThrow(
      'Expected object input with property "key".',
    );
  });

  it("throws when input is a number", () => {
    expect(() => getStringProperty(42, "key")).toThrow(
      'Expected object input with property "key".',
    );
  });

  it("throws when input is a string", () => {
    expect(() => getStringProperty("text", "key")).toThrow(
      'Expected object input with property "key".',
    );
  });

  it("throws when property is missing", () => {
    expect(() => getStringProperty({}, "key")).toThrow('Expected non-empty string property "key".');
  });

  it("throws when property is an empty string", () => {
    expect(() => getStringProperty({ key: "" }, "key")).toThrow(
      'Expected non-empty string property "key".',
    );
  });

  it("throws when property is only whitespace", () => {
    expect(() => getStringProperty({ key: "   " }, "key")).toThrow(
      'Expected non-empty string property "key".',
    );
  });

  it("throws when property is a number", () => {
    expect(() => getStringProperty({ key: 123 }, "key")).toThrow(
      'Expected non-empty string property "key".',
    );
  });

  it("returns string with whitespace (non-empty after trim check)", () => {
    // " hello " has non-empty trim → valid
    expect(getStringProperty({ key: " hello " }, "key")).toBe(" hello ");
  });
});

// ─── PathAccessController ─────────────────────────────────────────────────────

describe("PathAccessController", () => {
  const dataDir = path.resolve("/app/data");
  let ctrl: PathAccessController;

  beforeEach(() => {
    ctrl = new PathAccessController(dataDir);
  });

  describe("dataDir getter", () => {
    it("returns the normalized data dir", () => {
      expect(ctrl.dataDir).toBe(path.resolve(dataDir));
    });
  });

  describe("isInsideDataDir", () => {
    it("returns true for a path inside data dir", () => {
      expect(ctrl.isInsideDataDir(path.join(dataDir, "file.db"))).toBe(true);
    });

    it("returns false for a path outside data dir", () => {
      expect(ctrl.isInsideDataDir("/etc/passwd")).toBe(false);
    });
  });

  describe("rememberReadPath + assertAllowedReadPath", () => {
    it("allows a path after rememberReadPath", () => {
      const file = path.resolve("/user/downloads/data.csv");
      ctrl.rememberReadPath(file);
      expect(ctrl.assertAllowedReadPath(file)).toBe(path.resolve(file));
    });

    it("allows a file inside a remembered read directory", () => {
      const dir = path.resolve("/user/downloads");
      ctrl.rememberReadPath(dir);
      const file = path.join(dir, "nested", "data.csv");
      expect(ctrl.assertAllowedReadPath(file)).toBe(path.resolve(file));
    });

    it("allows a path inside the data dir without explicit remember", () => {
      const file = path.join(dataDir, "store.db");
      expect(ctrl.assertAllowedReadPath(file)).toBe(path.resolve(file));
    });

    it("throws for an untrusted path not remembered and not in data dir", () => {
      expect(() => ctrl.assertAllowedReadPath("/etc/passwd")).toThrow(
        "Blocked read access to untrusted path",
      );
    });

    it("iterates multiple allowed directories and finds a match on the second one (covers loop false branch)", () => {
      // Add first directory that does NOT contain our target file
      const dir1 = path.resolve("/user/downloads");
      const dir2 = path.resolve("/user/docs");
      ctrl.rememberReadPath(dir1);
      ctrl.rememberDirectory(dir2);
      // target is inside dir2 but NOT inside dir1 => loop visits dir1 (false), then dir2 (true)
      const file = path.join(dir2, "report.pdf");
      expect(ctrl.assertAllowedReadPath(file)).toBe(path.resolve(file));
    });

    it("iterates allowed directories and throws when none match (covers loop false branch then throw)", () => {
      // Add a directory that does NOT contain our target
      const dir1 = path.resolve("/user/downloads");
      ctrl.rememberReadPath(dir1);
      // target is NOT inside dir1 and NOT in dataDir
      expect(() => ctrl.assertAllowedReadPath("/etc/passwd")).toThrow(
        "Blocked read access to untrusted path",
      );
    });
  });

  describe("rememberSavePath + assertAllowedWritePath", () => {
    it("allows write to a remembered save path", () => {
      const file = path.resolve("/user/docs/output.csv");
      ctrl.rememberSavePath(file);
      expect(ctrl.assertAllowedWritePath(file)).toBe(path.resolve(file));
    });

    it("allows write to a path inside data dir", () => {
      const file = path.join(dataDir, "export.csv");
      expect(ctrl.assertAllowedWritePath(file)).toBe(path.resolve(file));
    });

    it("throws for an untrusted write path", () => {
      expect(() => ctrl.assertAllowedWritePath("/etc/evil.txt")).toThrow(
        "Blocked write access to untrusted path",
      );
    });
  });

  describe("assertAllowedDeletePath", () => {
    it("allows delete for a path inside data dir", () => {
      const file = path.join(dataDir, "temp.db");
      expect(ctrl.assertAllowedDeletePath(file)).toBe(path.resolve(file));
    });

    it("throws for a path outside data dir", () => {
      expect(() => ctrl.assertAllowedDeletePath("/user/docs/file.txt")).toThrow(
        "Blocked delete access outside app data dir",
      );
    });
  });

  describe("rememberDirectory + assertAllowedDirectoryPath", () => {
    it("allows a directory after rememberDirectory", () => {
      const dir = path.resolve("/user/projects");
      ctrl.rememberDirectory(dir);
      expect(ctrl.assertAllowedDirectoryPath(dir)).toBe(path.resolve(dir));
    });

    it("allows data dir itself as a directory", () => {
      expect(ctrl.assertAllowedDirectoryPath(dataDir)).toBe(path.resolve(dataDir));
    });

    it("allows a subdirectory of data dir", () => {
      const sub = path.join(dataDir, "cache");
      expect(ctrl.assertAllowedDirectoryPath(sub)).toBe(path.resolve(sub));
    });

    it("throws for an untrusted directory path", () => {
      expect(() => ctrl.assertAllowedDirectoryPath("/etc")).toThrow(
        "Blocked directory access to untrusted path",
      );
    });
  });
});

// ─── CROSS_ORIGIN_ISOLATION_HEADERS constant ──────────────────────────────────

describe("CROSS_ORIGIN_ISOLATION_HEADERS", () => {
  /**
   * These pin the exact isolation policy chosen (and reviewed) in
   * electron/security.ts. A unit test cannot prove same-origin/require-corp is
   * the "right" choice — that's a security-review judgment — but it does catch
   * accidental drift (refactor, merge, copy-paste) away from the reviewed value.
   */
  it("has the correct keys and values", () => {
    expect(CROSS_ORIGIN_ISOLATION_HEADERS["Cross-Origin-Opener-Policy"]).toEqual(["same-origin"]);
    expect(CROSS_ORIGIN_ISOLATION_HEADERS["Cross-Origin-Embedder-Policy"]).toEqual([
      "require-corp",
    ]);
    expect(CROSS_ORIGIN_ISOLATION_HEADERS["Cross-Origin-Resource-Policy"]).toEqual(["same-origin"]);
  });

  it("never permits the isolation-defeating 'unsafe-none' value on any header", () => {
    // Independent invariant, not copied from the constant: whatever the exact
    // policy in force, isolation headers must never regress to the permissive
    // default — that is the one property this module exists to guarantee.
    for (const values of Object.values(CROSS_ORIGIN_ISOLATION_HEADERS)) {
      expect(values).not.toContain("unsafe-none");
    }
  });
});

// ─── withCrossOriginIsolationHeaders ──────────────────────────────────────────

describe("withCrossOriginIsolationHeaders", () => {
  it("adds isolation headers when responseHeaders is undefined", () => {
    const result = withCrossOriginIsolationHeaders(undefined);
    expect(result["Cross-Origin-Opener-Policy"]).toEqual(["same-origin"]);
    expect(result["Cross-Origin-Embedder-Policy"]).toEqual(["require-corp"]);
    expect(result["Cross-Origin-Resource-Policy"]).toEqual(["same-origin"]);
  });

  it("adds isolation headers when responseHeaders is empty", () => {
    const result = withCrossOriginIsolationHeaders({});
    expect(result["Cross-Origin-Opener-Policy"]).toEqual(["same-origin"]);
  });

  it("keeps unmanaged headers and adds isolation headers", () => {
    const result = withCrossOriginIsolationHeaders({
      "Content-Type": "text/html",
      "Cache-Control": "no-cache",
    });
    expect(result["Content-Type"]).toBe("text/html");
    expect(result["Cache-Control"]).toBe("no-cache");
    expect(result["Cross-Origin-Opener-Policy"]).toEqual(["same-origin"]);
  });

  it("strips existing managed headers (any casing) and replaces with policy", () => {
    const result = withCrossOriginIsolationHeaders({
      "cross-origin-opener-policy": "unsafe-none",
      "Cross-Origin-Embedder-Policy": "unsafe-none",
      "CROSS-ORIGIN-RESOURCE-POLICY": "cross-origin",
    });
    // All replaced with our policy
    expect(result["Cross-Origin-Opener-Policy"]).toEqual(["same-origin"]);
    expect(result["Cross-Origin-Embedder-Policy"]).toEqual(["require-corp"]);
    expect(result["Cross-Origin-Resource-Policy"]).toEqual(["same-origin"]);
    // Old keys with different casing should be gone
    expect(result["cross-origin-opener-policy"]).toBeUndefined();
  });

  it("handles string array values in response headers", () => {
    const result = withCrossOriginIsolationHeaders({
      "X-Custom": ["value1", "value2"],
    });
    expect(result["X-Custom"]).toEqual(["value1", "value2"]);
  });
});

// ─── buildRendererCsp ─────────────────────────────────────────────────────────

describe("buildRendererCsp", () => {
  it("returns enforce and reportOnly strings for dev=false", () => {
    const { enforce, reportOnly } = buildRendererCsp({ dev: false });
    expect(enforce).toContain("script-src");
    expect(enforce).toContain("'unsafe-inline'");
    expect(enforce).not.toContain("'unsafe-eval'");
    expect(reportOnly).toContain("script-src");
    expect(reportOnly).not.toContain("'unsafe-inline'");
  });

  it("includes unsafe-eval in enforce when dev=true", () => {
    const { enforce, reportOnly } = buildRendererCsp({ dev: true });
    expect(enforce).toContain("'unsafe-eval'");
    // strict: true (reportOnly) also gets dev eval
    expect(reportOnly).toContain("'unsafe-eval'");
  });

  it("enforce includes unsafe-inline style-src when not strict", () => {
    const { enforce } = buildRendererCsp({ dev: false });
    expect(enforce).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("reportOnly does not include unsafe-inline style-src (strict)", () => {
    const { reportOnly } = buildRendererCsp({ dev: false });
    expect(reportOnly).toContain("style-src 'self'");
    expect(reportOnly).not.toContain("style-src 'self' 'unsafe-inline'");
  });

  it("both include wasm-unsafe-eval", () => {
    const { enforce, reportOnly } = buildRendererCsp({ dev: false });
    expect(enforce).toContain("'wasm-unsafe-eval'");
    expect(reportOnly).toContain("'wasm-unsafe-eval'");
  });

  it("includes worker-src self blob:", () => {
    const { enforce } = buildRendererCsp({ dev: false });
    expect(enforce).toContain("worker-src 'self' blob:");
  });
});

// ─── STATIC_SECURITY_HEADERS constant ────────────────────────────────────────

describe("STATIC_SECURITY_HEADERS", () => {
  it("contains X-Content-Type-Options: nosniff", () => {
    expect(STATIC_SECURITY_HEADERS["X-Content-Type-Options"]).toEqual(["nosniff"]);
  });

  it("contains X-Frame-Options: SAMEORIGIN", () => {
    expect(STATIC_SECURITY_HEADERS["X-Frame-Options"]).toEqual(["SAMEORIGIN"]);
  });

  it("contains Referrer-Policy: no-referrer", () => {
    expect(STATIC_SECURITY_HEADERS["Referrer-Policy"]).toEqual(["no-referrer"]);
  });

  it("never sets X-Frame-Options to a clickjacking-permissive value", () => {
    // Independent invariant: ALLOWALL / ALLOW-FROM would defeat the clickjacking
    // protection this header exists for, regardless of the currently pinned value.
    const value = STATIC_SECURITY_HEADERS["X-Frame-Options"][0];
    expect(value).not.toMatch(/^ALLOW-FROM/i);
    expect(value.toUpperCase()).not.toBe("ALLOWALL");
  });
});

// ─── withRendererSecurityHeaders ──────────────────────────────────────────────

describe("withRendererSecurityHeaders", () => {
  it("adds all security headers to empty headers, dev=false, enforceCsp default", () => {
    const result = withRendererSecurityHeaders(undefined, { dev: false });
    expect(result["Content-Security-Policy"]).toBeDefined();
    expect(result["Content-Security-Policy-Report-Only"]).toBeDefined();
    expect(result["X-Content-Type-Options"]).toEqual(["nosniff"]);
    expect(result["Cross-Origin-Opener-Policy"]).toEqual(["same-origin"]);
  });

  it("does not include CSP enforce header when enforceCsp=false", () => {
    const result = withRendererSecurityHeaders(undefined, { dev: false, enforceCsp: false });
    expect(result["Content-Security-Policy"]).toBeUndefined();
    expect(result["Content-Security-Policy-Report-Only"]).toBeDefined();
  });

  it("includes CSP enforce header when enforceCsp=true explicitly", () => {
    const result = withRendererSecurityHeaders(undefined, { dev: false, enforceCsp: true });
    expect(result["Content-Security-Policy"]).toBeDefined();
  });

  it("strips existing security-related headers (case-insensitive)", () => {
    const result = withRendererSecurityHeaders(
      {
        "content-security-policy": "old-csp",
        "X-Frame-Options": "DENY",
        "x-powered-by": "Express",
        "content-security-policy-report-only": "old-report-only",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "permissions-policy": "old",
        "x-dns-prefetch-control": "on",
      },
      { dev: false },
    );
    // Our policy replaces all of these
    expect(result["Content-Security-Policy"]).toBeDefined();
    expect(result["content-security-policy"]).toBeUndefined();
    expect(result["x-powered-by"]).toBeUndefined();
    expect(result["X-Frame-Options"]).toEqual(["SAMEORIGIN"]);
  });

  it("keeps unmanaged headers", () => {
    const result = withRendererSecurityHeaders({ "Cache-Control": "no-store" }, { dev: true });
    expect(result["Cache-Control"]).toBe("no-store");
  });

  it("includes unsafe-eval in CSP when dev=true", () => {
    const result = withRendererSecurityHeaders(undefined, { dev: true });
    const csp = result["Content-Security-Policy"] as string[];
    expect(csp[0]).toContain("'unsafe-eval'");
  });
});

// ─── isLoopbackHostname ───────────────────────────────────────────────────────

describe("isLoopbackHostname", () => {
  it("returns false for undefined", () => {
    expect(isLoopbackHostname(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isLoopbackHostname("")).toBe(false);
  });

  it("returns true for 127.0.0.1", () => {
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
  });

  it("returns true for localhost", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
  });

  it("returns true for ::1", () => {
    expect(isLoopbackHostname("::1")).toBe(true);
  });

  it("returns true for [::1]", () => {
    expect(isLoopbackHostname("[::1]")).toBe(true);
  });

  it("returns false for external hostname", () => {
    expect(isLoopbackHostname("example.com")).toBe(false);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isLoopbackHostname("  LOCALHOST  ")).toBe(true);
  });
});

// ─── assertLoopbackHostname ───────────────────────────────────────────────────

describe("assertLoopbackHostname", () => {
  it("returns the hostname when it is a loopback address", () => {
    expect(assertLoopbackHostname("localhost")).toBe("localhost");
    expect(assertLoopbackHostname("127.0.0.1")).toBe("127.0.0.1");
    expect(assertLoopbackHostname("0.0.0.0")).toBe("0.0.0.0");
  });

  it("throws for a non-loopback hostname", () => {
    expect(() => assertLoopbackHostname("192.168.1.100")).toThrow(
      'Refusing to bind the embedded server to non-loopback host "192.168.1.100"',
    );
  });

  it("throws for an external domain", () => {
    expect(() => assertLoopbackHostname("example.com")).toThrow("localhost-only");
  });
});

// ─── loadOrCreateAuthSecret ───────────────────────────────────────────────────

describe("loadOrCreateAuthSecret", () => {
  const existsSyncMock = vi.mocked(existsSync);
  const readFileSyncMock = vi.mocked(readFileSync);
  const writeFileSyncMock = vi.mocked(writeFileSync);
  const mkdirSyncMock = vi.mocked(mkdirSync);
  const testDataDir = path.resolve("/test/userData");

  beforeEach(() => {
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    mkdirSyncMock.mockReset();
  });

  it("returns existing secret when file exists and secret is long enough", () => {
    const existingSecret = "a".repeat(64);
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(existingSecret + "\n");

    const result = loadOrCreateAuthSecret(testDataDir);
    expect(result).toBe(existingSecret);
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it("generates a new secret when file exists but secret is too short", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("short");

    const result = loadOrCreateAuthSecret(testDataDir);
    // Should be a 64-char hex string (32 bytes)
    expect(result).toMatch(/^[0-9a-f]{64}$/);
    expect(writeFileSyncMock).toHaveBeenCalledOnce();
    expect(mkdirSyncMock).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it("generates and writes a new secret when file does not exist", () => {
    existsSyncMock.mockReturnValue(false);

    const result = loadOrCreateAuthSecret(testDataDir);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
    expect(writeFileSyncMock).toHaveBeenCalledOnce();
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("better-auth-secret"),
      result,
      { encoding: "utf8", mode: 0o600 },
    );
    expect(mkdirSyncMock).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it("each new secret is a 64-char hex string", () => {
    existsSyncMock.mockReturnValue(false);
    const result = loadOrCreateAuthSecret(testDataDir);
    expect(typeof result).toBe("string");
    expect(result.length).toBe(64);
  });
});

// ─── ensureAuthSecretEnv ──────────────────────────────────────────────────────

describe("ensureAuthSecretEnv", () => {
  const existsSyncMock = vi.mocked(existsSync);
  const readFileSyncMock = vi.mocked(readFileSync);
  const writeFileSyncMock = vi.mocked(writeFileSync);
  const mkdirSyncMock = vi.mocked(mkdirSync);
  const testDataDir = path.resolve("/test/userData");
  const originalEnv = process.env.BETTER_AUTH_SECRET;

  beforeEach(() => {
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    delete process.env.BETTER_AUTH_SECRET;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BETTER_AUTH_SECRET;
    } else {
      process.env.BETTER_AUTH_SECRET = originalEnv;
    }
  });

  it("returns existing env var when it is long enough (>= 32 chars)", () => {
    const secret = "x".repeat(64);
    process.env.BETTER_AUTH_SECRET = secret;

    const result = ensureAuthSecretEnv(testDataDir);
    expect(result).toBe(secret);
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("loads/creates secret when env var is not set", () => {
    delete process.env.BETTER_AUTH_SECRET;
    existsSyncMock.mockReturnValue(false);

    const result = ensureAuthSecretEnv(testDataDir);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
    expect(process.env.BETTER_AUTH_SECRET).toBe(result);
  });

  it("loads/creates secret when env var is too short", () => {
    process.env.BETTER_AUTH_SECRET = "short";
    existsSyncMock.mockReturnValue(false);

    const result = ensureAuthSecretEnv(testDataDir);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
    expect(process.env.BETTER_AUTH_SECRET).toBe(result);
  });

  it("loads/creates secret when env var is whitespace-only", () => {
    process.env.BETTER_AUTH_SECRET = "    ";
    existsSyncMock.mockReturnValue(false);

    const result = ensureAuthSecretEnv(testDataDir);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── PRODUCTION_FUSE_CONFIG constant ─────────────────────────────────────────

describe("PRODUCTION_FUSE_CONFIG", () => {
  /**
   * These pin the exact values chosen (and reviewed) in electron/security.ts,
   * each with its own security rationale documented there. A vitest unit test
   * cannot PROVE a fuse value is correct — e.g. that RunAsNode:false actually
   * blocks ELECTRON_RUN_AS_NODE in the packaged binary — that requires launching
   * the real fused build, out of scope here. What these tests DO catch: a
   * refactor, merge, or copy-paste that silently flips a reviewed value.
   * Grouped by security intent (not just "field X equals Y") and backed by a
   * completeness check below, so a new fuse can't ship silently unpinned.
   */
  it("disables every fuse that would grant a dangerous capability", () => {
    expect(PRODUCTION_FUSE_CONFIG.RunAsNode).toBe(false);
    expect(PRODUCTION_FUSE_CONFIG.EnableNodeOptionsEnvironmentVariable).toBe(false);
    expect(PRODUCTION_FUSE_CONFIG.EnableNodeCliInspectArguments).toBe(false);
    expect(PRODUCTION_FUSE_CONFIG.GrantFileProtocolExtraPrivileges).toBe(false);
  });

  it("enables every fuse that hardens integrity/confidentiality", () => {
    expect(PRODUCTION_FUSE_CONFIG.EnableCookieEncryption).toBe(true);
    expect(PRODUCTION_FUSE_CONFIG.EnableEmbeddedAsarIntegrityValidation).toBe(true);
    expect(PRODUCTION_FUSE_CONFIG.OnlyLoadAppFromAsar).toBe(true);
  });

  it("keeps LoadBrowserProcessSpecificV8Snapshot off (no per-process snapshot is generated)", () => {
    // Turning this fuse on without shipping a generated
    // browser_v8_context_snapshot.bin crashes Electron at boot (fatal V8
    // snapshot error before main.js) — see electron/security.ts.
    expect(PRODUCTION_FUSE_CONFIG.LoadBrowserProcessSpecificV8Snapshot).toBe(false);
  });

  it("has no extra or missing fuse keys (every fuse the type declares is pinned above)", () => {
    // Independent structural check: if a fuse is ever added to or removed from
    // the source object, this fails until the tests above are updated too.
    expect(Object.keys(PRODUCTION_FUSE_CONFIG).sort()).toEqual(
      [
        "RunAsNode",
        "EnableCookieEncryption",
        "EnableNodeOptionsEnvironmentVariable",
        "EnableNodeCliInspectArguments",
        "EnableEmbeddedAsarIntegrityValidation",
        "OnlyLoadAppFromAsar",
        "LoadBrowserProcessSpecificV8Snapshot",
        "GrantFileProtocolExtraPrivileges",
      ].sort(),
    );
  });
});
