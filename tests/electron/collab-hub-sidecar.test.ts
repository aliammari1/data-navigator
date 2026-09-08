import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSidecarContext,
  handleSidecarRequest,
  type SidecarContext,
} from "../../electron/collab-hub-service";

// collab-hub-service imports `electron` at module level; the sidecar handler
// itself never touches `app`, so a stub is all the import needs.
vi.mock("electron", () => ({ app: { getPath: () => "" } }));

const PAIRING_CODE = "111111";
const GUEST_CODE = "222222";

function makeRequest(init: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}): IncomingMessage {
  const req = Readable.from(init.body === undefined ? [] : [Buffer.from(init.body)]) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = init.method;
  req.url = init.url;
  req.headers = { host: "192.168.1.10:4321", ...(init.headers ?? {}) };
  return req as unknown as IncomingMessage;
}

class MockResponse {
  statusCode = 0;
  headers: Record<string, string> = {};
  body = "";
  headersSent = false;
  ended = false;

  writeHead(status: number, headers?: Record<string, string>): this {
    this.statusCode = status;
    if (headers) this.headers = headers;
    this.headersSent = true;
    return this;
  }

  end(chunk?: unknown): this {
    if (typeof chunk === "string") this.body += chunk;
    this.ended = true;
    return this;
  }

  asServerResponse(): ServerResponse {
    return this as unknown as ServerResponse;
  }

  json(): Record<string, unknown> {
    return JSON.parse(this.body) as Record<string, unknown>;
  }
}

