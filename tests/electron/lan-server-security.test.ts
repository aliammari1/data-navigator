import { type ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PAIRING_CODE = "123456";
const HOST_SECRET = "a".repeat(64);

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

describe("standalone LAN server metadata boundary", () => {
  let child: ChildProcess;
  let root: string;
  let origin: string;

  beforeAll(async () => {
    root = mkdtempSync(path.join(os.tmpdir(), "dn-lan-security-"));
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ["scripts/lan-server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(port),
        PORT_SCAN_LIMIT: "0",
        PAIRING_CODE,
        GUEST_CODE: "654321",
        DATA_NAVIGATOR_HOST_SECRET: HOST_SECRET,
        DB_PATH: path.join(root, "hub.sqlite"),
        LAN_INBOX_DIR: path.join(root, "inbox"),
      },
      stdio: "ignore",
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`LAN server exited: ${child.exitCode}`);
      try {
        const response = await fetch(`${origin}/lan/status`);
        if (response.ok) return;
      } catch {
        // Wait for the server to bind.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("LAN server did not start");
  }, 10_000);

  afterAll(() => {
    child?.kill();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("keeps public discovery usable without private metadata", async () => {
    const response = await fetch(`${origin}/lan/status`);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.websocketUrls).toBeInstanceOf(Array);
    expect(payload.rooms).toEqual([]);
    expect(payload.audit).toEqual([]);
    expect(payload.files).toEqual([]);
    expect(payload.inboxDir).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain(root);
  });

  it.each(["/lan/audit", "/lan/files"])("requires the full code for %s", async (route) => {
    const denied = await fetch(`${origin}${route}`);
    expect(denied.status).toBe(401);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();

    const allowed = await fetch(`${origin}${route}`, {
      headers: { "x-pairing-code": PAIRING_CODE },
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("keeps invite polling same-origin and omits session credentials", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ iss: "data-navigator", aud: "guest-invite", exp: Date.now() + 60_000 }),
    ).toString("base64url");
    const signature = crypto
      .createHmac("sha256", HOST_SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");
    const token = `${header}.${payload}.${signature}`;
    const join = await fetch(`${origin}/guest/join`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, name: "Guest", pairingCode: PAIRING_CODE }),
    });
    expect(join.status).toBe(200);
    const html = await join.text();
    const id = html.match(/const id = "([^"]+)"/)?.[1];
    expect(id).toBeTruthy();

    const status = await fetch(`${origin}/guest/status?id=${id}`);
    expect(status.status).toBe(200);
    expect(status.headers.get("access-control-allow-origin")).toBeNull();
    expect(status.headers.get("cache-control")).toBe("no-store");
    expect(await status.json()).toEqual({ status: "pending" });
  });
});
