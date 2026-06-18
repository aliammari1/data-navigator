import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  assertLoopbackHostname,
  buildRendererCsp,
  getStringProperty,
  isAllowedAppOrigin,
  isLoopbackHostname,
  isPathInside,
  normalizePath,
  PathAccessController,
  wantsMicrophone,
  withRendererSecurityHeaders,
} from "../../electron/security";

/**
 * Security tests for the Electron trust boundary.
 *
 * These cover the renderer→main attack surface: path traversal, untrusted
 * origins, and the default-deny filesystem allowlist. A regression here is a
 * potential RCE / arbitrary-file-access vulnerability, so the bar is high
 * (see the per-file coverage gate in vitest.config.ts).
 */

const ROOT = path.resolve("/app/data");

describe("normalizePath", () => {
  it("resolves to an absolute path", () => {
    expect(path.isAbsolute(normalizePath("foo/bar"))).toBe(true);
  });
  it("collapses traversal segments", () => {
    expect(normalizePath(`${ROOT}/a/../b`)).toBe(path.resolve(`${ROOT}/b`));
  });
});

describe("isPathInside", () => {
  it("accepts the parent itself", () => {
    expect(isPathInside(ROOT, ROOT)).toBe(true);
  });
  it("accepts nested children", () => {
    expect(isPathInside(`${ROOT}/sub/file.csv`, ROOT)).toBe(true);
  });
  it("rejects siblings", () => {
    expect(isPathInside(path.resolve("/app/other/file"), ROOT)).toBe(false);
  });
  it("rejects path-traversal escapes", () => {
    expect(isPathInside(`${ROOT}/../../etc/passwd`, ROOT)).toBe(false);
  });
  it("rejects a parent of the parent", () => {
    expect(isPathInside(path.resolve("/app"), ROOT)).toBe(false);
  });
});

describe("isAllowedAppOrigin", () => {
  it("allows file:// origins", () => {
    expect(isAllowedAppOrigin("file:///C:/app/index.html")).toBe(true);
  });
  it("allows localhost and 127.0.0.1", () => {
    expect(isAllowedAppOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedAppOrigin("http://127.0.0.1:3000/page")).toBe(true);
  });
  it("rejects remote origins", () => {
    expect(isAllowedAppOrigin("https://evil.example.com")).toBe(false);
    expect(isAllowedAppOrigin("http://localhost.evil.com")).toBe(false);
  });
  it("rejects empty / malformed / undefined", () => {
    expect(isAllowedAppOrigin("")).toBe(false);
    expect(isAllowedAppOrigin(undefined)).toBe(false);
    expect(isAllowedAppOrigin("not a url")).toBe(false);
    expect(isAllowedAppOrigin("javascript:alert(1)")).toBe(false);
  });
});

describe("wantsMicrophone", () => {
  it("defaults to true when details are absent", () => {
    expect(wantsMicrophone()).toBe(true);
    expect(wantsMicrophone(undefined)).toBe(true);
  });
  it("reads the mediaTypes array", () => {
    expect(wantsMicrophone({ mediaTypes: ["audio"] })).toBe(true);
    expect(wantsMicrophone({ mediaTypes: ["video"] })).toBe(false);
  });
  it("reads the singular mediaType", () => {
    expect(wantsMicrophone({ mediaType: "audio" })).toBe(true);
    expect(wantsMicrophone({ mediaType: "unknown" })).toBe(true);
    expect(wantsMicrophone({ mediaType: "video" })).toBe(false);
  });
});

describe("getStringProperty", () => {
  it("returns a valid non-empty string", () => {
    expect(getStringProperty({ filePath: "/x/y" }, "filePath")).toBe("/x/y");
  });
  it("throws for non-object input", () => {
    expect(() => getStringProperty(null, "filePath")).toThrow();
    expect(() => getStringProperty("string", "filePath")).toThrow();
  });
  it("throws for missing / empty / non-string values", () => {
    expect(() => getStringProperty({}, "filePath")).toThrow();
    expect(() => getStringProperty({ filePath: "   " }, "filePath")).toThrow();
    expect(() => getStringProperty({ filePath: 42 }, "filePath")).toThrow();
  });
});

