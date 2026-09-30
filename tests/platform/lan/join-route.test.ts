import { describe, expect, it, vi } from "vitest";

const { createPendingGuest, verifyInviteToken } = vi.hoisted(() => ({
  createPendingGuest: vi.fn(),
  verifyInviteToken: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (url: URL, init: { status: number }) => ({
      url: url.toString(),
      status: init.status,
    }),
  },
}));
vi.mock("@/platform/lan/lan-common", () => ({
  getHostSecret: () => "test-secret",
  verifyInviteToken: (...args: unknown[]) => verifyInviteToken(...args),
}));
vi.mock("@/server/pending-guests", () => ({
  createPendingGuest: (...args: unknown[]) => createPendingGuest(...args),
}));
vi.mock("@/server/lan-ip", () => ({ getPrimaryLanIp: () => "192.168.1.105" }));

import { POST } from "@/app/guest/join/route";

describe("guest join on the host computer", () => {
  it("keeps an explicit 127.0.0.1 invite on loopback through the approval redirect", async () => {
    verifyInviteToken.mockResolvedValue({
      jti: "invite-1",
      defaultRole: "editor",
      pairingCode: "123456",
      room: "demo",
    });
    createPendingGuest.mockResolvedValue({ id: "pending-1" });
    const form = new FormData();
    form.set("token", "valid-token");
    form.set("name", "Guest");
    form.set("pairingCode", "123456");

    const response = await POST(
      new Request("http://127.0.0.1:3000/guest/join", {
        method: "POST",
        body: form,
      }),
    );

    expect(createPendingGuest).toHaveBeenCalledWith(
      expect.objectContaining({
        hostUrl: "http://127.0.0.1:3000",
      }),
    );
    expect(response).toMatchObject({
      url: "http://127.0.0.1:3000/guest/waiting?id=pending-1",
      status: 303,
    });
  });
});
