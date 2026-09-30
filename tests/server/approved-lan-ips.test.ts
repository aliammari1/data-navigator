import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  approveLanIp,
  clearApprovedLanIps,
  lanProxyHeaders,
  mayRequestLanPath,
} from "@/server/approved-lan-ips";

const priorDataDir = process.env.APP_USER_DATA;
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dn-lan-approval-test-"));
process.env.APP_USER_DATA = testDataDir;

afterEach(clearApprovedLanIps);
afterAll(() => {
  clearApprovedLanIps();
  fs.rmdirSync(testDataDir);
  if (priorDataDir === undefined) delete process.env.APP_USER_DATA;
  else process.env.APP_USER_DATA = priorDataDir;
});

describe("LAN Next proxy access", () => {
  it("allows onboarding but denies dashboard access before approval", () => {
    expect(mayRequestLanPath("192.168.1.20", "/guest/join?token=x")).toBe(true);
    expect(mayRequestLanPath("192.168.1.20", "/api/guest/status?id=x")).toBe(true);
    expect(mayRequestLanPath("192.168.1.20", "/_next/static/chunk.js")).toBe(true);
    expect(mayRequestLanPath("192.168.1.20", "/_next/private")).toBe(false);
    expect(mayRequestLanPath("192.168.1.20", "/dashboard")).toBe(false);
  });

  it("allows only an approved peer IP for the session", () => {
    approveLanIp("192.168.1.20");
    expect(mayRequestLanPath("::ffff:192.168.1.20", "/dashboard")).toBe(true);
    expect(mayRequestLanPath("192.168.1.20", "/api/guest/approve")).toBe(false);
    expect(mayRequestLanPath("192.168.1.21", "/dashboard")).toBe(false);
    clearApprovedLanIps();
    expect(mayRequestLanPath("192.168.1.20", "/dashboard")).toBe(false);
  });

  it("forwards guests to loopback with trusted LAN identity headers", () => {
    const headers = lanProxyHeaders(
      {
        host: "untrusted.example",
        forwarded: "for=1.2.3.4;host=untrusted.example",
        "x-forwarded-for": "1.2.3.4",
        "x-forwarded-host": "untrusted.example",
      },
      "192.168.1.20",
      "192.168.1.10",
      3000,
    );
    expect(headers.host).toBe("127.0.0.1:3000");
    expect(headers["x-forwarded-for"]).toBe("192.168.1.20");
    expect(headers["x-forwarded-host"]).toBe("192.168.1.10:3000");
    expect(headers.forwarded).toBeUndefined();
  });
});
