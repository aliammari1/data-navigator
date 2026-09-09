import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getHostSecret,
  isGuestPermission,
  signInviteToken,
  signSessionToken,
  verifyInviteToken,
  verifySessionToken,
} from "@/platform/lan/lan-common";

const SECRET = "test-host-secret-that-is-long-enough-32";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isGuestPermission", () => {
  it("accepts known permissions and rejects the rest", () => {
    expect(isGuestPermission("uploadData")).toBe(true);
    expect(isGuestPermission("dropDatabase")).toBe(false);
    expect(isGuestPermission(undefined)).toBe(false);
    expect(isGuestPermission(42)).toBe(false);
  });
});

describe("invite tokens", () => {
  it("round-trips a valid token", async () => {
    const token = await signInviteToken(
      { sub: "host-1", room: "room-a", defaultRole: "viewer", pairingCode: "1234" },
      SECRET,
    );
    const payload = await verifyInviteToken(token, SECRET);
    expect(payload).toMatchObject({
      iss: "data-navigator",
      aud: "guest-invite",
      room: "room-a",
      pairingCode: "1234",
    });
  });

  it("rejects tampered payloads and wrong secrets", async () => {
    const token = await signInviteToken(
      { sub: "host-1", room: "room-a", defaultRole: "viewer", pairingCode: "1234" },
      SECRET,
    );
    const [h, p] = token.split(".");
    const tampered = `${h}.${p.replace(/.$/, p.endsWith("A") ? "B" : "A")}.${token.split(".")[2]}`;
    await expect(verifyInviteToken(tampered, SECRET)).resolves.toBeNull();
    await expect(
      verifyInviteToken(token, "a-different-secret-that-is-long-enough"),
    ).resolves.toBeNull();
  });

  it("rejects malformed tokens", async () => {
    await expect(verifyInviteToken("not-a-token", SECRET)).resolves.toBeNull();
    await expect(verifyInviteToken("a.b", SECRET)).resolves.toBeNull();
    await expect(verifyInviteToken("", SECRET)).resolves.toBeNull();
  });

  it("rejects expired invites", async () => {
    const token = await signInviteToken(
      { sub: "host-1", room: "room-a", defaultRole: "viewer", pairingCode: "1234" },
      SECRET,
    );
    // Backdate Date.now past the 1h TTL.
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 2 * 60 * 60 * 1000;
      await expect(verifyInviteToken(token, SECRET)).resolves.toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it("rejects cross-type tokens", async () => {
    const session = await signSessionToken(
      {
        sub: "guest-1",
        room: "room-a",
        role: "viewer",
        name: "Guest",
        pairingCode: "1234",
        permissions: ["viewReports"],
      },
      SECRET,
    );
    await expect(verifyInviteToken(session, SECRET)).resolves.toBeNull();
  });
});

describe("session tokens", () => {
  it("round-trips without expiry enforcement", async () => {
    const token = await signSessionToken(
      {
        sub: "guest-1",
        room: "room-a",
        role: "editor",
        name: "Guest",
        pairingCode: "1234",
        permissions: ["viewReports", "uploadData"],
      },
      SECRET,
    );
    const payload = await verifySessionToken(token, SECRET);
    expect(payload).toMatchObject({ role: "editor", permissions: ["viewReports", "uploadData"] });
  });
});

describe("getHostSecret", () => {
  it("prefers a long-enough env secret and caches it", () => {
    const prev = process.env.DATA_NAVIGATOR_HOST_SECRET;
    process.env.DATA_NAVIGATOR_HOST_SECRET = "env-secret-that-is-long-enough-012345";
    try {
      expect(getHostSecret()).toBe("env-secret-that-is-long-enough-012345");
      expect(getHostSecret()).toBe("env-secret-that-is-long-enough-012345");
    } finally {
      if (prev === undefined) delete process.env.DATA_NAVIGATOR_HOST_SECRET;
      else process.env.DATA_NAVIGATOR_HOST_SECRET = prev;
    }
  });
});

describe("codec fallbacks (no TextEncoder/atob/getRandomValues)", () => {
  it("round-trips a token through the Buffer codecs", async () => {
    vi.stubGlobal("TextEncoder", undefined);
    vi.stubGlobal("TextDecoder", undefined);
    vi.stubGlobal("atob", undefined);
    vi.stubGlobal("btoa", undefined);
    try {
      const token = await signInviteToken(
        { sub: "h", room: "r", defaultRole: "viewer", pairingCode: "1" },
        SECRET,
      );
      const payload = await verifyInviteToken(token, SECRET);
      expect(payload).toMatchObject({ room: "r" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back to Math.random when getRandomValues is missing", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Crypto.prototype, "getRandomValues");
    Object.defineProperty(Crypto.prototype, "getRandomValues", {
      value: undefined,
      configurable: true,
    });
    try {
      const a = await signInviteToken(
        { sub: "h", room: "r", defaultRole: "viewer", pairingCode: "1" },
        SECRET,
      );
      const b = await signInviteToken(
        { sub: "h", room: "r", defaultRole: "viewer", pairingCode: "1" },
        SECRET,
      );
      // Distinct jtis → distinct tokens even without secure randomness.
      expect(a).not.toBe(b);
    } finally {
      if (descriptor) Object.defineProperty(Crypto.prototype, "getRandomValues", descriptor);
    }
  });
});

describe("audience enforcement", () => {
  it("rejects a correctly-signed token with the wrong audience", async () => {
    const enc = new TextEncoder();
    const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
    const header = toB64(enc.encode(JSON.stringify({ alg: "HS256", typ: "dn-invite" })));
    const payload = toB64(
      enc.encode(
        JSON.stringify({
          iss: "data-navigator",
          aud: "someone-else",
          jti: "x",
          iat: Date.now(),
          exp: Date.now() + 99999,
          sub: "h",
          room: "r",
        }),
      ),
    );
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = toB64(
      new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`))),
    );
    await expect(verifyInviteToken(`${header}.${payload}.${sig}`, SECRET)).resolves.toBeNull();
  });
});

describe("short env secrets", () => {
  it("ignores an env secret below the minimum length and generates one", async () => {
    vi.resetModules();
    const prev = process.env.DATA_NAVIGATOR_HOST_SECRET;
    process.env.DATA_NAVIGATOR_HOST_SECRET = "too-short";
    try {
      const mod = await import("@/platform/lan/lan-common");
      const first = mod.getHostSecret();
      expect(typeof first).toBe("string");
      expect(first).not.toBe("too-short");
      expect(mod.getHostSecret()).toBe(first);
    } finally {
      if (prev === undefined) delete process.env.DATA_NAVIGATOR_HOST_SECRET;
      else process.env.DATA_NAVIGATOR_HOST_SECRET = prev;
      vi.resetModules();
    }
  });

  it("adopts the Electron host secret when the bridge exists at import", async () => {
    vi.resetModules();
    (window as unknown as Record<string, unknown>).electronCollab = {
      getHostSecret: async () => "electron-secret-value",
    };
    try {
      const mod = await import("@/platform/lan/lan-common");
      await new Promise((r) => setTimeout(r, 0));
      expect(mod.getHostSecret()).toBe("electron-secret-value");
    } finally {
      delete (window as unknown as Record<string, unknown>).electronCollab;
      vi.resetModules();
    }
  });
});
