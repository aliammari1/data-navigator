import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the real implementation BEFORE vi.mock replaces the module — the
// top-level import below would otherwise resolve to the spy, causing the
// spy's mockImplementation to recurse into itself.
const realLanCommon = await vi.importActual<
  typeof import("@/platform/lan/lan-common")
>("@/platform/lan/lan-common");
const realSignSessionToken = realLanCommon.signSessionToken;
const realVerifySessionToken = realLanCommon.verifySessionToken;

const setCookie = vi.fn();
const getPendingGuest = vi.fn();
const verifySessionTokenSpy = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      set: setCookie,
    }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> },
    ) => ({
      status: init?.status ?? 200,
      json: async () => body,
      headers: new Headers(init?.headers ?? {}),
    }),
  },
}));

vi.mock("@/server/pending-guests", () => ({
  getPendingGuest: (...args: unknown[]) => getPendingGuest(...args),
}));

vi.mock("@/platform/lan/lan-common", () => ({
  verifySessionToken: (...args: unknown[]) => verifySessionTokenSpy(...args),
}));

import { POST } from "@/app/api/guest/accept/route";

const SECRET_AT_APPROVE = "host-secret-when-approve-signed-the-token-aaaaaaaaaaaa";
const PENDING_ID = "00000000-0000-4000-8000-000000000001";

describe("/api/guest/accept — host secret mismatch regression", () => {
  beforeEach(() => {
    verifySessionTokenSpy.mockReset();
    setCookie.mockReset();
    getPendingGuest.mockReset();
    verifySessionTokenSpy.mockImplementation((token, secret) =>
      realVerifySessionToken(token as string, secret as string),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies the session token with pending.hostSecret — the secret captured at join time and reused by /api/guest/approve to sign", async () => {
    const realSigned = await realSignSessionToken(
      {
        sub: "guest-test",
        room: "default",
        role: "editor",
        name: "Guest",
        pairingCode: "123456",
      },
      SECRET_AT_APPROVE,
    );

    getPendingGuest.mockResolvedValue({
      id: PENDING_ID,
      name: "Guest",
      role: "editor",
      pairingCode: "123456",
      room: "default",
      hostSecret: SECRET_AT_APPROVE,
      hostUrl: "http://localhost:3000",
      requestedAt: Date.now(),
      expiresAt: Date.now() + 30_000,
      status: "approved",
      approvedRole: "editor",
      sessionToken: realSigned,
    });

    const request = new Request("http://localhost:3000/api/guest/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pendingId: PENDING_ID }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(verifySessionTokenSpy).toHaveBeenCalledTimes(1);
    expect(verifySessionTokenSpy).toHaveBeenCalledWith(realSigned, SECRET_AT_APPROVE);
    expect(setCookie).toHaveBeenCalledWith(
      expect.objectContaining({ name: "dn_guest_session", value: realSigned }),
    );
  });

  it("returns 401 when the stored session token cannot be verified against pending.hostSecret", async () => {
    getPendingGuest.mockResolvedValue({
      id: PENDING_ID,
      name: "Guest",
      role: "editor",
      pairingCode: "123456",
      room: "default",
      hostSecret: SECRET_AT_APPROVE,
      hostUrl: "http://localhost:3000",
      requestedAt: Date.now(),
      expiresAt: Date.now() + 30_000,
      status: "approved",
      approvedRole: "editor",
      sessionToken: "header.payload.tampered-signature",
    });

    const request = new Request("http://localhost:3000/api/guest/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pendingId: PENDING_ID }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("returns 409 when pending.status is not approved and does not invoke verifySessionToken", async () => {
    getPendingGuest.mockResolvedValue({
      id: PENDING_ID,
      name: "Guest",
      role: "editor",
      pairingCode: "123456",
      room: "default",
      hostSecret: SECRET_AT_APPROVE,
      hostUrl: "http://localhost:3000",
      requestedAt: Date.now(),
      expiresAt: Date.now() + 30_000,
      status: "pending",
    });

    const request = new Request("http://localhost:3000/api/guest/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pendingId: PENDING_ID }),
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
    expect(verifySessionTokenSpy).not.toHaveBeenCalled();
  });
});
