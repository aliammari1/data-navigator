import { describe, expect, it } from "vitest";
import { CHANNELS, channelLabel } from "@/features/channel-monitor/lib/channels";

/**
 * Unit tests for the shared channel catalog and label resolution. `channelLabel`
 * is the single source of friendly names used by alerts/notifications, so the
 * fallback-to-raw-key contract matters.
 */

describe("CHANNELS catalog", () => {
  it("exposes a non-empty catalog with unique keys", () => {
    const keys = CHANNELS.map((c) => c.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every channel both a key and a non-empty label", () => {
    for (const channel of CHANNELS) {
      expect(channel.key).toBeTruthy();
      expect(channel.label.length).toBeGreaterThan(0);
    }
  });
});

describe("channelLabel", () => {
  it("resolves a known key to its friendly label", () => {
    expect(channelLabel("bill_payment")).toBe("Bill Payment");
    expect(channelLabel("credit_transfer")).toBe("Credit Transfer");
  });

  it("falls back to the raw key for an unknown channel", () => {
    expect(channelLabel("nonexistent_channel")).toBe("nonexistent_channel");
  });

  it("returns the empty string unchanged when given an empty key", () => {
    expect(channelLabel("")).toBe("");
  });
});