describe("PathAccessController", () => {
  let ctl: PathAccessController;

  beforeEach(() => {
    ctl = new PathAccessController(ROOT);
  });

  it("exposes a normalized data dir", () => {
    expect(ctl.dataDir).toBe(path.resolve(ROOT));
  });

  describe("reads", () => {
    it("allows reads inside the data dir", () => {
      expect(ctl.assertAllowedReadPath(`${ROOT}/cache/x.parquet`)).toBe(
        path.resolve(`${ROOT}/cache/x.parquet`),
      );
    });
    it("denies arbitrary reads by default", () => {
      expect(() => ctl.assertAllowedReadPath("/etc/passwd")).toThrow(/Blocked read/);
    });
    it("allows a read after the file was remembered (dialog selection)", () => {
      const picked = path.resolve("/home/user/report.csv");
      ctl.rememberReadPath(picked);
      expect(ctl.assertAllowedReadPath(picked)).toBe(picked);
    });
    it("allows reads under a remembered directory but not its siblings", () => {
      ctl.rememberDirectory(path.resolve("/home/user/datasets"));
      expect(ctl.assertAllowedReadPath(path.resolve("/home/user/datasets/a/b.csv"))).toBeTruthy();
      expect(() => ctl.assertAllowedReadPath(path.resolve("/home/user/secrets/c.csv"))).toThrow();
    });
    it("blocks traversal out of a remembered directory", () => {
      ctl.rememberDirectory(path.resolve("/home/user/datasets"));
      expect(() =>
        ctl.assertAllowedReadPath(path.resolve("/home/user/datasets/../secrets/c.csv")),
      ).toThrow(/Blocked read/);
    });
  });

  describe("writes", () => {
    it("allows writes inside the data dir", () => {
      expect(ctl.assertAllowedWritePath(`${ROOT}/out.json`)).toBeTruthy();
    });
    it("denies arbitrary writes by default", () => {
      expect(() => ctl.assertAllowedWritePath("/tmp/evil.sh")).toThrow(/Blocked write/);
    });
    it("allows a write only after the save target was remembered", () => {
      const target = path.resolve("/home/user/export.xlsx");
      expect(() => ctl.assertAllowedWritePath(target)).toThrow();
      ctl.rememberSavePath(target);
      expect(ctl.assertAllowedWritePath(target)).toBe(target);
    });
    it("does not let a remembered read path grant write access", () => {
      const picked = path.resolve("/home/user/report.csv");
      ctl.rememberReadPath(picked);
      expect(() => ctl.assertAllowedWritePath(picked)).toThrow(/Blocked write/);
    });
  });

  describe("deletes", () => {
    it("allows deletes inside the data dir", () => {
      expect(ctl.assertAllowedDeletePath(`${ROOT}/tmp/old.db`)).toBeTruthy();
    });
    it("blocks deletes outside the data dir even if remembered", () => {
      const picked = path.resolve("/home/user/report.csv");
      ctl.rememberReadPath(picked);
      ctl.rememberSavePath(picked);
      expect(() => ctl.assertAllowedDeletePath(picked)).toThrow(/Blocked delete/);
    });
  });

  describe("directories", () => {
    it("allows the data dir and remembered dirs", () => {
      expect(ctl.assertAllowedDirectoryPath(ROOT)).toBeTruthy();
      const dir = path.resolve("/mnt/share");
      ctl.rememberDirectory(dir);
      expect(ctl.assertAllowedDirectoryPath(dir)).toBe(dir);
    });
    it("denies unknown directories", () => {
      expect(() => ctl.assertAllowedDirectoryPath("/var/log")).toThrow(/Blocked directory/);
    });
  });
});

