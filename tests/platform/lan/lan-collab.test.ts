import { describe, expect, it } from "vitest";
import { buildLANCommand, type LANSettings } from "@/platform/lan/lan-collab";

function settingsWithUrl(url: string): LANSettings {
  return {
    url,
    room: "telecom-default",
    pairingCode: "",
    peer: { id: "p1", name: "Me", role: "editor", color: "#000", active: true },
  };
}

describe("buildLANCommand", () => {
  it("defaults to port 1234 when no URL is set", () => {
    expect(buildLANCommand(settingsWithUrl(""))).toContain("PORT=1234");
  });

  it("extracts the port from a valid ws:// URL", () => {
    expect(buildLANCommand(settingsWithUrl("ws://192.168.1.20:5678"))).toContain("PORT=5678");
  });

  it("defaults to port 1234 for a valid URL with no explicit port", () => {
    expect(buildLANCommand(settingsWithUrl("ws://192.168.1.20"))).toContain("PORT=1234");
  });

  // Regression: `settings.url` is a live-typed field (LanControlCenter's
  // "Server address" input), so this is called on every keystroke, including
  // while the value is an incomplete/invalid URL. `new URL()` used to throw
  // straight through render, crashing the whole component to the nearest
  // error boundary.
  it("falls back to port 1234 instead of throwing on an invalid URL", () => {
    expect(() => buildLANCommand(settingsWithUrl("w"))).not.toThrow();
    expect(buildLANCommand(settingsWithUrl("w"))).toContain("PORT=1234");

    expect(() => buildLANCommand(settingsWithUrl("ws:"))).not.toThrow();
    expect(buildLANCommand(settingsWithUrl("ws:"))).toContain("PORT=1234");

    expect(() => buildLANCommand(settingsWithUrl("taskkill /PID 16756 /F"))).not.toThrow();
  });

  it("includes the pairing code, defaulting to 123456 when unset", () => {
    expect(buildLANCommand(settingsWithUrl(""))).toContain("PAIRING_CODE=123456");
    const settings = { ...settingsWithUrl(""), pairingCode: "999888" };
    expect(buildLANCommand(settings)).toContain("PAIRING_CODE=999888");
  });
});