describe("handleSidecarRequest (embedded hub HTTP sidecar)", () => {
  let tempRoot: string;
  let inboxDir: string;
  let ctx: SidecarContext;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(tmpdir(), "dn-hub-sidecar-"));
    inboxDir = path.join(tempRoot, "inbox");
    ctx = createSidecarContext({
      name: "Data Navigator LAN",
      room: "telecom-default",
      port: 4321,
      pairingCode: PAIRING_CODE,
      allowGuests: true,
      startedAt: "2026-07-10T00:00:00.000Z",
      inboxDir,
      maxFileBytes: 1024,
    });
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  describe("GET /lan/status", () => {
    it("returns the lan-server-shaped discovery payload with the CORP header", async () => {
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({ method: "GET", url: "/lan/status" }),
        response.asServerResponse(),
        ctx,
      );

      expect(response.statusCode).toBe(200);
      expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
      expect(response.headers["content-type"]).toBe("application/json");

      const payload = response.json();
      expect(payload).toMatchObject({
        ok: true,
        name: "Data Navigator LAN",
        port: 4321,
        pairingRequired: true,
        allowGuests: true,
        maxFileBytes: 1024,
        inboxDir,
        startedAt: "2026-07-10T00:00:00.000Z",
      });
      expect(Array.isArray(payload.ips)).toBe(true);
      expect(Array.isArray(payload.websocketUrls)).toBe(true);
      expect(Array.isArray(payload.httpUrls)).toBe(true);
      expect(Array.isArray(payload.rooms)).toBe(true);
      expect(Array.isArray(payload.audit)).toBe(true);
      expect(Array.isArray(payload.files)).toBe(true);
    });

    it("never discloses the pairing code", async () => {
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({ method: "GET", url: "/lan/status" }),
        response.asServerResponse(),
        ctx,
      );
      expect(response.body).not.toContain(PAIRING_CODE);
    });

    it("answers /lan/discover as an alias", async () => {
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({ method: "GET", url: "/lan/discover" }),
        response.asServerResponse(),
        ctx,
      );
      expect(response.statusCode).toBe(200);
      expect(response.json().ok).toBe(true);
    });
  });

  describe("join landing page (replaces Hocuspocus's default response)", () => {
    it("serves the branded HTML page on GET /", async () => {
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({ method: "GET", url: "/?room=telecom-default&code=333333" }),
        response.asServerResponse(),
        ctx,
      );

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
      expect(response.body).toContain("<title>Data Navigator — LAN session</title>");
      expect(response.body).toContain("telecom-default");
      // The inline script reads the QR join URL's query params client-side.
      expect(response.body).toContain('params.get("room")');
      expect(response.body).toContain('params.get("code")');
      expect(response.body).not.toContain("Welcome to Hocuspocus");
      // The server-side code must never be embedded in the page.
      expect(response.body).not.toContain(PAIRING_CODE);
    });

    it("serves the landing page for any other unmatched GET", async () => {
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({ method: "GET", url: "/some/unknown/path" }),
        response.asServerResponse(),
        ctx,
      );
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("<title>Data Navigator — LAN session</title>");
    });

    it("escapes the room name (no HTML injection through start input)", async () => {
      ctx = createSidecarContext({ ...ctx, room: 'tele<com>"room"' });
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({ method: "GET", url: "/" }),
        response.asServerResponse(),
        ctx,
      );
      expect(response.body).toContain("tele&lt;com&gt;&quot;room&quot;");
      expect(response.body).not.toContain('tele<com>"room"');
    });

    it("returns 404 JSON for unmatched non-GET methods", async () => {
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({ method: "POST", url: "/nope" }),
        response.asServerResponse(),
        ctx,
      );
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ ok: false, error: "Not found" });
    });

    it("answers OPTIONS preflight with the upload headers allow-list", async () => {
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({ method: "OPTIONS", url: "/lan/files" }),
        response.asServerResponse(),
        ctx,
      );
      expect(response.statusCode).toBe(204);
      expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
      expect(response.headers["access-control-allow-headers"]).toContain("x-pairing-code");
    });
  });

  describe("POST /lan/files (inbox upload)", () => {
    it("rejects an upload without any code", async () => {
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({ method: "POST", url: "/lan/files", body: "data" }),
        response.asServerResponse(),
        ctx,
      );
      expect(response.statusCode).toBe(401);
      expect(ctx.audit[0]?.event).toBe("file.rejected_pairing");
    });

    it("rejects the guest code — only the FULL pairing code authorizes uploads", async () => {
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({
          method: "POST",
          url: "/lan/files",
          headers: { "x-pairing-code": GUEST_CODE },
          body: "data",
        }),
        response.asServerResponse(),
        ctx,
      );
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ ok: false, error: "Pairing code required" });
      expect(ctx.files).toHaveLength(0);
    });

    it("accepts an upload with the full pairing code and writes it to the inbox", async () => {
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({
          method: "POST",
          url: "/lan/files",
          headers: {
            "x-pairing-code": PAIRING_CODE,
            "x-file-name": "report.csv",
            "x-peer-id": "peer-1",
            "x-peer-name": "Alice",
            "x-room": "telecom-default",
            "content-type": "text/csv",
          },
          body: "col1,col2\n1,2\n",
        }),
        response.asServerResponse(),
        ctx,
      );

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.ok).toBe(true);
      const file = payload.file as Record<string, unknown>;
      expect(file).toMatchObject({
        originalName: "report.csv",
        size: 14,
        type: "text/csv",
        room: "telecom-default",
        peerId: "peer-1",
        peerName: "Alice",
      });

      const stored = readdirSync(inboxDir);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toBe(file.storedName);
      expect(readFileSync(path.join(inboxDir, stored[0]), "utf8")).toBe("col1,col2\n1,2\n");
      expect(ctx.files).toHaveLength(1);
      expect(ctx.audit[0]?.event).toBe("file.uploaded");
    });

    it("sanitizes path-traversal file names", async () => {
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({
          method: "POST",
          url: "/lan/files",
          headers: { "x-pairing-code": PAIRING_CODE, "x-file-name": "../../evil.sh" },
          body: "x",
        }),
        response.asServerResponse(),
        ctx,
      );
      expect(response.statusCode).toBe(200);
      const file = response.json().file as Record<string, unknown>;
      expect(String(file.originalName)).not.toContain("/");
      expect(String(file.originalName)).not.toContain("\\");
      // The file landed inside the inbox, not two directories up.
      expect(readdirSync(inboxDir)).toHaveLength(1);
    });

    it("rejects a body over the size cap with 413 and records no metadata", async () => {
      ctx = createSidecarContext({ ...ctx, maxFileBytes: 16 });
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({
          method: "POST",
          url: "/lan/files",
          headers: { "x-pairing-code": PAIRING_CODE, "x-file-name": "big.bin" },
          body: Buffer.alloc(64),
        }),
        response.asServerResponse(),
        ctx,
      );
      expect(response.statusCode).toBe(413);
      expect(ctx.files).toHaveLength(0);
      expect(ctx.audit[0]?.event).toBe("file.upload_failed");
    });

    it("rejects with 507 once the inbox quota is reached", async () => {
      ctx.counters.inboxFiles = ctx.maxInboxFiles;
      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({
          method: "POST",
          url: "/lan/files",
          headers: { "x-pairing-code": PAIRING_CODE },
          body: "data",
        }),
        response.asServerResponse(),
        ctx,
      );
      expect(response.statusCode).toBe(507);
      expect(ctx.audit[0]?.event).toBe("file.rejected_quota");
    });
  });

  describe("GET /lan/files", () => {
    it("lists uploaded file metadata", async () => {
      const upload = new MockResponse();
      await handleSidecarRequest(
        makeRequest({
          method: "POST",
          url: "/lan/files",
          headers: { "x-pairing-code": PAIRING_CODE, "x-file-name": "a.txt" },
          body: "hello",
        }),
        upload.asServerResponse(),
        ctx,
      );

      const response = new MockResponse();
      await handleSidecarRequest(
        makeRequest({ method: "GET", url: "/lan/files" }),
        response.asServerResponse(),
        ctx,
      );
      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.maxFileBytes).toBe(1024);
      expect(payload.inboxDir).toBe(inboxDir);
      const files = payload.files as Array<Record<string, unknown>>;
      expect(files).toHaveLength(1);
      expect(files[0].originalName).toBe("a.txt");
    });
  });
});