describe("buildRendererCsp", () => {
  it("allows the WASM/Worker engine in BOTH policies (or it hard-breaks DuckDB/LLM)", () => {
    for (const dev of [false, true]) {
      const { enforce, reportOnly } = buildRendererCsp({ dev });
      for (const policy of [enforce, reportOnly]) {
        expect(policy).toContain("worker-src 'self' blob:");
        expect(policy).toContain("'wasm-unsafe-eval'");
        expect(policy).toContain("connect-src");
        expect(policy).toContain("ws:"); // LAN collab peers
      }
    }
  });
  it("locks down the high-value directives", () => {
    const { enforce } = buildRendererCsp({ dev: false });
    expect(enforce).toContain("default-src 'self'");
    expect(enforce).toContain("object-src 'none'");
    expect(enforce).toContain("base-uri 'self'");
    expect(enforce).toContain("form-action 'self'");
    expect(enforce).toContain("frame-ancestors 'self'");
  });
  it("enforce tolerates inline (Next/Tailwind); report-only is the stricter target", () => {
    const { enforce, reportOnly } = buildRendererCsp({ dev: false });
    expect(enforce).toContain("'unsafe-inline'");
    expect(reportOnly).not.toContain("'unsafe-inline'");
  });
  it("permits eval ONLY in dev (HMR), never in production", () => {
    expect(buildRendererCsp({ dev: true }).enforce).toContain("'unsafe-eval'");
    expect(buildRendererCsp({ dev: false }).enforce).not.toContain("'unsafe-eval'");
  });
});

describe("withRendererSecurityHeaders", () => {
  it("keeps cross-origin isolation and adds the static + CSP headers", () => {
    const out = withRendererSecurityHeaders({}, { dev: false });
    expect(out["Cross-Origin-Opener-Policy"]).toEqual(["same-origin"]);
    expect(out["Cross-Origin-Embedder-Policy"]).toEqual(["require-corp"]);
    expect(out["Content-Security-Policy"]).toBeDefined();
    expect(out["Content-Security-Policy-Report-Only"]).toBeDefined();
    expect(out["X-Content-Type-Options"]).toEqual(["nosniff"]);
    expect(out["Referrer-Policy"]).toEqual(["no-referrer"]);
  });
  it("emits ONLY the report-only CSP when enforceCsp is false", () => {
    const out = withRendererSecurityHeaders({}, { dev: false, enforceCsp: false });
    expect(out["Content-Security-Policy"]).toBeUndefined();
    expect(out["Content-Security-Policy-Report-Only"]).toBeDefined();
  });
  it("strips any upstream X-Powered-By / pre-existing CSP (case-insensitive)", () => {
    const out = withRendererSecurityHeaders(
      { "x-powered-by": "Next.js", "content-security-policy": "default-src *" },
      { dev: false },
    );
    const keys = Object.keys(out).map((k) => k.toLowerCase());
    expect(keys).not.toContain("x-powered-by");
    expect(out["Content-Security-Policy"]).not.toEqual(["default-src *"]);
  });
});

describe("isLoopbackHostname / assertLoopbackHostname", () => {
  it("recognizes loopback hosts", () => {
    for (const h of ["127.0.0.1", "localhost", "::1", "[::1]", "LOCALHOST"]) {
      expect(isLoopbackHostname(h)).toBe(true);
    }
  });
  it("rejects non-loopback and empty hosts", () => {
    for (const h of ["0.0.0.0", "192.168.1.10", "example.com", "", undefined]) {
      expect(isLoopbackHostname(h)).toBe(false);
    }
  });
  it("assert returns the host for loopback and throws otherwise (fail closed)", () => {
    expect(assertLoopbackHostname("127.0.0.1")).toBe("127.0.0.1");
    expect(() => assertLoopbackHostname("0.0.0.0")).toThrow(/non-loopback/);
    expect(() => assertLoopbackHostname("evil.example.com")).toThrow(/localhost-only/);
  });
});
